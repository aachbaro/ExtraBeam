import { useState } from "react";
import {
  type PageProps,
  type Shift,
  addDays,
  dateLabel,
  days,
  hours,
  minutes,
  monday,
  skillNames,
} from "../types";
import TimePicker from "../../components/TimePicker";

export default function NeedsPage({ week, board, act }: PageProps) {
  const [rows, setRows] = useState(() =>
    structuredClone(week.shifts.filter((s) => !s.fixed)),
  );
  const [day, setDay] = useState(0);
  const [template, setTemplate] = useState("");
  const [source, setSource] = useState(addDays(week.start, -7));
  const [dirty, setDirty] = useState(false);
  function update(id: string, patch: Partial<Shift>) {
    setRows(rows.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  }
  function add() {
    setRows([
      ...rows,
      {
        id: crypto.randomUUID(),
        date: addDays(week.start, day),
        service: "midi",
        role: "salle",
        start: "11:00",
        end: day > 4 ? "17:00" : "15:30",
        count: 1,
        required: [],
        assignments: [],
        fixed: false,
      },
    ]);
    setDirty(true);
  }
  return (
    <>
      <div className="lulu-panel">
        <div className="lulu-panel-head">
          <div>
            <h2>Modèles de semaine</h2>
            <p>
              Les modèles A, B, C… enregistrent les besoins, sans imposer
              d’affectations.
            </p>
          </div>
          {week.label && <span className="lulu-tag">Modèle {week.label}</span>}
        </div>
        <div className="lulu-template-tools">
          <label>
            Nom du modèle
            <input
              maxLength={30}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="A, B, vacances…"
            />
          </label>
          <button
            disabled={!template.trim() || dirty}
            onClick={() =>
              act(
                "saveTemplate",
                { name: template },
                "Modèle de besoins enregistré.",
              )
            }
          >
            Enregistrer le modèle
          </button>
          <select
            aria-label="Appliquer un modèle"
            value=""
            disabled={dirty}
            onChange={(e) =>
              e.target.value &&
              act(
                "applyTemplate",
                { name: e.target.value },
                "Modèle appliqué. Les disponibilités sont à reconfirmer.",
              )
            }
          >
            <option value="">Appliquer un modèle…</option>
            {Object.keys(board.templates).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <label>
            Copier les besoins du
            <input
              type="date"
              value={source}
              onChange={(e) =>
                e.target.value && setSource(monday(e.target.value))
              }
            />
          </label>
          <button
            disabled={dirty}
            onClick={() =>
              act(
                "copyWeek",
                { source },
                "Besoins copiés. Les affectations sont à préparer.",
              )
            }
          >
            Copier
          </button>
        </div>
        <p className="lulu-helper padded">
          Appliquer un modèle ou copier une semaine remplace les besoins et les
          affectations du brouillon de cette semaine. La version publiée reste
          visible jusqu’à republication.
        </p>
      </div>
      <div className="lulu-panel">
        <div className="lulu-panel-head">
          <div>
            <h2>Les postes à couvrir</h2>
            <p>Une ligne = une variante horaire et un nombre de personnes.</p>
          </div>
          <button className="primary" onClick={add}>
            + Ajouter un shift
          </button>
        </div>
        <div className="lulu-day-tabs">
          {days.map((name, i) => (
            <button
              className={day === i ? "selected" : ""}
              key={name}
              onClick={() => setDay(i)}
            >
              {name}
              <small>
                {dateLabel(addDays(week.start, i), {
                  day: "numeric",
                  month: "short",
                })}
              </small>
            </button>
          ))}
        </div>
        <div className="lulu-table-scroll">
          <table className="lulu-table needs">
            <thead>
              <tr>
                <th>Service</th>
                <th>Rôle</th>
                <th>Début</th>
                <th>Fin estimée</th>
                <th>Effectif</th>
                <th>Compétences requises</th>
                <th>Heures nettes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((s) => s.date === addDays(week.start, day))
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      <select
                        aria-label="Service"
                        value={s.service}
                        onChange={(e) =>
                          update(s.id, { service: e.target.value })
                        }
                      >
                        <option value="midi">Midi</option>
                        <option value="soir">Soir</option>
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label="Rôle"
                        value={s.role}
                        onChange={(e) => update(s.id, { role: e.target.value })}
                      >
                        <option value="salle">Salle</option>
                        <option value="plonge">Plonge</option>
                      </select>
                    </td>
                    <td>
                      <TimePicker
                        aria-label="Début"
                        className="lulu-time-input"
                        value={s.start}
                        onChange={(v) => update(s.id, { start: v })}
                      />
                    </td>
                    <td>
                      <TimePicker
                        aria-label="Fin"
                        className="lulu-time-input"
                        value={s.end}
                        onChange={(v) => update(s.id, { end: v })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Effectif"
                        type="number"
                        min={1}
                        max={30}
                        value={s.count}
                        onChange={(e) =>
                          update(s.id, { count: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <div className="lulu-skill-checks">
                        {["cles", "ouverture", "fermeture"].map((skill) => (
                          <label key={skill}>
                            <input
                              type="checkbox"
                              checked={s.required.includes(skill)}
                              onChange={(e) =>
                                update(s.id, {
                                  required: e.target.checked
                                    ? [...s.required, skill]
                                    : s.required.filter((r) => r !== skill),
                                })
                              }
                            />
                            {skillNames[skill]}
                          </label>
                        ))}
                      </div>
                    </td>
                    <td>{hours(minutes(s))}</td>
                    <td>
                      <button
                        aria-label="Supprimer le shift"
                        className="lulu-danger"
                        onClick={() => {
                          setRows(rows.filter((r) => r.id !== s.id));
                          setDirty(true);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="lulu-save-bar">
          <p>
            {dirty
              ? "Modifications non enregistrées."
              : "Vérifiez les besoins proposés avant de préparer la semaine."}
            <small>
              Les changements d’horaires ou de compétences demandent une
              nouvelle confirmation aux employés.
            </small>
          </p>
          <button
            className="primary"
            onClick={() =>
              act("shifts", { shifts: rows }, "Besoins enregistrés.")
            }
          >
            Enregistrer les besoins
          </button>
        </div>
      </div>
      <p className="lulu-helper">
        Cuisine : les shifts fixes se configurent sur chaque fiche dans Équipe.
        Les besoins de départ sont des suggestions à adapter au restaurant.
      </p>
    </>
  );
}
