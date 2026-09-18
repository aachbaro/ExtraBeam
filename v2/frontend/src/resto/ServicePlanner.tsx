import { useEffect, useRef, useState, type FormEvent } from "react";
import ContactPickerPanel from "../components/contacts/ContactPickerPanel";
import TimePicker from "../components/TimePicker";
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
import ServiceEditor, { weekdays, serviceDefinition } from "./ServiceEditor";
import ServiceDayCard from "./ServiceDayCard";
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
  } | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(1),
    [month, setMonth] = useState(""),
    [hours, setHours] = useState<MonthlyMemberHours[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"services" | "modeles">("services");
  const [view, setView] = useState<"planning" | "agenda">("planning");
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return localDay(d);
  });
  const from = days[0],
    to = days[days.length - 1],
    viewMonth = month || from.slice(0, 7);
  const [deleting, setDeleting] = useState<RestaurantService | null>(null);
  const [deleteScope, setDeleteScope] = useState<"this" | "future">("this");
  const [pendingDay, setPendingDay] = useState<string | null>(null);
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
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedIds(new Set());
        setFocusedDay(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, copiedDef, focusedDay, services]);

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
    fetchRestaurantHours(slug, viewMonth, token)
      .then((r) => {
        if (alive) setHours(r);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [slug, token, viewMonth, refresh]);
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
  async function prepare() {
    await action(async () => {
      const end = new Date(to + "T12:00:00");
      end.setDate(end.getDate() + (weeks - 1) * 7);
      const result = await prepareServices(slug, from, localDay(end), token);
      setNotice(
        `${result.created} service(s) préparé(s). Les services hebdomadaires apparaissent automatiquement en consultant chaque semaine.`,
      );
    });
  }
  async function generate() {
    await action(async () => {
      const end = new Date(to + "T12:00:00");
      end.setDate(end.getDate() + (weeks - 1) * 7);
      const result = await generateRestaurantPlanning(
        slug,
        from,
        localDay(end),
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
              {m === "services" ? "Services" : "Modèles"}
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                <select className="border rounded p-2" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
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
                      Publier la semaine
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
                    onClick={() => setEditor({ initial: { date: from, start_time: "12:00", end_time: "15:30" } })}
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
          {view === "agenda" && (
            <WeekTimeGrid
              days={days}
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
          )}

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
                    onDuplicate={(prefill) => setEditor({ prefill })}
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
                    const sourceDay = e.dataTransfer.getData("application/x-eb-service");
                    if (sourceDay && sourceDay === day) return;
                    void pasteToDay(day);
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
                        e.dataTransfer.setData("application/x-eb-service", service.date);
                        setCopiedDef(serviceDefinition(service));
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
                        onDuplicate={(prefill) => setEditor({ prefill })}
                        onDelete={() => { setDeleting(service); setDeleteScope("this"); }}
                        onReload={reload}
                        onCopy={() => { setCopiedDef(serviceDefinition(service)); setCopiedTitle(service.title); setSelectedId(service.id); }}
                        isNew={animatingIds.has(service.id)}
                      />
                    </div>
                  ))}

                  {/* Nouvelle card inline */}
                  {pendingDay === day && (
                    <NewServiceInlineCard
                      day={day}
                      slug={slug}
                      token={token}
                      onSaved={() => { setPendingDay(null); reload(); }}
                      onCancel={() => setPendingDay(null)}
                    />
                  )}

                  {/* Empty day */}
                  {dayServices.length === 0 && pendingDay !== day && !manager && (
                    <div className="rounded-lg border border-dashed py-6 text-center text-xs text-eb-muted">
                      Aucun service
                    </div>
                  )}

                  {/* Add service */}
                  {manager && pendingDay !== day && (
                    <button
                      className="w-full rounded-lg border border-dashed py-2 text-xs text-eb-secondary hover:border-eb-primary hover:text-eb-primary transition-colors"
                      onClick={() => setPendingDay(day)}
                    >
                      + Service
                    </button>
                  )}
                </div>
              );
            };

            return (
              <div className="overflow-x-auto -mx-1 px-1 pb-2">
                {weeks > 1 ? (
                  <div className="space-y-5">
                    {Array.from({ length: weeks }, (_, wi) => {
                      const weekDays = days.slice(wi * 7, wi * 7 + 7);
                      return (
                        <div key={wi}>
                          <p className="text-xs font-medium text-eb-muted mb-2 px-0.5 uppercase tracking-wide">
                            Semaine du {weekDays[0]}
                          </p>
                          <div className="flex gap-3" style={{ minWidth: `${7 * 210}px` }}>
                            {weekDays.map(renderCol)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex gap-3" style={{ minWidth: `${7 * 210}px` }}>
                    {days.map(renderCol)}
                  </div>
                )}
              </div>
            );
          })()}

          </div>{/* fin overlay chargement */}

          <section className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <h2 className="font-medium">Heures prévues dans le mois</h2>
              <input aria-label="Mois des heures" type="month" value={viewMonth} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <p className="text-xs text-eb-secondary">
              Foncé : publié · clair : brouillon. Calcul sur les horaires des postes, pauses déduites. Objectif : contrat hebdomadaire × jours du mois ÷ 7.
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-eb-text">Modèles de service</h2>
              <p className="text-sm text-eb-secondary mt-0.5">
                Définissez les besoins habituels par jour de la semaine. Préparez ensuite les semaines à venir en un clic.
              </p>
            </div>
            <button
              className="bg-eb-primary text-white px-4 py-2 rounded-lg text-sm shrink-0"
              onClick={() => setEditor({ initial: { date: from, start_time: "12:00", end_time: "15:30" } })}
            >
              + Créer un modèle
            </button>
          </div>

          {error && <p role="alert" className="text-red-700">{error}</p>}
          {notice && <p role="status" className="text-sm">{notice}</p>}

          {templates.length === 0 ? (
            <div className="bg-white border rounded-xl p-10 text-center space-y-2">
              <p className="text-eb-secondary text-sm">Aucun modèle pour l’instant.</p>
              <p className="text-xs text-eb-muted">
                Cliquez sur "+ Créer un modèle", définissez les postes et tâches, puis cochez "Service hebdomadaire".
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="bg-white border rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-eb-primary uppercase tracking-wide">{weekdays[t.weekday]}</p>
                    <h3 className="font-semibold text-eb-text mt-0.5">{t.name}</h3>
                    <p className="text-sm text-eb-secondary">{t.definition.start_time} – {t.definition.end_time}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="bg-eb-page border rounded-full px-2.5 py-0.5 text-xs">
                      {t.definition.slots.reduce((n, s) => n + s.positions_needed, 0)} postes
                    </span>
                    <span className="bg-eb-page border rounded-full px-2.5 py-0.5 text-xs">
                      {t.definition.tasks.length} tâches
                    </span>
                  </div>
                  <div className="flex gap-3 text-sm border-t pt-2">
                    <button className="underline text-eb-primary" onClick={() => setEditor({ template: t })}>Modifier</button>
                    <button
                      disabled={busy}
                      className="text-red-600"
                      onClick={() => {
                        if (confirm("Supprimer ce modèle ? Les services déjà créés seront conservés."))
                          void action(() => deleteServiceTemplate(slug, t.id, token));
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border rounded-xl p-4 space-y-3">
            <h3 className="font-medium">Préparer les services</h3>
            <p className="text-sm text-eb-secondary">
              Génère les services datés à partir des modèles. Les services déjà créés ne sont pas dupliqués.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-sm">
                Période{" "}
                <select className="border rounded p-2" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n} semaine(s)</option>
                  ))}
                </select>
              </label>
              <button
                className="border rounded px-3 py-2 text-sm"
                disabled={busy || !templates.length}
                onClick={() => void prepare()}
              >
                Préparer depuis les modèles
              </button>
            </div>
          </div>
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
      {selectedIds.size > 0 && manager && (
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
              await Promise.all(
                services
                  .filter((s) => selectedIds.has(s.id) && !s.template_id)
                  .map((s) => editService(slug, s.id, { definition: serviceDefinition(s), recurring: true }, token))
              );
              setSelectedIds(new Set());
              setNotice(`${selectedIds.size} service(s) rendus hebdomadaires.`);
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
      {copiedDef && !(selectedIds.size > 0) && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-eb-panel text-white text-[12px] rounded-xl px-4 py-2.5 shadow-xl"
          style={{ animation: "cardEnter 0.2s ease-out both" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>«&nbsp;{copiedTitle}&nbsp;» copié — cliquer sur un jour ou Ctrl+V pour coller</span>
          <button onClick={() => { setCopiedDef(null); setSelectedId(null); }} className="text-white/50 hover:text-white ml-1">×</button>
        </div>
      )}
    </div>
  );
}

const NEW_POSITIONS = [
  { value: "serveur",       label: "Serveur·se" },
  { value: "chef_de_rang",  label: "Chef de rang" },
  { value: "barman",        label: "Barman / Barmaid" },
  { value: "sommelier",     label: "Sommelier·e" },
  { value: "hote_accueil",  label: "Hôte·sse d'accueil" },
  { value: "chef_cuisine",  label: "Chef de cuisine" },
  { value: "cuisinier",     label: "Cuisinier·e" },
  { value: "plongeur",      label: "Plongeur·se" },
  { value: "manager",       label: "Manager" },
  { value: "autre",         label: "Autre" },
];

interface DraftShift {
  id: string;
  position: string;
  start_time: string;
  end_time: string;
}

function NewServiceInlineCard({
  day, slug, token, onSaved, onCancel,
}: {
  day: string; slug: string; token: string; onSaved: () => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState("Service");
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("15:30");
  const [shifts, setShifts] = useState<DraftShift[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function addShift() {
    setShifts((prev) => [...prev, { id: crypto.randomUUID(), position: "serveur", start_time: startTime, end_time: endTime }]);
  }

  function updateShift(id: string, patch: Partial<DraftShift>) {
    setShifts((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function removeShift(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const slots = shifts.map((s) => ({
        key: s.id,
        title: NEW_POSITIONS.find((p) => p.value === s.position)?.label ?? s.position,
        position: s.position,
        positions_needed: 1,
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: 0,
        required_skills: [] as string[],
      }));
      await createService(slug, {
        date: day,
        definition: {
          title: title.trim() || "Service",
          start_time: startTime,
          kitchen_end_time: endTime,
          end_time: endTime,
          notes: "",
          tasks: [],
          slots,
        },
      }, token);
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <div
      className="bg-white border border-eb-primary/30 rounded-xl p-3 text-sm"
      style={{ animation: "cardEnter 0.2s ease-out both" }}
    >
      {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {/* Titre */}
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full font-semibold bg-transparent border-b border-eb-layout focus:outline-none focus:border-eb-primary pb-0.5 text-sm text-eb-text"
          placeholder="Nom du service"
        />

        {/* Horaires du service */}
        <div className="flex items-center gap-2">
          <TimePicker
            value={startTime}
            onChange={(v) => { setStartTime(v); setShifts((prev) => prev.map((s) => ({ ...s, start_time: v }))); }}
            className="flex-1 text-xs rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text"
          />
          <span className="text-eb-muted text-xs shrink-0">–</span>
          <TimePicker
            value={endTime}
            onChange={(v) => { setEndTime(v); setShifts((prev) => prev.map((s) => ({ ...s, end_time: v }))); }}
            className="flex-1 text-xs rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text"
          />
        </div>

        {/* Shifts définis */}
        {shifts.length > 0 && (
          <div className="space-y-2 border-t border-eb-layout pt-2">
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <select
                  value={s.position}
                  onChange={(e) => updateShift(s.id, { position: e.target.value })}
                  className="flex-1 text-xs rounded border border-eb-layout px-1.5 py-1 bg-white focus:outline-none focus:border-eb-primary min-w-0"
                >
                  {NEW_POSITIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <TimePicker
                  value={s.start_time}
                  onChange={(v) => updateShift(s.id, { start_time: v })}
                  className="w-16 text-[11px] rounded border border-eb-layout px-1 py-1 flex items-center gap-0 bg-white text-eb-text shrink-0"
                />
                <span className="text-eb-muted text-[10px] shrink-0">–</span>
                <TimePicker
                  value={s.end_time}
                  onChange={(v) => updateShift(s.id, { end_time: v })}
                  className="w-16 text-[11px] rounded border border-eb-layout px-1 py-1 flex items-center gap-0 bg-white text-eb-text shrink-0"
                />
                <button
                  type="button"
                  onClick={() => removeShift(s.id)}
                  className="text-eb-muted hover:text-red-500 text-sm shrink-0 leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ajouter un shift */}
        <button
          type="button"
          onClick={addShift}
          className="text-[12px] text-eb-secondary hover:text-eb-primary transition-colors flex items-center gap-1"
        >
          <span className="font-medium">+</span>
          <span>Ajouter un shift</span>
        </button>

        {/* Actions */}
        <div className="flex gap-2 border-t border-eb-layout pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-1.5 text-xs text-eb-secondary border border-eb-layout rounded-lg hover:bg-eb-page transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-1.5 text-xs font-medium bg-eb-primary text-white rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </form>
    </div>
  );
}
