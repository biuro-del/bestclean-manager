import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ensureFirebaseAnalytics } from './firebase/firebaseClient'
import { getMobileSession, loginMobile, logoutMobile } from './services/mobileAuthService'
import {
  defaultQrFunctionLabel,
  findZoneByQrId,
  isStartZoneFunction,
  loadCoordinatorContext,
  logAuditZone,
  saveZoneAssignment,
} from './services/mobileCoordinatorService'
import { fetchZoneChecklistDefinition, saveWorkdayCloseResult, saveZoneChecklistResult } from './services/mobileChecklistService'
import { MobileQrScanner, normalizeQrValue } from './services/mobileQrScannerService'
import { fetchMobileSchedule } from './services/mobileScheduleService'
import {
  closeMobileWorkdayImmediately,
  getMobileSnapshot,
  scanMobileQr,
  startMobilePause,
} from './services/mobileWorkflowService'
import { writeMobileSession } from './state/sessionStore'

const VIEW = {
  LOGIN: 'login',
  MENU: 'menu',
  WORKLOG: 'worklog',
  SUMMARY: 'summary',
  SUMMARY_DETAILS: 'summary-details',
  START: 'start',
  SCAN: 'scan',
  PAUSE: 'pause',
  CLEAN: 'clean',
  END: 'end',
  SCHEDULE: 'schedule',
  COORDINATOR: 'coordinator',
}

const COORD = {
  HOME: 'home',
  AUDIT_START: 'audit-start',
  AUDIT_SCAN: 'audit-scan',
  AUDIT_FORM: 'audit-form',
  EDIT_QR: 'edit-qr',
}

const SCHEDULE_SYNC_MS = 15 * 60 * 1000
const SCHEDULE_SWIPE_THRESHOLD_PX = 45
const MAX_REASONABLE_WORKDAY_SEC = 20 * 60 * 60
const CHECKLIST_REASON_MAX_LEN = 300
const CHECKLIST_ENABLED = false
const NOTICE_AUTO_HIDE_MS = 5000

const QR_FUNCTION_OPTIONS = [
  'Sprzątanie',
  'START (czas pracy)',
  'STOP0 (czas pracy + 0 min)',
  'STOP5 (czas pracy + 5 min)',
  'STOP10 (czas pracy + 10 min)',
  'STOP15 (czas pracy + 15 min)',
  'Podajnik: mydło',
  'Podajnik: papier toaletowy',
  'Podajnik: ręczniki papierowe',
  'Podajnik: inne',
  'Indeks - Produkt',
  'Magazyn - lokalizacja magazynowa',
]

const QR_PLACE_OPTIONS = [
  'Biuro',
  'Aneks kuchenny',
  'WC / Prysznic',
  'Szatnia',
  'Ciąg komunikacyjny',
  'Sala konferencyjna',
  'Recepcja',
  'Pomieszczenie gospodarcze',
  'Showroom',
  'Pokój odpoczynku',
  'Piwnica',
  'Magazyn',
  'Serwerownia',
  'Kotłownia',
  'Archiwum',
  'Inne',
]

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.86l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .8 1.7 1.7 0 0 1-3 0 1.7 1.7 0 0 0-1-.8 1.7 1.7 0 0 0-1.86.34l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.8-1 1.7 1.7 0 0 1 0-3 1.7 1.7 0 0 0 .8-1 1.7 1.7 0 0 0-.34-1.86l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.8 1.7 1.7 0 0 1 3 0 1.7 1.7 0 0 0 1 .8 1.7 1.7 0 0 0 1.86-.34l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9c0 .38.14.74.4 1a1.7 1.7 0 0 1 0 3c-.26.26-.4.62-.4 1Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 7h10v10H7z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 6v12l10-6z" />
    </svg>
  )
}

function CleaningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20l7-7" />
      <path d="M6.5 17.5l4 4" />
      <path d="M13 3l8 8" />
      <path d="M9.5 6.5l8 8" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 9h18" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
    </svg>
  )
}

function AuditPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20" />
      <path d="M2 12h20" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

function txt(value) {
  return String(value ?? '').trim()
}

function up(value) {
  return txt(value).toUpperCase()
}

function normalizeKey(value) {
  return txt(value).toLowerCase()
}

function normalizeFunctionToken(value) {
  const raw = txt(value)
  if (!raw) return ''
  let normalized = raw
  try {
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  } catch {
    // Best effort only.
  }
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isSpecialOrIndividualCleanFunction(functionName) {
  const token = normalizeFunctionToken(functionName)
  return token === 'zlecenieindywidualne' || token === 'sprzatanieindywidualne' || token === 'strefaspecjalna'
}

function parseIso(value) {
  const raw = txt(value)
  if (!raw) return ''
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString()
}

function monthNow() {
  const date = new Date()
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function shiftMonth(state, diff) {
  const date = new Date(Number(state.year), Number(state.month) - 1 + diff, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function monthLabel(state) {
  try {
    return new Date(Number(state.year), Number(state.month) - 1, 1).toLocaleDateString('pl-PL', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function hms(secValue) {
  const seconds = Math.max(0, Math.floor(Number(secValue || 0)))
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function hm(secValue) {
  const seconds = Math.max(0, Math.floor(Number(secValue || 0)))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function secBetween(startValue, endValue = new Date().toISOString()) {
  const startMs = new Date(parseIso(startValue) || 0).getTime()
  const endMs = new Date(parseIso(endValue) || 0).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0
  return Math.floor((endMs - startMs) / 1000)
}

function sanitizeClosedWorkdaySeconds(seconds, startIso, endIso) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)))
  if (value <= MAX_REASONABLE_WORKDAY_SEC) {
    return value
  }

  const range = secBetween(startIso, endIso)
  if (range > 0 && range <= MAX_REASONABLE_WORKDAY_SEC) {
    return range
  }
  return 0
}

function formatTime(value) {
  const iso = parseIso(value)
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function dateKey(value) {
  const iso = parseIso(value)
  return iso ? iso.slice(0, 10) : ''
}

function datePart(dateKeyValue) {
  const parts = String(dateKeyValue || '').split('-')
  const dd = Number(parts[2] || 0)
  return dd > 0 ? String(dd).padStart(2, '0') : '--'
}

function weekdayLabel(dateKeyValue) {
  const parts = String(dateKeyValue || '').split('-')
  const y = Number(parts[0] || 0)
  const m = Number(parts[1] || 0)
  const d = Number(parts[2] || 0)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { weekday: 'long' }).toUpperCase()
}

function parseErrorMessage(error, fallback) {
  const direct =
    txt(error?.error?.message) ||
    txt(error?.message) ||
    txt(error?.statusText) ||
    txt(fallback)

  if (!direct) return txt(fallback)
  if (!direct.startsWith('{')) return direct

  try {
    const parsed = JSON.parse(direct)
    return (
      txt(parsed?.error?.message) ||
      txt(parsed?.message) ||
      txt(parsed?.error?.details?.[0]?.message) ||
      direct
    )
  } catch {
    return direct
  }
}

function isPermissionDeniedError(error) {
  const message = parseErrorMessage(error, '').toLowerCase()
  const code = txt(error?.code || error?.status || error?.error?.status || error?.error?.code).toUpperCase()
  const raw = (() => {
    try {
      return JSON.stringify(error).toLowerCase()
    } catch {
      return ''
    }
  })()

  return (
    code.includes('PERMISSION_DENIED') ||
    message.includes('missing or insufficient permissions') ||
    message.includes('permission denied') ||
    raw.includes('permission_denied') ||
    raw.includes('insufficient permissions')
  )
}

function parseChecklistLoadError(error) {
  if (isPermissionDeniedError(error)) {
    return {
      kind: 'permission',
      message: 'Brak uprawnień do checklisty tej strefy.',
    }
  }
  return {
    kind: 'general',
    message: parseErrorMessage(error, 'Nie udało się pobrać checklisty strefy.'),
  }
}

function isUnauthenticatedError(error) {
  const message = parseErrorMessage(error, '').toLowerCase()
  const code = txt(error?.code || error?.status || error?.error?.status).toUpperCase()
  const raw = (() => {
    try {
      return JSON.stringify(error).toLowerCase()
    } catch {
      return ''
    }
  })()

  return (
    code.includes('UNAUTHENTICATED') ||
    message.includes('unauthenticated') ||
    message.includes('requires a signed-in user') ||
    raw.includes('unauthenticated')
  )
}

function normalizeRole(value) {
  const role = txt(value).toUpperCase()
  if (!role) return ''
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'ADMIN'
  if (role === 'MANAGER' || role === 'KIEROWNIK') return 'MANAGER'
  if (role === 'COORDINATOR' || role === 'KOORDYNATOR') return 'COORDINATOR'
  if (role === 'WORKER' || role === 'PRACOWNIK') return 'WORKER'
  return role
}

function hasCoordinatorAccess(workerRoleValue, sessionRoleValue) {
  const role = normalizeRole(workerRoleValue || sessionRoleValue)
  return role === 'ADMIN' || role === 'MANAGER' || role === 'COORDINATOR'
}

function hasManualQrAccess(workerRoleValue, sessionRoleValue) {
  const role = normalizeRole(workerRoleValue || sessionRoleValue)
  return role === 'ADMIN'
}

function isSameLocalDay(leftIso, rightIso = new Date().toISOString()) {
  const leftKey = localDayKey(leftIso)
  const rightKey = localDayKey(rightIso)
  return Boolean(leftKey && rightKey && leftKey === rightKey)
}

function localDayKey(value = new Date().toISOString()) {
  const iso = parseIso(value)
  if (!iso) return ''
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isWorkdayOpen(workday) {
  if (!workday) return false
  const status = up(workday.status)
  if (status === 'CLOSED') return false
  if (status === 'ENDING') return true
  return !txt(workday.endAt)
}

function isLiveWorkday(workday, nowIsoValue = new Date().toISOString()) {
  if (!isWorkdayOpen(workday)) return false
  return isSameLocalDay(workday?.startAt, nowIsoValue)
}

function isCycleOpen(cycle) {
  if (!cycle) return false
  const status = up(cycle.status)
  if (status === 'CLOSED') return false
  return !txt(cycle.endAt)
}

function isPauseOpen(pause) {
  if (!pause) return false
  const status = up(pause.status)
  if (status === 'CLOSED' || status === 'STOPPED') return false
  return !txt(pause.stopAt)
}

function resolveWorkflowView(snapshot, nowIsoValue = new Date().toISOString()) {
  if (!isLiveWorkday(snapshot?.activeWorkday, nowIsoValue)) return VIEW.START
  if (up(snapshot?.activeWorkday?.status) === 'ENDING') return VIEW.END
  if (isPauseOpen(snapshot?.activePause)) return VIEW.PAUSE
  if (isCycleOpen(snapshot?.activeCycle)) return VIEW.CLEAN
  return VIEW.SCAN
}

function resolveCycleCloseReason(activeCycle, scannedZone) {
  if (!isCycleOpen(activeCycle)) return ''
  const kind = up(scannedZone?.kind)
  if (!kind) return ''
  if (kind === 'STOP') return 'STOP_END_DAY'
  if (kind === 'CLEAN' || kind === 'INDIVIDUAL') {
    if (normalizeKey(activeCycle?.zoneId) === normalizeKey(scannedZone?.id)) {
      return 'QR_SAME'
    }
    return 'QR_SWITCH'
  }
  return ''
}

function unresolvedChecklistItems(items) {
  return (items || []).filter((item) => !item?.checked && !txt(item?.reason))
}

function splitChecklistItems(items) {
  const list = Array.isArray(items) ? items : []
  return {
    additional: list.filter((item) => normalizeKey(item?.section) === 'additional'),
    standard: list.filter((item) => normalizeKey(item?.section) === 'standard'),
  }
}

function createCloseCycleState(overrides = {}) {
  return {
    open: false,
    pending: false,
    error: '',
    intent: 'workflow',
    code: '',
    closeReason: '',
    closeComment: '',
    targetZone: null,
    activeCycle: null,
    mode: 'zone-close',
    showChecklist: CHECKLIST_ENABLED,
    offerWorkdayClose: false,
    ...overrides,
  }
}

function createWorkdayClosePromptState(overrides = {}) {
  return {
    open: false,
    pending: false,
    error: '',
    code: '',
    intent: 'workflow',
    mode: 'zone-close',
    closeReason: '',
    closeComment: '',
    checklistItems: [],
    ...overrides,
  }
}

function getWorkdaySeconds(row, nowIso) {
  const startIso = parseIso(row?.startAt)
  const endIso = parseIso(row?.endAt)
  const status = up(row?.status)
  const direct = Number(row?.durationSec)
  const hasDirect = Number.isFinite(direct) && direct >= 0

  if (status === 'CLOSED') {
    if (hasDirect) return sanitizeClosedWorkdaySeconds(direct, startIso, endIso)
    return sanitizeClosedWorkdaySeconds(secBetween(startIso, endIso), startIso, endIso)
  }

  if (status === 'ENDING') {
    if (!endIso) {
      if (hasDirect) return Math.floor(direct)
      return 0
    }
    const minIso = new Date(endIso).getTime() < new Date(nowIso).getTime() ? endIso : nowIso
    return secBetween(startIso, minIso)
  }

  // For historical RUNNING rows (e.g. imported history), do not accumulate until "now".
  if (!isSameLocalDay(startIso, nowIso)) {
    if (endIso) return secBetween(startIso, endIso)
    if (hasDirect) return Math.floor(direct)
    return 0
  }

  return secBetween(startIso, nowIso)
}

function getPauseSeconds(row, nowIso) {
  if (!row) return 0
  const direct = Number(row.durationSec)
  const hasDirect = Number.isFinite(direct) && direct >= 0
  const status = up(row?.status)
  const stopIso = parseIso(row.stopAt)
  if (stopIso || status === 'CLOSED' || status === 'STOPPED') {
    if (hasDirect) return Math.floor(direct)
    return secBetween(row?.startAt, stopIso)
  }

  const startIso = parseIso(row?.startAt)
  if (startIso) {
    return secBetween(startIso, nowIso)
  }
  if (hasDirect) return Math.floor(direct)
  return 0
}

function getWorkdayPauseSeconds(row, nowIso) {
  const direct = Number(row?.pauseTotalSec)
  let total = Number.isFinite(direct) && direct >= 0 ? Math.floor(direct) : 0
  const openAt = parseIso(row?.pauseOpenAt)
  if (openAt && isWorkdayOpen(row)) {
    total += secBetween(openAt, nowIso)
  }
  return Math.max(0, total)
}

function getWorkdayNetSeconds(row, nowIso) {
  const gross = getWorkdaySeconds(row, nowIso)
  const pause = getWorkdayPauseSeconds(row, nowIso)
  return Math.max(0, gross - pause)
}

function inMonth(isoValue, state) {
  const iso = parseIso(isoValue)
  if (!iso) return false
  const date = new Date(iso)
  return date.getFullYear() === Number(state.year) && date.getMonth() + 1 === Number(state.month)
}

function groupWorklog(events, state) {
  const monthEvents = (events || []).filter((eventRow) => inMonth(eventRow.at, state))
  const map = new Map()
  monthEvents.forEach((eventRow) => {
    const key = dateKey(eventRow.at)
    if (!key) return
    const list = map.get(key) || []
    list.push(eventRow)
    map.set(key, list)
  })

  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, list]) => ({
      dateKey: dayKey,
      events: [...list].sort((a, b) => (a.at < b.at ? 1 : -1)),
    }))
}

function buildSummary(workdays, state, nowIso) {
  const monthRows = (workdays || []).filter((row) => inMonth(row.startAt, state))
  const monthSeconds = monthRows.reduce((acc, row) => acc + getWorkdayNetSeconds(row, nowIso), 0)
  const byDay = new Map()

  monthRows.forEach((row) => {
    const key = dateKey(row.startAt)
    if (!key) return
    const sum = byDay.get(key) || 0
    byDay.set(key, sum + getWorkdayNetSeconds(row, nowIso))
  })

  const days = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, totalSec]) => ({ dateKey: dayKey, totalSec }))

  return { monthSeconds, days }
}

