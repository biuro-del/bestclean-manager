import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bell,
  CalendarBlank,
  Check,
  ClipboardText,
  Clock,
  Copy,
  FloppyDisk,
  GearSix,
  Info,
  PaperPlaneTilt,
  Plus,
  Trash,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { formatDuration, getShiftMinutes } from "./scheduleModel.js";

const FOCUSABLE = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

function useDialogA11y(ref, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const root = document.querySelector("#root");
    const oldOverflow = document.body.style.overflow;
    const oldHidden = root?.getAttribute("aria-hidden");
    const oldInert = root?.inert;
    document.body.style.overflow = "hidden";
    if (root) {
      root.setAttribute("aria-hidden", "true");
      root.inert = true;
    }
    const frame = window.requestAnimationFrame(() => (dialog?.querySelector(FOCUSABLE) ?? dialog)?.focus?.());
    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current?.();
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(dialog?.querySelectorAll(FOCUSABLE) ?? []);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = oldOverflow;
      if (root) {
        root.inert = Boolean(oldInert);
        if (oldHidden == null) root.removeAttribute("aria-hidden"); else root.setAttribute("aria-hidden", oldHidden);
      }
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [ref]);
}

function PortalDialog({ children, className = "", labelledBy, onClose, side = false }) {
  const ref = useRef(null);
  useDialogA11y(ref, onClose);
  return createPortal(
    <div className={`tm-schedule-overlay ${side ? "is-side" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby={labelledBy} aria-modal="true" className={`tm-schedule-dialog ${className}`} ref={ref} role="dialog" tabIndex={-1}>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function IconButton({ children, label, onClick, className = "", disabled = false }) {
  return <button aria-label={label} className={`tm-schedule-icon-button ${className}`} disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function userName(user) {
  return user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim();
}

function isCatalogSelectable(item) {
  return item?.selectable !== false;
}

export function ShiftDrawer({ busy = false, deliveryDisabled = true, initialShift, locations, onClose, onDelete, onSave, templates, templatesEnabled = false, todayIso, users }) {
  const titleId = useId();
  const isNew = !initialShift?.id;
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(() => ({
    id: initialShift?.id || "",
    title: initialShift?.title || "Nowa zmiana",
    date: initialShift?.date || todayIso,
    startTime: initialShift?.startTime || "09:00",
    endTime: initialShift?.endTime || "17:00",
    breakMinutes: initialShift?.breakMinutes ?? 30,
    locationId: initialShift?.locationId || locations.find(isCatalogSelectable)?.id,
    assigneeIds: initialShift?.assigneeIds || [],
    requiredHeadcount: initialShift?.requiredHeadcount || 1,
    notes: initialShift?.notes || "",
    tasks: initialShift?.tasks || [],
  }));
  const [taskDraft, setTaskDraft] = useState("");

  const toggleAssignee = (userId) => setForm((current) => ({
    ...current,
    assigneeIds: current.assigneeIds.includes(userId) ? current.assigneeIds.filter((id) => id !== userId) : [...current.assigneeIds, userId],
  }));
  const save = (publishNow = false) => onSave({ ...form, publishNow });

  return (
    <PortalDialog className="tm-schedule-shift-drawer" labelledBy={titleId} onClose={onClose} side>
      <header className="tm-schedule-drawer-header">
        <IconButton label="Zamknij edycję zmiany" onClick={onClose}><X size={21} /></IconButton>
        <div>
          <p>{isNew ? "Nowa pozycja grafiku" : "Edycja zmiany"}</p>
          <h2 id={titleId}>{form.title || "Zmiana bez nazwy"}</h2>
        </div>
      </header>
      <nav aria-label="Sekcje zmiany" className="tm-schedule-drawer-tabs">
        {[["details", "Szczegóły zmiany"], ["tasks", "Zadania"], ...(templatesEnabled ? [["templates", "Szablony"]] : []), ["activity", "Aktywność"]].map(([id, label]) => (
          <button aria-current={tab === id ? "page" : undefined} className={tab === id ? "is-active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
        ))}
      </nav>
      <div className="tm-schedule-drawer-body">
        {tab === "details" && (
          <div className="tm-schedule-form-grid">
            <label className="is-wide">Tytuł zmiany<input onChange={(e) => setForm({ ...form, title: e.target.value })} value={form.title} /></label>
            <label>Data<input onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" value={form.date} /></label>
            <label>Lokalizacja<select onChange={(e) => setForm({ ...form, locationId: e.target.value })} value={form.locationId}>{locations.map((location) => <option disabled={!isCatalogSelectable(location)} key={location.id} value={location.id}>{location.name}{isCatalogSelectable(location) ? "" : " — Nieaktywny"}</option>)}</select></label>
            <label>Od<input onChange={(e) => setForm({ ...form, startTime: e.target.value })} type="time" value={form.startTime} /></label>
            <label>Do<input onChange={(e) => setForm({ ...form, endTime: e.target.value })} type="time" value={form.endTime} /></label>
            <label>Przerwa<select onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} value={form.breakMinutes}><option value="0">Bez przerwy</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label>
            <label>Wymagana obsada<input min="1" onChange={(e) => setForm({ ...form, requiredHeadcount: Number(e.target.value) })} type="number" value={form.requiredHeadcount} /></label>
            <fieldset className="tm-schedule-assignees is-wide"><legend>Użytkownicy</legend>{users.map((user) => { const assigned = form.assigneeIds.includes(user.id); const inactive = !isCatalogSelectable(user); return <label className={inactive ? "is-inactive" : ""} key={user.id}><input checked={assigned} disabled={inactive && !assigned} onChange={() => toggleAssignee(user.id)} type="checkbox" /><span className="tm-schedule-avatar">{user.initials}</span><span>{userName(user)}<small>{inactive ? "Nieaktywny" : user.role}</small></span></label>; })}</fieldset>
            <label className="is-wide">Notatka<textarea onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Dodaj informacje dla zespołu" rows="4" value={form.notes} /></label>
            <div className="tm-schedule-shift-facts is-wide"><span><Clock size={17} /> {formatDuration(getShiftMinutes(form))} pracy</span><span><Users size={17} /> {form.assigneeIds.length}/{form.requiredHeadcount} obsady</span><span><Bell size={17} /> {deliveryDisabled ? "Bez wysyłki do pracowników" : "Powiadomienie po publikacji"}</span></div>
          </div>
        )}
        {tab === "tasks" && (
          <div className="tm-schedule-task-editor">
            <div className="tm-schedule-section-heading"><ClipboardText size={22} /><div><h3>Zadania w ramach zmiany</h3><p>{deliveryDisabled ? "Lista pozostaje wyłącznie w wewnętrznym Grafiku." : "Lista będzie widoczna dla przypisanych osób."}</p></div></div>
            <div className="tm-schedule-inline-add"><input onChange={(e) => setTaskDraft(e.target.value)} placeholder="Nazwa zadania" value={taskDraft} /><button disabled={!taskDraft.trim()} onClick={() => { setForm({ ...form, tasks: [...form.tasks, taskDraft.trim()] }); setTaskDraft(""); }} type="button"><Plus size={17} /> Dodaj</button></div>
            <ul className="tm-schedule-task-list">{form.tasks.map((task, index) => <li key={`${task}-${index}`}><Check size={17} /><span>{task}</span><IconButton label={`Usuń zadanie ${task}`} onClick={() => setForm({ ...form, tasks: form.tasks.filter((_, itemIndex) => itemIndex !== index) })}><X size={16} /></IconButton></li>)}</ul>
            {!form.tasks.length && <div className="tm-schedule-empty-small"><ClipboardText size={30} /><strong>Brak zadań</strong><span>Dodaj pierwszą pozycję do tej zmiany.</span></div>}
          </div>
        )}
        {templatesEnabled && tab === "templates" && (
          <div className="tm-schedule-template-list"><div className="tm-schedule-section-heading"><Copy size={22} /><div><h3>Użyj szablonu</h3><p>Wypełnij najważniejsze pola jednym kliknięciem.</p></div></div>{templates.map((template) => <button key={template.id} onClick={() => { setForm({ ...form, title: template.name, startTime: template.startTime, endTime: template.endTime, breakMinutes: template.breakMinutes, locationId: template.locationId, requiredHeadcount: template.requiredHeadcount }); setTab("details"); }} type="button"><strong>{template.name}</strong><span>{template.startTime}–{template.endTime} · obsada {template.requiredHeadcount}</span></button>)}</div>
        )}
        {tab === "activity" && (
          <div className="tm-schedule-activity-log"><div className="tm-schedule-section-heading"><Info size={22} /><div><h3>Aktywność dla zmiany</h3><p>Historia operacji wewnętrznych.</p></div></div><ol><li><span />{isNew ? "Przygotowano nową zmianę" : "Wczytano istniejącą zmianę"}<small>Bieżąca sesja</small></li><li><span />Oczekuje na zapis<small>Teraz</small></li></ol></div>
        )}
      </div>
      <footer className="tm-schedule-drawer-footer">
        {!isNew && <button className="tm-schedule-danger-button" disabled={busy} onClick={() => onDelete(initialShift.id)} type="button"><Trash size={18} /> Usuń</button>}
        <div>
          <button className="tm-schedule-secondary-button" disabled={busy} onClick={() => save(false)} type="button"><FloppyDisk size={18} /> {busy ? "Zapisuję…" : "Zapisz jako szkic"}</button>
          <button className="tm-schedule-primary-button" disabled={busy} onClick={() => save(deliveryDisabled ? false : true)} type="button"><PaperPlaneTilt size={18} /> {busy ? "Zapisuję…" : deliveryDisabled ? "Zapisz zmianę" : "Zapisz i opublikuj"}</button>
        </div>
      </footer>
    </PortalDialog>
  );
}

export function PublishDialog({ busy = false, deliveryDisabled = true, shifts, onClose, onPublish, periodLabel, users }) {
  const titleId = useId();
  const [notify, setNotify] = useState(!deliveryDisabled);
  const totals = useMemo(() => ({ minutes: shifts.reduce((sum, shift) => sum + getShiftMinutes(shift), 0), users: new Set(shifts.flatMap((shift) => shift.assigneeIds)).size }), [shifts]);
  return (
    <PortalDialog className="tm-schedule-publish-dialog" labelledBy={titleId} onClose={onClose}>
      <IconButton className="tm-schedule-dialog-close" label={deliveryDisabled ? "Zamknij zatwierdzanie" : "Zamknij publikowanie"} onClick={onClose}><X size={20} /></IconButton>
      <span className="tm-schedule-dialog-hero"><PaperPlaneTilt size={34} weight="duotone" /></span>
      <h2 id={titleId}>{deliveryDisabled ? "Zatwierdź zmiany" : "Publikuj zmiany"}</h2>
      <p>{periodLabel}</p>
      <div className="tm-schedule-publish-stats"><span><strong>{shifts.length}</strong> zmian</span><span><strong>{formatDuration(totals.minutes)}</strong> godzin</span><span><strong>{totals.users}</strong> osób</span></div>
      {deliveryDisabled
        ? <div className="tm-schedule-delivery-lock"><Bell size={20} /><span><strong>Dostarczenie wyłączone</strong><small>Pracownicy nie zobaczą zmian i nie otrzymają powiadomień.</small></span></div>
        : <label className="tm-schedule-notify-row"><span><Bell size={20} /><span><strong>Powiadom zespół</strong><small>{notify ? `${Math.max(totals.users, users.length)} użytkowników otrzyma informację` : "Bez wysyłania powiadomień"}</small></span></span><input checked={notify} onChange={(e) => setNotify(e.target.checked)} role="switch" type="checkbox" /></label>}
      <div className="tm-schedule-publish-list">{shifts.slice(0, 4).map((shift) => <span key={shift.id}><CalendarBlank size={16} /><strong>{shift.title}</strong><small>{shift.date} · {shift.startTime}–{shift.endTime}</small></span>)}</div>
      <footer><button className="tm-schedule-secondary-button" disabled={busy} onClick={onClose} type="button">Zamknij</button><button className="tm-schedule-primary-button" disabled={busy} onClick={() => onPublish(deliveryDisabled ? false : notify)} type="button">{busy ? "Zatwierdzam…" : deliveryDisabled ? "Zatwierdź wewnętrznie" : "Opublikuj"}</button></footer>
    </PortalDialog>
  );
}

export function RequestsDialog({ onClose, onResolve, requests, users }) {
  const titleId = useId();
  const [tab, setTab] = useState("open");
  const visible = requests.filter((request) => tab === "open" ? request.status === "pending" : request.status !== "pending");
  return (
    <PortalDialog className="tm-schedule-requests-dialog" labelledBy={titleId} onClose={onClose}>
      <header className="tm-schedule-modal-header"><div><p>Grafik</p><h2 id={titleId}>Wnioski pracowników</h2></div><IconButton label="Zamknij wnioski" onClick={onClose}><X size={21} /></IconButton></header>
      <nav aria-label="Rodzaj wniosków" className="tm-schedule-modal-tabs"><button className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")} type="button">Oczekujące ({requests.filter((request) => request.status === "pending").length})</button><button className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")} type="button">Historia</button></nav>
      <div className="tm-schedule-requests-body">
        {visible.map((request) => {
          const user = users.find((candidate) => candidate.id === request.userId);
          return <article className="tm-schedule-request-card" key={request.id}><span className="tm-schedule-avatar">{user?.initials || "?"}</span><div><strong>{user ? userName(user) : "Użytkownik"}</strong><h3>{request.label}</h3><p>{request.detail}</p>{request.status !== "pending" && <span className={`tm-schedule-request-status is-${request.status}`}>{request.status === "accepted" ? "Zaakceptowano" : "Odrzucono"}</span>}</div>{request.status === "pending" && <div className="tm-schedule-request-actions"><button onClick={() => onResolve(request, "rejected")} type="button">Odrzuć</button><button onClick={() => onResolve(request, "accepted")} type="button"><Check size={17} /> Akceptuj</button></div>}</article>;
        })}
        {!visible.length && <div className="tm-schedule-empty-state"><Check size={34} /><strong>Wszystko sprawdzone</strong><p>Brak wniosków w tym widoku.</p></div>}
      </div>
    </PortalDialog>
  );
}

export function SettingsDialog({ busy = false, deliveryDisabled = true, initialSettings, onClose, onSave }) {
  const titleId = useId();
  const timeZoneId = useId();
  const hoursId = useId();
  const minutesId = useId();
  const initialLimit = Number(initialSettings?.weeklyLimitMinutes);
  const safeLimit = Number.isSafeInteger(initialLimit) && initialLimit > 0 && initialLimit <= 10080 ? initialLimit : 2400;
  const initialTimeZone = String(initialSettings?.timeZone || "Europe/Warsaw");
  const initialVersion = Number(initialSettings?.version);
  const [form, setForm] = useState(() => ({
    hours: String(Math.floor(safeLimit / 60)),
    minutes: String(safeLimit % 60),
    timeZone: initialTimeZone,
  }));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting;
  const timeZones = useMemo(() => Array.from(new Set([
    initialTimeZone,
    "Europe/Warsaw",
    "Europe/Berlin",
    "Europe/Prague",
  ])), [initialTimeZone]);
  const close = () => { if (!locked) onClose(); };

  const save = async () => {
    if (locked) return;
    const hours = Number(form.hours);
    const minutes = Number(form.minutes);
    const weeklyLimitMinutes = hours * 60 + minutes;
    if (
      !form.timeZone
      || !Number.isSafeInteger(hours)
      || hours < 0
      || hours > 168
      || !Number.isSafeInteger(minutes)
      || minutes < 0
      || minutes > 59
      || weeklyLimitMinutes < 1
      || weeklyLimitMinutes > 10080
    ) {
      setError("Podaj prawidłowy limit: od 1 minuty do 168 godzin tygodniowo.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const saved = await onSave({ expectedVersion: initialVersion, timeZone: form.timeZone, weeklyLimitMinutes });
      setSubmitting(false);
      if (!saved) {
        setError("Ustawienia nie zostały zapisane. Sprawdź komunikat systemu i spróbuj ponownie.");
        return;
      }
      onClose();
    } catch {
      setSubmitting(false);
      setError("Ustawienia nie zostały zapisane. Spróbuj ponownie.");
    }
  };

  return (
    <PortalDialog className="tm-schedule-settings-dialog" labelledBy={titleId} onClose={close}>
      <header className="tm-schedule-modal-header">
        <div><p>Konfiguracja Grafiku</p><h2 id={titleId}>Ustawienia operacyjne</h2></div>
        <IconButton disabled={locked} label="Zamknij ustawienia" onClick={close}><X size={21} /></IconButton>
      </header>
      <div className="tm-schedule-settings-content">
        <div className="tm-schedule-settings-intro">
          <span><GearSix size={22} weight="duotone" /></span>
          <div><h3>Zasady planowania</h3><p>Te wartości są zapisywane w ustawieniach organizacji i wpływają na kontrolę Grafiku.</p></div>
        </div>

        <div className="tm-schedule-settings-fields">
          <label className="tm-schedule-settings-field" htmlFor={timeZoneId}>
            <span><Clock size={19} /><strong>Strefa czasowa</strong></span>
            <select disabled={locked} id={timeZoneId} onChange={(event) => setForm({ ...form, timeZone: event.target.value })} value={form.timeZone}>
              {timeZones.map((timeZone) => <option key={timeZone} value={timeZone}>{timeZone}</option>)}
            </select>
            <small>Po utworzeniu pierwszej zmiany strefa czasu jest chroniona przed zmianą.</small>
          </label>

          <fieldset className="tm-schedule-settings-field">
            <legend><WarningCircle size={19} /><strong>Tygodniowy limit pracy</strong></legend>
            <div className="tm-schedule-duration-fields">
              <label htmlFor={hoursId}><span>Godziny</span><input disabled={locked} id={hoursId} inputMode="numeric" max="168" min="0" onChange={(event) => setForm({ ...form, hours: event.target.value })} step="1" type="number" value={form.hours} /></label>
              <label htmlFor={minutesId}><span>Minuty</span><input disabled={locked} id={minutesId} inputMode="numeric" max="59" min="0" onChange={(event) => setForm({ ...form, minutes: event.target.value })} step="1" type="number" value={form.minutes} /></label>
            </div>
            <small>Po przekroczeniu tego czasu Grafik pokaże ostrzeżenie przed zatwierdzeniem.</small>
          </fieldset>
        </div>

        <div className="tm-schedule-settings-boundary" role="note">
          <Info size={20} />
          <span><strong>{deliveryDisabled ? "Nadal tylko wewnętrznie" : "Zakres tego ustawienia"}</strong>{deliveryDisabled ? " Zapis nie wysyła zmian do pracowników, Zleceń ani Kalendarza." : " To okno nie zmienia zasad dostarczania Grafiku."}</span>
        </div>
        {error && <p className="tm-schedule-settings-error" role="alert">{error}</p>}
        <small className="tm-schedule-settings-version">Wersja ustawień: {Number.isSafeInteger(initialVersion) && initialVersion > 0 ? initialVersion : "—"}</small>
      </div>
      <footer className="tm-schedule-settings-footer">
        <button className="tm-schedule-secondary-button" disabled={locked} onClick={close} type="button">Anuluj</button>
        <button className="tm-schedule-primary-button" disabled={locked} onClick={() => void save()} type="button">{locked ? "Zapisuję…" : "Zapisz ustawienia"}</button>
      </footer>
    </PortalDialog>
  );
}
