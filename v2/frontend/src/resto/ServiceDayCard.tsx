import { useState } from "react";
import type { RestaurantMember, RestaurantService, RestaurantShift } from "../types";
import { assignMember, deleteShift, editService, removeAssignment, updateShift } from "../api";
import { serviceDefinition } from "./ServiceEditor";
import type { ServiceDefinition } from "../types";

const POSITION_LABELS: Record<string, string> = {
  serveur: "Serveur",
  chef_de_rang: "Chef de rang",
  barman: "Bar",
  sommelier: "Sommelier",
  hote_accueil: "Accueil",
  chef_cuisine: "Chef",
  cuisinier: "Cuisinier",
  plongeur: "Plonge",
  manager: "Responsable",
  autre: "Autre",
};

const STATUS_LABEL: Record<string, string> = { confirmed: "✓", declined: "✗", proposed: "?" };
const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-500 line-through",
  proposed: "bg-amber-50 text-amber-700",
};

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
}

export default function ServiceDayCard({
  service,
  members,
  manager,
  token,
  slug,
  onEdit,
  onDuplicate,
  onDelete,
  onReload,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tasksOpen, setTasksOpen] = useState(false);
  const [assigningShift, setAssigningShift] = useState<number | null>(null);

  const totalPostes = service.shifts.reduce((n, s) => n + s.positions_needed, 0);
  const assignedPostes = service.shifts.reduce((n, s) => n + s.assigned_count, 0);
  const tasksDone = service.tasks.filter((t) => t.done).length;
  const allPublished = service.shifts.length > 0 && service.shifts.every((s) => s.status === "published");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onReload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(key: string, done: boolean) {
    await run(() => editService(slug, service.id, { task_key: key, done }, token));
  }

  async function assign(shiftId: number, memberId: number) {
    setAssigningShift(null);
    await run(() => assignMember(slug, shiftId, memberId, token));
  }

  async function unassign(shiftId: number, assignmentId: number) {
    await run(() => removeAssignment(slug, shiftId, assignmentId, token));
  }

  async function publishShift(shift: RestaurantShift) {
    await run(() => updateShift(slug, shift.id, { status: "published" }, token));
  }

  async function removeShift(shiftId: number) {
    if (!confirm("Supprimer ce poste ?")) return;
    await run(() => deleteShift(slug, shiftId, token));
  }

  const postesColor =
    totalPostes === 0
      ? "text-eb-muted"
      : assignedPostes === totalPostes
        ? "text-green-600 font-medium"
        : "text-amber-600 font-medium";

  return (
    <div className={`bg-white border rounded-xl overflow-hidden text-sm ${busy ? "opacity-70" : ""}`}>
      {error && <p role="alert" className="px-3 pt-2 text-xs text-red-600">{error}</p>}

      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-eb-text truncate">{service.title}</h3>
            <p className="text-xs text-eb-secondary">
              {service.start_time.slice(0, 5)} – {service.end_time.slice(0, 5)}
            </p>
          </div>
          {manager && (
            <div className="flex gap-1 shrink-0">
              <button
                title="Modifier"
                onClick={onEdit}
                className="p-1 rounded hover:bg-eb-page text-eb-secondary hover:text-eb-text transition-colors text-base leading-none"
              >
                ✏
              </button>
              <button
                title="Dupliquer"
                onClick={() => onDuplicate(serviceDefinition(service))}
                className="p-1 rounded hover:bg-eb-page text-eb-secondary hover:text-eb-text transition-colors text-base leading-none"
              >
                ⧉
              </button>
              <button
                title="Supprimer"
                onClick={onDelete}
                className="p-1 rounded hover:bg-red-50 text-eb-secondary hover:text-red-500 transition-colors text-base leading-none"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="mt-2 flex gap-3 text-xs">
          <span className={postesColor}>
            {assignedPostes}/{totalPostes} postes
          </span>
          {!allPublished && service.shifts.length > 0 && (
            <span className="text-amber-600">brouillon</span>
          )}
          {service.tasks.length > 0 && (
            <button
              onClick={() => setTasksOpen((o) => !o)}
              className="text-eb-secondary hover:text-eb-text underline"
            >
              {tasksDone}/{service.tasks.length} tâches
            </button>
          )}
        </div>
      </div>

      {/* Tasks (collapsible) */}
      {tasksOpen && service.tasks.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1">
          {service.tasks.map((t) => (
            <label key={t.key} className="flex gap-2 items-center text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={t.done}
                disabled={busy}
                onChange={(e) => void toggleTask(t.key, e.target.checked)}
              />
              <span className={t.done ? "line-through text-eb-muted" : ""}>{t.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Shifts */}
      {service.shifts.length > 0 && (
        <div className="border-t divide-y divide-eb-layout">
          {service.shifts.map((shift) => {
            const active = shift.assignments.filter((a) => a.status !== "declined");
            const freeSlots = Math.max(0, shift.positions_needed - active.length);
            const unassigned = members.filter(
              (m) => m.is_active && !active.some((a) => a.member_id === m.id),
            );
            const isAssigning = assigningShift === shift.id;

            return (
              <div key={shift.id} className="px-3 py-2 space-y-1.5">
                {/* Shift header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-medium text-eb-text truncate">
                      {POSITION_LABELS[shift.position] ?? shift.position}
                    </span>
                    <span className="text-[10px] text-eb-muted">
                      {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                    </span>
                  </div>
                  {manager && (
                    <div className="flex gap-1 shrink-0">
                      {shift.status === "draft" && (
                        <button
                          disabled={busy}
                          onClick={() => void publishShift(shift)}
                          className="text-[10px] bg-green-500 text-white rounded px-1.5 py-0.5 hover:bg-green-600"
                        >
                          Publier
                        </button>
                      )}
                      <button
                        disabled={busy}
                        onClick={() => void removeShift(shift.id)}
                        className="text-[10px] text-eb-muted hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Assignment chips */}
                <div className="flex flex-wrap gap-1">
                  {active.map((a) => (
                    <span
                      key={a.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLOR[a.status] ?? "bg-eb-page text-eb-text"}`}
                    >
                      {a.member_name}
                      <span title={a.status}>{STATUS_LABEL[a.status]}</span>
                      {manager && (
                        <button
                          onClick={() => void unassign(shift.id, a.id)}
                          className="opacity-50 hover:opacity-100 ml-0.5 leading-none"
                          title="Retirer"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}

                  {/* Free slots */}
                  {Array.from({ length: freeSlots }).map((_, i) => (
                    manager ? (
                      <button
                        key={i}
                        onClick={() => setAssigningShift(isAssigning ? null : shift.id)}
                        className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-eb-secondary hover:border-eb-primary hover:text-eb-primary transition-colors"
                      >
                        + Assigner
                      </button>
                    ) : (
                      <span key={i} className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-eb-muted">
                        Libre
                      </span>
                    )
                  ))}
                </div>

                {/* Assign dropdown */}
                {isAssigning && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {unassigned.length === 0 ? (
                      <span className="text-[11px] text-eb-muted">Aucun membre disponible</span>
                    ) : (
                      unassigned.map((m) => {
                        const candidate = shift.candidates?.find((c) => c.member_id === m.id);
                        const blocked = (candidate?.reasons.length ?? 0) > 0;
                        return (
                          <button
                            key={m.id}
                            disabled={busy || blocked}
                            title={candidate?.reasons.join(", ")}
                            onClick={() => void assign(shift.id, m.id)}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] border transition-colors ${
                              blocked
                                ? "opacity-40 cursor-not-allowed border-eb-layout text-eb-muted"
                                : candidate?.status === "available"
                                  ? "border-green-400 text-green-700 hover:bg-green-50"
                                  : candidate?.status === "maybe"
                                    ? "border-amber-400 text-amber-700 hover:bg-amber-50"
                                    : "border-eb-layout text-eb-secondary hover:bg-eb-page"
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })
                    )}
                    <button
                      onClick={() => setAssigningShift(null)}
                      className="text-[11px] text-eb-muted hover:text-eb-text"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No shifts */}
      {service.shifts.length === 0 && (
        <p className="border-t px-3 py-2 text-xs text-eb-muted">
          Aucun poste — modifier le service pour en ajouter.
        </p>
      )}
    </div>
  );
}
