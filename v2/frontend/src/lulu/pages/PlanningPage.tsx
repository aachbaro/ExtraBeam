import { useState } from "react";
import {
  type PageProps,
  type Board,
  type Shift,
  type Availability,
  type Action,
  type GenerationReport,
  addDays,
  dateLabel,
  days,
  hours,
  minutes,
  qualified,
  availabilityState,
  skillNames,
  states,
} from "../types";
import TimePicker from "../../components/TimePicker";
import { NavLink } from "react-router-dom";
import { Stat, Empty } from "../ui";
import MonthlyHoursGauges from "../MonthlyHoursGauges";

type AddCtx = { date: string; service: string; role: string };
type AssignCtx = { shift: Shift; posIdx: number };

const ROLES = [
  { key: "salle", label: "Salle" },
  { key: "plonge", label: "Plonge" },
  { key: "cuisine", label: "Cuisine" },
] as const;

export default function PlanningPage({ board, week, act }: PageProps) {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [genCount, setGenCount] = useState(4);
  const [addCtx, setAddCtx] = useState<AddCtx | null>(null);
  const [assignCtx, setAssignCtx] = useState<AssignCtx | null>(null);
  const [showReport, setShowReport] = useState(false);
  const manager = board.me.manager;
  const shifts = manager ? week.shifts : week.published?.shifts || [];
  const weeklyMinutes = new Map<number, number>();
  for (const shift of shifts) {
    for (const id of new Set(shift.assignments.map((a) => a.employeeId))) {
      weeklyMinutes.set(id, (weeklyMinutes.get(id) ?? 0) + minutes(shift));
    }
  }
  const displayed = employeeId !== null
    ? shifts.filter((s) =>
        s.assignments.some((a) => a.employeeId === employeeId),
      )
    : shifts;
  const slots = shifts.reduce((n, s) => n + s.count, 0);
  const assigned = shifts.reduce((n, s) => n + s.assignments.length, 0);
  const myMinutes = shifts.reduce(
    (n, s) =>
      n +
      (s.assignments.some((a) => a.employeeId === board.me.id)
        ? minutes(s)
        : 0),
    0,
  );
  const active = board.employees.filter(
    (e) =>
      e.active && (e.skills.includes("salle") || e.skills.includes("plonge")),
  );
  const confirmed = active.filter((e) => week.confirmation?.[e.id]).length;
  const issues = [
    ...board.issues.filter((i) => i.week === week.start),
    ...(week.generationWarnings || []),
  ];

  return (
    <>
      <div className="lulu-stats">
        <Stat
          label="LE PLANNING"
          value={
            manager
              ? week.status === "published"
                ? "Publié"
                : "Brouillon"
              : week.published
                ? "Publié"
                : "À venir"
          }
          detail={
            week.published
              ? `Dernière publication : ${new Date(week.published.at).toLocaleDateString("fr-FR")}`
              : "En préparation chez Jean-Sébastien"
          }
        />
        <Stat
          label={manager ? "POSTES COUVERTS" : "MES HEURES"}
          value={manager ? `${assigned} / ${slots}` : hours(myMinutes)}
          detail={
            manager
              ? `${Math.max(0, slots - assigned)} poste(s) à compléter`
              : "Pauses repas déjà déduites"
          }
        />
        <Stat
          label={manager ? "DISPONIBILITÉS CONFIRMÉES" : "MA SEMAINE"}
          value={
            manager
              ? `${confirmed} / ${active.length}`
              : week.mine.confirmed
                ? "Confirmée"
                : "À confirmer"
          }
          detail={manager ? "Salle et plonge" : "Dans Mes disponibilités"}
        />
      </div>

      <div className="lulu-panel">
        {manager && (
          <details className="lulu-confirmations">
            <summary>Qui a confirmé sa semaine ?</summary>
            <div>
              {active.map((e) => (
                <span
                  className={`lulu-status ${week.confirmation?.[e.id] ? "good" : ""}`}
                  key={e.id}
                >
                  {e.name} ·{" "}
                  {week.confirmation?.[e.id] ? "Confirmée" : "À confirmer"}
                </span>
              ))}
            </div>
          </details>
        )}

        <div className="lulu-panel-head">
          <div>
            <h2>
              Affectations par service{" "}
              {week.label && (
                <span className="lulu-tag">Semaine {week.label}</span>
              )}
            </h2>
            <p>
              {manager
                ? "Cliquez sur un poste pour l'affecter ou le supprimer."
                : "La version publiée par Jean-Sébastien."}
            </p>
          </div>
          <div className="lulu-planning-filter">
            <label>
              Afficher un employé
              <select
                value={employeeId ?? ""}
                onChange={(event) => setEmployeeId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">Toute l'équipe</option>
                {board.employees.filter((e) => e.active || shifts.some((s) => s.assignments.some((a) => a.employeeId === e.id)))
                  .map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <div className="lulu-toggle">
            <button
              className={employeeId === null ? "selected" : ""}
              onClick={() => setEmployeeId(null)}
            >
              Toute l'équipe
            </button>
            <button
              className={employeeId === board.me.id ? "selected" : ""}
              onClick={() => setEmployeeId(board.me.id)}
            >
              Mon planning
            </button>
            </div>
            {employeeId !== null && (
              <span role="status" className="lulu-helper">
                {displayed.length} service(s) · {hours(displayed.reduce((total, s) => total + minutes(s), 0))} · pauses déduites
              </span>
            )}
          </div>
        </div>

        {manager && (
          <div className="lulu-toolbar">
            <label>
              Proposer sur{" "}
              <select
                aria-label="Nombre de semaines à générer"
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} semaine{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              onClick={() =>
                act(
                  "generate",
                  { count: genCount },
                  "Proposition générée. Vérifiez les alertes avant publication.",
                )
              }
            >
              Générer une proposition
            </button>
            <button
              onClick={() =>
                act(
                  "remind",
                  {},
                  "Rappels envoyés aux employés concernés.",
                )
              }
            >
              Rappeler les disponibilités
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Vider toutes les affectations non verrouillées de cette semaine ?",
                  )
                )
                  act("clear", {}, "Planning vidé.");
              }}
            >
              Vider le brouillon
            </button>
            <button
              className="lulu-outline"
              onClick={() =>
                act("publish", {}, "Planning publié. L'équipe a été notifiée.")
              }
            >
              Publier cette semaine
            </button>
            {board.generationReports?.length > 0 && (
              <button onClick={() => setShowReport(true)}>
                Rapport de génération
              </button>
            )}
          </div>
        )}
        {manager && (
          <p className="lulu-helper padded">
            La génération remplace les affectations non verrouillées sur{" "}
            {genCount} semaine(s) à partir du {dateLabel(week.start)}.
          </p>
        )}

        {!manager && !week.published ? (
          <Empty
            title="Planning non publié"
            text="Vous recevrez une notification dès sa publication."
          />
        ) : (
          <div className="lulu-planning-scroll">
            <div className="lulu-planning-grid">
              {days.map((day, index) => {
                const date = addDays(week.start, index);
                return (
                  <div className="lulu-day" key={day}>
                    <div
                      className={`lulu-day-heading ${index > 4 ? "weekend" : ""}`}
                    >
                      <span>{day}</span>
                      <strong>{dateLabel(date, { day: "2-digit" })}</strong>
                    </div>
                    {(["midi", "soir"] as const).map((service) => (
                      <section className="lulu-service" key={service}>
                        <h3>{service === "midi" ? "MIDI" : "SOIR"}</h3>
                        {ROLES.map(({ key: role, label }) => {
                          const rShifts = displayed.filter(
                            (s) =>
                              s.date === date &&
                              s.service === service &&
                              s.role === role,
                          );
                          const isCuisine = role === "cuisine";
                          const hasPositions = rShifts.some((s) => s.count > 0);
                          return (
                            <div key={role} className="lulu-role-section">
                              <span className="lulu-role-label">{label}</span>
                              {rShifts.map((s) =>
                                Array.from(
                                  { length: s.count },
                                  (_, posIdx) => employeeId !== null && s.assignments[posIdx]?.employeeId !== employeeId ? null : (
                                    <PositionCard
                                      key={`${s.id}-${posIdx}`}
                                      shift={s}
                                      posIdx={posIdx}
                                      board={board}
                                      weeklyMinutes={weeklyMinutes}
                                      editable={!!manager && !isCuisine}
                                      onOpen={() =>
                                        setAssignCtx({ shift: s, posIdx })
                                      }
                                    />
                                  ),
                                ),
                              )}
                              {!hasPositions && (
                                <span className="lulu-no-service">—</span>
                              )}
                              {manager && !isCuisine && employeeId === null && (
                                <button
                                  className="lulu-add-slot-btn"
                                  onClick={() =>
                                    setAddCtx({ date, service, role })
                                  }
                                >
                                  + Ajouter un poste
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {manager && <MonthlyHoursGauges board={board} start={week.start} employeeId={employeeId} />}
      {manager && (
        <div className="lulu-bottom-grid">
          <div className="lulu-panel">
            <div className="lulu-panel-head">
              <h2>Points à vérifier</h2>
              <span className="lulu-tag">{issues.length} signalement(s)</span>
            </div>
            {issues.length ? (
              <div className="lulu-issues">
                {issues.map((issue, index) => (
                  <div key={index} className={`lulu-issue ${issue.severity}`}>
                    <span>{issue.severity === "error" ? "!" : "·"}</span>
                    <p>
                      <strong>
                        {dateLabel(issue.date, {
                          weekday: "short",
                          day: "numeric",
                        })}{" "}
                        · {issue.service}
                      </strong>
                      {issue.message}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="padded">Aucun conflit détecté sur cette semaine.</p>
            )}
          </div>
          <div className="lulu-panel">
            <div className="lulu-panel-head">
              <h2>Notifications récentes</h2>
            </div>
            <div className="padded">
              {board.notifications
                .slice(-3)
                .reverse()
                .map((n) => (
                  <p className="lulu-mini-news" key={n.id}>
                    {n.message}
                  </p>
                ))}
              {!board.notifications.length && (
                <p className="lulu-helper">
                  Les confirmations apparaîtront ici.
                </p>
              )}
              <NavLink className="lulu-text-link" to="/lulu/notifications">
                Ouvrir le fil →
              </NavLink>
            </div>
          </div>
        </div>
      )}

      {showReport && board.generationReports?.length > 0 && (
        <GenerationReportModal
          report={board.generationReports[0]}
          onClose={() => setShowReport(false)}
        />
      )}
      {addCtx && (
        <SlotAddDialog
          ctx={addCtx}
          weekShifts={week.shifts}
          act={act}
          onClose={() => setAddCtx(null)}
        />
      )}
      {assignCtx && (
        <PositionDialog
          ctx={assignCtx}
          board={board}
          weekShifts={week.shifts}
          weekAvailability={week.availability || {}}
          act={act}
          onClose={() => setAssignCtx(null)}
        />
      )}
    </>
  );
}

// One card per position (one person per card)
function PositionCard({
  shift: s,
  posIdx,
  board,
  weeklyMinutes,
  editable,
  onOpen,
}: {
  shift: Shift;
  posIdx: number;
  board: Board;
  weeklyMinutes: Map<number, number>;
  editable: boolean;
  onOpen: () => void;
}) {
  const a = s.assignments[posIdx];
  const emp = a
    ? board.employees.find((e) => e.id === a.employeeId)
    : undefined;
  const filled = !!a;

  return (
    <div
      className={`lulu-shift ${s.role} ${!filled ? "unfilled" : ""} ${editable ? "clickable" : ""}`}
      onClick={editable ? onOpen : undefined}
      onKeyDown={editable ? (e) => e.key === "Enter" && onOpen() : undefined}
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
    >
      <div className="lulu-shift-time">
        {s.start.replace(":", "h")} – {s.end.replace(":", "h")}
        {s.fixed && <span className="lulu-shift-fixed-tag"> · Fixe</span>}
      </div>
      {s.required.length > 0 && (
        <div className="lulu-requirements">
          {s.required.map((r) => skillNames[r]).join(" · ")}
        </div>
      )}
      {filled ? (
        <div className="lulu-assignee">
          <span
            tabIndex={0}
            className="lulu-employee-hours"
            aria-label={`${emp?.name ?? "Ancien membre"} : ${hours(weeklyMinutes.get(a.employeeId) ?? 0)} cette semaine, pauses déduites`}
          >
            {emp?.name ?? "Ancien membre"}
            <span className="lulu-hours-tooltip" aria-hidden="true">
              {hours(weeklyMinutes.get(a.employeeId) ?? 0)} cette semaine · pauses déduites
            </span>
          </span>
          {a.locked && <span title="Verrouillé">🔒</span>}
        </div>
      ) : (
        <div className="lulu-missing">Poste libre</div>
      )}
    </div>
  );
}

function SlotAddDialog({
  ctx,
  weekShifts,
  act,
  onClose,
}: {
  ctx: AddCtx;
  weekShifts: Shift[];
  act: Action;
  onClose: () => void;
}) {
  const jsDay = new Date(`${ctx.date}T12:00`).getDay();
  const isWeekend = [0, 6].includes(jsDay);
  const weekday = (jsDay + 6) % 7;
  const [start, setStart] = useState(
    ctx.service === "midi" ? "11:00" : "18:30",
  );
  const [end, setEnd] = useState(
    ctx.service === "midi"
      ? isWeekend
        ? "17:00"
        : "15:30"
      : isWeekend
        ? "00:00"
        : "23:00",
  );
  const [withKeys, setWithKeys] = useState(false);
  const [persist, setPersist] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    const newShift: Shift = {
      id: crypto.randomUUID(),
      date: ctx.date,
      service: ctx.service,
      role: ctx.role,
      start,
      end,
      count: 1,
      required: withKeys ? ["cles"] : [],
      assignments: [],
      fixed: false,
    };
    const existing = weekShifts.filter((s) => !s.fixed);
    const payload: Record<string, unknown> = { shifts: [...existing, newShift] };
    if (persist) { payload.persistWeekday = true; payload.weekday = weekday; }
    const ok = await act("shifts", payload, "Poste ajouté.");
    setSaving(false);
    if (ok) onClose();
  }

  const dayLabel = dateLabel(ctx.date, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="lulu-modal-backdrop" onClick={onClose}>
      <section
        className="lulu-modal lulu-assign-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slot-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lulu-panel-head">
          <div>
            <p className="lulu-eyebrow">
              NOUVEAU POSTE · {skillNames[ctx.role].toUpperCase()} ·{" "}
              {ctx.service === "midi" ? "MIDI" : "SOIR"}
            </p>
            <h2 id="slot-title">{dayLabel}</h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{ padding: "8px 12px", fontSize: 18, background: "none", border: 0 }}
          >
            ×
          </button>
        </div>
        <div className="padded">
          <div className="lulu-form-grid">
            <label>
              Début
              <TimePicker
                autoFocus
                className="lulu-time-input"
                value={start}
                onChange={setStart}
              />
            </label>
            <label>
              Fin estimée
              <TimePicker
                className="lulu-time-input"
                value={end}
                onChange={setEnd}
              />
            </label>
          </div>
          {ctx.role === "salle" && (
            <label className="lulu-check" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={withKeys}
                onChange={(e) => setWithKeys(e.target.checked)}
              />
              Nécessite les clés (ouverture / fermeture)
            </label>
          )}
          <label className="lulu-check" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
            />
            Retenir ce poste pour les prochains {days[weekday]}s
          </label>
        </div>
        <div className="lulu-save-bar">
          <button type="button" onClick={onClose}>
            Annuler
          </button>
          <button className="primary" disabled={saving} onClick={confirm}>
            {saving ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PositionDialog({
  ctx: { shift: s, posIdx },
  board,
  weekShifts,
  weekAvailability,
  act,
  onClose,
}: {
  ctx: AssignCtx;
  board: Board;
  weekShifts: Shift[];
  weekAvailability: Record<string, Availability>;
  act: Action;
  onClose: () => void;
}) {
  const currentA = s.assignments[posIdx];
  const [start, setStart] = useState(s.start);
  const [end, setEnd] = useState(s.end);
  const [withKeys, setWithKeys] = useState(
    s.required.some((r) => ["cles", "ouverture", "fermeture"].includes(r)),
  );
  const [empId, setEmpId] = useState<number | null>(
    currentA?.employeeId ?? null,
  );
  const [locked, setLocked] = useState(currentA?.locked ?? true);
  const [persistDelete, setPersistDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const weekday = (new Date(`${s.date}T12:00:00`).getDay() + 6) % 7;

  const origWithKeys = s.required.some((r) =>
    ["cles", "ouverture", "fermeture"].includes(r),
  );

  function getState(id: number): keyof typeof states {
    // Use a temporary shift with potentially updated times for dispo lookup
    const tmpShift = { ...s, start, end, required };
    const av = weekAvailability[String(id)];
    if (!av?.confirmed) return "unknown";
    return availabilityState(av, tmpShift);
  }

  const required = s.role === "salle" && withKeys ? ["cles"] : [];

  const candidates = board.employees.filter(
    (e) =>
      e.active &&
      qualified({ ...e }, { ...s, start, end, required }) &&
      (e.id === empId ||
        !s.assignments.some((a, i) => i !== posIdx && a.employeeId === e.id)),
  );

  async function save() {
    setSaving(true);

    const newAssignments = [...s.assignments];
    if (empId === null) {
      if (posIdx < newAssignments.length) newAssignments.splice(posIdx, 1);
    } else if (posIdx < newAssignments.length) {
      newAssignments[posIdx] = { employeeId: empId, locked };
    } else {
      newAssignments.push({ employeeId: empId, locked });
    }

    const payload: Record<string, unknown> = {
      shiftId: s.id,
      assignments: newAssignments,
    };
    if (start !== s.start) payload.start = start;
    if (end !== s.end) payload.end = end;
    if (s.role === "salle" && withKeys !== origWithKeys) {
      payload.required = withKeys ? ["cles"] : [];
    }

    const ok = await act("assign", payload, "Enregistré.");
    setSaving(false);
    if (ok) onClose();
  }

  async function deletePosition() {
    if (!window.confirm("Supprimer ce poste ?")) return;
    setSaving(true);
    let ok: boolean;
    const extra: Record<string, unknown> = persistDelete
      ? { persistWeekday: true, weekday }
      : {};
    if (s.count === 1) {
      const updated = weekShifts.filter((sh) => !sh.fixed && sh.id !== s.id);
      ok = await act("shifts", { shifts: updated, ...extra }, "Poste supprimé.");
    } else {
      const updated = weekShifts.filter((sh) => !sh.fixed).map((sh) => {
        if (sh.id !== s.id) return sh;
        const newA = sh.assignments.filter((_, i) => i !== posIdx);
        return { ...sh, count: sh.count - 1, assignments: newA };
      });
      ok = await act("shifts", { shifts: updated, ...extra }, "Poste supprimé.");
    }
    setSaving(false);
    if (ok) onClose();
  }

  const dayLabel = dateLabel(s.date, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const state = empId !== null ? getState(empId) : null;

  return (
    <div className="lulu-modal-backdrop" onClick={onClose}>
      <section
        className="lulu-modal lulu-assign-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lulu-panel-head">
          <div>
            <p className="lulu-eyebrow">
              {skillNames[s.role].toUpperCase()} ·{" "}
              {s.service === "midi" ? "MIDI" : "SOIR"}
            </p>
            <h2 id="pos-title">{dayLabel}</h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            style={{ padding: "8px 12px", fontSize: 18, background: "none", border: 0 }}
          >
            ×
          </button>
        </div>

        <div className="padded">
          <div className="lulu-form-grid" style={{ marginBottom: 20 }}>
            <label>
              Début
              <TimePicker
                autoFocus
                className="lulu-time-input"
                value={start}
                onChange={setStart}
              />
            </label>
            <label>
              Fin estimée
              <TimePicker
                className="lulu-time-input"
                value={end}
                onChange={setEnd}
              />
            </label>
          </div>

          {s.role === "salle" && (
            <label className="lulu-check" style={{ marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={withKeys}
                onChange={(e) => setWithKeys(e.target.checked)}
              />
              Nécessite les clés (ouverture / fermeture)
            </label>
          )}

          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 7 }}>
              Employé affecté
            </span>
            <select
              value={empId ?? ""}
              onChange={(e) => {
                setEmpId(e.target.value === "" ? null : Number(e.target.value));
                setLocked(true);
              }}
              style={{ width: "100%" }}
            >
              <option value="">— Poste libre —</option>
              {candidates.map((e) => {
                const st = getState(e.id);
                return (
                  <option key={e.id} value={e.id} disabled={st === "unavailable"}>
                    {e.name} · {states[st]}
                  </option>
                );
              })}
            </select>
          </label>

          {empId !== null && state !== null && (
            <p className="lulu-helper" style={{ marginBottom: 12 }}>
              Disponibilité :{" "}
              <span className={`lulu-dispos-state ${state}`}>{states[state]}</span>
            </p>
          )}

          {empId !== null && (
            <label className="lulu-check">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
              />
              Maintenir cette affectation lors de la génération
            </label>
          )}
        </div>

        <div style={{ padding: "0 20px 12px" }}>
          <label className="lulu-check" style={{ fontSize: 12, color: "#b96046" }}>
            <input
              type="checkbox"
              checked={persistDelete}
              onChange={(e) => setPersistDelete(e.target.checked)}
            />
            Supprimer aussi pour les prochains {days[weekday]}s
          </label>
        </div>

        <div className="lulu-save-bar">
          <button
            type="button"
            style={{ border: "1px solid #edcfbf", fontSize: 12, padding: "8px 14px", color: "#b96046", background: "none", borderRadius: 8 }}
            onClick={deletePosition}
            disabled={saving}
          >
            Supprimer ce poste
          </button>
          <div style={{ display: "flex", gap: 9 }}>
            <button type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="primary" disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function GenerationReportModal({ report, onClose }: { report: GenerationReport; onClose: () => void }) {
  const overHours = Object.entries(report.hoursSummary)
    .flatMap(([name, { contractH, weeks }]) =>
      Object.entries(weeks)
        .filter(([, h]) => h > contractH)
        .map(([week, h]) => ({ name, contractH, assignedH: h, week, over: Math.round((h - contractH) * 10) / 10 }))
    )
    .sort((a, b) => b.over - a.over);

  function download() {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  }

  return (
    <div className="lulu-modal-backdrop" onClick={onClose}>
      <section
        className="lulu-modal lulu-assign-modal"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 620, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lulu-panel-head" style={{ flexShrink: 0 }}>
          <div>
            <p className="lulu-eyebrow">RAPPORT DE GÉNÉRATION</p>
            <h2>{new Date(report.at).toLocaleString("fr-FR")} · {report.weeks.length} semaine(s)</h2>
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose}
            style={{ padding: "8px 12px", fontSize: 18, background: "none", border: 0 }}>×</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "0 20px 20px" }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#8a9b80", textTransform: "uppercase", margin: "16px 0 8px" }}>
            Heures par employé
          </h3>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#999", fontSize: 11 }}>
                <th style={{ textAlign: "left", paddingBottom: 4 }}>Employé</th>
                <th style={{ textAlign: "right", paddingBottom: 4 }}>Contrat</th>
                {report.weeks.map(w => (
                  <th key={w} style={{ textAlign: "right", paddingBottom: 4 }}>
                    {new Date(`${w}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.hoursSummary).sort((a, b) => a[0].localeCompare(b[0])).map(([name, { contractH, weeks }]) => (
                <tr key={name} style={{ borderTop: "1px solid #edf0e7" }}>
                  <td style={{ padding: "5px 0" }}>{name}</td>
                  <td style={{ textAlign: "right", color: "#888" }}>{contractH}h</td>
                  {report.weeks.map(w => {
                    const h = weeks[w] ?? 0;
                    const over = h > contractH;
                    return (
                      <td key={w} style={{ textAlign: "right", fontWeight: over ? 600 : 400, color: over ? "#b96046" : "inherit" }}>
                        {h ? `${h}h` : "—"}
                        {over && ` (+${Math.round((h - contractH) * 10) / 10}h)`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {overHours.length > 0 && (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#b96046", textTransform: "uppercase", margin: "20px 0 8px" }}>
                Dépassements de contrat
              </h3>
              {overHours.map((o, i) => (
                <p key={i} style={{ fontSize: 13, margin: "3px 0" }}>
                  <strong>{o.name}</strong> : {o.assignedH}h assignées vs {o.contractH}h contractuelles
                  (sem. {new Date(`${o.week}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })})
                  {" — "}<span style={{ color: "#b96046" }}>+{o.over}h</span>
                </p>
              ))}
            </>
          )}

          {report.decisions.filter(d => !d.assigned).length > 0 && (
            <>
              <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#888", textTransform: "uppercase", margin: "20px 0 8px" }}>
                Postes non pourvus
              </h3>
              {report.decisions.filter(d => !d.assigned).map((d, i) => (
                <p key={i} style={{ fontSize: 13, margin: "3px 0" }}>
                  {dateLabel(d.date, { weekday: "long", day: "numeric", month: "short" })} · {d.service} · {skillNames[d.role]} {d.start}–{d.end}
                  {d.reason && <span style={{ color: "#888" }}> — {d.reason}</span>}
                </p>
              ))}
            </>
          )}

          <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#8a9b80", textTransform: "uppercase", margin: "20px 0 8px" }}>
            Décisions ({report.decisions.filter(d => d.assigned).length} affectées)
          </h3>
          {report.decisions.filter(d => d.assigned).map((d, i) => {
            const overContract = d.contractH && d.weekMinAfter && d.weekMinAfter / 60 > d.contractH;
            return (
              <details key={i} style={{ fontSize: 13, marginBottom: 6, borderBottom: "1px solid #edf0e7", paddingBottom: 6 }}>
                <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>
                    {dateLabel(d.date, { weekday: "short" })} · {d.service} · {skillNames[d.role]} {d.start}–{d.end}
                    {" → "}<strong>{d.assigned}</strong>
                    {overContract && <span style={{ color: "#b96046", marginLeft: 6 }}>⚠ {Math.round((d.weekMinAfter ?? 0) / 60 * 10) / 10}h/sem</span>}
                  </span>
                  <span style={{ color: "#999", fontSize: 11, flexShrink: 0 }}>{d.eligibleTotal} éligible(s)</span>
                </summary>
                {d.candidates && (
                  <table style={{ marginTop: 6, width: "100%", fontSize: 12, color: "#555" }}>
                    <tbody>
                      {d.candidates.map((c, j) => (
                        <tr key={j}>
                          <td style={{ paddingRight: 12, fontWeight: j === 0 ? 600 : 400 }}>{c.name}</td>
                          <td style={{ paddingRight: 12 }}>{c.weekH}h/{c.contractH}h</td>
                          <td style={{ paddingRight: 12, color: c.state === "available" ? "#4a7a45" : c.state === "prefer_not" ? "#b07030" : "#888" }}>{c.state}</td>
                          <td style={{ color: "#999" }}>score {c.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            );
          })}
        </div>

        <div className="lulu-save-bar" style={{ flexShrink: 0 }}>
          <button onClick={download}>Copier JSON</button>
          <button className="primary" onClick={onClose}>Fermer</button>
        </div>
      </section>
    </div>
  );
}
