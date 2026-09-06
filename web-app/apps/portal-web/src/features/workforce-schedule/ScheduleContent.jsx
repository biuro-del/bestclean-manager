import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  Copy,
  DotsThree,
  DownloadSimple,
  Eye,
  Funnel,
  GearSix,
  Info,
  List,
  MagnifyingGlass,
  MapPin,
  PaperPlaneTilt,
  Plus,
  Rows,
  SlidersHorizontal,
  SquaresFour,
  Trash,
  UserCircle,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  createWorkforceScheduleAdapter,
  normalizeWorkforceScheduleSnapshot,
  notifyScheduleAdapter,
} from "./scheduleContract.js";
import {
  addDays,
  dirtyShifts,
  duplicateShift,
  filterShifts,
  findConflicts,
  formatDuration,
  getShiftMinutes,
  getWeekDays,
  isShiftDirty,
  parseIsoDate,
  summarizeShifts,
  validateShiftMove,
} from "./scheduleModel.js";
import {
  applyWorkforceSchedulePublication,
  isConfirmedWorkforceScheduleShift,
  normalizeWorkforceScheduleShift,
} from "./workforceScheduleClientModel.js";
import { PublishDialog, RequestsDialog, SettingsDialog, ShiftDrawer } from "./ScheduleOverlays.jsx";
import "./schedule.css";

const WEEKDAY_SHORT = ["niedz.", "pon.", "wt.", "śr.", "czw.", "pt.", "sob."];
const MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const UNKNOWN_LOCATION = Object.freeze({ id: "unknown-location", name: "Nieznana lokalizacja", color: "#64748b", softColor: "#f1f5f9" });

function userName(user) {
  return user?.displayName || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Nieprzypisany";
}

function dateParts(iso) {
  const date = parseIsoDate(iso);
  return { day: date.getUTCDate(), weekday: WEEKDAY_SHORT[date.getUTCDay()], month: MONTHS[date.getUTCMonth()], monthIndex: date.getUTCMonth(), year: date.getUTCFullYear() };
}

function rangeLabel(startIso, days = 7) {
  const start = dateParts(startIso);
  const end = dateParts(addDays(startIso, days - 1));
  if (start.month === end.month) return `${start.day}–${end.day} ${start.month} ${end.year}`;
  return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
}

function avatarTone(index) {
  return ["blue", "teal", "orange", "purple", "green"][index % 5];
}

function MenuLayer({ children, className = "" }) {
  return <div className={`tm-schedule-menu ${className}`} role="menu">{children}</div>;
}

function ShiftCard({ actionsEnabled = true, conflicts, dragEnabled = false, dragging = false, onDragCancel, onDragMove, onDragStart, onDragStop, originResourceId, location, onAction, onOpen, shift, users }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pointerSessionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const assigned = shift.assigneeIds.map((id) => users.find((user) => user.id === id)).filter(Boolean);
  const openSlots = Math.max(0, shift.requiredHeadcount - assigned.length);
  const hasConflict = conflicts.some((conflict) => conflict.shiftId === shift.id);
  useEffect(() => () => pointerSessionRef.current?.cleanup?.(), []);
  return (
    <article
      aria-label={`${shift.title}, ${shift.startTime}–${shift.endTime}${dragEnabled ? ". Przeciągnij, aby przenieść zmianę." : ""}`}
      className={`tm-schedule-shift ${isShiftDirty(shift) ? "is-dirty" : ""} ${hasConflict ? "has-conflict" : ""} ${dragEnabled ? "is-draggable" : ""} ${dragging ? "is-dragging" : ""}`}
      data-resource-id={originResourceId}
      data-shift-id={shift.id}
      onClick={(event) => {
        if (!actionsEnabled) return;
        if (suppressClickRef.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
          return;
        }
        onOpen(shift);
      }}
      onPointerDown={(event) => {
        if (!dragEnabled || event.button !== 0 || event.target.closest("button")) return;
        const session = { active: false, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
        const cleanup = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", stop);
          window.removeEventListener("pointercancel", cancel);
        };
        const move = (moveEvent) => {
          if (moveEvent.pointerId !== session.pointerId) return;
          const point = { x: moveEvent.clientX, y: moveEvent.clientY };
          if (!session.active && Math.hypot(point.x - session.startX, point.y - session.startY) >= 6) {
            session.active = true;
            suppressClickRef.current = true;
            onDragStart?.(shift, originResourceId, point);
          }
          if (session.active) onDragMove?.(point);
        };
        const finish = () => {
          cleanup();
          pointerSessionRef.current = null;
          window.setTimeout(() => { suppressClickRef.current = false; }, 150);
        };
        const stop = (stopEvent) => {
          if (stopEvent.pointerId !== session.pointerId) return;
          if (session.active) onDragStop?.({ x: stopEvent.clientX, y: stopEvent.clientY });
          finish();
        };
        const cancel = (cancelEvent) => {
          if (cancelEvent.pointerId !== session.pointerId) return;
          if (session.active) onDragCancel?.();
          finish();
        };
        session.cleanup = cleanup;
        pointerSessionRef.current = session;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
        window.addEventListener("pointercancel", cancel);
      }}
      style={{ "--shift-color": location.color, "--shift-soft": location.softColor }}
      tabIndex={actionsEnabled ? 0 : undefined}
      onKeyDown={(event) => { if (actionsEnabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(shift); } }}
    >
      <div className="tm-schedule-shift__top"><strong>{shift.startTime}–{shift.endTime}</strong>{actionsEnabled && <button aria-expanded={menuOpen} aria-label={`Działania dla ${shift.title}`} draggable="false" onClick={(event) => { event.stopPropagation(); setMenuOpen((value) => !value); }} onDragStart={(event) => event.preventDefault()} type="button"><DotsThree size={18} weight="bold" /></button>}</div>
      <span className="tm-schedule-shift__title">{shift.title}</span>
      <div className="tm-schedule-shift__people"><span className="tm-schedule-avatar-stack">{assigned.slice(0, 3).map((user, index) => <span className={`tm-schedule-avatar is-${avatarTone(index)}`} key={user.id} title={userName(user)}>{user.initials}</span>)}</span><small className={openSlots ? "is-open" : ""}>{assigned.length}/{shift.requiredHeadcount}{openSlots ? ` · ${openSlots} wolne` : ""}</small></div>
      {isShiftDirty(shift) && <span className="tm-schedule-draft-dot" title="Nieopublikowana zmiana" />}
      {hasConflict && <WarningCircle aria-label="Zmiana ma konflikt" className="tm-schedule-shift__warning" size={16} weight="fill" />}
      {actionsEnabled && menuOpen && <MenuLayer className="tm-schedule-shift-menu"><button onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onOpen(shift); }} role="menuitem" type="button"><Eye size={16} /> Edytuj</button><button onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onAction("duplicate", shift); }} role="menuitem" type="button"><Copy size={16} /> Duplikuj</button><button onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onAction("move", shift); }} role="menuitem" type="button"><CalendarBlank size={16} /> Przenieś o dzień</button><button className="is-danger" onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onAction("delete", shift); }} role="menuitem" type="button"><Trash size={16} /> Usuń</button></MenuLayer>}
    </article>
  );
}

