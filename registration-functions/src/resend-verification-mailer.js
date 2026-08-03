import { createHash, createHmac } from "node:crypto";
import {
  RegistrationGateError,
  normalizeRegistrationEmail,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeVerificationUrl(value) {
  const raw = requiredText(value, "INVALID_VERIFICATION_URL", 4_096);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new RegistrationGateError("INVALID_VERIFICATION_URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new RegistrationGateError("INVALID_VERIFICATION_URL");
  }
  return url.toString();
}

function errorCode(error) {
  return String(error?.code || error?.name || error?.message || "VERIFICATION_PROVIDER_UNKNOWN")
    .slice(0, 120);
}

export function createResendVerificationMailer({
  apiKey,
  from,
  replyTo = null,
  deliveryStore,
  hmacKey,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  now = () => Date.now(),
}) {
  const safeApiKey = requiredText(apiKey, "RESEND_API_KEY_REQUIRED", 4_096);
  const safeFrom = requiredText(from, "VERIFICATION_FROM_REQUIRED", 320);
  const safeReplyTo = replyTo ? normalizeRegistrationEmail(replyTo) : null;
  const safeHmacKey = requiredText(hmacKey, "HMAC_KEY_REQUIRED", 4_096);
  if (Buffer.byteLength(safeHmacKey, "utf8") < 32) {
    throw new RegistrationGateError("HMAC_KEY_TOO_SHORT");
  }
  if (
    typeof deliveryStore?.claim !== "function" ||
    typeof deliveryStore?.markSent !== "function" ||
    typeof deliveryStore?.markUnknown !== "function"
  ) {
    throw new RegistrationGateError("VERIFICATION_DELIVERY_STORE_REQUIRED");
  }
  if (typeof fetchImpl !== "function") throw new RegistrationGateError("FETCH_REQUIRED");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new RegistrationGateError("INVALID_RESEND_TIMEOUT");
  }

  return Object.freeze({
    async sendVerification({
      idempotencyKey,
      email,
      displayName,
      verificationUrl,
      locale,
    }) {
      const operationKey = requiredText(idempotencyKey, "INVALID_IDEMPOTENCY_KEY", 160);
      const recipient = normalizeRegistrationEmail(email);
      const name = requiredText(displayName, "INVALID_DISPLAY_NAME", 200);
      const url = safeVerificationUrl(verificationUrl);
      if (locale !== "pl-PL") throw new RegistrationGateError("UNSUPPORTED_VERIFICATION_LOCALE");
      const providerIdempotencyKey = `email-verification/${operationKey}`;
      const deliveryId = createHash("sha256")
        .update(providerIdempotencyKey, "utf8")
        .digest("base64url");
      const requestFingerprint = createHmac("sha256", safeHmacKey)
        .update([recipient, name, url, locale, safeFrom, safeReplyTo || ""].join("\0"), "utf8")
        .digest("base64url");
      const claimedAtMs = normalizedNow(now());
      const claim = await deliveryStore.claim({
        deliveryId,
        requestFingerprint,
        providerIdempotencyKey,
        nowMs: claimedAtMs,
      });
      if (claim.action === "ALREADY_SENT") {
        return Object.freeze({ providerMessageId: claim.providerMessageId, deduplicated: true });
      }
      if (claim.action === "BUSY") {
        throw new RegistrationGateError("VERIFICATION_DELIVERY_IN_PROGRESS");
      }
      if (claim.action !== "SEND") {
        throw new RegistrationGateError("VERIFICATION_DELIVERY_RECOVERY_REQUIRED");
      }

      const safeName = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      const payload = {
        from: safeFrom,
        to: [recipient],
        subject: "Potwierdź adres e-mail w Cleanzi",
        text: `Dzień dobry ${name},\n\nPotwierdź adres e-mail, aby dokończyć rejestrację firmy w Cleanzi:\n${url}\n\nJeśli to nie Ty rozpocząłeś rejestrację, zignoruj tę wiadomość.`,
        html: `<p>Dzień dobry ${safeName},</p><p>Potwierdź adres e-mail, aby dokończyć rejestrację firmy w Cleanzi.</p><p><a href="${safeUrl}">Potwierdź adres e-mail</a></p><p>Jeśli to nie Ty rozpocząłeś rejestrację, zignoruj tę wiadomość.</p>`,
        ...(safeReplyTo ? { reply_to: safeReplyTo } : {}),
      };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(RESEND_EMAILS_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${safeApiKey}`,
            "content-type": "application/json",
            "Idempotency-Key": providerIdempotencyKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        let result = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        if (!response.ok || typeof result?.id !== "string") {
          const providerError = new RegistrationGateError("VERIFICATION_PROVIDER_REJECTED");
          providerError.providerStatus = response.status;
          throw providerError;
        }
        await deliveryStore.markSent({
          deliveryId,
          providerMessageId: result.id,
          nowMs: normalizedNow(now()),
        });
        return Object.freeze({ providerMessageId: result.id, deduplicated: false });
      } catch (error) {
        try {
          await deliveryStore.markUnknown({
            deliveryId,
            errorCode: errorCode(error),
            nowMs: normalizedNow(now()),
          });
        } catch {
          // The broker remains VERIFICATION_PENDING; no unsafe second key is generated.
        }
        if (error instanceof RegistrationGateError) throw error;
        throw new RegistrationGateError("VERIFICATION_PROVIDER_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

export const __test = Object.freeze({ escapeHtml, safeVerificationUrl });
