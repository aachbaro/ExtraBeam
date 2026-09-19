import { useEffect, useRef, useState } from "react";
import ContactPickerPanel from "../components/contacts/ContactPickerPanel";
import type {
  Restaurant,
  RestaurantMember,
  RestaurantService,
  ServiceDefinition,
  ServiceTemplate,
} from "../types";
import {
  fetchServices,
  fetchServiceTemplates,
  prepareServices,
  fetchMembers,
  editService,
  deleteService,
  deleteServiceTemplate,
  generateRestaurantPlanning,
  fetchRestaurantHours,
  updateShift,
  createService,
  type MonthlyMemberHours,
} from "../api";
import WeekTimeGrid, { type TimeRange } from "../components/agenda/WeekTimeGrid";
import HoursGauge from "../components/HoursGauge";
import ServiceEditor, { serviceDefinition } from "./ServiceEditor";
import ServiceDayCard from "./ServiceDayCard";
import WeeklyTemplateBoard from "./WeeklyTemplateBoard";
import { UndoContext, useUndoStack } from "./UndoContext";
function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function ServicePlanner({
  restaurant,
  members,
  token,
  onMembersChanged,
}: {
  restaurant: Restaurant;
  members: RestaurantMember[];
  token: string;
  onMembersChanged: (members: RestaurantMember[]) => void;
}) {
  const slug = restaurant.slug,
    manager = !!restaurant.is_manager;
  const { contextValue: undoContextValue, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useUndoStack();
  const [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [services, setServices] = useState<RestaurantService[]>([]),
    [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selected, setSelected] = useState<number | null>(null),
    [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<{
    initial?: TimeRange;
    service?: RestaurantService;
    template?: ServiceTemplate;
    prefill?: ServiceDefinition;
    templateMode?: boolean;
    initialWeekday?: number;
  } | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"weeks" | "month" | "cycle">("weeks");
  const [weeks, setWeeks] = useState(1),
    [month, setMonth] = useState(""),
    [hours, setHours] = useState<MonthlyMemberHours[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"services" | "modeles">("services");
  const [view, setView] = useState<"planning" | "agenda">("planning");
  const monday = new Date();
  const cycleDay = restaurant.planning_rules?.cycle_start_day ?? 1;
  const endDate = new Date();
  if (period !== "weeks") {
    monday.setDate(1); monday.setMonth(monday.getMonth() + offset);
    if (period === "cycle") monday.setDate(Math.min(cycleDay, new Date(monday.getFullYear(), monday.getMonth()+1, 0).getDate()));
    endDate.setFullYear(monday.getFullYear(), monday.getMonth()+1, 1);
    if (period === "cycle") endDate.setDate(Math.min(cycleDay, new Date(endDate.getFullYear(), endDate.getMonth()+1, 0).getDate()));
    endDate.setDate(endDate.getDate()-1);
  } else monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const length = period !== "weeks" ? Math.round((Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())-Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()))/86400000)+1 : weeks * 7;
  const days = Array.from({ length }, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return localDay(d);
  });
  const calendarDays: (string | null)[] = period !== "weeks"
    ? [...Array((monday.getDay() + 6) % 7).fill(null), ...days]
    : days;
  while (calendarDays.length % 7) calendarDays.push(null);
  const from = days[0],
    to = days[days.length - 1],
    viewMonth = month || from.slice(0, 7);
  const [deleting, setDeleting] = useState<RestaurantService | null>(null);
  const [deleteScope, setDeleteScope] = useState<"this" | "future">("this");
  const [animatingIds, setAnimatingIds] = useState<Set<number>>(new Set());
  const knownIdsRef = useRef<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiedDef, setCopiedDef] = useState<ServiceDefinition | null>(null);
  const [copiedTitle, setCopiedTitle] = useState<string>("");
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const active = services.find((s) => s.id === selected);
  const reload = () => setRefresh((n) => n + 1);

  async function pasteToDay(targetDay: string) {
    if (!copiedDef || !manager) return;
    setBusy(true);
    try {
      const def: ServiceDefinition = {
        ...copiedDef,
        tasks: copiedDef.tasks.map((t) => ({ ...t, done: false })),
      };
      await createService(slug, { date: targetDay, definition: def }, token);
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "services" || editor || busy) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const sel = services.find((s) => s.id === selectedId);
        if (sel) {
          setCopiedDef(serviceDefinition(sel));
          setCopiedTitle(sel.title);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (copiedDef && focusedDay) void pasteToDay(focusedDay);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        void undo();
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === "z") || e.key === "y")) {
        e.preventDefault();
        void redo();
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedIds(new Set());
        setFocusedDay(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, copiedDef, focusedDay, services, mode, editor, busy, undo, redo]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      prepareServices(slug, from, to, token).then(() =>
        fetchServices(slug, from, to, token),
      ),
      manager ? fetchServiceTemplates(slug, token) : Promise.resolve([]),
    ])
      .then(([s, t]) => {
        if (alive) {
          if (knownIdsRef.current.size > 0) {
            const newIds = s.filter((svc) => !knownIdsRef.current.has(svc.id)).map((svc) => svc.id);
            if (newIds.length > 0) {
              setAnimatingIds(new Set(newIds));
              setTimeout(() => setAnimatingIds(new Set()), 900);
            }
          }
          knownIdsRef.current = new Set(s.map((svc) => svc.id));
          setServices(s);
          setTemplates(t);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, token, from, to, refresh, manager]);
  useEffect(() => {
    let alive = true;
    fetchRestaurantHours(slug, viewMonth, token, period !== "weeks" ? { from, to } : undefined)
      .then((r) => {
        if (alive) setHours(r);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [slug, token, viewMonth, refresh, period, from, to]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function publishAllDrafts() {
    const draftShifts = services.flatMap((s) => s.shifts.filter((sh) => sh.status === "draft"));
    if (!draftShifts.length) return;
    await action(async () => {
      await Promise.all(draftShifts.map((sh) => updateShift(slug, sh.id, { status: "published" }, token)));
      setNotice(`${draftShifts.length} poste(s) publiés.`);
    });
  }
  async function quickCreate(date: string, definition: ServiceDefinition = { title: "Service", start_time: "12:00", kitchen_end_time: "14:30", end_time: "15:30", notes: "", tasks: [], slots: [] }) {
    if (busy) return;
    await action(() => createService(slug, { date, definition: { ...definition, tasks: definition.tasks.map(t => ({ ...t, done: false })) } }, token));
  }
  async function generate() {
    await action(async () => {
      const result = await generateRestaurantPlanning(
        slug,
        from,
        to,
        token,
      );
      const missing = result.warnings.reduce((sum, w) => sum + w.missing, 0);
      setNotice(
        missing
          ? `${missing} poste(s) restent à pourvoir. Ouvrez les services pour voir les contraintes.`
          : "Proposition générée. Les affectations manuelles ont été conservées.",
      );
    });
  }
  return (
    <UndoContext.Provider value={undoContextValue}>
    <div className="space-y-5">
      {/* Mode toggle */}
      {manager && (
        <div className="inline-flex rounded-lg border border-eb-layout bg-eb-page p-1 gap-1">
          {(["services", "modeles"] as const).map((m) => (
            <button
              key={m}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${mode === m ? "bg-white shadow-sm text-eb-text" : "text-eb-secondary hover:text-eb-text"}`}
              onClick={() => { setMode(m); setSelected(null); setNotice(""); }}
            >
              {m === "services" ? "Planning" : "Semaine type"}
            </button>
          ))}
        </div>
      )}

      {/* ── MODE SERVICES ── */}
      {mode === "services" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 items-center">
              <button className="border rounded p-2" onClick={() => { setOffset((n) => n - 1); setSelected(null); }}>←</button>
              <span className="text-sm">{from} → {to}</span>
              <button className="border rounded p-2" onClick={() => { setOffset((n) => n + 1); setSelected(null); }}>→</button>
              {offset !== 0 && (
                <button onClick={() => setOffset(0)} className="text-sm underline">Aujourd’hui</button>
              )}
              <div className="flex gap-1 ml-1">
                <button
                  disabled={!canUndo || busy}
                  onClick={() => void undo()}
                  title={undoLabel ? `Annuler : ${undoLabel} (Ctrl+Z)` : "Annuler (Ctrl+Z)"}
                  className="border rounded p-1.5 disabled:opacity-30 hover:bg-eb-page transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6"/><path d="M3 13C5.2 8 9.6 5 14 5c4.4 0 8 3.6 8 8s-3.6 8-8 8c-2 0-3.9-.7-5.3-2"/>
                  </svg>
                </button>
                <button
                  disabled={!canRedo || busy}
                  onClick={() => void redo()}
                  title={redoLabel ? `Rétablir : ${redoLabel} (Ctrl+Shift+Z)` : "Rétablir (Ctrl+Shift+Z)"}
                  className="border rounded p-1.5 disabled:opacity-30 hover:bg-eb-page transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6"/><path d="M21 13c-2.2-5-6.6-8-11-8-4.4 0-8 3.6-8 8s3.6 8 8 8c2 0 3.9-.7 5.3-2"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                <select aria-label="Période du planning" className="border rounded p-2" value={period !== "weeks" ? period : String(weeks)} onChange={(e) => { setOffset(0); setSelected(null); setFocusedDay(null); setMonth(""); if (e.target.value === "month" || e.target.value === "cycle") setPeriod(e.target.value); else { setPeriod("weeks"); setWeeks(Number(e.target.value)); } }}>
                  <option value="month">Mois entier</option>
                  <option value="cycle">Cycle mensuel (à partir du {cycleDay})</option>
                  <option value={1}>1 semaine</option>
                  <option value={2}>2 semaines</option>
                  <option value={4}>4 semaines</option>
                  <option value={5}>5 semaines</option>
                </select>
              </label>
              <label className="text-sm">
                <select className="border rounded p-2" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">Toute l’équipe</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              {/* View toggle */}
              <div className="inline-flex rounded border border-eb-layout overflow-hidden">
                {(["planning", "agenda"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-sm transition-colors ${view === v ? "bg-eb-primary text-white" : "bg-white text-eb-secondary hover:bg-eb-page"}`}
                  >
                    {v === "planning" ? "Planning" : "Agenda"}
                  </button>
                ))}
              </div>
              {manager && (
                <>
                  <button className="border rounded px-3 py-2 text-sm" disabled={busy} onClick={() => void generate()}>
                    Générer les affectations
                  </button>
                  {services.some((s) => s.shifts.some((sh) => sh.status === "draft")) && (
                    <button
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm"
                      disabled={busy}
                      onClick={() => void publishAllDrafts()}
                    >
                      Publier la période
                    </button>
                  )}
                  <div className="relative" ref={pickerRef}>
                    <button
                      className="border border-eb-layout rounded-lg px-3 py-2 text-sm text-eb-secondary hover:text-eb-text transition-colors"
                      onClick={() => setShowPicker((v) => !v)}
                    >
                      Réserver un extra
                    </button>
                    {showPicker && (
                      <div className="absolute right-0 top-full mt-2 z-20">
                        <ContactPickerPanel
                          token={token}
                          currentWeekStart={from}
                          onClose={() => setShowPicker(false)}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    className="bg-eb-primary text-white px-4 py-2 rounded-lg text-sm"
                    onClick={() => void quickCreate(focusedDay || from)}
                  >
                    + Nouveau service
                  </button>
                </>
              )}
            </div>
          </div>

          {error && <p role="alert" className="text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm">{notice}</p>}

          {/* ── Contenu (avec overlay de chargement) ── */}
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 z-20 flex items-start justify-center pt-12 bg-white/60 rounded-xl">
                <svg className="animate-spin h-6 w-6 text-eb-primary" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              </div>
            )}

          {/* ── Vue Agenda (WeekTimeGrid) ── */}
          {view === "agenda" && Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIndex) => (
            <WeekTimeGrid
              key={weekIndex}
              days={days.slice(weekIndex * 7, weekIndex * 7 + 7)}
              editable={manager && !busy}
              events={services
                .filter((s) => !filter || s.shifts.some((p) => p.assignments.some((a) => a.member_id === Number(filter) && a.status !== "declined")))
                .map((s) => ({
                  id: s.id,
                  date: s.date,
                  start: s.start_time,
                  end: s.end_time,
                  label: s.title,
                  detail: `${s.shifts.reduce((n, p) => n + p.assigned_count, 0)}/${s.shifts.reduce((n, p) => n + p.positions_needed, 0)} postes · ${s.tasks.filter((t) => t.done).length}/${s.tasks.length} tâches`,
                  draft: s.shifts.some((p) => p.status === "draft") || !s.shifts.length,
                }))}
              onSelect={(initial) => setEditor({ initial })}
              onOpen={setSelected}
            />
          ))}

          {/* Active service detail (agenda view) */}
          {view === "agenda" && active && (
            <section className="bg-white rounded-xl border p-4 space-y-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{active.title} · {active.date}</h2>
                  <p className="text-sm text-eb-secondary">
                    Clients : {active.start_time} · Cuisine jusqu'à {active.kitchen_end_time} · Rangement jusqu'à {active.end_time}
                  </p>
                  {active.template_id && (
                    <p className="text-xs text-eb-muted">
                      Modèle hebdomadaire{active.customized ? " · Ajustements sur cette date" : ""}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 text-sm flex-wrap">
                  {manager && (
                    <>
                      <button onClick={() => setEditor({ service: active })} className="underline">Modifier</button>
                      <button onClick={() => setEditor({ prefill: serviceDefinition(active) })} className="underline">Dupliquer</button>
                      <button disabled={busy} className="text-red-700" onClick={() => { setDeleting(active); setDeleteScope("this"); }}>Supprimer</button>
                    </>
                  )}
                  <button onClick={() => setSelected(null)}>Fermer</button>
                </div>
              </div>
              {active.notes && (
                <p className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm whitespace-pre-wrap">{active.notes}</p>
              )}
              {active.tasks.length > 0 && (
                <div className="grid sm:grid-cols-3 gap-4">
                  {(["opening", "during", "closing"] as const).map((phase, i) => (
                    <section key={phase}>
                      <h3 className="text-sm font-medium mb-2">{["Début de service", "Pendant le service", "Fin de service"][i]}</h3>
                      {active.tasks.filter((t) => t.phase === phase).map((t) => (
                        <label key={t.key} className="flex gap-2 items-start text-sm py-1">
                          <input className="mt-1" type="checkbox" disabled={busy} checked={t.done}
                            onChange={(e) => void action(() => editService(slug, active.id, { task_key: t.key, done: e.target.checked }, token))} />
                          <span className={t.done ? "line-through text-eb-secondary" : ""}>{t.label}</span>
                        </label>
                      ))}
                    </section>
                  ))}
                </div>
              )}
              <div>
                <h3 className="font-medium mb-3">Postes et affectations</h3>
                {!active.shifts.length ? (
                  <p className="text-sm text-eb-secondary">Aucun poste défini. Modifiez ce service pour ajouter les rôles nécessaires.</p>
                ) : (
                  <ServiceDayCard
                    service={active}
                    members={members}
                    manager={manager}
                    token={token}
                    slug={slug}
                    hideTasks
                    onEdit={() => setEditor({ service: active })}
                    onDuplicate={(prefill) => void quickCreate(active.date, prefill)}
                    onDelete={() => { setDeleting(active); setDeleteScope("this"); }}
                    onReload={reload}
                  />
                )}
              </div>
            </section>
          )}

          {/* ── Vue Planning (colonnes par jour) ── */}
          {view === "planning" && (() => {
            const renderCol = (day: string) => {
              const dayServices = services.filter(
                (s) =>
                  s.date === day &&
                  (!filter ||
                    s.shifts.some((p) =>
                      p.assignments.some(
                        (a) => a.member_id === Number(filter) && a.status !== "declined",
                      ),
                    )),
              );
              const jsDay = new Date(day + "T12:00:00").getDay();
              const dayLabel = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][jsDay];
              const isToday = day === localDay(new Date());
              const isDragTarget = dragOverDay === day;
              const isFocused = focusedDay === day && copiedDef;
              return (
                <div
                  key={day}
                  className={`flex-1 min-w-[200px] space-y-2 rounded-xl transition-all ${isDragTarget ? "ring-2 ring-eb-primary/50 bg-blue-50/50" : ""} ${isFocused ? "ring-2 ring-green-400/50" : ""}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-service-card]")) return;
                    setFocusedDay(day);
                    setSelectedId(null);
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-eb-item")) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDragOverDay(day);
                  }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDay(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverDay(null);
                    if (e.dataTransfer.types.includes("application/x-eb-item")) return;
                    const raw = e.dataTransfer.getData("application/x-eb-service");
                    if (!raw) return;
                    const payload = JSON.parse(raw) as { day: string; def: ServiceDefinition; title: string };
                    if (payload.day === day) return;
                    if (!manager) return;
                    setBusy(true);
                    const dropDef: ServiceDefinition = { ...payload.def, tasks: payload.def.tasks.map((t) => ({ ...t, done: false })) };
                    createService(slug, { date: day, definition: dropDef }, token)
                      .then(reload)
                      .catch((err) => setError(String(err)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {/* Day header */}
                  <div
                    className={`rounded-lg py-2 text-center text-sm cursor-pointer ${
                      isToday
                        ? "bg-eb-primary text-white"
                        : isFocused
                        ? "bg-green-50 border border-green-300 text-green-700"
                        : "bg-white border text-eb-secondary"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (copiedDef) {
                        setFocusedDay(day);
                        void pasteToDay(day);
                      } else {
                        setFocusedDay(day);
                        setSelectedId(null);
                      }
                    }}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide">{dayLabel}</p>
                    <p className={`font-semibold ${isToday ? "" : isFocused ? "" : "text-eb-text"}`}>{day.slice(8)}</p>
                  </div>

                  {/* Services */}
                  {dayServices.map((service) => (
                    <div
                      key={service.id}
                      data-service-card
                      draggable={manager}
                      className={`transition-all ${selectedId === service.id ? "ring-2 ring-eb-primary rounded-xl" : selectedIds.has(service.id) ? "ring-2 ring-violet-400 rounded-xl" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(service.id)) next.delete(service.id);
                            else next.add(service.id);
                            return next;
                          });
                          setSelectedId(null);
                        } else {
                          setSelectedId(service.id);
                          setSelectedIds(new Set());
                          setFocusedDay(null);
                        }
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        const def = serviceDefinition(service);
                        e.dataTransfer.setData("application/x-eb-service", JSON.stringify({ day: service.date, def, title: service.title }));
                        setCopiedDef(def);
                        setCopiedTitle(service.title);
                        setSelectedId(service.id);
                      }}
                    >
                      <ServiceDayCard
                        service={service}
                        members={members}
                        manager={manager}
                        token={token}
                        slug={slug}
                        onEdit={() => setEditor({ service })}
                        onDuplicate={(prefill) => void quickCreate(service.date, prefill)}
                        onDelete={() => { setDeleting(service); setDeleteScope("this"); }}
                        onReload={reload}
                        onCopy={() => { setCopiedDef(serviceDefinition(service)); setCopiedTitle(service.title); setSelectedId(service.id); }}
                        isNew={animatingIds.has(service.id)}
                      />
                    </div>
                  ))}

                  {/* Empty day */}
                  {dayServices.length === 0 && !manager && (
                    <div className="rounded-lg border border-dashed py-6 text-center text-xs text-eb-muted">
                      Aucun service
                    </div>
                  )}

                  {/* Add service */}
                  {manager && (
                    <button
                      className="w-full rounded-lg border border-dashed py-2 text-xs text-eb-secondary hover:border-eb-primary hover:text-eb-primary transition-colors"
                      onClick={() => void quickCreate(day)}
                    >
                      + Service
                    </button>
                  )}
                </div>
              );
            };

            return (
              <div className="overflow-x-auto -mx-1 px-1 pb-2">
                <div className="space-y-5">
                  {Array.from({ length: calendarDays.length / 7 }, (_, wi) => (
                    <div key={wi} className="flex gap-3" style={{ minWidth: `${7 * 210}px` }}>
                      {calendarDays.slice(wi * 7, wi * 7 + 7).map((day, i) => day ? renderCol(day) : <div key={`empty-${i}`} aria-hidden="true" className="flex-1 min-w-[200px]" />)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          </div>{/* fin overlay chargement */}

          <section className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <h2 className="font-medium">{period === "weeks" ? "Heures prévues dans le mois" : `Heures prévues du ${from} au ${to}`}</h2>
              {period === "weeks" && <input aria-label="Mois des heures" type="month" value={viewMonth} onChange={(e) => setMonth(e.target.value)} />}
            </div>
            <p className="text-xs text-eb-secondary">
              Foncé : publié · clair : brouillon. Calcul sur les horaires des postes, pauses déduites. Objectif : contrat hebdomadaire × jours de la période ÷ 7.
            </p>
            {hours.filter((r) => !filter || r.member_id === Number(filter)).map((r) => (
              <HoursGauge key={r.member_id} name={r.name} published={r.published_minutes} draft={r.draft_minutes} target={r.target_minutes} />
            ))}
          </section>
        </>
      )}

      {/* ── MODE MODÈLES ── */}
      {mode === "modeles" && manager && (
        <>
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <WeeklyTemplateBoard
            templates={templates}
            members={members}
            busy={busy || loading}
            slug={slug}
            token={token}
            onReload={reload}
            onDelete={(template) => {
              if (confirm(`Retirer « ${template.name} » de la semaine type ? Les services déjà créés seront conservés.`))
                void action(() => deleteServiceTemplate(slug, template.id, token));
            }}
          />
        </>
      )}
      {deleting && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Supprimer le service"
        >
          <div className="bg-white rounded-xl p-6 max-w-md space-y-4">
            <h2 className="font-semibold">
              Supprimer {deleting.title} du {deleting.date} ?
            </h2>
            <p className="text-sm">
              Les postes, affectations, réponses de disponibilité, notes et
              tâches des services supprimés seront retirés.
            </p>
            {deleting.template_id && (
              <label className="block text-sm">
                Portée de la suppression
                <select
                  className="w-full border rounded p-2 mt-2"
                  value={deleteScope}
                  onChange={(e) =>
                    setDeleteScope(e.target.value as typeof deleteScope)
                  }
                >
                  <option value="this">Cette date uniquement</option>
                  <option value="future">
                    Cette date et les suivantes : arrêter la récurrence
                  </option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="text-red-700 text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button disabled={busy} onClick={() => setDeleting(null)}>
                Annuler
              </button>
              <button
                className="bg-red-700 text-white rounded px-3 py-2"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await deleteService(slug, deleting.id, token, deleteScope);
                    setDeleting(null);
                    setSelected(null);
                  })
                }
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
      {editor && (
        <ServiceEditor
          slug={slug}
          token={token}
          {...editor}
          templates={templates}
          members={members}
          onSkillsChanged={() => {
            void fetchMembers(slug, token)
              .then(onMembersChanged)
              .catch((e) => setError(String(e)));
          }}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            reload();
            setNotice("Enregistré.");
          }}
        />
      )}

      {/* Barre d'actions multi-sélection */}
      {mode === "services" && selectedIds.size > 0 && manager && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-eb-panel text-white text-[12px] rounded-xl px-4 py-2.5 shadow-xl"
          style={{ animation: "cardEnter 0.2s ease-out both" }}
        >
          <span className="text-white/60">{selectedIds.size} service{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}</span>
          <div className="w-px h-4 bg-white/20" />
          <button
            disabled={busy}
            className="hover:text-white/80 transition-colors disabled:opacity-40"
            onClick={() => void action(async () => {
              const toMakeRecurring = services.filter((s) => selectedIds.has(s.id) && !s.template_id);
              for (const s of toMakeRecurring) {
                await editService(slug, s.id, { definition: serviceDefinition(s), recurring: true }, token);
              }
              setSelectedIds(new Set());
              setNotice(`${toMakeRecurring.length} service(s) rendus hebdomadaires.`);
            })}
          >
            Rendre hebdomadaires
          </button>
          <button
            className="text-white/50 hover:text-white ml-1"
            onClick={() => setSelectedIds(new Set())}
          >
            ×
          </button>
        </div>
      )}

      {/* Toast clipboard */}
      {mode === "services" && copiedDef && !(selectedIds.size > 0) && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-eb-panel text-white text-[12px] rounded-xl px-4 py-2.5 shadow-xl"
          style={{ animation: "cardEnter 0.2s ease-out both" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>«&nbsp;{copiedTitle}&nbsp;» copié — cliquer sur un jour ou Ctrl+V pour coller</span>
          <button onClick={() => { setCopiedDef(null); setSelectedId(null); }} className="text-white/50 hover:text-white ml-1">×</button>
        </div>
      )}
    </div>
    </UndoContext.Provider>
  );
}