function WeekGrid({ conflicts, days, display, dragEnabled, editingEnabled, grouping, locations, onCellClick, onSearch, onShiftAction, onShiftDrop, onShiftOpen, onValidateShiftDrop, searchValue, shifts, todayIso, users }) {
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const draggedRef = useRef(null);
  const dropTargetRef = useRef(null);
  const resources = grouping === "location" ? locations : users.map((user) => ({ id: user.id, name: userName(user), color: "#506de2", softColor: "#eef1ff", initials: user.initials }));
  const resourceShifts = (resourceId, day) => shifts.filter((shift) => shift.date === day && (grouping === "location" ? shift.locationId === resourceId : shift.assigneeIds.includes(resourceId)));
  const visibleResources = display.showEmpty ? resources : resources.filter((resource) => days.some((day) => resourceShifts(resource.id, day).length));
  const weekSummary = summarizeShifts(shifts);
  const targetFor = (resourceId, day, dragContext = draggedRef.current) => grouping === "location"
    ? { date: day, locationId: resourceId }
    : { date: day, fromUserId: dragContext?.originResourceId, toUserId: resourceId };
  const clearDrag = () => {
    draggedRef.current = null;
    dropTargetRef.current = null;
    setDragged(null);
    setDropTarget(null);
  };
  const handleDragStart = (shift, originResourceId, point) => {
    const next = { shift, originResourceId, point };
    draggedRef.current = next;
    dropTargetRef.current = null;
    setDragged(next);
    setDropTarget(null);
    setAnnouncement(`Przenoszenie zmiany ${shift.title}. Wybierz docelową komórkę.`);
  };
  const handleDragCancel = () => {
    const active = draggedRef.current;
    if (active) setAnnouncement(`Anulowano przenoszenie zmiany ${active.shift.title}.`);
    clearDrag();
  };
  const handleDragMove = (point) => {
    const active = draggedRef.current;
    if (!active) return;
    const next = { ...active, point };
    draggedRef.current = next;
    setDragged(next);
    const cell = document.elementFromPoint(point.x, point.y)?.closest?.("[data-drop-day][data-drop-resource]");
    if (!cell?.closest(".tm-schedule-week-grid")) {
      dropTargetRef.current = null;
      setDropTarget(null);
      return;
    }
    const resourceId = cell.getAttribute("data-drop-resource");
    const day = cell.getAttribute("data-drop-day");
    const validationTarget = targetFor(resourceId, day, active);
    const validation = onValidateShiftDrop(active.shift.id, validationTarget);
    const target = { key: `${resourceId}-${day}`, resourceId, day, target: validationTarget, code: validation.code, valid: validation.ok, message: validation.message };
    if (dropTargetRef.current?.key !== target.key || dropTargetRef.current?.code !== target.code) {
      dropTargetRef.current = target;
      setDropTarget(target);
      const resource = resources.find((item) => item.id === resourceId);
      setAnnouncement(validation.ok ? `Cel: ${resource?.name || resourceId}, ${day}. Można upuścić.` : validation.message);
    }
  };
  const handleDragStop = async (point) => {
    if (point) handleDragMove(point);
    const active = draggedRef.current;
    const target = dropTargetRef.current;
    if (!active || !target) {
      handleDragCancel();
      return;
    }
    const result = await onShiftDrop(active.shift.id, target.target);
    setAnnouncement(result.ok ? `Przeniesiono zmianę ${active.shift.title}.` : result.message);
    clearDrag();
    if (result.ok) {
      window.setTimeout(() => document.querySelector(`[data-shift-id="${active.shift.id}"][data-resource-id="${target.resourceId}"]`)?.focus(), 0);
    }
  };
  useEffect(() => {
    if (!dragged) return undefined;
    const cancelOnEscape = (event) => {
      if (event.key !== "Escape") return;
      const active = draggedRef.current;
      if (active) setAnnouncement(`Anulowano przenoszenie zmiany ${active.shift.title}.`);
      draggedRef.current = null;
      dropTargetRef.current = null;
      setDragged(null);
      setDropTarget(null);
    };
    document.addEventListener("keydown", cancelOnEscape);
    return () => document.removeEventListener("keydown", cancelOnEscape);
  }, [dragged]);
  return (
    <div className="tm-schedule-grid-scroller">
      <div aria-live="polite" className="tm-sr-only" role="status">{announcement}</div>
      {dragged && <div aria-hidden="true" className="tm-schedule-drag-preview" style={{ left: dragged.point.x + 14, top: dragged.point.y + 14 }}><strong>{dragged.shift.startTime}–{dragged.shift.endTime}</strong><span>{dragged.shift.title}</span></div>}
      <div className="tm-schedule-week-grid" role="grid" style={{ "--day-count": days.length }}>
        <div className="tm-schedule-resource-head" role="columnheader"><label><MagnifyingGlass size={16} /><span className="tm-sr-only">Szukaj w grafiku</span><input onChange={(event) => onSearch(event.target.value)} placeholder="Szukaj" value={searchValue} />{searchValue && <button aria-label="Wyczyść wyszukiwanie grafiku" onClick={() => onSearch("")} type="button"><X size={14} /></button>}</label></div>
        {days.map((day) => { const part = dateParts(day); const dayShifts = shifts.filter((shift) => shift.date === day); return <div className={`tm-schedule-day-head ${day === todayIso ? "is-today" : ""}`} key={day} role="columnheader"><span>{part.weekday}</span><strong>{part.day}</strong>{display.showSummary && <small>{formatDuration(dayShifts.reduce((sum, shift) => sum + getShiftMinutes(shift), 0))} · {dayShifts.length}</small>}</div>; })}
        {visibleResources.map((resource) => (
          <div className="tm-schedule-grid-row" key={resource.id} role="row">
            <div className="tm-schedule-resource-cell" role="rowheader"><span className="tm-schedule-resource-mark" style={{ background: resource.color }}>{grouping === "user" ? resource.initials : ""}</span><div><strong>{resource.name}</strong><small>{resourceShifts(resource.id, days[0]).length || ""}{grouping === "location" ? " aktywnych zmian" : ""}</small></div></div>
            {days.map((day) => {
              const items = resourceShifts(resource.id, day);
              const targetKey = `${resource.id}-${day}`;
              const activeTarget = dropTarget?.key === targetKey;
              return <div
                aria-label={`${resource.name}, ${day}${activeTarget ? dropTarget.valid ? ", dozwolone miejsce upuszczenia" : `, niedozwolone miejsce upuszczenia: ${dropTarget.message}` : ""}`}
                className={`tm-schedule-day-cell ${activeTarget ? dropTarget.valid ? "is-drag-target" : "is-drop-invalid" : ""}`}
                data-drop-day={day}
                data-drop-resource={resource.id}
                key={targetKey}
                onDoubleClick={() => onCellClick(day, grouping === "location" ? resource.id : locations[0]?.id)}
                role="gridcell"
              >{editingEnabled && <button aria-label={`Dodaj zmianę: ${resource.name}, ${day}`} className="tm-schedule-cell-add" disabled={!locations.length} onClick={() => onCellClick(day, grouping === "location" ? resource.id : locations[0]?.id)} type="button"><Plus size={16} /></button>}{items.map((shift) => <ShiftCard actionsEnabled={editingEnabled} conflicts={conflicts} dragEnabled={dragEnabled} dragging={dragged?.shift.id === shift.id && dragged.originResourceId === resource.id} key={shift.id} location={locations.find((location) => location.id === shift.locationId) || UNKNOWN_LOCATION} onAction={onShiftAction} onDragCancel={handleDragCancel} onDragMove={handleDragMove} onDragStart={handleDragStart} onDragStop={handleDragStop} onOpen={onShiftOpen} originResourceId={resource.id} shift={shift} users={users} />)}</div>;
            })}
          </div>
        ))}
        {display.showSummary && <div className="tm-schedule-summary-row"><div><strong>Podliczenie tygodniowe</strong><small>Podsumowanie całego okresu</small></div><div className="tm-schedule-summary-metrics"><span><Clock size={17} /><small>Godziny</small><strong>{formatDuration(weekSummary.minutes)}</strong></span><span><Rows size={17} /><small>Zmiany</small><strong>{weekSummary.shifts}</strong></span><span><Users size={17} /><small>Użytkownicy</small><strong>{weekSummary.users}</strong></span></div></div>}
      </div>
    </div>
  );
}

