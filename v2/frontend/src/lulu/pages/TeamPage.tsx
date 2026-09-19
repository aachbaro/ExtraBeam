import { useState, type FormEvent } from "react";
import {
  type PageProps,
  type Employee,
  type FixedShift,
  type Board,
  days,
  skillNames,
} from "../types";
import EmployeeAvailabilityDialog from "../EmployeeAvailabilityDialog";
import TimePicker from "../../components/TimePicker";

export default function TeamPage({
  board,
  week,
  act,
  loadWeek,
}: PageProps & { loadWeek: (start: string) => Promise<Board> }) {
  const [editing, setEditing] = useState<Employee | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  return (
    <>
      <div className="lulu-section-title">
        <p>
          {board.employees.filter((e) => e.active).length} personnes dans
          l’équipe
        </p>
        <button
          className="primary"
          onClick={() =>
            setEditing({
              id: 0,
              name: "",
              weeklyHours: 35,
              skills: ["salle"],
              active: true,
              defaults: {},
              fixedShifts: [],
            })
          }
        >
          + Ajouter une personne
        </button>
      </div>
      <div className="lulu-banner">
        Les contrats initiaux sont à vérifier. Renseignez les horaires fixes de
        chaque cuisinier avant la première publication.
      </div>
      <div className="lulu-team-grid">
        {board.employees.map((e) => (
          <article
            key={e.id}
            className={`lulu-person ${!e.active ? "inactive" : ""}`}
          >
            <div className="lulu-person-top">
              <span className="lulu-avatar">{e.name.slice(0, 1)}</span>
              <span className="lulu-tag">
                {e.manager ? "Responsable" : e.active ? "Équipe" : "Inactif"}
              </span>
            </div>
            <h2>{e.name}</h2>
            <p>{e.weeklyHours} h / semaine</p>
            <div className="lulu-chips">
              {e.skills.map((s) => (
                <span key={s}>{skillNames[s]}</span>
              ))}
            </div>
            {e.skills.includes("cuisine") && (
              <small>
                {e.fixedShifts?.length || 0} shifts fixes par semaine
              </small>
            )}
            <div className="lulu-person-actions">
              <button onClick={() => setEditing(structuredClone(e))}>
                Gérer la fiche →
              </button>
              <button
                className="lulu-dispos-button"
                onClick={() => setViewing(e)}
              >
                {e.skills.includes("cuisine")
                  ? "Voir les horaires"
                  : "Voir les dispos"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {viewing && (
        <EmployeeAvailabilityDialog
          employee={viewing}
          initialWeek={week.start}
          loadWeek={loadWeek}
          close={() => setViewing(null)}
        />
      )}
      {editing && (
        <EmployeeEditor
          key={editing.id}
          employee={editing}
          close={() => setEditing(null)}
          save={async (employee) => {
            if (
              await act(
                "employee",
                { employee },
                "Fiche enregistrée. Les brouillons intègrent les horaires fixes mis à jour.",
              )
            )
              setEditing(null);
          }}
        />
      )}
    </>
  );
}

function EmployeeEditor({
  employee,
  close,
  save,
}: {
  employee: Employee;
  close: () => void;
  save: (e: Employee & { pin: string }) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ ...employee, pin: "" });
  const [saving, setSaving] = useState(false);
  const fixed = draft.fixedShifts || [];
  function updateFixed(index: number, patch: Partial<FixedShift>) {
    setDraft({
      ...draft,
      fixedShifts: fixed.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await save(draft);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="lulu-modal-backdrop">
      <section
        className="lulu-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-title"
      >
        <form onSubmit={submit}>
          <div className="lulu-panel-head">
            <h2 id="employee-title">
              {employee.id ? employee.name : "Ajouter un employé"}
            </h2>
            <button type="button" aria-label="Fermer la fiche" onClick={close}>
              ×
            </button>
          </div>
          <div className="padded">
            <div className="lulu-form-grid">
              <label>
                Prénom / nom
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                Contrat hebdomadaire (h)
                <input
                  required
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={draft.weeklyHours}
                  onChange={(e) =>
                    setDraft({ ...draft, weeklyHours: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {employee.id ? "Nouveau PIN (facultatif)" : "PIN initial"}
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  required={!employee.id}
                  minLength={6}
                  maxLength={12}
                  pattern="[0-9]{6,12}"
                  value={draft.pin}
                  onChange={(e) => setDraft({ ...draft, pin: e.target.value })}
                  placeholder="6 à 12 chiffres"
                />
              </label>
              <label className="lulu-check">
                <input
                  type="checkbox"
                  disabled={employee.manager}
                  checked={draft.active}
                  onChange={(e) =>
                    setDraft({ ...draft, active: e.target.checked })
                  }
                />
                Compte actif
              </label>
            </div>
            <h3>Compétences et responsabilités</h3>
            <div className="lulu-skill-checks large">
              {Object.entries(skillNames).map(([skill, label]) => (
                <label key={skill}>
                  <input
                    type="checkbox"
                    checked={draft.skills.includes(skill)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        skills: e.target.checked
                          ? [...draft.skills, skill]
                          : draft.skills.filter((s) => s !== skill),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {draft.skills.includes("cuisine") && (
              <>
                <div className="lulu-section-title">
                  <div>
                    <h3>Horaires fixes de cuisine</h3>
                    <p className="lulu-helper">
                      Répétés chaque semaine. Les brouillons existants seront
                      actualisés.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        fixedShifts: [
                          ...fixed,
                          {
                            day: 0,
                            service: "midi",
                            start: "08:30",
                            end: "15:30",
                          },
                        ],
                      })
                    }
                  >
                    + Shift fixe
                  </button>
                </div>
                {fixed.map((f, index) => (
                  <div className="lulu-fixed-row" key={index}>
                    <select
                      aria-label="Jour du shift fixe"
                      value={f.day}
                      onChange={(e) =>
                        updateFixed(index, { day: Number(e.target.value) })
                      }
                    >
                      {days.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Service fixe"
                      value={f.service}
                      onChange={(e) =>
                        updateFixed(index, { service: e.target.value })
                      }
                    >
                      <option value="midi">Midi</option>
                      <option value="soir">Soir</option>
                    </select>
                    <TimePicker
                      aria-label="Début fixe"
                      required
                      className="lulu-time-input"
                      value={f.start}
                      onChange={(v) => updateFixed(index, { start: v })}
                    />
                    <TimePicker
                      aria-label="Fin fixe"
                      required
                      className="lulu-time-input"
                      value={f.end}
                      onChange={(v) => updateFixed(index, { end: v })}
                    />
                    <button
                      type="button"
                      aria-label="Retirer le shift fixe"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          fixedShifts: fixed.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="lulu-save-bar">
            <button type="button" onClick={close}>
              Annuler
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer la fiche"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
