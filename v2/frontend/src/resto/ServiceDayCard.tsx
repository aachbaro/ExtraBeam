import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { RestaurantMember, RestaurantService, ServiceDefinition, ServiceSlot, ServiceTask } from "../types";
import { assignMember, deleteShift, editService, removeAssignment } from "../api";
import { serviceDefinition } from "./ServiceEditor";
import TimePicker from "../components/TimePicker";

const TASK_PHASES: { value: ServiceTask["phase"]; label: string }[] = [
  { value: "opening", label: "Avant" },
  { value: "during",  label: "Pendant" },
  { value: "closing", label: "Après" },
];

const POSITIONS = [
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

const POSITION_LABELS: Record<string, string> = {
  serveur:      "Serveur",
  chef_de_rang: "Chef de rang",
  barman:       "Bar",
  sommelier:    "Sommelier",
  hote_accueil: "Accueil",
  chef_cuisine: "Chef de cuisine",
  cuisinier:    "Cuisinier",
  plongeur:     "Plonge",
  manager:      "Responsable",
  autre:        "Autre",
};

function fmtTime(t: string) {
  const [h, m] = t.slice(0, 5).split(":");
  return m === "00" ? `${h}h` : `${h}h${m}`;
}

interface Props {
  service: RestaurantService;
  members: RestaurantMember[];
  manager: boolean;
  token: string;
  slug: string;
  onEdit: () => void;
  onDuplicate: (prefill: ServiceDefinition) => void;
  onDelete: () => void;
  onReload: () => void;
  onCopy?: () => void;
  isNew?: boolean;
  hideTasks?: boolean;
}

export default function ServiceDayCard({
  service, members, manager, token, slug, onEdit, onDuplicate, onDelete, onReload, onCopy, isNew, hideTasks,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(service.title);
  const [editStart, setEditStart] = useState(service.start_time.slice(0, 5));
  const [editEnd, setEditEnd] = useState(service.end_time.slice(0, 5));
  const [assigningSlot, setAssigningSlot] = useState<{ shiftId: number; slotIdx: number } | null>(null);
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [notesEditOpen, setNotesEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropActive(false);
    const raw = e.dataTransfer.getData("application/x-eb-item");
    if (!raw) return;
    const payload = JSON.parse(raw) as {
      type: "task" | "note" | "shift";
      sourceServiceId: number;
      sourceDef: ServiceDefinition;
      task?: ServiceTask;
      note?: string;
      noteIndex?: number;
      shift?: { id: number; position: string; title: string; start_time: string; end_time: string; break_minutes: number; required_skills: string[] };
    };
    const destDef = serviceDefinition(service);
    setBusy(true);
    setError("");
    try {
      if (payload.type === "task" && payload.task) {
        const alreadyHere = destDef.tasks.some((t) => t.key === payload.task!.key);
        if (payload.sourceServiceId !== service.id) {
          await editService(slug, payload.sourceServiceId, {
            definition: { ...payload.sourceDef, tasks: payload.sourceDef.tasks.filter((t) => t.key !== payload.task!.key) },
          }, token);
        }
        if (!alreadyHere) {
          await editService(slug, service.id, {
            definition: { ...destDef, tasks: [...destDef.tasks, { ...payload.task, done: false }] },
          }, token);
        }
      } else if (payload.type === "note" && payload.note !== undefined) {
        const srcNotes = (payload.sourceDef.notes || "").split("\n").filter(Boolean);
        const dstNotes = (destDef.notes || "").split("\n").filter(Boolean);
        if (payload.sourceServiceId !== service.id) {
          await editService(slug, payload.sourceServiceId, {
            definition: { ...payload.sourceDef, notes: srcNotes.filter((_, i) => i !== payload.noteIndex).join("\n") },
          }, token);
        }
        if (!dstNotes.includes(payload.note)) {
          await editService(slug, service.id, {
            definition: { ...destDef, notes: [...dstNotes, payload.note].join("\n") },
          }, token);
        }
      }
      } else if (payload.type === "shift" && payload.shift) {
        const newSlot: ServiceSlot = {
          key: crypto.randomUUID(),
          title: payload.shift.title,
          position: payload.shift.position,
          positions_needed: 1,
          start_time: payload.shift.start_time,
          end_time: payload.shift.end_time,
          break_minutes: payload.shift.break_minutes,
          required_skills: payload.shift.required_skills,
        };
        // Supprimer du service source
        if (payload.sourceServiceId !== service.id) {
          await deleteShift(slug, payload.shift.id, token);
        }
        // Ajouter au service destination
        await editService(slug, service.id, {
          definition: { ...destDef, slots: [...destDef.slots, newSlot] },
        }, token);
      }
      onReload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await fn(); onReload(); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function saveInlineEdit() {
    setBusy(true);
    setError("");
    try {
      const def = serviceDefinition(service);
      // Reclamper kitchen_end_time dans [editStart, editEnd] pour éviter l'erreur de validation
      let kitchenEnd = def.kitchen_end_time;
      if (kitchenEnd < editStart) kitchenEnd = editStart;
      if (kitchenEnd > editEnd)   kitchenEnd = editEnd;
      await editService(slug, service.id, {
        definition: { ...def, title: editTitle.trim() || service.title, start_time: editStart, end_time: editEnd, kitchen_end_time: kitchenEnd },
      }, token);
      setEditMode(false);
      onReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function assign(shiftId: number, memberId: number) {
    setAssigningSlot(null);
    await run(() => assignMember(slug, shiftId, memberId, token));
  }

  async function unassign(shiftId: number, assignmentId: number) {
    await run(() => removeAssignment(slug, shiftId, assignmentId, token));
  }

  async function removeShiftSlot(shiftId: number) {
    if (!confirm("Supprimer ce poste ?")) return;
    await run(() => deleteShift(slug, shiftId, token));
  }

  async function toggleTask(key: string, done: boolean) {
    await run(() => editService(slug, service.id, { task_key: key, done }, token));
  }

  // Group shifts by position, preserving first-seen order
  const positionOrder: string[] = [];
  const groups: Record<string, typeof service.shifts> = {};
  for (const shift of service.shifts) {
    if (!groups[shift.position]) {
      positionOrder.push(shift.position);
      groups[shift.position] = [];
    }
    groups[shift.position].push(shift);
  }

  const totalPostes = service.shifts.reduce((n, s) => n + s.positions_needed, 0);
  const assignedPostes = service.shifts.reduce((n, s) => n + s.assigned_count, 0);

  return (
    <div
      className={`bg-white border rounded-xl text-sm overflow-hidden ${busy ? "opacity-70 pointer-events-none" : ""}`}
      style={isNew ? { animation: "cardEnter 0.25s ease-out both" } : undefined}
    >
      {error && <p role="alert" className="px-3 pt-2 text-xs text-red-600">{error}</p>}

      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        {editMode ? (
          <div className="space-y-2" style={{ animation: "menuEnter 0.15s ease-out both" }}>
            <input
              autoFocus
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full font-semibold text-eb-text bg-transparent border-b border-eb-primary/40 focus:outline-none focus:border-eb-primary pb-0.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <TimePicker value={editStart} onChange={setEditStart} className="flex-1 text-xs rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text focus:border-eb-primary" />
              <span className="text-eb-muted text-xs shrink-0">–</span>
              <TimePicker value={editEnd} onChange={setEditEnd} className="flex-1 text-xs rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text focus:border-eb-primary" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditMode(false)}
                className="flex-1 py-1 text-xs text-eb-secondary border border-eb-layout rounded hover:bg-eb-page transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveInlineEdit()}
                className="flex-1 py-1 text-xs font-medium bg-eb-primary text-white rounded hover:opacity-90 disabled:opacity-60"
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-eb-text truncate">{service.title}</h3>
              <p className="text-xs text-eb-secondary mt-0.5">
                {fmtTime(service.start_time)} – {fmtTime(service.end_time)}
                {totalPostes > 0 && (
                  <span className={`ml-2 font-medium ${assignedPostes === totalPostes ? "text-green-600" : "text-amber-600"}`}>
                    {assignedPostes}/{totalPostes}
                  </span>
                )}
              </p>
            </div>
            {manager && (
              <div ref={menuRef} className="relative shrink-0">
                <button
                  title="Actions"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={`p-1.5 rounded-lg transition-colors text-eb-secondary hover:bg-eb-page hover:text-eb-text ${menuOpen ? "bg-eb-page text-eb-text" : ""}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 z-50 bg-white border border-eb-layout rounded-xl shadow-xl py-1 min-w-[190px] overflow-hidden"
                    style={{ animation: "menuEnter 0.15s ease-out both" }}
                  >
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                      label="Renommer / horaires"
                      onClick={() => { setEditTitle(service.title); setEditStart(service.start_time.slice(0, 5)); setEditEnd(service.end_time.slice(0, 5)); setEditMode(true); setMenuOpen(false); }}
                    />
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                      label="Ajouter un shift"
                      onClick={() => { setAddShiftOpen(true); setMenuOpen(false); }}
                    />
                    <div className="h-px bg-eb-layout mx-2 my-1" />
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
                      label="Édition complète"
                      onClick={() => { onEdit(); setMenuOpen(false); }}
                    />
                    <div className="h-px bg-eb-layout mx-2 my-1" />
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
                      label="Copier"
                      shortcut="Ctrl+C"
                      onClick={() => { onCopy?.(); setMenuOpen(false); }}
                    />
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="13" height="13" rx="2"/><rect x="3" y="3" width="13" height="13" rx="2"/></svg>}
                      label="Dupliquer"
                      onClick={() => { onDuplicate(serviceDefinition(service)); setMenuOpen(false); }}
                    />
                    <div className="h-px bg-eb-layout mx-2 my-1" />
                    <MenuItem
                      icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>}
                      label="Supprimer"
                      danger
                      onClick={() => { onDelete(); setMenuOpen(false); }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Positions groupées */}
      {positionOrder.length > 0 && (
        <div
          className={`border-t divide-y divide-eb-layout/50 rounded-b-xl transition-colors ${dropActive ? "bg-blue-50/40" : ""}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-eb-item")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropActive(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false); }}
          onDrop={(e) => void handleDrop(e)}
        >
          {positionOrder.map((position) => (
            <div key={position} className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-eb-muted mb-1.5">
                {POSITION_LABELS[position] ?? position}
              </p>
              {groups[position].map((shift) => {
                const active = shift.assignments.filter((a) => a.status !== "declined");
                const freeSlots = Math.max(0, shift.positions_needed - active.length);
                const timeRange = `${fmtTime(shift.start_time)} – ${fmtTime(shift.end_time)}`;
                const unassigned = members.filter(
                  (m) => m.is_active && !active.some((a) => a.member_id === m.id),
                );

                return (
                  <div
                    key={shift.id}
                    className="space-y-0.5 group/shift group/item"
                    draggable={manager}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("application/x-eb-item", JSON.stringify({
                        type: "shift",
                        sourceServiceId: service.id,
                        sourceDef: serviceDefinition(service),
                        shift: {
                          id: shift.id,
                          position: shift.position,
                          title: shift.title,
                          start_time: shift.start_time.slice(0, 5),
                          end_time: shift.end_time.slice(0, 5),
                          break_minutes: shift.break_minutes,
                          required_skills: shift.required_skills,
                        },
                      }));
                    }}
                  >
                    {/* Ligne créneau + poignée drag + bouton supprimer shift */}
                    <div className="flex items-center gap-1 justify-between">
                      <div className="flex items-center gap-1">
                        {manager && <DragHandle />}
                        <span className="text-[10px] text-eb-muted">{timeRange}</span>
                      </div>
                      {manager && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeShiftSlot(shift.id)}
                          title="Supprimer ce shift"
                          className="opacity-0 group-hover/shift:opacity-100 text-eb-muted hover:text-red-500 transition-opacity p-0.5"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Personnes assignées */}
                    {active.map((a) => (
                      <div key={a.id} className="group/person flex items-center justify-between py-0.5 pl-2">
                        <span
                          className={`text-[12px] ${a.status === "proposed" ? "text-amber-600" : "text-eb-text"}`}
                          title={a.status === "proposed" ? "Affectation proposée — en attente de confirmation" : undefined}
                        >
                          {a.member_name}
                          {a.status === "proposed" && (
                            <span className="ml-1 text-[10px] font-medium text-amber-500 opacity-70">?</span>
                          )}
                          {!manager && <span className="text-eb-muted ml-2 text-[11px]">{timeRange}</span>}
                        </span>
                        {manager && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void unassign(shift.id, a.id)}
                            className="opacity-0 group-hover/person:opacity-100 text-[11px] text-eb-muted hover:text-red-500 transition-opacity ml-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Slots libres */}
                    {Array.from({ length: freeSlots }).map((_, i) => {
                      const isThisAssigning = assigningSlot?.shiftId === shift.id && assigningSlot.slotIdx === i;

                      if (isThisAssigning) {
                        return (
                          <div key={`slot-${i}`} className="flex items-center gap-2 py-0.5">
                            <select
                              autoFocus
                              className="flex-1 text-[12px] rounded border border-eb-layout px-2 py-1 bg-white focus:outline-none focus:border-eb-primary"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) void assign(shift.id, Number(e.target.value));
                              }}
                            >
                              <option value="">Choisir…</option>
                              {unassigned.map((m) => {
                                const candidate = shift.candidates?.find((c) => c.member_id === m.id);
                                const blocked = (candidate?.reasons.length ?? 0) > 0;
                                return (
                                  <option key={m.id} value={m.id} disabled={blocked}>
                                    {m.name}{blocked ? " ✗" : candidate?.status === "available" ? " ✓" : ""}
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              type="button"
                              onClick={() => setAssigningSlot(null)}
                              className="text-[11px] text-eb-muted hover:text-eb-text shrink-0"
                            >
                              Annuler
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div key={`slot-${i}`} className="py-0.5">
                          {manager ? (
                            <button
                              type="button"
                              onClick={() => setAssigningSlot({ shiftId: shift.id, slotIdx: i })}
                              className="text-[12px] text-eb-secondary hover:text-eb-primary transition-colors flex items-center gap-1 group/slot"
                            >
                              <span className="text-eb-muted font-medium">+</span>
                              <span className="border-b border-dashed border-eb-layout group-hover/slot:border-eb-primary transition-colors">
                                Assigner
                              </span>
                            </button>
                          ) : (
                            <span className="text-[12px] text-eb-muted italic">Poste libre</span>
                          )}
                        </div>
                      );
                    })}

                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Aucun poste */}
      {positionOrder.length === 0 && (
        <p className="border-t px-3 py-2 text-xs text-eb-muted">
          Aucun shift — utilisez "Ajouter un shift" ci-dessous.
        </p>
      )}

      {/* Ajouter un shift */}
      {manager && (
        <div className="border-t px-3 py-2">
          <button
            type="button"
            onClick={() => setAddShiftOpen(true)}
            className="text-[12px] text-eb-secondary hover:text-eb-primary transition-colors flex items-center gap-1"
          >
            <span className="font-medium text-base leading-none">+</span>
            <span>Ajouter un shift</span>
          </button>
        </div>
      )}

      {/* Mini-panel ajout de shift */}
      {addShiftOpen && (
        <AddShiftPanel
          service={service}
          slug={slug}
          token={token}
          onSaved={() => { setAddShiftOpen(false); onReload(); }}
          onClose={() => setAddShiftOpen(false)}
        />
      )}

      {/* Bouton Notes & tâches */}
      {!hideTasks && (
        <div className="border-t px-3 py-2">
          <button
            type="button"
            onClick={() => setTasksExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-[11px] text-eb-secondary hover:text-eb-text transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>Notes & tâches</span>
              {service.tasks.length > 0 && (
                <span className="text-[10px] text-eb-muted">{service.tasks.filter((t) => t.done).length}/{service.tasks.length}</span>
              )}
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${tasksExpanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {/* Wrapper animé hauteur : grid-template-rows 0fr → 1fr */}
          <div
            style={{
              display: "grid",
              gridTemplateRows: tasksExpanded ? "1fr" : "0fr",
              transition: "grid-template-rows 0.22s ease",
            }}
          >
            <div style={{ overflow: "hidden" }}>
              <div
                className={`pt-2 pb-1 space-y-2 rounded-lg transition-colors ${dropActive ? "bg-blue-50/60 ring-1 ring-eb-primary/30" : ""}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropActive(true); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false); }}
                onDrop={(e) => void handleDrop(e)}
              >
                {/* Tâches groupées par phase */}
                {TASK_PHASES.map(({ value: phase, label: phaseLabel }) => {
                  const group = service.tasks.filter((t) => t.phase === phase);
                  if (!group.length) return null;
                  return (
                    <div key={phase}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-eb-muted mb-1">{phaseLabel}</p>
                      <div className="space-y-1">
                        {group.map((t) => (
                          <div
                            key={t.key}
                            className="group/item flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("application/x-eb-item", JSON.stringify({
                                type: "task", sourceServiceId: service.id,
                                sourceDef: serviceDefinition(service), task: t,
                              }));
                            }}
                          >
                            <DragHandle />
                            <input
                              type="checkbox"
                              checked={t.done}
                              disabled={busy}
                              onChange={(e) => void toggleTask(t.key, e.target.checked)}
                              className="h-3.5 w-3.5 accent-eb-primary rounded shrink-0"
                            />
                            <span className={`text-[12px] flex-1 ${t.done ? "line-through text-eb-muted" : "text-eb-text"}`}>{t.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Notes individuelles */}
                {service.notes && (() => {
                  const lines = service.notes.split("\n").filter(Boolean);
                  if (!lines.length) return null;
                  return (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-eb-muted mb-1">Notes</p>
                      {lines.map((note, i) => (
                        <div
                          key={i}
                          className="group/item flex items-center gap-1.5 cursor-grab active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("application/x-eb-item", JSON.stringify({
                              type: "note", sourceServiceId: service.id,
                              sourceDef: serviceDefinition(service), note, noteIndex: i,
                            }));
                          }}
                        >
                          <DragHandle />
                          <span className="text-[12px] text-eb-secondary flex-1">{note}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Aucun contenu */}
                {service.tasks.length === 0 && !service.notes && (
                  <p className="text-[11px] text-eb-muted italic">{dropActive ? "Déposer ici…" : "Aucune tâche ni note."}</p>
                )}

                {/* Modifier (manager) */}
                {manager && (
                  <button
                    type="button"
                    onClick={() => setNotesEditOpen(true)}
                    className="text-[11px] text-eb-secondary hover:text-eb-primary transition-colors flex items-center gap-1 pt-1"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Modifier
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel édition Notes & tâches */}
      {notesEditOpen && (
        <NotesTasksPanel
          service={service}
          slug={slug}
          token={token}
          manager={manager}
          onToggleTask={(key, done) => void toggleTask(key, done)}
          onSaved={() => { setNotesEditOpen(false); onReload(); }}
          onClose={() => setNotesEditOpen(false)}
        />
      )}
    </div>
  );
}

function AddShiftPanel({
  service, slug, token, onSaved, onClose,
}: {
  service: RestaurantService;
  slug: string;
  token: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [position, setPosition] = useState("serveur");
  const [startTime, setStartTime] = useState(service.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(service.end_time.slice(0, 5));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const def = serviceDefinition(service);
      const newSlot: ServiceSlot = {
        key: crypto.randomUUID(),
        title: POSITION_LABELS[position] ?? position,
        position,
        positions_needed: 1,
        start_time: startTime,
        end_time: endTime,
        break_minutes: 0,
        required_skills: [],
      };
      await editService(slug, service.id, {
        definition: { ...def, slots: [...def.slots, newSlot] },
      }, token);
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-4 w-full max-w-xs space-y-3 shadow-xl"
        style={{ animation: "cardEnter 0.2s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-sm text-eb-text">Ajouter un shift</h3>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div>
            <label className="block text-[11px] text-eb-muted mb-1">Poste</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full text-sm rounded border border-eb-layout px-2 py-1.5 bg-white focus:outline-none focus:border-eb-primary"
            >
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] text-eb-muted mb-1">Début</label>
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                className="w-full text-sm rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-eb-muted mb-1">Fin</label>
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                className="w-full text-sm rounded border border-eb-layout px-2 py-1.5 flex items-center gap-0.5 bg-white text-eb-text"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 text-xs text-eb-secondary border border-eb-layout rounded-lg hover:bg-eb-page transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-1.5 text-xs font-medium bg-eb-primary text-white rounded-lg hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DragHandle() {
  return (
    <svg
      width="10" height="14" viewBox="0 0 10 14" fill="currentColor"
      className="shrink-0 text-eb-muted/30 group-hover/item:text-eb-muted transition-colors cursor-grab active:cursor-grabbing"
    >
      <circle cx="3" cy="2.5" r="1.5"/><circle cx="7" cy="2.5" r="1.5"/>
      <circle cx="3" cy="7"   r="1.5"/><circle cx="7" cy="7"   r="1.5"/>
      <circle cx="3" cy="11.5" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/>
    </svg>
  );
}

function MenuItem({
  icon, label, shortcut, danger, onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left ${danger ? "text-red-500 hover:bg-red-50" : "text-eb-text hover:bg-eb-page"}`}
    >
      <span className={`shrink-0 ${danger ? "text-red-400" : "text-eb-muted"}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[10px] text-eb-muted font-mono ml-2">{shortcut}</span>}
    </button>
  );
}

function NotesTasksPanel({
  service, slug, token, manager, onToggleTask, onSaved, onClose,
}: {
  service: RestaurantService;
  slug: string;
  token: string;
  manager: boolean;
  onToggleTask: (key: string, done: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [notesList, setNotesList] = useState<string[]>(
    (service.notes || "").split("\n").filter(Boolean)
  );
  const [tasks, setTasks] = useState<ServiceTask[]>(service.tasks ?? []);
  const [newNote, setNewNote] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newPhase, setNewPhase] = useState<ServiceTask["phase"]>("during");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function addNote() {
    const text = newNote.trim();
    if (!text) return;
    setNotesList((prev) => [...prev, text]);
    setNewNote("");
  }

  function removeNote(i: number) {
    setNotesList((prev) => prev.filter((_, j) => j !== i));
  }

  function addTask() {
    const label = newTask.trim();
    if (!label) return;
    setTasks((prev) => [...prev, { key: `task_${Date.now()}`, label, phase: newPhase, done: false }]);
    setNewTask("");
  }

  function removeTask(key: string) {
    setTasks((prev) => prev.filter((t) => t.key !== key));
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const { serviceDefinition } = await import("./ServiceEditor");
      const def = serviceDefinition(service);
      await editService(slug, service.id, {
        definition: { ...def, notes: notesList.join("\n"), tasks },
      }, token);
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-4 w-full max-w-sm space-y-4 shadow-xl"
        style={{ animation: "cardEnter 0.2s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-sm text-eb-text">Notes & tâches</h3>
        {err && <p className="text-xs text-red-500">{err}</p>}

        {/* Notes individuelles */}
        <div>
          <p className="text-[11px] text-eb-muted mb-1.5">Notes</p>
          {notesList.length > 0 && (
            <div className="space-y-1 mb-2">
              {notesList.map((note, i) => (
                <div key={i} className="group/n flex items-center gap-2">
                  <DragHandle />
                  <span className="flex-1 text-[12px] text-eb-secondary">{note}</span>
                  {manager && (
                    <button
                      type="button"
                      onClick={() => removeNote(i)}
                      className="opacity-0 group-hover/n:opacity-100 text-[11px] text-eb-muted hover:text-red-500 transition-opacity"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {manager && (
            <div className="flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNote(); } }}
                placeholder="Nouvelle note…"
                className="flex-1 text-[12px] rounded border border-eb-layout px-2 py-1.5 bg-white focus:outline-none focus:border-eb-primary"
              />
              <button type="button" onClick={addNote} className="text-[11px] px-2.5 py-1.5 bg-eb-primary text-white rounded-lg hover:opacity-90">+</button>
            </div>
          )}
        </div>

        {/* Tâches groupées par phase */}
        <div>
          <p className="text-[11px] text-eb-muted mb-1.5">Tâches</p>
          {tasks.length > 0 && (
            <div className="space-y-2 mb-2">
              {TASK_PHASES.map(({ value: phase, label: phaseLabel }) => {
                const group = tasks.filter((t) => t.phase === phase);
                if (!group.length) return null;
                return (
                  <div key={phase}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-eb-muted mb-1">{phaseLabel}</p>
                    <div className="space-y-1">
                      {group.map((t) => (
                        <div key={t.key} className="group/t flex items-center gap-2">
                          <DragHandle />
                          <input
                            type="checkbox"
                            checked={t.done}
                            onChange={(e) => {
                              onToggleTask(t.key, e.target.checked);
                              setTasks((prev) => prev.map((x) => x.key === t.key ? { ...x, done: e.target.checked } : x));
                            }}
                            className="h-3.5 w-3.5 accent-eb-primary rounded shrink-0"
                          />
                          <span className={`flex-1 text-[12px] ${t.done ? "line-through text-eb-muted" : "text-eb-text"}`}>{t.label}</span>
                          {manager && (
                            <button
                              type="button"
                              onClick={() => removeTask(t.key)}
                              className="opacity-0 group-hover/t:opacity-100 text-[11px] text-eb-muted hover:text-red-500 transition-opacity"
                            >×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {manager && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {TASK_PHASES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setNewPhase(value)}
                    className={`flex-1 py-1 text-[11px] rounded border transition-colors ${newPhase === value ? "bg-eb-primary text-white border-eb-primary" : "border-eb-layout text-eb-secondary hover:border-eb-primary hover:text-eb-primary"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                  placeholder="Nouvelle tâche…"
                  className="flex-1 text-[12px] rounded border border-eb-layout px-2 py-1.5 bg-white focus:outline-none focus:border-eb-primary"
                />
                <button type="button" onClick={addTask} className="text-[11px] px-2.5 py-1.5 bg-eb-primary text-white rounded-lg hover:opacity-90">+</button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-1.5 text-xs text-eb-secondary border border-eb-layout rounded-lg hover:bg-eb-page transition-colors"
          >Fermer</button>
          {manager && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="flex-1 py-1.5 text-xs font-medium bg-eb-primary text-white rounded-lg hover:opacity-90 disabled:opacity-60"
            >{saving ? "Enregistrement…" : "Enregistrer"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