function DayAgenda({ conflicts, day, editingEnabled, locations, onCellClick, onShiftAction, onShiftOpen, shifts, users }) {
  const part = dateParts(day);
  return (
    <div className="tm-schedule-agenda">
      <header><div><span>{part.weekday}</span><strong>{part.day} {part.month}</strong></div>{editingEnabled && <button disabled={!locations.length} onClick={() => onCellClick(day, locations[0]?.id)} type="button"><Plus size={18} /> Dodaj zmianę</button>}</header>
      {locations.map((location) => {
        const items = shifts.filter((shift) => shift.date === day && shift.locationId === location.id);
        if (!items.length) return null;
        return <section key={location.id}><div className="tm-schedule-agenda-location"><span style={{ background: location.color }} /><div><strong>{location.name}</strong><small>{items.length} {items.length === 1 ? "zmiana" : "zmiany"}</small></div></div><div className="tm-schedule-agenda-cards">{items.map((shift) => <ShiftCard actionsEnabled={editingEnabled} conflicts={conflicts} key={shift.id} location={location} onAction={onShiftAction} onOpen={onShiftOpen} shift={shift} users={users} />)}</div></section>;
      })}
      {!shifts.some((shift) => shift.date === day) && <div className="tm-schedule-empty-state"><CalendarBlank size={38} /><strong>Brak zmian tego dnia</strong><p>{locations.length ? editingEnabled ? "Dodaj pierwszą zmianę lub przejdź do innej daty." : "W tym dniu nie zaplanowano zmian." : "Najpierw wczytaj katalog obiektów."}</p>{editingEnabled && <button disabled={!locations.length} onClick={() => onCellClick(day, locations[0]?.id)} type="button"><Plus size={17} /> Dodaj zmianę</button>}</div>}
    </div>
  );
}

