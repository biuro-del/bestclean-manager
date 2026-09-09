import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const moduleRoot = path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'workforce-schedule')
const recurrenceModule = import(pathToFileURL(path.join(moduleRoot, 'recurrenceModel.js')).href)
const clientModule = import(pathToFileURL(path.join(moduleRoot, 'workforceScheduleClientModel.js')).href)

const shift = () => ({
  title: 'Zmiana poranna',
  date: '2026-09-09',
  startTime: '07:00',
  endTime: '15:00',
  breakMinutes: 30,
  requiredHeadcount: 2,
  locationId: 'location-1',
  assigneeIds: ['person-1'],
  notes: 'Wejście od zaplecza',
  tasks: ['Odprawa'],
})

test('domyślne powtarzanie wybiera dzień daty zmiany i pięć wystąpień', async () => {
  const { createDefaultRecurrence } = await recurrenceModule
  assert.deepEqual(createDefaultRecurrence('2026-09-09'), {
    enabled: false,
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [3],
    monthlyPattern: { kind: 'DAY_OF_MONTH', day: 9 },
    ends: { mode: 'COUNT', count: 5, until: '2026-09-09' },
  })
})

test('model klienta normalizuje tygodnie, miesiące i oba sposoby zakończenia', async () => {
  const { normalizeRecurrenceDraft } = await recurrenceModule
  assert.deepEqual(normalizeRecurrenceDraft({
    frequency: 'weekly',
    interval: '2',
    weekdays: [5, 1, 5],
    ends: { mode: 'count', count: '8' },
  }, '2026-09-09'), {
    frequency: 'WEEKLY',
    interval: 2,
    weekdays: [1, 5],
    ends: { mode: 'COUNT', count: 8 },
  })
  assert.deepEqual(normalizeRecurrenceDraft({
    frequency: 'monthly',
    interval: 1,
    monthlyPattern: { kind: 'nth_weekday', ordinal: -1, weekday: 5 },
    ends: { mode: 'until', until: '2027-01-31' },
  }, '2026-09-09'), {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyPattern: { kind: 'NTH_WEEKDAY', ordinal: -1, weekday: 5 },
    ends: { mode: 'UNTIL', until: '2027-01-31' },
  })
})

test('model klienta odrzuca reguły przekraczające limit wystąpień lub horyzont', async () => {
  const { expandRecurrenceDraftDates } = await recurrenceModule
  assert.throws(() => expandRecurrenceDraftDates({
    frequency: 'DAILY', interval: 1, ends: { mode: 'UNTIL', until: '2027-01-02' },
  }, '2026-01-01'), (error) => error?.code === 'RECURRENCE_LIMIT')
  assert.throws(() => expandRecurrenceDraftDates({
    frequency: 'MONTHLY', interval: 30, monthlyPattern: { kind: 'LAST_DAY' }, ends: { mode: 'COUNT', count: 20 },
  }, '2026-01-01'), (error) => error?.code === 'RECURRENCE_LIMIT')
})

test('payload mapuje UI na ścisły kontrakt jednej komendy backendu', async () => {
  const { buildWorkforceScheduleRecurringShiftsPayload } = await clientModule
  const payload = buildWorkforceScheduleRecurringShiftsPayload(shift(), {
    frequency: 'MONTHLY',
    interval: 1,
    monthlyPattern: { kind: 'LAST_DAY' },
    ends: { mode: 'COUNT', count: 4 },
  })
  assert.deepEqual(payload.recurrence, {
    frequency: 'MONTHLY',
    interval: 1,
    pattern: { type: 'LAST_DAY' },
    ends: { type: 'COUNT', count: 4 },
  })
  assert.equal(payload.shift.expectedVersion, 0)
  assert.deepEqual(payload.shift.personIds, ['person-1'])
  assert.deepEqual(payload.shift.instructions, ['Odprawa'])
  assert.equal(Object.hasOwn(payload.shift, 'shiftId'), false)
})

test('receipt jest akceptowany tylko jako pełna, uporządkowana i unikalna lista potwierdzeń', async () => {
  const { normalizeWorkforceScheduleRecurringShiftsReceipt } = await clientModule
  const recurrence = {
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [3],
    ends: { mode: 'COUNT', count: 3 },
  }
  const receipt = {
    orgId: 'bestclean',
    from: '2026-09-09',
    to: '2026-09-23',
    createdCount: 3,
    created: [
      { shiftId: 'shift-1', date: '2026-09-09', revision: 1, version: 1 },
      { shiftId: 'shift-2', date: '2026-09-16', revision: 1, version: 1 },
      { shiftId: 'shift-3', date: '2026-09-23', revision: 1, version: 1 },
    ],
  }
  const normalized = normalizeWorkforceScheduleRecurringShiftsReceipt(receipt, {
    orgId: 'bestclean', recurrence, shift: shift(),
  })
  assert.equal(normalized.createdCount, 3)
  assert.deepEqual(normalized.shifts.map((item) => [item.id, item.date, item.version]), [
    ['shift-1', '2026-09-09', 1],
    ['shift-2', '2026-09-16', 1],
    ['shift-3', '2026-09-23', 1],
  ])
  assert.deepEqual(normalized.shifts[0].assigneeIds, ['person-1'])
  assert.deepEqual(normalized.shifts[0].tasks, ['Odprawa'])

  assert.equal(normalizeWorkforceScheduleRecurringShiftsReceipt({ ...receipt, createdCount: 2 }, {
    orgId: 'bestclean', recurrence, shift: shift(),
  }), null)
  assert.equal(normalizeWorkforceScheduleRecurringShiftsReceipt({
    ...receipt,
    created: [receipt.created[0], receipt.created[0], receipt.created[2]],
  }, { orgId: 'bestclean', recurrence, shift: shift() }), null)
  assert.equal(normalizeWorkforceScheduleRecurringShiftsReceipt({ ...receipt, debug: true }, {
    orgId: 'bestclean', recurrence, shift: shift(),
  }), null)
  assert.equal(normalizeWorkforceScheduleRecurringShiftsReceipt({
    ...receipt,
    created: [receipt.created[0], { ...receipt.created[1], date: '2026-09-17' }, receipt.created[2]],
  }, { orgId: 'bestclean', recurrence, shift: shift() }), null)
})

test('powtarzanie jest operacją wyłącznie dla nowej zmiany', async () => {
  const { buildWorkforceScheduleRecurringShiftsPayload } = await clientModule
  assert.throws(() => buildWorkforceScheduleRecurringShiftsPayload({ ...shift(), shiftId: 'shift-1', version: 1 }, {
    frequency: 'DAILY', interval: 1, ends: { mode: 'COUNT', count: 2 },
  }), (error) => error?.code === 'WORKFORCE_SCHEDULE_RECURRENCE_CREATE_ONLY')
})

test('podsumowanie jasno opisuje rytm i koniec serii', async () => {
  const { recurrenceSummary } = await recurrenceModule
  assert.equal(recurrenceSummary({
    frequency: 'WEEKLY', interval: 2, weekdays: [1, 3], ends: { mode: 'COUNT', count: 6 },
  }), 'co 2 tygodnie · pon., śr. · 6 wystąpień')
  assert.equal(recurrenceSummary({
    frequency: 'MONTHLY', interval: 1, monthlyPattern: { kind: 'LAST_DAY' }, ends: { mode: 'UNTIL', until: '2026-12-31' },
  }), 'co miesiąc · ostatni dzień miesiąca · do 2026-12-31')
})
