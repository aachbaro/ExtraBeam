import { useState } from "react";
import HoursGauge from "../components/HoursGauge";
import { type Board, minutes, monday } from "./types";

export default function MonthlyHoursGauges({
  board,
  start,
  employeeId,
}: {
  board: Board;
  start: string;
  employeeId: number | null;
}) {
  const [chosen, setChosen] = useState("");
  const month = chosen || start.slice(0, 7);
  const [year, n] = month.split("-").map(Number);
  const dayCount = new Date(year, n, 0).getDate();
  const starts = [
    ...new Set(
      Array.from({ length: dayCount }, (_, i) =>
        monday(`${month}-${String(i + 1).padStart(2, "0")}`),
      ),
    ),
  ];
  const missing = starts.filter((s) => !board.weeks[s]?.prepared).length;
  return (
    <section className="lulu-panel" style={{ padding: 22, marginTop: 20 }}>
      <div className="lulu-panel-head">
        <h2>Heures prévues dans le mois</h2>
        <label>
          Mois{" "}
          <input
            type="month"
            value={month}
            onChange={(e) => setChosen(e.target.value)}
          />
        </label>
      </div>
      <p className="lulu-helper">
        Foncé : planning publié. Clair : proposition à confirmer. Pauses
        déduites ; le réalisé reste dans le carnet de pointage.
      </p>
      {missing > 0 && (
        <p className="lulu-helper">
          Total partiel : {missing} semaine(s) non préparée(s).
        </p>
      )}
      {board.employees
        .filter((e) => employeeId === null || e.id === employeeId)
        .map((e) => {
          let published = 0,
            draft = 0;
          for (const s of starts) {
            const w = board.weeks[s];
            if (!w?.prepared) continue;
            const confirmed = w.status === "published";
            const rows = confirmed ? w.published?.shifts || [] : w.shifts;
            const count = rows
              .filter(
                (row) =>
                  row.date.startsWith(month) &&
                  row.assignments.some((a) => a.employeeId === e.id),
              )
              .reduce((v, row) => v + minutes(row), 0);
            if (confirmed) published += count;
            else draft += count;
          }
          return (
            <HoursGauge
              key={e.id}
              name={e.name}
              published={published}
              draft={draft}
              target={((e.weeklyHours || 0) * 60 * dayCount) / 7}
            />
          );
        })}
      <p className="lulu-helper">
        Une semaine modifiée remplace sa version publiée dans cette projection,
        sans compter les heures deux fois.
      </p>
    </section>
  );
}
