'use strict'

const crypto = require('node:crypto')
const nodemailer = require('nodemailer')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHALLENGE_TTL_MINUTES = 10
const SESSION_TTL_HOURS = 12
const RESEND_COOLDOWN_SECONDS = 60
const MAX_CHALLENGES_PER_HOUR = 5
const MAX_CODE_ATTEMPTS = 5

let cachedTransport = null
let cachedTransportKey = ''

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak', 'on'].includes(text(value).toLowerCase())
}

function normalizeEmail(value) {
  const email = text(value).toLowerCase()
  return email.length <= 160 && EMAIL_PATTERN.test(email) ? email : ''
}

function allowedCustomRecipients() {
  return new Set(
    text(process.env.PLATFORM_EMAIL_MFA_ALLOWED_RECIPIENTS)
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  )
}

function resolveChallengeDestination(principal, requestedEmail) {
  const recipientMode = text(process.env.PLATFORM_EMAIL_MFA_RECIPIENT_MODE).toLowerCase()
  if (recipientMode === 'firebase') return normalizeEmail(principal?.email)

  const destination = normalizeEmail(requestedEmail)
  const allowed = allowedCustomRecipients()
  if (!allowed.size) {
    throw publicError(
      503,
      'PLATFORM_EMAIL_RECIPIENT_NOT_CONFIGURED',
      'Tymczasowy adres dla kodów email nie jest skonfigurowany na backendzie.',
    )
  }
  if (!destination || !allowed.has(destination)) {
    throw publicError(403, 'PLATFORM_EMAIL_RECIPIENT_NOT_ALLOWED', 'Ten adres nie jest dozwolony dla kodów administratora platformy.')
  }
  return destination
}

function publicError(statusCode, publicCode, publicMessage) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  return error
}

function emailMfaSecret() {
  const secret = text(process.env.PLATFORM_EMAIL_MFA_SECRET)
  if (secret.length < 32) {
    throw publicError(
      503,
      'PLATFORM_EMAIL_MFA_NOT_CONFIGURED',
      'Kod email nie jest jeszcze skonfigurowany. Brakuje bezpiecznego sekretu PLATFORM_EMAIL_MFA_SECRET.',
    )
  }
  return secret
}

function smtpConfig() {
  const host = text(process.env.PLATFORM_MFA_SMTP_HOST || process.env.SMTP_HOST)
  const port = Number(process.env.PLATFORM_MFA_SMTP_PORT || process.env.SMTP_PORT || 587)
  const user = text(process.env.PLATFORM_MFA_SMTP_USER || process.env.SMTP_USER)
  const pass = String(process.env.PLATFORM_MFA_SMTP_PASS || process.env.SMTP_PASS || '')
  const from = text(process.env.PLATFORM_MFA_EMAIL_FROM || process.env.SMTP_FROM || user)
  const secure = isTrue(process.env.PLATFORM_MFA_SMTP_SECURE || process.env.SMTP_SECURE)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw publicError(
      503,
      'PLATFORM_EMAIL_DELIVERY_NOT_CONFIGURED',
      'Wysyłka kodów email nie jest jeszcze skonfigurowana. Uzupełnij ustawienia SMTP backendu.',
    )
  }
  return { host, port, user, pass, from, secure }
}

function mailTransport(config) {
  const key = `${config.host}:${config.port}:${config.user}:${config.secure}`
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
    cachedTransportKey = key
  }
  return cachedTransport
}