function LoginView({ pending, error, onSubmit }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  return (
    <section className="card">
      <div className="title">Logowanie</div>
      <div className="box col">
        <label className="muted">Login</label>
        <input className="input" value={login} onChange={(event) => setLogin(event.target.value)} />
        <label className="muted">Hasło</label>
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error ? <div className="error-inline">{error}</div> : null}
        <button className="btn primary" type="button" disabled={pending} onClick={() => onSubmit({ login, password })}>
          {pending ? 'Logowanie...' : 'Zaloguj'}
        </button>
      </div>
    </section>
  )
}

function WorkHud({ workerName, timer, onPause, onStop, startLabel, topActionIsStart }) {
  return (
    <div className="home-hero">
      <div className="home-hero__top">
        <div>
          <div className="home-hero__label">Twoj czas pracy</div>
          <div className="home-hero__time">{timer}</div>
        </div>
        <div className="home-actions">
          <button className="home-action home-action--pause" type="button" onClick={onPause} aria-label="Pauza">
            <PauseIcon />
          </button>
          <button
            className={`home-action ${topActionIsStart ? 'home-action--play' : 'home-action--stop'}`}
            type="button"
            onClick={onStop}
            aria-label={topActionIsStart ? 'Start' : 'Stop'}
          >
            {topActionIsStart ? <PlayIcon /> : <StopIcon />}
          </button>
        </div>
      </div>
      <div className="home-hero__meta">
        <span className="pill-dark">{txt(workerName).split(/\s+/)[0] || '-'}</span>
        <span className={`pill-dark ${startLabel ? '' : 'pill-dark--alert'}`}>{startLabel || 'BRAK START'}</span>
      </div>
    </div>
  )
}

function SettingsModal({ open, session, onClose, onLogout }) {
  if (!open) return null
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-content settings-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Ustawienia</div>
          <button className="link-btn" type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="modal-body">
          <div className="settings-item">
            Zalogowano: {txt(session?.email) || '-'}
            <small>Organizacja: {txt(session?.orgId) || '-'}</small>
          </div>
          <button className="settings-item" type="button">
            Zmien jezyk
            <small>Wkrotce</small>
          </button>
          <button className="settings-item settings-item--danger" type="button" onClick={onLogout}>
            Wyloguj
            <small>Wylogowanie z urzadzenia</small>
          </button>
        </div>
      </div>
    </div>
  )
}

