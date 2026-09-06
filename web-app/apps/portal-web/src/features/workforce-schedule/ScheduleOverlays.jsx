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
  MapPin,
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

function IconButton({ children, label, onClick, className = "" }) {
  return <button aria-label={label} className={`tm-schedule-icon-button ${className}`} onClick={onClick} type="button">{children}</button>;
}

function userName(user) {
  return user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim();
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
    locationId: initialShift?.locationId || locations[0]?.id,
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
            <label>Lokalizacja<select onChange={(e) => setForm({ ...form, locationId: e.target.value })} value={form.locationId}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label>Od<input onChange={(e) => setForm({ ...form, startTime: e.target.value })} type="time" value={form.startTime} /></label>
            <label>Do<input onChange={(e) => setForm({ ...form, endTime: e.target.value })} type="time" value={form.endTime} /></label>
            <label>Przerwa<select onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} value={form.breakMinutes}><option value="0">Bez przerwy</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></label>
            <label>Wymagana obsada<input min="1" onChange={(e) => setForm({ ...form, requiredHeadcount: Number(e.target.value) })} type="number" value={form.requiredHeadcount} /></label>
            <fieldset className="tm-schedule-assignees is-wide"><legend>Użytkownicy</legend>{users.map((user) => <label key={user.id}><input checked={form.assigneeIds.includes(user.id)} onChange={() => toggleAssignee(user.id)} type="checkbox" /><span className="tm-schedule-avatar">{user.initials}</span><span>{userName(user)}<small>{user.role}</small></span></label>)}</fieldset>
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

export function SettingsDialog({ deliveryDisabled = true, onClose, onSave }) {
  const titleId = useId();
  const [section, setSection] = useState("details");
  const [settings, setSettings] = useState({ location: true, address: true, users: true, note: true, tags: false, warnings: true, confirmation: false });
  const toggle = (key) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  return (
    <PortalDialog className="tm-schedule-settings-dialog" labelledBy={titleId} onClose={onClose}>
      <header className="tm-schedule-modal-header"><div><p>Konfiguracja grafiku</p><h2 id={titleId}>Ustawienia</h2></div><IconButton label="Zamknij ustawienia" onClick={onClose}><X size={21} /></IconButton></header>
      <div className="tm-schedule-settings-layout">
        <nav aria-label="Sekcje ustawień"><button className={section === "details" ? "is-active" : ""} onClick={() => setSection("details")} type="button"><GearSix size={18} /> Szczegóły zmian</button><button className={section === "rules" ? "is-active" : ""} onClick={() => setSection("rules")} type="button"><WarningCircle size={18} /> Reguły i konflikty</button></nav>
        <div className="tm-schedule-settings-content">
          {section === "details" ? <><h3>Domyślne pola zmiany</h3><p>Wybierz informacje, które koordynator zobaczy podczas planowania.</p>{[["location", "Lokalizacja", <MapPin key="location-icon" size={19} />], ["address", "Adres", <MapPin key="address-icon" size={19} />], ["users", "Użytkownicy", <Users key="users-icon" size={19} />], ["note", "Notatka", <ClipboardText key="note-icon" size={19} />], ["tags", "Tagi zmiany", <Info key="tags-icon" size={19} />]].map(([key, label, icon]) => <label className="tm-schedule-setting-row" key={key}><span>{icon}<strong>{label}</strong></span><input checked={settings[key]} onChange={() => toggle(key)} role="switch" type="checkbox" /></label>)}</> : <><h3>Kontrola jakości grafiku</h3><p>Ostrzeżenia pojawią się przed zatwierdzeniem zmian.</p><label className="tm-schedule-setting-row"><span><WarningCircle size={19} /><span><strong>Wykrywaj konflikty</strong><small>Nakładające się zmiany i braki obsady</small></span></span><input checked={settings.warnings} onChange={() => toggle("warnings")} role="switch" type="checkbox" /></label><label className={`tm-schedule-setting-row ${deliveryDisabled ? "is-disabled" : ""}`}><span><Check size={19} /><span><strong>Wymagaj potwierdzenia</strong><small>{deliveryDisabled ? "Niedostępne — pracownicy nie widzą Grafiku" : "Pracownik potwierdza każdą opublikowaną zmianę"}</small></span></span><input checked={deliveryDisabled ? false : settings.confirmation} disabled={deliveryDisabled} onChange={() => toggle("confirmation")} role="switch" type="checkbox" /></label></>}
        </div>
      </div>
      <footer className="tm-schedule-settings-footer"><button className="tm-schedule-secondary-button" onClick={onClose} type="button">Anuluj</button><button className="tm-schedule-primary-button" onClick={() => onSave(settings)} type="button">Zapisz ustawienia</button></footer>
    </PortalDialog>
  );
}