function MonthGrid({ locations, monthDate, onDayOpen, shifts, todayIso }) {
  const current = parseIsoDate(monthDate);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * 86400000);
  const cells = Array.from({ length: 42 }, (_, index) => new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10));
  return <div className="tm-schedule-month-grid"><div className="tm-schedule-month-weekdays">{["Pon.", "Wt.", "Śr.", "Czw.", "Pt.", "Sob.", "Niedz."].map((day) => <span key={day}>{day}</span>)}</div><div className="tm-schedule-month-cells">{cells.map((day) => { const part = dateParts(day); const items = shifts.filter((shift) => shift.date === day); return <button className={`${part.monthIndex !== month ? "is-outside" : ""} ${day === todayIso ? "is-today" : ""}`} key={day} onClick={() => onDayOpen(day)} type="button"><strong>{part.day}</strong><span>{items.slice(0, 3).map((shift) => <small key={shift.id} style={{ borderLeftColor: (locations.find((location) => location.id === shift.locationId) || UNKNOWN_LOCATION).color }}>{shift.startTime} {shift.title}</small>)}</span>{items.length > 3 && <em>+{items.length - 3} więcej</em>}</button>; })}</div></div>;
}

export function ScheduleContent({
  advancedActionsEnabled = false,
  adapter: providedAdapter,
  deliveryDisabled = true,
  editingEnabled = true,
  exportEnabled = false,
  globalSearch = "",
  locations: providedLocations,
  mode = "internal",
  onExport,
  onNotify = () => {},
  onRangeChange,
  onRequestResolve,
  onSchedulePublish,
  onSettingsSave,
  onShiftCreate,
  onShiftDelete,
  onShiftMove,
  onShiftUpdate,
  onSnapshotChange,
  requestsEnabled = false,
  settingsEnabled = false,
  requests: providedRequests,
  shifts: providedShifts,
  snapshot,
  snapshotVersion,
  templatesEnabled = false,
  templates: providedTemplates,
  todayIso: providedTodayIso,
  users: providedUsers,
  weeklyLimitMinutes = 40 * 60,
  weekStart: providedWeekStart,
}) {
  const source = useMemo(() => normalizeWorkforceScheduleSnapshot({
    ...(snapshot || {}),
    ...(providedUsers !== undefined ? { users: providedUsers } : {}),
    ...(providedLocations !== undefined ? { locations: providedLocations } : {}),
    ...(providedShifts !== undefined ? { shifts: providedShifts } : {}),
    ...(providedRequests !== undefined ? { requests: providedRequests } : {}),
    ...(providedTemplates !== undefined ? { templates: providedTemplates } : {}),
    ...(providedTodayIso !== undefined ? { todayIso: providedTodayIso } : {}),
    ...(providedWeekStart !== undefined ? { weekStart: providedWeekStart } : {}),
    ...(snapshotVersion !== undefined ? { version: snapshotVersion } : {}),
  }), [snapshot, snapshotVersion, providedUsers, providedLocations, providedShifts, providedRequests, providedTemplates, providedTodayIso, providedWeekStart]);
  const { locations, templates, todayIso, users } = source;
  const adapter = useMemo(() => createWorkforceScheduleAdapter({
    ...providedAdapter,
    ...(onShiftCreate ? { onShiftCreate } : {}),
    ...(onShiftUpdate ? { onShiftUpdate } : {}),
    ...(onShiftDelete ? { onShiftDelete } : {}),
    ...(onShiftMove ? { onShiftMove } : {}),
    ...(onSchedulePublish ? { onSchedulePublish } : {}),
    ...(onRequestResolve ? { onRequestResolve } : {}),
    ...(onSettingsSave ? { onSettingsSave } : {}),
    ...(onExport ? { onExport } : {}),
    ...(onRangeChange ? { onRangeChange } : {}),
    ...(onSnapshotChange ? { onSnapshotChange } : {}),
  }), [providedAdapter, onShiftCreate, onShiftUpdate, onShiftDelete, onShiftMove, onSchedulePublish, onRequestResolve, onSettingsSave, onExport, onRangeChange, onSnapshotChange]);
  const [shifts, setShifts] = useState(() => [...source.shifts]);
  const [requests, setRequests] = useState(() => [...source.requests]);
  const [weekStart, setWeekStart] = useState(source.weekStart);
  const [selectedDay, setSelectedDay] = useState(todayIso);
  const [viewMode, setViewMode] = useState("week");
  const [grouping, setGrouping] = useState("location");
  const [localSearch, setLocalSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [display, setDisplay] = useState({ showSummary: true, showProblems: false, showEmpty: true, compact: false });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [editorShift, setEditorShift] = useState(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const toolbarRef = useRef(null);
  const appliedVersionRef = useRef(source.version);
  const mutationBusyRef = useRef(false);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const query = [globalSearch, localSearch].filter(Boolean).join(" ");
  const visibleShifts = useMemo(() => filterShifts(shifts, query, locationFilter, userFilter), [shifts, query, locationFilter, userFilter]);
  const currentShifts = useMemo(() => visibleShifts.filter((shift) => days.includes(shift.date)), [visibleShifts, days]);
  const weekShifts = useMemo(() => shifts.filter((shift) => days.includes(shift.date)), [shifts, days]);
  const changes = useMemo(() => dirtyShifts(shifts), [shifts]);
  const conflicts = useMemo(() => findConflicts(weekShifts, users, weeklyLimitMinutes), [weekShifts, users, weeklyLimitMinutes]);
  const summary = useMemo(() => summarizeShifts(currentShifts), [currentShifts]);
  const pendingRequests = requests.filter((request) => request.status === "pending").length;

  useEffect(() => {
    if (source.version == null || Object.is(source.version, appliedVersionRef.current)) return;
    appliedVersionRef.current = source.version;
    setShifts([...source.shifts]);
    setRequests([...source.requests]);
  }, [source]);

  const emit = async (method, payload) => {
    try {
      return await notifyScheduleAdapter(adapter, method, { ...payload, deliveryDisabled, mode });
    } catch (error) {
      onNotify(error?.message || "Nie udało się zapisać zmiany grafiku.", "error");
      throw error;
    }
  };

  const emitSnapshot = (reason, nextShifts, nextRequests = requests) => void emit("onSnapshotChange", {
    reason,
    snapshot: { ...source, shifts: nextShifts, requests: nextRequests, weekStart },
  }).catch(() => {});

  const runMutation = async (method, payload) => {
    if (!editingEnabled) {
      onNotify("Twoja rola pozwala tylko przeglądać Grafik.", "error");
      return null;
    }
    if (mutationBusyRef.current) {
      onNotify("Poczekaj na zakończenie poprzedniego zapisu Grafiku.", "error");
      return null;
    }
    mutationBusyRef.current = true;
    setMutationBusy(true);
    try {
      const result = await emit(method, payload);
      if (result === null || result === undefined || result === false) {
        onNotify("Serwer nie potwierdził zapisu Grafiku. Odśwież widok przed kolejną operacją.", "error");
        return null;
      }
      return result;
    } catch {
      return null;
    } finally {
      mutationBusyRef.current = false;
      setMutationBusy(false);
    }
  };

  useEffect(() => {
    const from = viewMode === "day"
      ? selectedDay
      : viewMode === "month"
        ? `${weekStart.slice(0, 7)}-01`
        : weekStart;
    const to = viewMode === "day"
      ? selectedDay
      : viewMode === "month"
        ? addDays(`${weekStart.slice(0, 7)}-01`, new Date(Date.UTC(Number(weekStart.slice(0, 4)), Number(weekStart.slice(5, 7)), 0)).getUTCDate() - 1)
        : addDays(weekStart, 6);
    void emit("onRangeChange", { from, to, viewMode }).catch(() => {});
    // Adapter callbacks are intentionally excluded: only a visible range change
    // should trigger a remote refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, viewMode, weekStart]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 680px)").matches) setViewMode("day");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine) and (min-width: 681px)");
    const sync = () => setDragEnabled(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const closeMenus = (event) => { if (!toolbarRef.current?.contains(event.target)) setMenu(null); };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  const openNewShift = (date = selectedDay, locationId = locations[0]?.id) => {
    if (!editingEnabled) return;
    if (!locationId) {
      onNotify("Najpierw wczytaj co najmniej jeden obiekt.", "error");
      return;
    }
    setEditorShift({ date, locationId, title: "Nowa zmiana", startTime: "09:00", endTime: "17:00", breakMinutes: 30, requiredHeadcount: 1, assigneeIds: [], notes: "", tasks: [] });
    setMenu(null);
  };

  const saveShift = async (form) => {
    const { publishNow, ...values } = form;
    const previousShift = values.id ? shifts.find((shift) => shift.id === values.id) : null;
    const revision = previousShift ? (previousShift.revision || 0) + 1 : 1;
    const nextShift = previousShift
      ? { ...previousShift, ...values, revision, publishedRevision: publishNow ? revision : previousShift.publishedRevision }
      : { ...values, id: `sh-${Date.now()}`, revision, publishedRevision: publishNow ? revision : null };
    const saved = await runMutation(previousShift ? "onShiftUpdate" : "onShiftCreate", { previousShift, publishNow, shift: nextShift });
    if (!saved) return;
    const confirmedShift = normalizeWorkforceScheduleShift(saved);
    if (!isConfirmedWorkforceScheduleShift(confirmedShift)) {
      onNotify("Serwer nie zwrócił zapisanej wersji zmiany. Odśwież Grafik przed kolejną operacją.", "error");
      return;
    }
    const nextShifts = previousShift
      ? shifts.map((shift) => shift.id === previousShift.id ? confirmedShift : shift)
      : [...shifts, confirmedShift];
    setShifts(nextShifts);
    setEditorShift(null);
    emitSnapshot(previousShift ? "shift-update" : "shift-create", nextShifts);
    onNotify(publishNow
      ? deliveryDisabled ? "Zmiana została zatwierdzona wewnętrznie. Pracownicy jej nie widzą." : "Zmiana została zapisana i opublikowana."
      : "Zmiana została zapisana jako szkic.");
  };

  const deleteShift = async (shiftId) => {
    const previousShift = shifts.find((shift) => shift.id === shiftId);
    const saved = await runMutation("onShiftDelete", { previousShift, shiftId });
    if (!saved) return;
    const confirmedShift = normalizeWorkforceScheduleShift(saved);
    if (!isConfirmedWorkforceScheduleShift(confirmedShift) || !confirmedShift.pendingDeletion) {
      onNotify("Serwer nie potwierdził archiwizacji zmiany. Odśwież Grafik przed kolejną operacją.", "error");
      return;
    }
    const nextShifts = shifts.map((shift) => shift.id === shiftId ? confirmedShift : shift);
    setShifts(nextShifts);
    setEditorShift(null);
    emitSnapshot("shift-delete", nextShifts);
    onNotify(deliveryDisabled ? "Usunięcie zmiany czeka na wewnętrzne zatwierdzenie." : "Usunięcie zmiany czeka na publikację.");
  };

  const handleShiftAction = async (action, shift) => {
    if (action === "delete") return deleteShift(shift.id);
    if (action === "duplicate") {
      const nextShift = duplicateShift(shift, `sh-${Date.now()}`);
      const saved = await runMutation("onShiftCreate", { sourceShift: shift, shift: nextShift });
      if (!saved) return;
      const confirmedShift = normalizeWorkforceScheduleShift(saved);
      if (!isConfirmedWorkforceScheduleShift(confirmedShift)) {
        onNotify("Serwer nie zwrócił zapisanej kopii zmiany. Odśwież Grafik przed kolejną operacją.", "error");
        return;
      }
      const nextShifts = [...shifts, confirmedShift];
      setShifts(nextShifts);
      emitSnapshot("shift-duplicate", nextShifts);
      onNotify("Utworzono kopię zmiany jako szkic.");
    }
    if (action === "move") {
      const nextShift = { ...shift, date: addDays(shift.date, 1), revision: shift.revision + 1 };
      const saved = await runMutation("onShiftMove", { previousShift: shift, shift: nextShift });
      if (!saved) return;
      const confirmedShift = normalizeWorkforceScheduleShift(saved);
      if (!isConfirmedWorkforceScheduleShift(confirmedShift)) {
        onNotify("Serwer nie zwrócił zapisanej wersji przeniesionej zmiany. Odśwież Grafik przed kolejną operacją.", "error");
        return;
      }
      const nextShifts = shifts.map((item) => item.id === shift.id ? confirmedShift : item);
      setShifts(nextShifts);
      emitSnapshot("shift-move", nextShifts);
      onNotify("Zmiana została przeniesiona na następny dzień.");
    }
  };

  const validateShiftDrop = (shiftId, target) => validateShiftMove(shifts, shiftId, target);

  const handleShiftDrop = async (shiftId, target) => {
    const result = validateShiftMove(shifts, shiftId, target);
    if (!result.ok) {
      onNotify(result.message, "error");
      return result;
    }
    const previousShift = shifts.find((shift) => shift.id === shiftId);
    const nextShift = { ...result.nextShift, revision: (previousShift?.revision || 0) + 1 };
    const saved = await runMutation("onShiftMove", { previousShift, shift: nextShift, target });
    if (!saved) return { ok: false, code: "save-failed", message: "Nie udało się zapisać przeniesienia." };
    const confirmedShift = normalizeWorkforceScheduleShift(saved);
    if (!isConfirmedWorkforceScheduleShift(confirmedShift)) {
      onNotify("Serwer nie zwrócił zapisanej wersji przeniesionej zmiany. Odśwież Grafik przed kolejną operacją.", "error");
      return { ok: false, code: "invalid-response", message: "Serwer nie potwierdził wersji przeniesionej zmiany." };
    }
    const nextShifts = shifts.map((shift) => shift.id === shiftId ? confirmedShift : shift);
    setShifts(nextShifts);
    emitSnapshot("shift-drop", nextShifts);
    onNotify(deliveryDisabled ? "Zmiana została przeniesiona i czeka na wewnętrzne zatwierdzenie." : "Zmiana została przeniesiona. Opublikuj grafik, aby powiadomić zespół.");
    return result;
  };

  const resolveRequest = (request, status) => {
    const nextRequests = requests.map((item) => item.id === request.id ? { ...item, status } : item);
    let nextShifts = shifts;
    if (status === "accepted" && request.type === "open_shift_claim") {
      nextShifts = shifts.map((shift) => shift.id === request.shiftId && shift.assigneeIds.length < shift.requiredHeadcount ? { ...shift, assigneeIds: [...shift.assigneeIds, request.userId], revision: shift.revision + 1 } : shift);
    }
    if (status === "accepted" && request.type === "time_off") {
      nextShifts = shifts.map((shift) => shift.id === request.shiftId ? { ...shift, assigneeIds: shift.assigneeIds.filter((id) => id !== request.userId), revision: shift.revision + 1 } : shift);
    }
    setRequests(nextRequests);
    setShifts(nextShifts);
    void emit("onRequestResolve", { request, status }).catch(() => {});
    emitSnapshot("request-resolve", nextShifts, nextRequests);
    onNotify(status === "accepted" ? "Wniosek został zaakceptowany." : "Wniosek został odrzucony.");
  };

  const clearWeekDrafts = () => {
    const nextShifts = shifts
      .filter((shift) => !days.includes(shift.date) || shift.publishedRevision != null)
      .map((shift) => days.includes(shift.date) && isShiftDirty(shift) ? { ...shift, revision: shift.publishedRevision || 1, pendingDeletion: false } : shift);
    setShifts(nextShifts);
    setMenu(null);
    emitSnapshot("week-drafts-clear", nextShifts);
    onNotify("Wyczyszczono szkice w tym tygodniu.");
  };

  const copyWeek = () => {
    const copies = shifts.filter((shift) => days.includes(shift.date)).map((shift) => duplicateShift(shift, `sh-${Date.now()}-${shift.id}`, addDays(shift.date, 7)));
    const nextShifts = [...shifts, ...copies];
    setShifts(nextShifts);
    setMenu(null);
    copies.forEach((shift) => void emit("onShiftCreate", { shift, source: "copy-week" }).catch(() => {}));
    emitSnapshot("week-copy", nextShifts);
    onNotify("Skopiowano tydzień do następnego okresu.");
  };

  const publishSchedule = async () => {
    const saved = await runMutation("onSchedulePublish", { changes, shifts });
    if (!saved) return;
    let nextShifts;
    try {
      nextShifts = applyWorkforceSchedulePublication(shifts, saved);
    } catch (error) {
      onNotify(error?.message || "Serwer nie potwierdził wersji zatwierdzonych zmian.", "error");
      return;
    }
    setShifts(nextShifts);
    setOverlay(null);
    emitSnapshot("schedule-publish", nextShifts);
    onNotify(deliveryDisabled ? "Grafik został zatwierdzony wewnętrznie. Pracownicy go nie widzą." : "Grafik został opublikowany.");
  };

  const navigate = (amount) => {
    const step = viewMode === "month" ? 28 : viewMode === "day" ? 1 : 7;
    setWeekStart((current) => addDays(current, amount * step));
    setSelectedDay((current) => addDays(current, amount * step));
  };

  return (
    <section className="tm-schedule-page" aria-labelledby="schedule-title" data-delivery-disabled={deliveryDisabled ? "true" : "false"} data-mode={mode}>
      <header className="tm-schedule-title-card"><div><span><CalendarBlank size={29} weight="duotone" /></span><div><p>Planowanie</p><h1 id="schedule-title">Grafik</h1></div></div><div className="tm-schedule-title-actions">{requestsEnabled && <button className="tm-schedule-request-button" onClick={() => setOverlay("requests")} type="button"><Users size={18} /><span>Wnioski</span>{pendingRequests > 0 && <em>{pendingRequests}</em>}</button>}<label className="tm-schedule-resource-select"><MapPin size={18} /><span className="tm-sr-only">Grupuj grafik według</span><select onChange={(event) => setGrouping(event.target.value)} value={grouping}><option value="location">Lokalizacja</option><option value="user">Użytkownicy</option></select></label>{settingsEnabled && <button onClick={() => setOverlay("settings")} type="button"><GearSix size={18} /><span>Ustawienia</span></button>}{advancedActionsEnabled && <button aria-label="Więcej ustawień grafiku" type="button"><DotsThree size={21} weight="bold" /></button>}</div></header>

      {(mode === "internal" || deliveryDisabled) && <div className="tm-schedule-boundary-banner" role="status"><Info size={19} weight="duotone" /><span><strong>Wewnętrzne planowanie</strong> Pracownicy nie widzą tego grafiku. Zapis nie uruchamia aplikacji pracownika ani powiadomień.</span></div>}

      <div className="tm-schedule-panel">
        <div className="tm-schedule-toolbar" ref={toolbarRef}>
          <div className="tm-schedule-toolbar-left">
            <div className="tm-schedule-popover-anchor"><button aria-expanded={menu === "display"} onClick={() => setMenu(menu === "display" ? null : "display")} type="button"><SlidersHorizontal size={18} /> Wyświetl opcje <CaretDown size={14} /></button>{menu === "display" && <MenuLayer className="tm-schedule-display-menu"><strong>Układ grafiku</strong><button className={grouping === "location" ? "is-selected" : ""} onClick={() => setGrouping("location")} role="menuitemradio" type="button"><MapPin size={17} /> Według lokalizacji {grouping === "location" && <Check size={16} />}</button><button className={grouping === "user" ? "is-selected" : ""} onClick={() => setGrouping("user")} role="menuitemradio" type="button"><UserCircle size={17} /> Według użytkowników {grouping === "user" && <Check size={16} />}</button><hr />{[["showSummary", "Podsumowanie godzin"], ["showProblems", "Pokaż problemy"], ["showEmpty", "Puste zasoby"], ["compact", "Widok kompaktowy"]].map(([key, label]) => <label key={key}><span>{label}</span><input checked={display[key]} onChange={() => setDisplay({ ...display, [key]: !display[key] })} role="switch" type="checkbox" /></label>)}</MenuLayer>}</div>
            <button aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} type="button"><Funnel size={17} /> Filtry</button>
            <div className="tm-schedule-nav-buttons"><button aria-label="Poprzedni okres" onClick={() => navigate(-1)} type="button"><CaretLeft size={18} /></button><button onClick={() => { setWeekStart(source.weekStart); setSelectedDay(todayIso); }} type="button">Dzisiaj</button><button aria-label="Następny okres" onClick={() => navigate(1)} type="button"><CaretRight size={18} /></button></div>
            <label className="tm-schedule-view-select"><span className="tm-sr-only">Widok grafiku</span><select onChange={(event) => setViewMode(event.target.value)} value={viewMode}><option value="day">Dzień</option><option value="week">Tydzień</option><option value="month">Miesiąc</option></select><CaretDown size={14} /></label>
            <button className="tm-schedule-date-button" onClick={() => setViewMode("month")} type="button"><CalendarBlank size={17} /><span>{viewMode === "day" ? `${dateParts(selectedDay).day} ${dateParts(selectedDay).month} ${dateParts(selectedDay).year}` : viewMode === "month" ? `${dateParts(weekStart).month} ${dateParts(weekStart).year}` : rangeLabel(weekStart)}</span></button>
          </div>
          <div className="tm-schedule-toolbar-right">
            {(advancedActionsEnabled || exportEnabled) && <div className="tm-schedule-popover-anchor"><button aria-expanded={menu === "actions"} disabled={mutationBusy} onClick={() => setMenu(menu === "actions" ? null : "actions")} type="button">Działania <CaretDown size={14} /></button>{menu === "actions" && <MenuLayer className="tm-schedule-actions-menu">{advancedActionsEnabled && <button onClick={clearWeekDrafts} role="menuitem" type="button"><Trash size={17} /> Wyczyść szkice</button>}{advancedActionsEnabled && <button onClick={copyWeek} role="menuitem" type="button"><Copy size={17} /> Skopiuj do następnego tygodnia</button>}{exportEnabled && <button onClick={() => { setMenu(null); void emit("onExport", { shifts: currentShifts, weekStart }); onNotify("Przygotowano dane grafiku do eksportu."); }} role="menuitem" type="button"><DownloadSimple size={17} /> Eksportuj grafik</button>}</MenuLayer>}</div>}
            {editingEnabled && <div className="tm-schedule-popover-anchor"><button className="tm-schedule-add-button" disabled={!locations.length} onClick={() => setMenu(menu === "add" ? null : "add")} type="button"><Plus size={17} /> Dodaj <CaretDown size={14} /></button>{menu === "add" && <MenuLayer className="tm-schedule-add-menu"><button onClick={() => openNewShift()} role="menuitem" type="button"><Clock size={18} /> Nowa zmiana</button>{requestsEnabled && <button onClick={() => { setOverlay("requests"); setMenu(null); }} role="menuitem" type="button"><Users size={18} /> Wniosek / wolna zmiana</button>}{templatesEnabled && <button disabled={!templates.length} onClick={() => { setEditorShift({ ...templates[0], date: selectedDay, assigneeIds: [], notes: "", tasks: [] }); setMenu(null); }} role="menuitem" type="button"><Copy size={18} /> Z szablonu</button>}</MenuLayer>}</div>}
            {editingEnabled && <button className="tm-schedule-publish-button" disabled={!changes.length || mutationBusy} onClick={() => setOverlay("publish")} type="button"><PaperPlaneTilt size={17} /> {deliveryDisabled ? "Zatwierdź" : "Opublikuj"}{changes.length ? ` (${changes.length})` : ""}</button>}
          </div>
        </div>

        {filtersOpen && <div className="tm-schedule-subtoolbar"><label><MagnifyingGlass size={17} /><input onChange={(event) => setLocalSearch(event.target.value)} placeholder="Szukaj zmian" value={localSearch} />{localSearch && <button aria-label="Wyczyść wyszukiwanie" onClick={() => setLocalSearch("")} type="button"><X size={15} /></button>}</label><div><label><Funnel size={16} /><span className="tm-sr-only">Filtr lokalizacji</span><select onChange={(event) => setLocationFilter(event.target.value)} value={locationFilter}><option value="all">Wszystkie lokalizacje</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label><label><UserCircle size={16} /><span className="tm-sr-only">Filtr użytkownika</span><select onChange={(event) => setUserFilter(event.target.value)} value={userFilter}><option value="all">Cały zespół</option>{users.map((user) => <option key={user.id} value={user.id}>{userName(user)}</option>)}</select></label></div></div>}

        {!editingEnabled && <div className="tm-schedule-catalog-warning" role="status"><Info size={19} /><span><strong>Tryb podglądu.</strong> Twoja rola pozwala przeglądać Grafik bez wprowadzania zmian.</span></div>}
        {(!locations.length || !users.length) && <div className="tm-schedule-catalog-warning" role="status"><WarningCircle size={19} /><span><strong>Niepełny katalog</strong> {!locations.length && !users.length ? "Brakuje obiektów i pracowników." : !locations.length ? "Brakuje obiektów." : "Brakuje pracowników."} Grafik nie uzupełnia tych danych przykładami.</span></div>}

        {display.showProblems && (conflicts.length > 0 || pendingRequests > 0) && <div className="tm-schedule-alert"><WarningCircle size={19} weight="fill" /><span><strong>{conflicts.length} {conflicts.length === 1 ? "problem" : "problemy"} w grafiku</strong> · {summary.openSlots} wolnych miejsc{requestsEnabled ? ` · ${pendingRequests} wnioski czekają` : ""}</span>{requestsEnabled && <button onClick={() => setOverlay("requests")} type="button">Sprawdź</button>}</div>}

        <div className={`tm-schedule-canvas ${display.compact ? "is-compact" : ""}`}>
          {viewMode === "week" && <WeekGrid conflicts={conflicts} days={days} display={display} dragEnabled={dragEnabled && editingEnabled} editingEnabled={editingEnabled} grouping={grouping} locations={locations} onCellClick={openNewShift} onSearch={setLocalSearch} onShiftAction={handleShiftAction} onShiftDrop={handleShiftDrop} onShiftOpen={setEditorShift} onValidateShiftDrop={validateShiftDrop} searchValue={localSearch} shifts={currentShifts} todayIso={todayIso} users={users} />}
          {viewMode === "day" && <DayAgenda conflicts={conflicts} day={selectedDay} editingEnabled={editingEnabled} locations={locations} onCellClick={openNewShift} onShiftAction={handleShiftAction} onShiftOpen={setEditorShift} shifts={visibleShifts} users={users} />}
          {viewMode === "month" && <MonthGrid locations={locations} monthDate={weekStart} onDayOpen={(day) => { setSelectedDay(day); setViewMode("day"); }} shifts={visibleShifts} todayIso={todayIso} />}
        </div>
      </div>

      {editingEnabled && <div className="tm-schedule-mobile-bar"><button disabled={!locations.length || mutationBusy} onClick={() => openNewShift(selectedDay)} type="button"><Plus size={19} /> Dodaj</button><button disabled={!changes.length || mutationBusy} onClick={() => setOverlay("publish")} type="button"><PaperPlaneTilt size={18} /> {deliveryDisabled ? "Zatwierdź" : "Opublikuj"}{changes.length ? ` (${changes.length})` : ""}</button></div>}

      {editorShift && <ShiftDrawer busy={mutationBusy} deliveryDisabled={deliveryDisabled} initialShift={editorShift} locations={locations} onClose={() => setEditorShift(null)} onDelete={deleteShift} onSave={saveShift} templates={templates} templatesEnabled={templatesEnabled} todayIso={todayIso} users={users} />}
      {overlay === "publish" && <PublishDialog busy={mutationBusy} deliveryDisabled={deliveryDisabled} onClose={() => setOverlay(null)} onPublish={publishSchedule} periodLabel={rangeLabel(weekStart)} shifts={changes} users={users} />}
      {requestsEnabled && overlay === "requests" && <RequestsDialog onClose={() => setOverlay(null)} onResolve={resolveRequest} requests={requests} users={users} />}
      {settingsEnabled && overlay === "settings" && <SettingsDialog deliveryDisabled={deliveryDisabled} onClose={() => setOverlay(null)} onSave={(settings) => { setOverlay(null); emit("onSettingsSave", { settings }); onNotify("Ustawienia grafiku zostały zapisane."); }} />}
    </section>
  );
}

export default ScheduleContent;
