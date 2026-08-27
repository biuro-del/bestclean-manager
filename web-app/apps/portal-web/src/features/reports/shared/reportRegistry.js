export const REPORT_SECTION_DEFINITIONS = [
  {
    id: 'podsumowanie',
    label: 'Podsumowanie',
    description: 'Najważniejsze wskaźniki, alerty i ostatnio używane raporty.',
    icon: 'ph-gauge',
    tone: 'primary',
    meta: '3 obszary',
  },
  {
    id: 'zestawienia',
    label: 'Zestawienia',
    description: 'Operacyjne raporty zdarzeń, czasu pracy, klientów i stref.',
    icon: 'ph-table',
    tone: 'cyan',
    meta: '4 aktywne',
  },
  {
    id: 'analizy',
    label: 'Analizy',
    description: 'Trendy i porównania danych przygotowywane w kolejnym etapie.',
    icon: 'ph-chart-line-up',
    tone: 'violet',
    meta: 'W budowie',
  },
  {
    id: 'raporty-gotowe',
    label: 'Raporty gotowe',
    description: 'Gotowe układy raportów do szybkiego wygenerowania i eksportu.',
    icon: 'ph-file-text',
    tone: 'green',
    meta: '4 aktywne',
  },
  {
    id: 'moje-raporty',
    label: 'Moje raporty',
    description: 'Zapisane widoki, harmonogramy, udostępnienia i historia plików.',
    icon: 'ph-folder-user',
    tone: 'amber',
    meta: 'Wkrótce',
  },
]