function ScanModal({ scanState, onClose, onSubmit, allowManualEntry = false }) {
  const [code, setCode] = useState('')
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [torchState, setTorchState] = useState({ supported: false, enabled: false })
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const submitRef = useRef(onSubmit)
  const commentRef = useRef(comment)

  useEffect(() => {
    submitRef.current = onSubmit
  }, [onSubmit])

  useEffect(() => {
    commentRef.current = comment
  }, [comment])

  useEffect(() => {
    if (!scanState.open) {
      return undefined
    }

    const scanner = new MobileQrScanner({
      video: videoRef.current,
      onStatus: (message) => setStatus(String(message || '')),
      onTorchState: (nextState) => setTorchState(nextState || { supported: false, enabled: false }),
      onError: (error) => {
        setCameraError(txt(error?.message || 'Nie udało się uruchomić kamery.'))
        if (allowManualEntry) {
          setManualOpen(true)
        }
      },
      onDecode: (decodedValue) => {
        const normalized = normalizeQrValue(decodedValue)
        if (!normalized) return
        setCode(normalized)
        setStatus(`Odczytano kod: ${normalized}`)
        submitRef.current({ code: normalized, comment: commentRef.current })
      },
    })

    scannerRef.current = scanner
    scanner.start().catch((error) => {
      setCameraError(txt(error?.message || 'Nie udało się uruchomić kamery.'))
      if (allowManualEntry) {
        setManualOpen(true)
      }
    })

    return () => {
      try {
        scanner.stop()
      } catch {
        // Ignore cleanup errors.
      }
      scannerRef.current = null
    }
  }, [allowManualEntry, scanState.open, scanState.nonce])

  const closeWithStop = () => {
    try {
      scannerRef.current?.stop()
    } catch {
      // Ignore.
    }
    onClose()
  }

  const handleTorchToggle = async () => {
    try {
      await scannerRef.current?.toggleTorch()
    } catch {
      // Ignore.
    }
  }

  const handleManualSubmit = () => {
    const normalized = normalizeQrValue(code)
    if (!normalized) {
      setStatus('Wpisz kod QR lub roomId.')
      return
    }
    try {
      scannerRef.current?.stop()
    } catch {
      // Ignore.
    }
    submitRef.current({ code: normalized, comment })
  }

  if (!scanState.open) return null
  return (
    <div className="modal" onClick={closeWithStop}>
      <div className="modal-content scan-modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{scanState.title || 'Skanuj QR'}</div>
          <button className="link-btn" type="button" onClick={closeWithStop}>
            Wróć
          </button>
        </div>
        <div className="modal-body col scan-modal-body">
          <div className="muted">{scanState.subtitle || 'Wpisz kod QR lub roomId.'}</div>
          <video ref={videoRef} className="scan-video" playsInline muted />
          <div className="scan-status">{cameraError || status || 'Skanuje...'}</div>
          <div className="row-inline">
            <button
              className="btn secondary"
              type="button"
              onClick={handleTorchToggle}
              disabled={!torchState.supported}
            >
              {torchState.supported ? `Latarka: ${torchState.enabled ? 'ON' : 'OFF'}` : 'Latarka niedostępna'}
            </button>
            {allowManualEntry ? (
              <button className="btn secondary" type="button" onClick={() => setManualOpen((prev) => !prev)}>
                {manualOpen ? 'Ukryj wpisywanie' : 'Wpisz recznie'}
              </button>
            ) : null}
          </div>
          {allowManualEntry && manualOpen ? (
            <div className="box col scan-manual">
              <div className="muted">Wpisz lub wklej kod QR / roomId.</div>
              <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Kod QR / roomId" />
            </div>
          ) : null}
          <input className="input" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Komentarz (opcjonalnie)" />
          {scanState.error ? <div className="error-inline">{scanState.error}</div> : null}
          <button className="btn primary" type="button" disabled={scanState.pending} onClick={handleManualSubmit}>
            {scanState.pending ? 'Przetwarzanie...' : 'Zatwierdz'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChecklistSection({ title, items, onToggle }) {
  if (!items.length) {
    return (
      <div className="box">
        <div className="tile-label">{title}</div>
        <div className="muted">Brak zadań.</div>
      </div>
    )
  }

  return (
    <div className="box col">
      <div className="tile-label">{title}</div>
      {items.map((item) => (
        <label className="checklist-item" key={item.key}>
          <input
            type="checkbox"
            checked={Boolean(item.checked)}
            onChange={(event) => onToggle(item.key, event.target.checked)}
          />
          <span>{item.taskName}</span>
        </label>
      ))}
    </div>
  )
}

function CloseCycleModal({
  open,
  state,
  checklistItems,
  onToggleTask,
  onReasonChange,
  onCommentChange,
  onCancel,
  onConfirm,
}) {
  if (!open) return null
  const showChecklist = Boolean(state.showChecklist)
  const unresolved = showChecklist ? (checklistItems || []).filter((item) => !item.checked) : []
  const mode = txt(state.mode) === 'workday-close' ? 'workday-close' : 'zone-close'
  const isWorkdayClose = mode === 'workday-close'
  const title = isWorkdayClose ? 'Zakończ dzień' : 'Zamknij strefę'
  const stopLabel = txt(state?.targetZone?.name || state?.targetZone?.id) || '-'

  return (
    <div className="modal" onClick={state.pending ? undefined : onCancel}>
      <div className="modal-content close-zone-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="link-btn" type="button" onClick={onCancel} disabled={state.pending}>
            Wróć
          </button>
        </div>
        <div className="modal-body col close-zone-body">
          {isWorkdayClose ? (
            <div className="muted">Zeskanowano STOP: {stopLabel}</div>
          ) : (
            <div className="muted">
              Zamykana: {txt(state?.activeCycle?.zoneName) || '-'}
              <br />
              Nastepna akcja: {txt(state?.targetZone?.name || state?.targetZone?.id) || '-'}
            </div>
          )}

          {showChecklist && checklistItems.length ? (
            <div className="box col">
              <div className="tile-label">Checklista strefy</div>
              {checklistItems.map((item) => (
                <div className="checklist-close-row" key={item.key}>
                  <label className="checklist-item">
                    <input
                      type="checkbox"
                      checked={Boolean(item.checked)}
                      onChange={(event) => onToggleTask(item.key, event.target.checked)}
                      disabled={state.pending}
                    />
                    <span>{item.taskName}</span>
                  </label>
                  {!item.checked ? (
                    <input
                      className="input"
                      value={item.reason || ''}
                      maxLength={CHECKLIST_REASON_MAX_LEN}
                      onChange={(event) => onReasonChange(item.key, event.target.value)}
                      placeholder="Przyczyna niewykonania (wymagana)"
                      disabled={state.pending}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {showChecklist && unresolved.length ? (
            <div className="muted">
              Zadania nieoznaczone jako OK wymagaja podania przyczyny.
            </div>
          ) : null}

          <div className="box col">
            <label className="muted">
              {isWorkdayClose ? 'Komentarz zakończenia dnia (opcjonalnie)' : 'Komentarz zamknięcia strefy (opcjonalnie)'}
            </label>
            <textarea
              className="textarea"
              value={state.closeComment}
              maxLength={CHECKLIST_REASON_MAX_LEN}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="Dodaj komentarz..."
              disabled={state.pending}
            />
          </div>

          {state.error ? <div className="error-inline">{state.error}</div> : null}

          <button className="btn primary" type="button" onClick={onConfirm} disabled={state.pending}>
            {state.pending ? 'Zapisywanie...' : isWorkdayClose ? 'Potwierdź zakończenie dnia' : 'Potwierdź zamknięcie'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WorkdayClosePromptModal({ open, pending, error, onChoose, onCancel }) {
  if (!open) return null
  return (
    <div className="modal" onClick={pending ? undefined : onCancel}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Zakonczenie dnia</div>
          <button className="link-btn" type="button" onClick={onCancel} disabled={pending}>
            Wróć
          </button>
        </div>
        <div className="modal-body col">
          <div className="muted">Czy zakończyć dzień pracy teraz?</div>
          <button className="btn primary" type="button" onClick={() => onChoose(true)} disabled={pending}>
            Tak
          </button>
          <button className="btn secondary" type="button" onClick={() => onChoose(false)} disabled={pending}>
            Nie
          </button>
          {error ? <div className="error-inline">{error}</div> : null}
        </div>
      </div>
    </div>
  )
}

function CoordinatorHome({ onDoAudit, onEditQr }) {
  return (
    <section className="card col">
      <div className="title-small">Strefa koordynatora</div>
      <div className="tile-grid">
        <button className="tile tile--success" type="button" onClick={onDoAudit}>
          <span className="tile-icon"><AuditPlusIcon /></span>
          <span className="tile-label">Wykonaj audyt</span>
        </button>
        <button className="tile" type="button" onClick={onEditQr}>
          <span className="tile-icon"><EditIcon /></span>
          <span className="tile-label">Edycja QR strefy</span>
        </button>
      </div>
    </section>
  )
}

function clamp(value, min, max) {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function formatDateTime(value) {
  const iso = parseIso(value)
  if (!iso) return '--'
  try {
    return new Date(iso).toLocaleString('pl-PL')
  } catch {
    return iso
  }
}

function scheduleShiftLabel(index) {
  if (index === 0) return 'Rano'
  if (index === 1) return 'Popoludnie'
  return `Zmiana ${index + 1}`
}

function CoordinatorAuditStart({ onNext, onBack }) {
  return (
    <section className="card col">
      <div className="title-small">Wykonaj audyt</div>
      <div className="box">
        <div className="tile-label">Start audytu</div>
        <div className="muted">Audyt jest dostępny tylko, gdy czas pracy ma status RUNNING dzisiaj.</div>
      </div>
      <button className="btn primary" type="button" onClick={onNext}>
        Dalej
      </button>
      <button className="btn secondary" type="button" onClick={onBack}>
        Wróć
      </button>
    </section>
  )
}

function CoordinatorAuditScan({ objectTimerText, auditTimerText, onScanZone, onEnd, onBack }) {
  return (
    <section className="card col">
      <div className="title-small">Wykonaj audyt</div>
      <div className="box">
        <div className="tile-label">Skanuj audytowaną strefę</div>
      </div>
      <button className="btn primary" type="button" onClick={onScanZone}>
        Skanuj QR strefy
      </button>
      <div className="tile-grid">
        <div className="tile tile--placeholder">
          <span className="tile-label">Licznik obiektu</span>
          <span className="tile-sub">{objectTimerText}</span>
        </div>
        <div className="tile tile--placeholder">
          <span className="tile-label">Licznik audytu</span>
          <span className="tile-sub">{auditTimerText}</span>
        </div>
      </div>
      <button className="btn secondary" type="button" onClick={onBack}>
        Wróć
      </button>
      <button className="btn secondary" type="button" onClick={onEnd}>
        Zakoncz audyt
      </button>
    </section>
  )
}

function CoordinatorAuditForm({ zoneId, cleanValue, comment, onPick, onComment, onSend, onBack }) {
  return (
    <section className="card col">
      <div className="title-small">Audyt strefy</div>
      <div className="muted">QR: {zoneId || '-'}</div>
      <div className="box">
        <div className="tile-label">Czy jest tu czysto?</div>
        <div className="row-inline">
          <button className={`btn ${cleanValue === 1 ? 'primary' : 'secondary'}`} type="button" onClick={() => onPick(1)}>
            TAK
          </button>
          <button className={`btn ${cleanValue === 0 ? 'primary' : 'secondary'}`} type="button" onClick={() => onPick(0)}>
            NIE
          </button>
        </div>
      </div>
      <div className="box col">
        <label className="muted">Komentarz (opcjonalnie)</label>
        <textarea className="textarea" maxLength={300} value={comment} onChange={(event) => onComment(event.target.value)} placeholder="Dodaj komentarz..." />
      </div>
      <button className="btn primary" type="button" onClick={onSend}>
        Wyslij audyt
      </button>
      <button className="btn secondary" type="button" onClick={onBack}>
        Wróć
      </button>
    </section>
  )
}

function CoordinatorEditQr({
  loading,
  clients,
  form,
  onBack,
  onScan,
  onSave,
  onFormChange,
}) {
  return (
    <section className="card col">
      <div className="title-small">Przypisz QR do strefy</div>
      {loading ? <div className="muted">Wczytywanie danych...</div> : null}
      <div className="row-inline">
        <button className="btn primary" type="button" onClick={onScan} disabled={loading}>
          Skanuj QR
        </button>
        <button className="btn secondary" type="button" onClick={onSave} disabled={loading}>
          Zapisz
        </button>
      </div>

      <div className="col">
        <label className="muted">ID z kodu QR</label>
        <input className="input" value={form.qrId} readOnly placeholder="Kliknij Skanuj QR" />

        <label className="muted">Funkcja kodu</label>
        <select className="input" value={form.functionName} onChange={(event) => onFormChange('functionName', event.target.value)} disabled={loading}>
          {QR_FUNCTION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label className="muted">Nazwa klienta</label>
        <select className="input" value={form.clientName} onChange={(event) => onFormChange('clientName', event.target.value)} disabled={loading}>
          <option value="">Wybierz...</option>
          {clients.map((row) => (
            <option key={row.clientId} value={row.name}>
              {row.name}
            </option>
          ))}
        </select>

        <label className="muted">Strefa / pomieszczenie</label>
        <select className="input" value={form.placeName} onChange={(event) => onFormChange('placeName', event.target.value)} disabled={loading}>
          <option value="">Wybierz...</option>
          {QR_PLACE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label className="muted">Lokalizacja strefy</label>
        <input className="input" value={form.location} onChange={(event) => onFormChange('location', event.target.value)} placeholder="Wpisz lokalizację..." disabled={loading} />
      </div>

      <button className="btn secondary" type="button" onClick={onBack}>
        Wróć
      </button>
    </section>
  )
}

export default function App() {
  const [session, setSession] = useState(() => getMobileSession())
  const [snapshot, setSnapshot] = useState(null)
  const [view, setView] = useState(() => (getMobileSession()?.token ? VIEW.MENU : VIEW.LOGIN))
  const [notice, setNotice] = useState('')
  const [tick, setTick] = useState(Date.now())
  const [refreshPending, setRefreshPending] = useState(false)
  const [refreshNoticeHidden, setRefreshNoticeHidden] = useState(false)
  const [loginPending, setLoginPending] = useState(false)
  const [operationPending, setOperationPending] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [worklogMonth, setWorklogMonth] = useState(() => monthNow())
  const [summaryMonth, setSummaryMonth] = useState(() => monthNow())
  const [scanState, setScanState] = useState({ open: false, title: 'Skanuj QR', subtitle: '', pending: false, error: '', intent: 'workflow', nonce: 0 })
  const [coordView, setCoordView] = useState(COORD.HOME)
  const [coordBusy, setCoordBusy] = useState(false)
  const [coordClients, setCoordClients] = useState([])
  const [coordZones, setCoordZones] = useState([])
  const [coordAuditZoneId, setCoordAuditZoneId] = useState('')
  const [coordAuditClean, setCoordAuditClean] = useState(null)
  const [coordAuditComment, setCoordAuditComment] = useState('')
  const [coordAuditStartedAt, setCoordAuditStartedAt] = useState('')
  const [coordEditForm, setCoordEditForm] = useState({
    qrId: '',
    functionName: defaultQrFunctionLabel(),
    clientName: '',
    placeName: '',
    location: '',
  })
  const [schedulePending, setSchedulePending] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [schedulePayload, setSchedulePayload] = useState({
    matched: false,
    worker: { workerId: '', login: '', email: '', name: '' },
    sync: { fetchedAtIso: '', cacheExpiresAtIso: '', cacheTtlMinutes: 15 },
    schedule: { days: [], fingerprint: '' },
  })
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0)
  const [scheduleUpdatedPopupOpen, setScheduleUpdatedPopupOpen] = useState(false)
  const [versionPopupOpen, setVersionPopupOpen] = useState(() => !getMobileSession()?.token)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState('')
  const [checklistErrorKind, setChecklistErrorKind] = useState('')
  const [checklistMeta, setChecklistMeta] = useState({
    zoneId: '',
    zoneName: '',
    clientName: '',
    location: '',
  })
  const [checklistItems, setChecklistItems] = useState([])
  const [closeCycleState, setCloseCycleState] = useState(() => createCloseCycleState())
  const [workdayClosePromptState, setWorkdayClosePromptState] = useState(() => createWorkdayClosePromptState())

  const scheduleFingerprintRef = useRef('')
  const scheduleTouchStartRef = useRef(null)
  const lastUserActivityMsRef = useRef(Date.now())
  const lastUserActivityDayRef = useRef(localDayKey(new Date().toISOString()))
  const inactivityMidnightHandledRef = useRef(false)

  const markUserActivity = useCallback(() => {
    lastUserActivityMsRef.current = Date.now()
    lastUserActivityDayRef.current = localDayKey(new Date().toISOString())
    inactivityMidnightHandledRef.current = false
  }, [])

  const resetCloseCycleState = useCallback(() => {
    setCloseCycleState(createCloseCycleState())
  }, [])

  const resetWorkdayClosePromptState = useCallback(() => {
    setWorkdayClosePromptState(createWorkdayClosePromptState())
  }, [])

  const resetCoordinatorAuditState = useCallback(() => {
    setCoordAuditZoneId('')
    setCoordAuditClean(null)
    setCoordAuditComment('')
    setCoordAuditStartedAt('')
  }, [])

  const forceLoginWithMessage = useCallback((message) => {
    setSession(null)
    setSnapshot(null)
    setView(VIEW.LOGIN)
    setSettingsOpen(false)
    setScanState((prev) => ({ ...prev, open: false, pending: false, error: '' }))
    setCoordView(COORD.HOME)
    setCoordClients([])
    setCoordZones([])
    setCoordBusy(false)
    resetCoordinatorAuditState()
    setSchedulePending(false)
    setScheduleError('')
    setSchedulePayload({
      matched: false,
      worker: { workerId: '', login: '', email: '', name: '' },
      sync: { fetchedAtIso: '', cacheExpiresAtIso: '', cacheTtlMinutes: 15 },
      schedule: { days: [], fingerprint: '' },
    })
    setScheduleDayIndex(0)
    setScheduleUpdatedPopupOpen(false)
    setVersionPopupOpen(true)
    setChecklistLoading(false)
    setChecklistError('')
    setChecklistErrorKind('')
    setChecklistMeta({ zoneId: '', zoneName: '', clientName: '', location: '' })
    setChecklistItems([])
    setCloseCycleState(createCloseCycleState())
    setWorkdayClosePromptState(createWorkdayClosePromptState())
    scheduleFingerprintRef.current = ''
    setNotice(txt(message) || 'Sesja wygasła. Zaloguj się ponownie.')
  }, [resetCoordinatorAuditState])

  const applySchedulePayload = useCallback((nextPayload, options = {}) => {
    const safePayload = nextPayload || {
      matched: false,
      worker: { workerId: '', login: '', email: '', name: '' },
      sync: { fetchedAtIso: '', cacheExpiresAtIso: '', cacheTtlMinutes: 15 },
      schedule: { days: [], fingerprint: '' },
    }

    setSchedulePayload(safePayload)
    const daysCount = Array.isArray(safePayload.schedule?.days) ? safePayload.schedule.days.length : 0
    setScheduleDayIndex((prev) => clamp(prev, 0, Math.max(0, daysCount - 1)))

    const fingerprint = txt(safePayload.schedule?.fingerprint)
    if (
      options.fromAutoSync &&
      scheduleFingerprintRef.current &&
      fingerprint &&
      scheduleFingerprintRef.current !== fingerprint
    ) {
      setScheduleUpdatedPopupOpen(true)
    }

    if (fingerprint) {
      scheduleFingerprintRef.current = fingerprint
    }
  }, [])

  const refresh = useCallback(async (activeSession, options = {}) => {
    if (!activeSession?.token) return
    if (!options.silent) setRefreshPending(true)
    try {
      const next = await getMobileSnapshot(activeSession)
      setSnapshot(next)
      setSession((prev) => {
        if (!prev) return prev
        const workerLogin = txt(next?.worker?.login)
        const workerName = txt(next?.worker?.name)
        if (prev.workerLogin === workerLogin && prev.workerName === workerName) return prev
        return writeMobileSession({ ...prev, workerLogin, workerName })
      })
    } finally {
      if (!options.silent) setRefreshPending(false)
    }
  }, [])

  const refreshSchedule = useCallback(async (activeSession, options = {}) => {
    if (!activeSession?.token) return
    if (!options.silent) setSchedulePending(true)
    setScheduleError('')
    try {
      const next = await fetchMobileSchedule(activeSession)
      applySchedulePayload(next, { fromAutoSync: Boolean(options.fromAutoSync) })
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setScheduleError(parseErrorMessage(error, 'Nie udało się pobrać grafiku.'))
    } finally {
      if (!options.silent) setSchedulePending(false)
    }
  }, [applySchedulePayload, forceLoginWithMessage])

  useEffect(() => {
    ensureFirebaseAnalytics().catch(() => null)
  }, [])

  useEffect(() => {
    if (!session?.token) return
    refresh(session).catch((error) => {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setNotice(parseErrorMessage(error, 'Nie udało się pobrać danych.'))
    })
  }, [forceLoginWithMessage, refresh, session])

  useEffect(() => {
    if (!session?.token) {
      inactivityMidnightHandledRef.current = false
      return
    }
    markUserActivity()
    const onUserActivity = () => markUserActivity()
    const passiveOptions = { passive: true }
    window.addEventListener('pointerdown', onUserActivity, passiveOptions)
    window.addEventListener('touchstart', onUserActivity, passiveOptions)
    window.addEventListener('keydown', onUserActivity)
    window.addEventListener('focus', onUserActivity)
    return () => {
      window.removeEventListener('pointerdown', onUserActivity, passiveOptions)
      window.removeEventListener('touchstart', onUserActivity, passiveOptions)
      window.removeEventListener('keydown', onUserActivity)
      window.removeEventListener('focus', onUserActivity)
    }
  }, [markUserActivity, session?.token])

  useEffect(() => {
    if (!session?.token) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session?.token])

  useEffect(() => {
    if (!session?.token) return
    const timer = setInterval(
      () =>
        refresh(session, { silent: true }).catch((error) => {
          if (isUnauthenticatedError(error)) {
            forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
          }
        }),
      30000,
    )
    return () => clearInterval(timer)
  }, [forceLoginWithMessage, refresh, session])

  useEffect(() => {
    if (!session?.token || view !== VIEW.SCHEDULE) return
    refreshSchedule(session, { silent: false, fromAutoSync: false })
  }, [refreshSchedule, session, view])

  useEffect(() => {
    if (!session?.token || view !== VIEW.SCHEDULE) return
    const timer = setInterval(
      () => refreshSchedule(session, { silent: true, fromAutoSync: true }),
      SCHEDULE_SYNC_MS,
    )
    return () => clearInterval(timer)
  }, [refreshSchedule, session, view])

  useEffect(() => {
    if (!refreshPending) setRefreshNoticeHidden(false)
  }, [refreshPending])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), NOTICE_AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!refreshPending || refreshNoticeHidden) return
    const timer = setTimeout(() => setRefreshNoticeHidden(true), NOTICE_AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [refreshNoticeHidden, refreshPending])

  const nowIso = useMemo(() => new Date(tick).toISOString(), [tick])
  const activeWorkday = snapshot?.activeWorkday
  const activePause = snapshot?.activePause
  const activeCycle = snapshot?.activeCycle
  const activeCycleZoneId = txt(activeCycle?.zoneId)
  const activeCycleZoneName = txt(activeCycle?.zoneName)
  const activeCycleClientName = txt(activeCycle?.clientName)
  const activeCycleLocation = txt(activeCycle?.location)
  const pauseOpen = useMemo(() => isPauseOpen(activePause), [activePause])
  const pauseTimer = useMemo(
    () => (pauseOpen ? hms(getPauseSeconds(activePause, nowIso)) : '00:00:00'),
    [activePause, nowIso, pauseOpen],
  )
  const activeCycleOpen = useMemo(() => isCycleOpen(activeCycle), [activeCycle])
  const activeCycleKey = useMemo(
    () => `${txt(activeCycle?.eventId || activeCycle?.cycleId)}:${activeCycleZoneId}`,
    [activeCycle?.eventId, activeCycle?.cycleId, activeCycleZoneId],
  )
  const liveWorkdayOpen = useMemo(() => isLiveWorkday(activeWorkday, nowIso), [activeWorkday, nowIso])
  const pauseTotalSec = useMemo(() => {
    const snapshotValue = Number(snapshot?.pauseTotalSec)
    const snapshotTotal = Number.isFinite(snapshotValue) && snapshotValue >= 0 ? Math.floor(snapshotValue) : 0
    let total = getWorkdayPauseSeconds(activeWorkday, nowIso)
    if (pauseOpen && !parseIso(activeWorkday?.pauseOpenAt)) {
      total += getPauseSeconds(activePause, nowIso)
    }
    return Math.max(0, Math.max(snapshotTotal, total))
  }, [activePause, activeWorkday, nowIso, pauseOpen, snapshot?.pauseTotalSec])
  const topActionIsStart = !liveWorkdayOpen
  const workdayTimer = useMemo(
    () => (liveWorkdayOpen ? hms(Math.max(0, getWorkdaySeconds(activeWorkday, nowIso) - pauseTotalSec)) : '--:--:--'),
    [activeWorkday, nowIso, liveWorkdayOpen, pauseTotalSec],
  )
  const cycleTimer = useMemo(() => (isCycleOpen(activeCycle) ? hms(secBetween(activeCycle?.startAt, nowIso)) : '--:--:--'), [activeCycle, nowIso])
  const startLabel = useMemo(() => (liveWorkdayOpen ? `START ${formatTime(activeWorkday?.startAt)}` : ''), [activeWorkday?.startAt, liveWorkdayOpen])
  const endingLeft = useMemo(() => {
    if (up(activeWorkday?.status) !== 'ENDING') return '00:00'
    const endIso = parseIso(activeWorkday?.endAt)
    if (!endIso) return '00:00'
    const left = Math.max(0, Math.floor((new Date(endIso).getTime() - tick) / 1000))
    return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
  }, [activeWorkday?.status, activeWorkday?.endAt, tick])

  useEffect(() => {
    if (!session?.token) return
    if (up(activeWorkday?.status) !== 'ENDING') return
    const endIso = parseIso(activeWorkday?.endAt)
    if (!endIso) return

    const refreshEndingState = () =>
      refresh(session, { silent: true }).catch((error) => {
        if (isUnauthenticatedError(error)) {
          forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        }
      })

    const delayMs = new Date(endIso).getTime() - Date.now()
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      refreshEndingState()
      return
    }

    const timer = setTimeout(refreshEndingState, delayMs + 500)
    return () => clearTimeout(timer)
  }, [activeWorkday?.status, activeWorkday?.endAt, forceLoginWithMessage, refresh, session])

  const worklogDays = useMemo(() => groupWorklog(snapshot?.workdayEvents || [], worklogMonth), [snapshot?.workdayEvents, worklogMonth])
  const summaryData = useMemo(() => buildSummary(snapshot?.workdays || [], summaryMonth, nowIso), [snapshot?.workdays, summaryMonth, nowIso])
  const coordinatorAccess = useMemo(
    () => hasCoordinatorAccess(snapshot?.worker?.role, session?.role),
    [session?.role, snapshot?.worker?.role],
  )
  const manualQrAccess = useMemo(
    () => hasManualQrAccess(snapshot?.worker?.role, session?.role),
    [session?.role, snapshot?.worker?.role],
  )
  const coordObjectCounter = useMemo(
    () => (liveWorkdayOpen ? hms(secBetween(activeWorkday?.startAt, nowIso)) : '00:00:00'),
    [activeWorkday, nowIso, liveWorkdayOpen],
  )
  const coordAuditCounter = useMemo(
    () => (coordAuditStartedAt ? hms(secBetween(coordAuditStartedAt, nowIso)) : '00:00:00'),
    [coordAuditStartedAt, nowIso],
  )
  const scheduleDays = useMemo(
    () => (Array.isArray(schedulePayload.schedule?.days) ? schedulePayload.schedule.days : []),
    [schedulePayload.schedule?.days],
  )
  const scheduleSelectedDay = useMemo(() => {
    if (!scheduleDays.length) return null
    return scheduleDays[clamp(scheduleDayIndex, 0, scheduleDays.length - 1)] || null
  }, [scheduleDayIndex, scheduleDays])
  const scheduleCanPrev = scheduleDayIndex > 0
  const scheduleCanNext = scheduleDayIndex < scheduleDays.length - 1
  const scheduleVisibleShiftIndexes = useMemo(() => {
    if (!scheduleSelectedDay) return [0, 1]
    const extra = Array.from(
      new Set(
        (Array.isArray(scheduleSelectedDay.shifts) ? scheduleSelectedDay.shifts : [])
          .map((shift) => Number(shift?.slotIndex))
          .filter((value) => Number.isFinite(value) && value >= 2),
      ),
    ).sort((left, right) => left - right)
    return [0, 1, ...extra]
  }, [scheduleSelectedDay])
  const checklistSplit = useMemo(() => splitChecklistItems(checklistItems), [checklistItems])
  const globalPending = useMemo(
    () =>
      Boolean(
        operationPending ||
          loginPending ||
          refreshPending ||
          schedulePending ||
          scanState.pending ||
          closeCycleState.pending ||
          workdayClosePromptState.pending ||
          coordBusy,
      ),
    [
      closeCycleState.pending,
      coordBusy,
      loginPending,
      operationPending,
      refreshPending,
      scanState.pending,
      schedulePending,
      workdayClosePromptState.pending,
    ],
  )

  useEffect(() => {
    if (!CHECKLIST_ENABLED) {
      setChecklistLoading(false)
      setChecklistError('')
      setChecklistErrorKind('')
      setChecklistMeta({
        zoneId: '',
        zoneName: activeCycleZoneName,
        clientName: activeCycleClientName,
        location: activeCycleLocation,
      })
      setChecklistItems([])
      return
    }

    if (!session?.token || !txt(session?.orgId)) {
      setChecklistLoading(false)
      setChecklistError('')
      setChecklistErrorKind('')
      setChecklistMeta({ zoneId: '', zoneName: '', clientName: '', location: '' })
      setChecklistItems([])
      return
    }

    if (!activeCycleOpen || !activeCycleZoneId) {
      setChecklistLoading(false)
      setChecklistError('')
      setChecklistErrorKind('')
      setChecklistMeta({
        zoneId: '',
        zoneName: activeCycleZoneName,
        clientName: activeCycleClientName,
        location: activeCycleLocation,
      })
      setChecklistItems([])
      return
    }

    let cancelled = false
    setChecklistLoading(true)
    setChecklistError('')
    setChecklistErrorKind('')

    const zoneRef = {
      id: activeCycleZoneId,
      zoneName: activeCycleZoneName,
      clientName: activeCycleClientName,
      location: activeCycleLocation,
    }

    fetchZoneChecklistDefinition(session, zoneRef)
      .then((definition) => {
        if (cancelled) return
        const list = [...(definition.additionalTasks || []), ...(definition.standardTasks || [])]
        setChecklistMeta({
          zoneId: txt(definition.zoneId || zoneRef.id),
          zoneName: txt(definition.zoneName || zoneRef.zoneName),
          clientName: txt(definition.clientName || zoneRef.clientName),
          location: txt(definition.location || zoneRef.location),
        })
        setChecklistItems(list)
      })
      .catch((error) => {
        if (cancelled) return
        const parsed = parseChecklistLoadError(error)
        setChecklistError(parsed.message)
        setChecklistErrorKind(parsed.kind)
        setChecklistMeta(zoneRef)
        setChecklistItems([])
      })
      .finally(() => {
        if (!cancelled) setChecklistLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeCycleClientName, activeCycleKey, activeCycleLocation, activeCycleOpen, activeCycleZoneId, activeCycleZoneName, session?.orgId, session?.token])

  useEffect(() => {
    if (!closeCycleState.open) return
    const closeMode = txt(closeCycleState.mode) === 'workday-close' ? 'workday-close' : 'zone-close'
    if (closeMode === 'zone-close' && !activeCycleOpen) {
      resetCloseCycleState()
      return
    }
    if (closeMode === 'workday-close') {
      return
    }
    const modalCycleKey = `${txt(closeCycleState.activeCycle?.eventId || closeCycleState.activeCycle?.cycleId)}:${txt(closeCycleState.activeCycle?.zoneId)}`
    if (modalCycleKey && modalCycleKey !== activeCycleKey) {
      resetCloseCycleState()
    }
  }, [activeCycleKey, activeCycleOpen, closeCycleState.activeCycle?.cycleId, closeCycleState.activeCycle?.eventId, closeCycleState.activeCycle?.zoneId, closeCycleState.mode, closeCycleState.open, resetCloseCycleState])

  const openScan = (intent, title, subtitle) => {
    setScanState((prev) => ({ open: true, title, subtitle, pending: false, error: '', intent, nonce: prev.nonce + 1 }))
  }

  const goSchedulePrev = useCallback(() => {
    setScheduleDayIndex((prev) => clamp(prev - 1, 0, scheduleDays.length - 1))
  }, [scheduleDays.length])

  const goScheduleNext = useCallback(() => {
    setScheduleDayIndex((prev) => clamp(prev + 1, 0, scheduleDays.length - 1))
  }, [scheduleDays.length])

  const onScheduleTouchStart = useCallback((event) => {
    const x = event.changedTouches?.[0]?.clientX
    scheduleTouchStartRef.current = Number.isFinite(x) ? x : null
  }, [])

  const onScheduleTouchEnd = useCallback((event) => {
    const startX = scheduleTouchStartRef.current
    scheduleTouchStartRef.current = null
    if (!Number.isFinite(startX)) return
    const endX = event.changedTouches?.[0]?.clientX
    if (!Number.isFinite(endX)) return
    const delta = endX - startX
    if (Math.abs(delta) < SCHEDULE_SWIPE_THRESHOLD_PX) return
    if (delta > 0) goSchedulePrev()
    if (delta < 0) goScheduleNext()
  }, [goScheduleNext, goSchedulePrev])

  const setChecklistItemChecked = useCallback((taskKey, checkedValue) => {
    setChecklistItems((prev) =>
      prev.map((item) => {
        if (item.key !== taskKey) return item
        return {
          ...item,
          checked: Boolean(checkedValue),
          reason: checkedValue ? '' : item.reason,
        }
      }),
    )
  }, [])

  const setChecklistItemReason = useCallback((taskKey, reasonValue) => {
    const normalized = txt(reasonValue).slice(0, CHECKLIST_REASON_MAX_LEN)
    setChecklistItems((prev) =>
      prev.map((item) => (item.key === taskKey ? { ...item, reason: normalized } : item)),
    )
  }, [])

  const closeScan = useCallback(() => {
    setScanState((prev) => ({ ...prev, open: false, pending: false, error: '' }))
  }, [])

  const openCoordinatorPanel = useCallback(() => {
    if (!coordinatorAccess) {
      setNotice('Nie masz dostępu do modułu koordynatora.')
      return
    }
    setCoordView(COORD.HOME)
    setView(VIEW.COORDINATOR)
  }, [coordinatorAccess])

  const ensureRunningToday = useCallback(
    (nextSnapshot) => {
      const candidate = nextSnapshot || snapshot
      const workday = candidate?.activeWorkday
      const status = up(workday?.status)
      if (status === 'RUNNING' && isSameLocalDay(workday?.startAt, nowIso)) {
        return { ok: true, stale: false }
      }
      if (isWorkdayOpen(workday) && !isSameLocalDay(workday?.startAt, nowIso)) {
        return { ok: false, stale: true }
      }
      return { ok: false, stale: false }
    },
    [nowIso, snapshot],
  )

  const ensureCoordinatorEditContext = useCallback(async () => {
    if (!session?.token) return
    setCoordBusy(true)
    try {
      const context = await loadCoordinatorContext(session)
      setCoordClients(context.clients)
      setCoordZones(context.zones)
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      throw error
    } finally {
      setCoordBusy(false)
    }
  }, [forceLoginWithMessage, session])

  const openCoordinatorEdit = useCallback(async () => {
    if (!coordinatorAccess) {
      setNotice('Nie masz dostępu do modułu koordynatora.')
      return
    }
    setCoordView(COORD.EDIT_QR)
    setCoordEditForm({
      qrId: '',
      functionName: defaultQrFunctionLabel(),
      clientName: '',
      placeName: '',
      location: '',
    })
    try {
      await ensureCoordinatorEditContext()
    } catch (error) {
      setNotice(parseErrorMessage(error, 'Nie udało się wczytać danych koordynatora.'))
    }
  }, [coordinatorAccess, ensureCoordinatorEditContext])

  const openCoordinatorAuditStart = useCallback(() => {
    if (!coordinatorAccess) {
      setNotice('Nie masz dostępu do modułu koordynatora.')
      return
    }
    resetCoordinatorAuditState()
    setCoordView(COORD.AUDIT_START)
  }, [coordinatorAccess, resetCoordinatorAuditState])

  const doCoordinatorAuditCheck = useCallback(() => {
    const state = ensureRunningToday()
    if (state.ok) {
      setCoordView(COORD.AUDIT_SCAN)
      if (!coordAuditStartedAt) setCoordAuditStartedAt(nowIso)
      return
    }

    const message = state.stale
      ? 'Masz otwarty dzień z poprzedniego dnia. Zeskanuj START dzisiaj, aby rozpocząć pracę.'
      : 'Brak START dzisiaj. Zeskanuj START obiektu, aby rozpocząć pracę.'
    setNotice(message)
    openScan('coordinator-audit-start', 'START obiektu (audyt)', 'Zeskanuj kod START obiektu.')
  }, [coordAuditStartedAt, ensureRunningToday, nowIso])

  const doCoordinatorAuditSend = useCallback(async () => {
    if (!session?.token || !snapshot) return
    if (coordAuditClean !== 0 && coordAuditClean !== 1) {
      setNotice('Wybierz TAK lub NIE.')
      return
    }
    try {
      setCoordBusy(true)
      await logAuditZone(session, snapshot, {
        zoneId: coordAuditZoneId,
        cleanValue: coordAuditClean,
        comment: coordAuditComment,
      })
      setCoordAuditZoneId('')
      setCoordAuditClean(null)
      setCoordAuditComment('')
      setCoordView(COORD.AUDIT_SCAN)
      setNotice('Zapisano audyt strefy.')
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setNotice(parseErrorMessage(error, 'Nie udało się zapisać audytu.'))
    } finally {
      setCoordBusy(false)
    }
  }, [coordAuditClean, coordAuditComment, coordAuditZoneId, forceLoginWithMessage, session, snapshot])

  const doCoordinatorQrSave = useCallback(async () => {
    if (!session?.token) return
    try {
      setCoordBusy(true)
      await saveZoneAssignment(
        session,
        {
          clients: coordClients,
          zones: coordZones,
        },
        coordEditForm,
      )
      await ensureCoordinatorEditContext()
      setNotice('Zapisano.')
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setNotice(parseErrorMessage(error, 'Błąd zapisu strefy.'))
    } finally {
      setCoordBusy(false)
    }
  }, [coordClients, coordEditForm, coordZones, ensureCoordinatorEditContext, forceLoginWithMessage, session])

  const doLogin = async ({ login, password }) => {
    setLoginPending(true)
    setLoginError('')
    setNotice('')
    try {
      const nextSession = await loginMobile({ login, password })
      setSession(nextSession)
      setView(VIEW.MENU)
      setWorklogMonth(monthNow())
      setSummaryMonth(monthNow())
      await refresh(nextSession)
    } catch (error) {
      setLoginError(parseErrorMessage(error, 'Błąd logowania.'))
    } finally {
      setLoginPending(false)
    }
  }

  const doLogout = async (options = {}) => {
    const showVersionPopup = options?.showVersionPopup !== false
    const logoutNotice = txt(options?.notice)
    try {
      await logoutMobile()
    } finally {
      setSession(null)
      setSnapshot(null)
      setView(VIEW.LOGIN)
      setSettingsOpen(false)
      setVersionPopupOpen(showVersionPopup)
      closeScan()
      setCoordView(COORD.HOME)
      setCoordClients([])
      setCoordZones([])
      setCoordBusy(false)
      resetCoordinatorAuditState()
      setChecklistLoading(false)
      setChecklistError('')
      setChecklistErrorKind('')
      setChecklistMeta({ zoneId: '', zoneName: '', clientName: '', location: '' })
      setChecklistItems([])
      setCloseCycleState(createCloseCycleState())
      setWorkdayClosePromptState(createWorkdayClosePromptState())
      setNotice(logoutNotice)
    }
  }

  useEffect(() => {
    if (!session?.token) return
    const nowDayKey = localDayKey(new Date(tick).toISOString())
    const lastActivityDayKey = txt(lastUserActivityDayRef.current)
    if (!nowDayKey || !lastActivityDayKey || nowDayKey === lastActivityDayKey) return
    if (inactivityMidnightHandledRef.current) return

    const inactiveMs = Date.now() - Number(lastUserActivityMsRef.current || Date.now())
    if (!Number.isFinite(inactiveMs) || inactiveMs < 1000) return

    inactivityMidnightHandledRef.current = true
    doLogout({
      showVersionPopup: false,
      notice: 'Wylogowano automatycznie o północy z powodu braku aktywności.',
    }).catch(() => null)
  }, [doLogout, session?.token, tick])

  const findZoneInSnapshot = useCallback((targetSnapshot, scannedCode) => {
    const normalizedCode = txt(scannedCode)
    if (!normalizedCode) {
      return null
    }

    const zones = Array.isArray(targetSnapshot?.zones) ? targetSnapshot.zones : []
    return (
      findZoneByQrId(zones, normalizedCode) ||
      zones.find((zone) => normalizeKey(zone?.id) === normalizeKey(normalizedCode)) ||
      null
    )
  }, [])

  const processWorkflowScan = useCallback(async ({ code, comment, intent, closeMeta }) => {
    const normalizedCode = txt(code)
    if (!normalizedCode) {
      throw new Error('Wpisz kod QR lub roomId.')
    }

    let snapshotForScan = snapshot
    let scannedZone = findZoneInSnapshot(snapshotForScan, normalizedCode)
    if (!scannedZone) {
      try {
        const refreshedSnapshot = await getMobileSnapshot(session)
        snapshotForScan = refreshedSnapshot
        setSnapshot(refreshedSnapshot)
        scannedZone = findZoneInSnapshot(refreshedSnapshot, normalizedCode)
      } catch {
        // Keep original snapshot and fallback to generic error below.
      }
    }

    if (!scannedZone) {
      if (!(snapshotForScan?.zones || []).length) {
        throw new Error('Brak listy stref dla tej sesji. Odśwież dane lub zaloguj się ponownie.')
      }
      throw new Error('Nie znaleziono kodu QR w bazie stref.')
    }

    const activeCycleForScan = snapshotForScan?.activeCycle || activeCycle
    const activeWorkdayForScan = snapshotForScan?.activeWorkday || snapshot?.activeWorkday
    const closeReason = resolveCycleCloseReason(activeCycleForScan, scannedZone)
    const isStopScan = up(scannedZone?.kind) === 'STOP'
    const offerWorkdayClose = txt(closeReason) === 'QR_SAME' && isSpecialOrIndividualCleanFunction(scannedZone?.functionName)
    const closeConfirmed = Boolean(closeMeta?.confirmed)
    if ((closeReason || isStopScan) && !closeConfirmed) {
      closeScan()
      const mode = isStopScan ? 'workday-close' : closeReason ? 'zone-close' : 'workday-close'
      setCloseCycleState(createCloseCycleState({
        open: true,
        intent,
        code: normalizedCode,
        closeReason: txt(closeReason || 'STOP_END_DAY'),
        closeComment: txt(comment),
        targetZone: scannedZone,
        activeCycle: activeCycleForScan,
        mode,
        showChecklist: CHECKLIST_ENABLED && mode === 'zone-close',
        offerWorkdayClose: mode === 'zone-close' && offerWorkdayClose,
      }))
      return { deferred: true }
    }

    const warnings = []
    if (closeConfirmed) {
      const closeMode = txt(closeMeta?.mode) === 'workday-close' ? 'workday-close' : 'zone-close'
      const itemsForSave = Array.isArray(closeMeta?.checklistItems) ? closeMeta.checklistItems : checklistItems
      const uploadedAttachments = []

      if (CHECKLIST_ENABLED && closeMode === 'zone-close') {
        try {
          await saveZoneChecklistResult({
            session,
            activeCycle: activeCycleForScan,
            zone: {
              id: txt(activeCycleForScan?.zoneId || scannedZone?.id),
              zoneName: txt(activeCycleForScan?.zoneName || checklistMeta?.zoneName),
              clientName: txt(activeCycleForScan?.clientName || checklistMeta?.clientName),
              location: txt(activeCycleForScan?.location || checklistMeta?.location),
            },
            closeReason: txt(closeMeta?.closeReason || closeReason),
            closeComment: txt(closeMeta?.closeComment || comment),
            closeAttachmentsMeta: uploadedAttachments,
            checklistItems: itemsForSave,
          })
        } catch (error) {
          const saveMessage = isPermissionDeniedError(error)
            ? 'Brak uprawnień do zapisu checklisty strefy.'
            : parseErrorMessage(error, 'Nie zapisano checklisty strefy.')
          warnings.push(saveMessage)
        }
      }

      if (isStopScan) {
        try {
          await saveWorkdayCloseResult({
            session,
            workday: activeWorkdayForScan,
            stopZone: scannedZone,
            closeComment: txt(closeMeta?.closeComment || comment),
            closeAttachmentsMeta: uploadedAttachments,
          })
        } catch (error) {
          warnings.push(parseErrorMessage(error, 'Nie zapisano metadanych zamknięcia dnia.'))
        }
      }
    }

    const result = await scanMobileQr({
      session,
      snapshot: snapshotForScan,
      qrCode: normalizedCode,
      comment: txt(comment),
      closeWorkdayImmediately: Boolean(closeMeta?.closeWorkdayNow),
    })
    const warningText = warnings.length ? ` ${warnings.map((message) => `Uwaga: ${message}`).join(' ')}` : ''
    const resultMessage = `${txt(result.message)}${warningText}`.trim()
    const autoLogoutAfterWorkdayClose = Boolean(closeMeta?.closeWorkdayNow)

    if (isStopScan || autoLogoutAfterWorkdayClose) {
      closeScan()
      const logoutReason = isStopScan
        ? 'Wylogowano automatycznie po zeskanowaniu kodu STOPx.'
        : 'Wylogowano automatycznie po zakończeniu dnia pracy.'
      await doLogout({
        showVersionPopup: false,
        notice: `${resultMessage} ${logoutReason}`.trim(),
      })
      return { deferred: false }
    }

    setSnapshot(result.snapshot)
    setNotice(resultMessage)
    const nextView = intent === 'menu' ? VIEW.MENU : resolveWorkflowView(result.snapshot)
    setView(nextView)
    closeScan()
    return { deferred: false }
  }, [activeCycle, checklistItems, checklistMeta?.clientName, checklistMeta?.location, checklistMeta?.zoneName, closeScan, doLogout, findZoneInSnapshot, session, snapshot])

  const onCloseCycleCancel = useCallback(() => {
    if (closeCycleState.pending) return
    resetCloseCycleState()
  }, [closeCycleState.pending, resetCloseCycleState])

  const onCloseCycleConfirm = useCallback(async () => {
    const checklistEnabled = CHECKLIST_ENABLED && Boolean(closeCycleState.showChecklist)
    const missingReasons = checklistEnabled ? unresolvedChecklistItems(checklistItems) : []
    if (checklistEnabled && missingReasons.length) {
      setCloseCycleState((prev) => ({
        ...prev,
        error: 'Uzupełnij przyczynę niewykonania dla wszystkich nieodhaczonych zadań.',
      }))
      return
    }

    if (closeCycleState.offerWorkdayClose) {
      setWorkdayClosePromptState(createWorkdayClosePromptState({
        open: true,
        code: closeCycleState.code,
        intent: closeCycleState.intent || 'workflow',
        mode: closeCycleState.mode,
        closeReason: closeCycleState.closeReason,
        closeComment: closeCycleState.closeComment,
        checklistItems: checklistEnabled ? checklistItems : [],
      }))
      resetCloseCycleState()
      return
    }

    setCloseCycleState((prev) => ({ ...prev, pending: true, error: '' }))
    try {
      const result = await processWorkflowScan({
        code: closeCycleState.code,
        comment: closeCycleState.closeComment,
        intent: closeCycleState.intent || 'workflow',
        closeMeta: {
          confirmed: true,
          mode: closeCycleState.mode,
          closeReason: closeCycleState.closeReason,
          closeComment: closeCycleState.closeComment,
          closeWorkdayNow: false,
          checklistItems: checklistEnabled ? checklistItems : [],
        },
      })

      if (!result?.deferred) {
        resetCloseCycleState()
      }
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      const fallback = closeCycleState.mode === 'workday-close'
        ? 'Nie udało się zakończyć dnia.'
        : 'Nie udało się zamknąć strefy.'
      setCloseCycleState((prev) => ({ ...prev, pending: false, error: parseErrorMessage(error, fallback) }))
    }
  }, [checklistItems, closeCycleState, forceLoginWithMessage, processWorkflowScan, resetCloseCycleState])

  const onWorkdayClosePromptCancel = useCallback(() => {
    if (workdayClosePromptState.pending) return
    resetWorkdayClosePromptState()
  }, [resetWorkdayClosePromptState, workdayClosePromptState.pending])

  const onWorkdayClosePromptChoose = useCallback(async (closeWorkdayNow) => {
    setWorkdayClosePromptState((prev) => ({ ...prev, pending: true, error: '' }))
    try {
      const result = await processWorkflowScan({
        code: workdayClosePromptState.code,
        comment: workdayClosePromptState.closeComment,
        intent: workdayClosePromptState.intent || 'workflow',
        closeMeta: {
          confirmed: true,
          mode: workdayClosePromptState.mode,
          closeReason: workdayClosePromptState.closeReason,
          closeComment: workdayClosePromptState.closeComment,
          closeWorkdayNow: Boolean(closeWorkdayNow),
          checklistItems: Array.isArray(workdayClosePromptState.checklistItems) ? workdayClosePromptState.checklistItems : [],
        },
      })

      if (!result?.deferred) {
        resetWorkdayClosePromptState()
      }
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setWorkdayClosePromptState((prev) => ({
        ...prev,
        pending: false,
        error: parseErrorMessage(error, 'Nie udało się zamknąć dnia.'),
      }))
    }
  }, [forceLoginWithMessage, processWorkflowScan, resetWorkdayClosePromptState, workdayClosePromptState])

  const doScan = async ({ code, comment }) => {
    if (!session?.token || !snapshot) return
    const intent = txt(scanState.intent)
    setScanState((prev) => ({ ...prev, pending: true, error: '' }))
    try {
      if (intent === 'coordinator-audit-start') {
        const scannedZone = findZoneInSnapshot(snapshot, code)
        if (!scannedZone) {
          throw new Error('Nie znaleziono kodu QR w bazie stref.')
        }
        if (!isStartZoneFunction(scannedZone.functionName)) {
          throw new Error('To nie jest kod START obiektu.')
        }

        const result = await scanMobileQr({ session, snapshot, qrCode: code, comment })
        setSnapshot(result.snapshot)
        const runningState = ensureRunningToday(result.snapshot)
        if (!runningState.ok) {
          throw new Error('Nie wykryto RUNNING dzisiaj.')
        }
        setCoordView(COORD.AUDIT_SCAN)
        if (!coordAuditStartedAt) setCoordAuditStartedAt(nowIso)
        setNotice('START audytu potwierdzony.')
        closeScan()
        return
      }

      if (intent === 'coordinator-audit-zone') {
        const scannedZone = findZoneInSnapshot(snapshot, code)
        if (!scannedZone) {
          throw new Error('Nie znaleziono strefy dla podanego kodu QR.')
        }
        setCoordAuditZoneId(txt(scannedZone.id))
        setCoordAuditClean(null)
        setCoordAuditComment('')
        setCoordView(COORD.AUDIT_FORM)
        closeScan()
        return
      }

      if (intent === 'coordinator-edit-scan') {
        const zone = findZoneByQrId(coordZones, code)
        if (!zone) {
          throw new Error('Brak kodu QR w bazie stref.')
        }
        setCoordEditForm({
          qrId: zone.zoneId,
          functionName: zone.functionLabel || defaultQrFunctionLabel(),
          clientName: zone.clientName || '',
          placeName: zone.placeName || '',
          location: zone.location || '',
        })
        setNotice('Wczytano dane QR.')
        closeScan()
        return
      }

      await processWorkflowScan({ code, comment, intent })
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setScanState((prev) => ({ ...prev, pending: false, error: parseErrorMessage(error, 'Nie udało się przetworzyć skanu.') }))
    }
  }

  const doPause = useCallback(async () => {
    if (!session?.token || !snapshot) return

    if (pauseOpen) {
      setView(VIEW.PAUSE)
      return
    }

    if (!isWorkdayOpen(activeWorkday)) {
      setNotice('Brak aktywnego dnia pracy. Najpierw zeskanuj START.')
      setView(VIEW.START)
      return
    }

    if (up(activeWorkday?.status) !== 'RUNNING') {
      setNotice('Pauza jest dostępna tylko podczas aktywnego dnia (RUNNING).')
      return
    }

    setOperationPending(true)
    try {
      const result = await startMobilePause({ session, snapshot })
      setSnapshot(result.snapshot)
      setNotice(txt(result.message))
      setView(VIEW.PAUSE)
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setNotice(parseErrorMessage(error, 'Nie udało się rozpocząć przerwy.'))
    } finally {
      setOperationPending(false)
    }
  }, [activeWorkday, forceLoginWithMessage, pauseOpen, session, snapshot])

  const doResumeFromPause = useCallback(() => {
    if (!session?.token || !snapshot) return
    openScan('workflow', 'Wróć do pracy', 'Zeskanuj QR CLEAN, zlecenia indywidualnego lub strefy specjalnej.')
  }, [session?.token, snapshot, openScan])

  const doTopAction = () => {
    if (!isWorkdayOpen(activeWorkday)) {
      setView(VIEW.START)
      openScan('workflow', 'Rozpocznij pracę', 'Zeskanuj kod START lub zlecenia indywidualnego.')
      return
    }
    if (up(activeWorkday?.status) === 'ENDING') {
      setView(VIEW.END)
      return
    }
    openScan('workflow', 'Koniec dnia', 'Zeskanuj STOP0, STOP5, STOP10 lub STOP15.')
  }

  const doCloseWorkdayNow = useCallback(async () => {
    if (!session?.token || !snapshot) return
    setOperationPending(true)
    try {
      const result = await closeMobileWorkdayImmediately({
        session,
        snapshot,
      })
      setSnapshot(result.snapshot)
      setNotice(txt(result.message))
      setView(resolveWorkflowView(result.snapshot))
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        forceLoginWithMessage('Sesja wygasła. Zaloguj się ponownie.')
        return
      }
      setNotice(parseErrorMessage(error, 'Nie udało się zakończyć dnia pracy.'))
    } finally {
      setOperationPending(false)
    }
  }, [forceLoginWithMessage, session, snapshot])

  const renderMain = () => {
    if (view === VIEW.LOGIN) {
      return <LoginView pending={loginPending} error={loginError} onSubmit={doLogin} />
    }

    if (!snapshot) {
      return <section className="card"><div className="muted">Wczytywanie danych...</div></section>
    }

    if (view === VIEW.MENU) {
      return (
        <section className="card col">
          <WorkHud
            workerName={snapshot?.worker?.name}
            timer={workdayTimer}
            startLabel={startLabel}
            onPause={doPause}
            onStop={doTopAction}
            topActionIsStart={topActionIsStart}
          />
          <div className="tile-grid--home">
            <button className="tile tile--success" type="button" onClick={() => setView(resolveWorkflowView(snapshot))}><span className="tile-icon"><CleaningIcon /></span><span className="tile-label">Sprzątanie</span><span className="tile-sub">Skanuj strefy</span></button>
            <button className="tile" type="button" onClick={() => setView(VIEW.SCHEDULE)}><span className="tile-icon"><CalendarIcon /></span><span className="tile-label">Grafik</span><span className="tile-sub">Tydzień</span></button>
            <button className="tile" type="button" onClick={() => setView(VIEW.SUMMARY)}><span className="tile-icon"><ClockIcon /></span><span className="tile-label">Czas pracy</span><span className="tile-sub">Podsumowanie</span></button>
            <button className="tile" type="button" onClick={openCoordinatorPanel}><span className="tile-icon"><UserIcon /></span><span className="tile-label">Koordynator</span><span className="tile-sub">Audyt / QR</span></button>
          </div>
        </section>
      )
    }

    if (view === VIEW.WORKLOG) {
      return (
        <section className="card col">
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setView(VIEW.MENU)}>Wróć</button><strong>Lista zdarzeń</strong><button className="link-btn" type="button" onClick={() => setWorklogMonth(monthNow())}>Dzisiaj</button></div>
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setWorklogMonth((prev) => shiftMonth(prev, -1))}>Poprzedni</button><span>{monthLabel(worklogMonth)}</span><button className="link-btn" type="button" onClick={() => setWorklogMonth((prev) => shiftMonth(prev, 1))}>Następny</button></div>
          {worklogDays.length ? worklogDays.map((day) => (
            <div key={day.dateKey} className="day-group">
              <div className="day-title"><span className="day-number">{datePart(day.dateKey)}</span><span className="day-week">{weekdayLabel(day.dateKey)}</span></div>
              {day.events.map((eventRow) => {
                const isStop = up(eventRow.type) === 'STOP'
                return <div className={`event-card ${isStop ? 'event-card--stop' : 'event-card--start'}`} key={eventRow.id}><span className="event-badge">{isStop ? 'Stop' : 'Start'}</span><span>{formatTime(eventRow.at)}</span></div>
              })}
            </div>
          )) : <div className="muted">Brak zdarzeń w tym miesiącu.</div>}
        </section>
      )
    }

    if (view === VIEW.SUMMARY) {
      return (
        <section className="card col">
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setView(VIEW.MENU)}>Wróć</button><strong>Podsumowanie czasu pracy</strong><button className="link-btn" type="button" onClick={() => setSummaryMonth(monthNow())}>Dzisiaj</button></div>
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setSummaryMonth((prev) => shiftMonth(prev, -1))}>Poprzedni</button><span>{monthLabel(summaryMonth)}</span><button className="link-btn" type="button" onClick={() => setSummaryMonth((prev) => shiftMonth(prev, 1))}>Następny</button></div>
          <div className="summary-row"><span>Zaplanowany czas pracy</span><span className="summary-value">0h 00m</span></div>
          <div className="summary-row"><span>Czas pracy</span><span className="summary-value">{hm(summaryData.monthSeconds)}</span></div>
          <div className="summary-row"><span>Nadgodziny</span><span className="summary-value">0h 00m</span></div>
          <div className="summary-row"><span>Czas nocny</span><span className="summary-value">0h 00m</span></div>
          <button className="btn secondary" type="button" onClick={() => setView(VIEW.SUMMARY_DETAILS)}>Szczegóły dzienne</button>
        </section>
      )
    }

    if (view === VIEW.SUMMARY_DETAILS) {
      return (
        <section className="card col">
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setView(VIEW.SUMMARY)}>Wróć</button><strong>Szczegóły dzienne</strong><button className="link-btn" type="button" onClick={() => setSummaryMonth(monthNow())}>Dzisiaj</button></div>
          <div className="list-month-header"><button className="link-btn" type="button" onClick={() => setSummaryMonth((prev) => shiftMonth(prev, -1))}>Poprzedni</button><span>{monthLabel(summaryMonth)}</span><button className="link-btn" type="button" onClick={() => setSummaryMonth((prev) => shiftMonth(prev, 1))}>Następny</button></div>
          {summaryData.days.length ? summaryData.days.map((day) => (
            <div className="summary-row" key={day.dateKey}><span>{datePart(day.dateKey)} {weekdayLabel(day.dateKey)}</span><span className="summary-value">{hm(day.totalSec)}</span></div>
          )) : <div className="muted">Brak danych dla wybranego miesiąca.</div>}
        </section>
      )
    }

    if (view === VIEW.SCHEDULE) {
      return (
        <section className="card col">
          <div className="list-month-header">
            <button className="link-btn" type="button" onClick={() => setView(VIEW.MENU)}>
              Wróć
            </button>
            <strong>Grafik pracy</strong>
            <button
              className="link-btn"
              type="button"
              onClick={() => refreshSchedule(session, { silent: false, fromAutoSync: false })}
              disabled={schedulePending}
            >
              {schedulePending ? 'Odświeżanie...' : 'Odśwież'}
            </button>
          </div>

          {scheduleError ? <div className="error-inline">{scheduleError}</div> : null}

          <div className="summary-row">
            <span>Pracownik</span>
            <span className="summary-value">{txt(schedulePayload.worker?.name || schedulePayload.worker?.login || session?.workerName || session?.workerLogin || '-')}</span>
          </div>
          <div className="schedule-sync-meta">Ostatnia synchronizacja: {formatDateTime(schedulePayload.sync?.fetchedAtIso)}</div>

          {!schedulePending && !scheduleError && !schedulePayload.matched ? (
            <div className="muted">Nie znaleziono wpisów grafiku dla tego konta.</div>
          ) : null}

          {!schedulePending && !scheduleError && schedulePayload.matched && !scheduleSelectedDay ? (
            <div className="muted">Brak dni grafiku do wyświetlenia.</div>
          ) : null}

          {scheduleSelectedDay ? (
            <>
              <div className="list-month-header">
                <button className="link-btn" type="button" onClick={goSchedulePrev} disabled={!scheduleCanPrev}>
                  {'<'}
                </button>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <strong style={{ display: 'block' }}>{txt(scheduleSelectedDay.weekdayLabel) || '-'}</strong>
                  <span>{txt(scheduleSelectedDay.dateLabel || scheduleSelectedDay.date) || '-'}</span>
                </div>
                <button className="link-btn" type="button" onClick={goScheduleNext} disabled={!scheduleCanNext}>
                  {'>'}
                </button>
              </div>

              <div
                className="scan-glass"
                onTouchStart={onScheduleTouchStart}
                onTouchEnd={onScheduleTouchEnd}
                style={{ display: 'grid', gap: 8 }}
              >
                <div className="muted">Status</div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{txt(scheduleSelectedDay.statusLabel) || '-'}</div>
                {scheduleVisibleShiftIndexes.map((shiftIndex) => {
                  const shift = (Array.isArray(scheduleSelectedDay.shifts) ? scheduleSelectedDay.shifts : []).find(
                    (item) => Number(item?.slotIndex) === shiftIndex,
                  )
                  return (
                    <div key={`shift-${shiftIndex}`} className="summary-row" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                      <span className="muted">{scheduleShiftLabel(shiftIndex)}</span>
                      <strong>{txt(shift?.primaryText) || 'Brak zmiany'}</strong>
                      {txt(shift?.secondaryText) ? <span>{txt(shift?.secondaryText)}</span> : null}
                    </div>
                  )
                })}
              </div>

              <div className="muted">Przesuń palcem w lewo lub prawo, aby zmienić dzień.</div>
            </>
          ) : null}
        </section>
      )
    }

    if (view === VIEW.COORDINATOR) {
      if (!coordinatorAccess) {
        return (
          <section className="card col">
            <div className="title-small">Strefa koordynatora</div>
            <div className="muted">Nie masz dostępu do modułu.</div>
            <button className="btn secondary" type="button" onClick={() => setView(VIEW.MENU)}>
              Wróć
            </button>
          </section>
        )
      }

      if (coordView === COORD.AUDIT_START) {
        return (
          <CoordinatorAuditStart
            onNext={doCoordinatorAuditCheck}
            onBack={() => setCoordView(COORD.HOME)}
          />
        )
      }

      if (coordView === COORD.AUDIT_SCAN) {
        return (
          <CoordinatorAuditScan
            objectTimerText={coordObjectCounter}
            auditTimerText={coordAuditCounter}
            onScanZone={() => openScan('coordinator-audit-zone', 'Skanuj strefę audytu', 'Zeskanuj kod QR strefy do audytu.')}
            onEnd={() => {
              resetCoordinatorAuditState()
              setCoordView(COORD.HOME)
            }}
            onBack={() => setCoordView(COORD.HOME)}
          />
        )
      }

      if (coordView === COORD.AUDIT_FORM) {
        return (
          <CoordinatorAuditForm
            zoneId={coordAuditZoneId}
            cleanValue={coordAuditClean}
            comment={coordAuditComment}
            onPick={setCoordAuditClean}
            onComment={(value) => setCoordAuditComment(txt(value).slice(0, 300))}
            onSend={doCoordinatorAuditSend}
            onBack={() => setCoordView(COORD.AUDIT_SCAN)}
          />
        )
      }

      if (coordView === COORD.EDIT_QR) {
        return (
          <CoordinatorEditQr
            loading={coordBusy}
            clients={coordClients}
            form={coordEditForm}
            onBack={() => setCoordView(COORD.HOME)}
            onScan={() => openScan('coordinator-edit-scan', 'Skanuj QR strefy', 'Zeskanuj kod QR do edycji przypisania.')}
            onSave={doCoordinatorQrSave}
            onFormChange={(field, value) => {
              setCoordEditForm((prev) => ({ ...prev, [field]: value }))
            }}
          />
        )
      }

      return (
        <CoordinatorHome
          onDoAudit={openCoordinatorAuditStart}
          onEditQr={openCoordinatorEdit}
        />
      )
    }

    if (view === VIEW.PAUSE) {
      return (
        <section className="card col">
          <WorkHud
            workerName={snapshot?.worker?.name}
            timer={workdayTimer}
            startLabel={startLabel}
            onPause={() => setView(VIEW.PAUSE)}
            onStop={doTopAction}
            topActionIsStart={topActionIsStart}
          />
          <div className="scan-glass">
            <div className="scan-title">Pauza</div>
            {pauseOpen ? (
              <div className="scan-sub">
                Trwająca przerwa: <strong>{pauseTimer}</strong>
                <br />
                Czas netto dnia: <strong>{workdayTimer}</strong>
              </div>
            ) : (
              <div className="scan-sub">Brak aktywnej przerwy.</div>
            )}
          </div>
          {pauseOpen ? (
            <button className="btn secondary btn-xl" type="button" onClick={doResumeFromPause} disabled={globalPending}>
              Skanuj QR, aby wrócić do pracy
            </button>
          ) : (
            <button className="btn secondary btn-xl" type="button" onClick={() => setView(resolveWorkflowView(snapshot))}>
              Wróć do pracy
            </button>
          )}
        </section>
      )
    }

    if (view === VIEW.START || view === VIEW.SCAN || view === VIEW.CLEAN || view === VIEW.END) {
      return (
        <section className="card col">
          <WorkHud
            workerName={snapshot?.worker?.name}
            timer={workdayTimer}
            startLabel={startLabel}
            onPause={doPause}
            onStop={doTopAction}
            topActionIsStart={topActionIsStart}
          />
          <button className="btn action btn-xl" type="button" onClick={() => openScan('workflow', 'Skanuj QR', 'Wpisz kod QR / roomId.')}>Skanuj QR</button>
          <div className="scan-glass checklist-wrap">
            <div className="scan-title">{view === VIEW.START ? 'Rozpocznij pracę' : view === VIEW.SCAN ? 'Skanuj strefę' : view === VIEW.CLEAN ? 'W trakcie sprzątania' : 'Kończenie dnia'}</div>
            {view === VIEW.CLEAN ? (
              <div className="scan-sub">
                Klient: {txt(activeCycle?.clientName || checklistMeta?.clientName) || '-'}
                <br />
                Strefa: {txt(activeCycle?.zoneName || checklistMeta?.zoneName) || '-'}
                <br />
                Lokalizacja: {txt(activeCycle?.location || checklistMeta?.location) || '-'}
                <br />
                Czas strefy: {cycleTimer}
              </div>
            ) : null}
            {view === VIEW.END ? <div className="scan-sub">Auto-zamknięcie za: {endingLeft}</div> : null}
            {view === VIEW.START ? <div className="scan-sub">Skanuj kod QR, aby przejść dalej.</div> : null}
            {view === VIEW.SCAN ? (
              <div className="scan-sub scan-sub--steps">
                <div className="scan-sub__important">WAŻNE: czas pracy już się nalicza.</div>
                <ol className="scan-steps">
                  <li>Kliknij „Skanuj QR”.</li>
                  <li>Zeskanuj kod strefy przed rozpoczęciem sprzątania.</li>
                  <li>Przy każdej zmianie strefy zeskanuj nowy kod QR.</li>
                </ol>
              </div>
            ) : null}
          </div>
          {CHECKLIST_ENABLED && view === VIEW.CLEAN ? (
            <div className="scan-glass checklist-wrap">
              <div className="scan-title">Checklista strefy</div>
              {checklistLoading ? <div className="muted">Wczytywanie zadań...</div> : null}
              {checklistError ? (
                <div className={checklistErrorKind === 'permission' ? 'muted' : 'error-inline'}>{checklistError}</div>
              ) : null}
              {!checklistLoading && !checklistError ? (
                <>
                  <ChecklistSection
                    title="Czynności dodatkowe"
                    items={checklistSplit.additional}
                    onToggle={setChecklistItemChecked}
                  />
                  <ChecklistSection
                    title="Czynności standardowe (QR)"
                    items={checklistSplit.standard}
                    onToggle={setChecklistItemChecked}
                  />
                </>
              ) : null}
            </div>
          ) : null}
          {view === VIEW.END ? (
            <button className="btn secondary btn-xl" type="button" onClick={doCloseWorkdayNow} disabled={globalPending}>
              {operationPending ? 'Trwa zamykanie...' : 'Zakończ teraz'}
            </button>
          ) : null}
        </section>
      )
    }

    return null
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-left"><button className="top-nav-btn top-nav-btn--icon" type="button" aria-label="Strona główna" onClick={() => setView(session?.token ? VIEW.MENU : VIEW.LOGIN)}><span className="top-nav-ico"><HomeIcon /></span></button></div>
        <div className="header-center">
          <button className="logo-home-btn" type="button" aria-label="Best Clean - ekran główny" onClick={() => setView(session?.token ? VIEW.MENU : VIEW.LOGIN)}>
            <img className="header-logo header-logo--bestclean" src="https://static.wixstatic.com/media/f53ca5_5f74c82b2ea6402aa1b469096b7ad4c5~mv2.png/v1/fill/w_698,h_238,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/f53ca5_5f74c82b2ea6402aa1b469096b7ad4c5~mv2.png" alt="Best Clean" />
          </button>
        </div>
        <div className="header-right"><button className="top-nav-btn top-nav-btn--icon" type="button" aria-label="Ustawienia" disabled={!session?.token} onClick={() => setSettingsOpen(true)}><span className="top-nav-ico"><SettingsIcon /></span></button></div>
      </header>
      <main className="main">
        {renderMain()}
      </main>
      <footer className="app-footer">Best Clean V1.2</footer>
      <div className="notice-bottom-stack" aria-live="polite">
        {notice ? (
          <div className="notice-box notice-box--bottom" role="status">
            <span className="notice-box__text">{notice}</span>
            <button className="notice-ok-btn" type="button" onClick={() => setNotice('')} aria-label="Zamknij komunikat">
              OK
            </button>
          </div>
        ) : null}
        {refreshPending && !refreshNoticeHidden ? (
          <div className="notice-box notice-box--bottom notice-muted" role="status">
            <span className="notice-box__text">Synchronizacja danych...</span>
            <button className="notice-ok-btn" type="button" onClick={() => setRefreshNoticeHidden(true)} aria-label="Ukryj komunikat synchronizacji">
              OK
            </button>
          </div>
        ) : null}
      </div>
      <SettingsModal open={settingsOpen} session={session} onClose={() => setSettingsOpen(false)} onLogout={doLogout} />
      <ScanModal
        key={scanState.nonce}
        scanState={scanState}
        onClose={closeScan}
        onSubmit={doScan}
        allowManualEntry={manualQrAccess}
      />
      <CloseCycleModal
        open={closeCycleState.open}
        state={closeCycleState}
        checklistItems={checklistItems}
        onToggleTask={setChecklistItemChecked}
        onReasonChange={setChecklistItemReason}
        onCommentChange={(value) => setCloseCycleState((prev) => ({ ...prev, closeComment: txt(value).slice(0, CHECKLIST_REASON_MAX_LEN), error: '' }))}
        onCancel={onCloseCycleCancel}
        onConfirm={onCloseCycleConfirm}
      />
      <WorkdayClosePromptModal
        open={workdayClosePromptState.open}
        pending={workdayClosePromptState.pending}
        error={workdayClosePromptState.error}
        onChoose={onWorkdayClosePromptChoose}
        onCancel={onWorkdayClosePromptCancel}
      />
      {globalPending ? (
        <div className="global-busy-overlay" role="status" aria-live="polite" aria-label="Trwa operacja">
          <div className="global-busy-content">
            <div className="global-busy-spinner" />
            <div className="global-busy-text">
              Trwa operacja.
              <br />
              Czekaj na odpowiedź serwera...
            </div>
          </div>
        </div>
      ) : null}
      {scheduleUpdatedPopupOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-content">
            <div className="title-small">Grafik zaktualizowany</div>
            <div className="muted">Wykryto zmianę w twoim grafiku. Widok został odświeżony.</div>
            <button className="btn action" type="button" onClick={() => setScheduleUpdatedPopupOpen(false)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
      {view === VIEW.LOGIN && versionPopupOpen ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-content version-popup">
            <div className="version-popup__badge">Best Clean</div>
            <div className="version-popup__title">Nowa wersja aplikacji</div>
            <div className="version-popup__text">Korzystasz z wersji V1.2.</div>
            <div className="version-popup__hint">
              <div><strong>Login:</strong> Twoje nazwisko</div>
              <div><strong>Hasło:</strong> Twoja data urodzenia. 6 cyfr, np. 120187 (dzień, miesiąc, rok)</div>
            </div>
            <button className="btn action" type="button" onClick={() => setVersionPopupOpen(false)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}