function challengeHash({ uid, challengeId, code, secret = emailMfaSecret() }) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${text(uid)}\n${text(challengeId)}\n${text(code)}`)
    .digest('hex')
}

function sessionTokenHash(token) {
  return crypto.createHash('sha256').update(text(token)).digest('hex')
}

function safeHashEqual(left, right) {
  const first = Buffer.from(text(left), 'hex')
  const second = Buffer.from(text(right), 'hex')
  return first.length === 32 && second.length === 32 && crypto.timingSafeEqual(first, second)
}

function maskEmail(email) {
  const [local = '', domain = ''] = normalizeEmail(email).split('@')
  if (!local || !domain) return ''
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

async function sendCodeEmail({ to, code }) {
  const config = smtpConfig()
  await mailTransport(config).sendMail({
    from: config.from,
    to,
    subject: 'Kod bezpieczeństwa Cleanzi',
    text: `Twój kod bezpieczeństwa Cleanzi: ${code}\n\nKod jest ważny przez ${CHALLENGE_TTL_MINUTES} minut. Jeśli to nie Ty, zignoruj tę wiadomość.`,
    html: `<div style="font-family:Arial,sans-serif;color:#172b4d"><h2>Potwierdź logowanie do Cleanzi</h2><p>Twój jednorazowy kod:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>Kod jest ważny przez ${CHALLENGE_TTL_MINUTES} minut.</p><p style="color:#667085">Jeśli to nie Ty, zignoruj tę wiadomość.</p></div>`,
  })
}

async function requestEmailChallenge(client, { principal, email, request, deliver = sendCodeEmail }) {
  const destination = resolveChallengeDestination(principal, email)
  if (!destination) {
    throw publicError(400, 'INVALID_MFA_EMAIL', 'Podaj poprawny adres email, na który ma zostać wysłany kod.')
  }
  const secret = emailMfaSecret()
  smtpConfig()
  const challengeId = crypto.randomUUID()
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const codeHash = challengeHash({ uid: principal.uid, challengeId, code, secret })
  let row

  try {
    await client.query('begin')
    await client.query('select uid from public.platform_admin where uid = $1::text for update', [text(principal.uid)])
    const rate = await client.query(
      `select count(*) filter (where created_at > now() - interval '1 hour')::integer as recent_count,
              max(created_at) as last_created_at
         from public.platform_email_mfa_challenge
        where admin_uid = $1::text`,
      [text(principal.uid)],
    )
    const recentCount = Number(rate.rows[0]?.recent_count || 0)
    const lastCreatedAt = rate.rows[0]?.last_created_at ? new Date(rate.rows[0].last_created_at).getTime() : 0
    if (recentCount >= MAX_CHALLENGES_PER_HOUR) {
      throw publicError(429, 'PLATFORM_EMAIL_MFA_RATE_LIMITED', 'Wysłano zbyt wiele kodów. Spróbuj ponownie później.')
    }
    if (lastCreatedAt && Date.now() - lastCreatedAt < RESEND_COOLDOWN_SECONDS * 1000) {
      throw publicError(429, 'PLATFORM_EMAIL_MFA_COOLDOWN', 'Odczekaj minutę przed wysłaniem kolejnego kodu.')
    }

    await client.query(
      `update public.platform_email_mfa_challenge
          set consumed_at = coalesce(consumed_at, now())
        where admin_uid = $1::text and consumed_at is null`,
      [text(principal.uid)],
    )
    const inserted = await client.query(
      `insert into public.platform_email_mfa_challenge (
         challenge_id, admin_uid, email, code_hash, expires_at, max_attempts,
         ip_address, user_agent, created_at
       ) values (
         $1::text, $2::text, $3::text, $4::text,
         now() + ($5::integer * interval '1 minute'), $6::integer,
         nullif($7::text, ''), nullif($8::text, ''), now()
       ) returning challenge_id, email, expires_at`,
      [
        challengeId,
        text(principal.uid),
        destination,
        codeHash,
        CHALLENGE_TTL_MINUTES,
        MAX_CODE_ATTEMPTS,
        text(request?.ipAddress),
        text(request?.userAgent),
      ],
    )
    row = inserted.rows[0]
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }

  try {
    await deliver({ to: destination, code })
    await client.query(
      `update public.platform_email_mfa_challenge set delivered_at = now()
        where challenge_id = $1::text`,
      [challengeId],
    )
  } catch (error) {
    await client.query(
      `update public.platform_email_mfa_challenge
          set consumed_at = coalesce(consumed_at, now()), delivery_error = $2::text
        where challenge_id = $1::text`,
      [challengeId, text(error?.code || error?.message || 'SMTP_DELIVERY_FAILED').slice(0, 500)],
    ).catch(() => {})
    throw publicError(503, 'PLATFORM_EMAIL_DELIVERY_FAILED', 'Nie udało się wysłać kodu email. Sprawdź konfigurację SMTP i spróbuj ponownie.')
  }

  return {
    challengeId: text(row.challenge_id),
    emailMasked: maskEmail(row.email),
    expiresAt: row.expires_at,
  }
}

async function verifyEmailChallenge(client, { principal, challengeId, code, request }) {
  const normalizedChallengeId = text(challengeId)
  const normalizedCode = text(code)
  if (!UUID_PATTERN.test(normalizedChallengeId) || !CODE_PATTERN.test(normalizedCode)) {
    throw publicError(400, 'INVALID_EMAIL_MFA_CODE', 'Podaj poprawny sześciocyfrowy kod email.')
  }

  const secret = emailMfaSecret()
  const rawSessionToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = sessionTokenHash(rawSessionToken)
  let row

  try {
    await client.query('begin')
    const result = await client.query(
      `select challenge_id, admin_uid, email, code_hash, expires_at, attempt_count,
              max_attempts, consumed_at, delivered_at
         from public.platform_email_mfa_challenge
        where challenge_id = $1::text
        for update`,
      [normalizedChallengeId],
    )
    row = result.rows[0]
    if (!row || text(row.admin_uid) !== text(principal.uid) || !row.delivered_at) {
      throw publicError(400, 'INVALID_EMAIL_MFA_CODE', 'Kod email jest niepoprawny albo wygasł.')
    }
    if (row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw publicError(400, 'EMAIL_MFA_CODE_EXPIRED', 'Kod email wygasł. Wyślij nowy kod.')
    }
    if (Number(row.attempt_count) >= Number(row.max_attempts)) {
      throw publicError(429, 'EMAIL_MFA_ATTEMPTS_EXCEEDED', 'Przekroczono limit prób. Wyślij nowy kod.')
    }

    const suppliedHash = challengeHash({ uid: principal.uid, challengeId: normalizedChallengeId, code: normalizedCode, secret })
    if (!safeHashEqual(row.code_hash, suppliedHash)) {
      const attempts = Number(row.attempt_count) + 1
      await client.query(
        `update public.platform_email_mfa_challenge
            set attempt_count = attempt_count + 1,
                consumed_at = case when attempt_count + 1 >= max_attempts then now() else consumed_at end
          where challenge_id = $1::text`,
        [normalizedChallengeId],
      )
      await client.query('commit')
      if (attempts >= Number(row.max_attempts)) {
        throw publicError(429, 'EMAIL_MFA_ATTEMPTS_EXCEEDED', 'Przekroczono limit prób. Wyślij nowy kod.')
      }
      throw publicError(400, 'INVALID_EMAIL_MFA_CODE', 'Kod email jest niepoprawny.')
    }

    await client.query(
      `update public.platform_email_mfa_challenge set consumed_at = now()
        where challenge_id = $1::text`,
      [normalizedChallengeId],
    )
    await client.query(
      `update public.platform_email_mfa_session set revoked_at = now()
        where admin_uid = $1::text and revoked_at is null`,
      [text(principal.uid)],
    )
    const session = await client.query(
      `insert into public.platform_email_mfa_session (
         session_id, token_hash, admin_uid, email, verified_at, expires_at,
         ip_address, user_agent, created_at
       ) values (
         $1::text, $2::text, $3::text, $4::text, now(),
         now() + ($5::integer * interval '1 hour'),
         nullif($6::text, ''), nullif($7::text, ''), now()
       ) returning verified_at, expires_at`,
      [
        crypto.randomUUID(),
        tokenHash,
        text(principal.uid),
        normalizeEmail(row.email),
        SESSION_TTL_HOURS,
        text(request?.ipAddress),
        text(request?.userAgent),
      ],
    )
    await client.query('commit')
    return {
      emailMfaToken: rawSessionToken,
      email: normalizeEmail(row.email),
      verifiedAt: session.rows[0].verified_at,
      expiresAt: session.rows[0].expires_at,
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function getValidEmailMfaSession(client, { uid, token }) {
  const normalizedToken = text(token)
  if (!text(uid) || normalizedToken.length < 32 || normalizedToken.length > 256) return null
  const result = await client.query(
    `select session_id, admin_uid, email, verified_at, expires_at
       from public.platform_email_mfa_session
      where token_hash = $1::text
        and admin_uid = $2::text
        and revoked_at is null
        and expires_at > now()
      limit 1`,
    [sessionTokenHash(normalizedToken), text(uid)],
  )
  return result.rows[0] || null
}

module.exports = {
  CHALLENGE_TTL_MINUTES,
  MAX_CODE_ATTEMPTS,
  SESSION_TTL_HOURS,
  challengeHash,
  getValidEmailMfaSession,
  maskEmail,
  normalizeEmail,
  resolveChallengeDestination,
  requestEmailChallenge,
  sessionTokenHash,
  verifyEmailChallenge,
}