export const REPORT_DEFINITIONS = [
  {
    id: 'event-register', section: 'zestawienia', label: 'Rejestr zdarzeń', available: true,
    description: 'Pełna lista zdarzeń z zakresem dat, statusem, typem i wyszukiwaniem.', icon: 'ph-activity', tone: 'primary',
    builderKind: 'eventsOperational', filters: ['dateRange', 'client', 'zone', 'worker', 'status', 'type', 'search'],
    source: 'workdays:events', columns: ['date', 'start', 'stop', 'duration', 'worker', 'client', 'zone', 'type'],
    summaries: ['eventCount', 'duration', 'workers', 'averageDuration'], formats: ['pdf', 'csv'],
  },
  {
    id: 'workers', section: 'zestawienia', label: 'Pracownicy', available: true,
    description: 'Rozbudowana historia sesji, aktywności i czasu pracy wybranej osoby.', icon: 'ph-users-three', tone: 'green',
    builderKind: 'workerTime', filters: ['dateRange', 'worker'], source: 'workers+workdays+events',
    columns: ['date', 'sessions', 'start', 'stop', 'duration', 'activities', 'integrity'], summaries: ['days', 'sessions', 'duration', 'openDays'], formats: ['pdf', 'csv'],
  },
  {
    id: 'clients-objects', section: 'zestawienia', label: 'Klienci i obiekty', available: true,
    description: 'Historia realizacji usług według klienta i obiektu.', icon: 'ph-buildings', tone: 'amber',
    builderKind: 'clients', filters: ['dateRange', 'client'], source: 'clients+workdays:events',
    columns: ['date', 'events', 'duration', 'openEntries'], summaries: ['days', 'events', 'duration'], formats: ['pdf', 'csv'],
  },
  {
    id: 'zones', section: 'zestawienia', label: 'Strefy', available: true,
    description: 'Historia zdarzeń i wykonanej pracy w wybranej strefie.', icon: 'ph-map-pin-area', tone: 'violet',
    builderKind: 'events', filters: ['dateRange', 'zone'], source: 'zones+workdays:events',
    columns: ['date', 'events', 'duration', 'openEntries'], summaries: ['days', 'events', 'duration'], formats: ['pdf', 'csv'],
  },
  {
    id: 'tasks-tickets', section: 'zestawienia', label: 'Zadania i zgłoszenia', available: false,
    unavailableReason: 'Brak podłączonego źródła zadań i zgłoszeń.', description: 'Realizacja zadań i obsługa zgłoszeń.', icon: 'ph-check-square-offset', tone: 'muted',
    filters: [], source: null, columns: [], summaries: [], formats: [],
  },
  {
    id: 'audits-quality', section: 'zestawienia', label: 'Audyty i jakość', available: false,
    unavailableReason: 'Dane audytowe nie są jeszcze dostępne.', description: 'Wyniki audytów i wskaźniki jakości.', icon: 'ph-clipboard-text', tone: 'muted',
    filters: [], source: null, columns: [], summaries: [], formats: [],
  },
  {
    id: 'monthly-client', section: 'raporty-gotowe', label: 'Raport miesięczny klienta', available: true,
    description: 'Miesięczne podsumowanie wykonanej pracy dla wybranego klienta.', icon: 'ph-calendar-blank', tone: 'primary',
    builderKind: 'clients', filters: ['month', 'client'], source: 'clients+workdays:events', columns: ['date', 'events', 'duration'], summaries: ['days', 'events', 'duration'], formats: ['pdf', 'csv'],
  },
  {
    id: 'ready-work-time', section: 'raporty-gotowe', label: 'Raport czasu pracy', available: true,
    description: 'Gotowa ewidencja czasu pracy dla wybranej osoby i okresu.', icon: 'ph-clock', tone: 'cyan',
    builderKind: 'workerTime', filters: ['dateRange', 'worker'], source: 'workers+workdays', columns: ['date', 'start', 'stop', 'duration'], summaries: ['days', 'duration'], formats: ['pdf', 'csv'],
  },
  {
    id: 'quality-report', section: 'raporty-gotowe', label: 'Raport jakości', available: false,
    unavailableReason: 'Raport zostanie uruchomiony po podłączeniu danych audytowych.', description: 'Wskaźniki jakości usług i wyniki audytów.', icon: 'ph-seal-check', tone: 'muted',
    filters: [], source: null, columns: [], summaries: [], formats: [],
  },
  {
    id: 'irregularities', section: 'raporty-gotowe', label: 'Raport nieprawidłowości', available: true,
    description: 'Otwarte i niekompletne zdarzenia wymagające weryfikacji.', icon: 'ph-warning-octagon', tone: 'amber',
    builderKind: 'eventsOperational', preset: { status: 'running', groupBy: 'worker' }, filters: ['dateRange', 'client', 'zone', 'worker'],
    source: 'workdays:events', columns: ['date', 'worker', 'client', 'zone', 'status'], summaries: ['eventCount', 'workers'], formats: ['pdf', 'csv'],
  },
  {
    id: 'service-execution', section: 'raporty-gotowe', label: 'Raport wykonania usługi', available: true,
    description: 'Potwierdzenie realizacji usług według klienta i strefy.', icon: 'ph-check-circle', tone: 'green',
    builderKind: 'eventsOperational', preset: { status: 'closed', groupBy: 'client' }, filters: ['dateRange', 'client', 'zone'],
    source: 'workdays:events', columns: ['date', 'client', 'zone', 'duration', 'worker'], summaries: ['eventCount', 'duration'], formats: ['pdf', 'csv'],
  },
  { id: 'saved-views', section: 'moje-raporty', label: 'Zapisane widoki', available: false, unavailableReason: 'Zapisywanie widoków nie jest jeszcze dostępne.', description: 'Własne zestawy filtrów i kolumn.', icon: 'ph-bookmark-simple', tone: 'muted', filters: [], source: null, columns: [], summaries: [], formats: [] },
  { id: 'scheduled-reports', section: 'moje-raporty', label: 'Raporty cykliczne', available: false, unavailableReason: 'Harmonogramy raportów nie są jeszcze dostępne.', description: 'Automatyczne generowanie raportów według harmonogramu.', icon: 'ph-calendar-check', tone: 'muted', filters: [], source: null, columns: [], summaries: [], formats: [] },
  { id: 'shared-reports', section: 'moje-raporty', label: 'Udostępnione raporty', available: false, unavailableReason: 'Udostępnianie raportów nie jest jeszcze dostępne.', description: 'Raporty współdzielone w organizacji.', icon: 'ph-share-network', tone: 'muted', filters: [], source: null, columns: [], summaries: [], formats: [] },
  { id: 'generated-history', section: 'moje-raporty', label: 'Historia wygenerowanych raportów', available: false, unavailableReason: 'Historia plików nie jest jeszcze przechowywana.', description: 'Archiwum wygenerowanych plików PDF i CSV.', icon: 'ph-clock-counter-clockwise', tone: 'muted', filters: [], source: null, columns: [], summaries: [], formats: [] },
]

export function reportDefinitionsBySection(sectionId) {
  return REPORT_DEFINITIONS.filter((definition) => definition.section === sectionId)
}

export function getReportDefinition(reportId) {
  return REPORT_DEFINITIONS.find((definition) => definition.id === reportId) ?? null
}
