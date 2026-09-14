import { useEffect, useState } from "react";
import { fetchMyBoard, setMyAvailability, type MemberBoard } from "../api";

const statuses: Record<string, string> = {
  unknown: "À confirmer",
  available: "Disponible",
  maybe: "De préférence non",
  unavailable: "Indisponible",
};

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  slug: string;
  token: string;
}

export default function MyAvailabilityBoard({ slug, token }: Props) {
  const [board, setBoard] = useState<MemberBoard | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const from = dateStr(monday);
  const to = dateStr(end);

  useEffect(() => {
    let alive = true;
    setError("");
    setBoard(null);
    fetchMyBoard(slug, token, from, to)
      .then((r) => { if (alive) setBoard(r); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [slug, token, from, to, refresh]);

  async function save(status: string, shiftId?: number) {
    setBusy(true);
    setError("");
    try {
      await setMyAvailability(slug, token, status, shiftId);
      setRefresh((n) => n + 1);
      setNotice("Disponibilité enregistrée.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !board) {
    return (
      <div className="rounded-eb-card border border-eb-layout bg-white p-6">
        <p className="text-[13px] text-eb-google">{error}</p>
        <p className="mt-2 text-[13px] text-eb-secondary">
          Votre compte n&apos;est pas lié à un profil employé de ce restaurant. Connectez-vous par PIN depuis la{" "}
          <a href={`/resto/${slug}/acces`} className="text-eb-primary underline">page employé</a> pour faire le lien.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button className="eb-btn-ghost" onClick={() => setOffset((n) => n - 1)}>← Semaine précédente</button>
        <span className="text-[13px] text-eb-secondary">{from} → {to}</span>
        <button className="eb-btn-ghost" onClick={() => setOffset((n) => n + 1)}>Semaine suivante →</button>
      </div>

      {notice && <p role="status" className="text-[13px] text-eb-primary">{notice}</p>}
      {error && <p role="alert" className="text-[13px] text-eb-google">{error}</p>}

      {board && (
        <>
          <div className="rounded-eb-card border border-eb-layout bg-white p-4">
            <label className="block text-[13px] font-medium text-eb-text">
              Disponibilité habituelle (sans réponse particulière)
              <select
                className="eb-input mt-2 block w-full"
                disabled={busy}
                value={board.default_availability}
                onChange={(e) => void save(e.target.value)}
              >
                {Object.entries(statuses).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          {board.slots.length === 0 ? (
            <p className="rounded-eb-card border border-eb-layout bg-white p-4 text-[13px] text-eb-secondary">
              Aucun poste correspondant à votre profil cette semaine.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {board.slots.map((s) => (
                <article key={s.id} className="rounded-eb-card border border-eb-layout bg-white p-4 space-y-2">
                  <h3 className="text-[14px] font-semibold text-eb-text">
                    {s.title} · {s.date}
                  </h3>
                  <p className="text-[13px] text-eb-secondary">
                    {s.start.slice(0, 5)}–{s.end.slice(0, 5)} · pause {s.break_minutes} min
                    {s.required.length > 0 && ` · ${s.required.join(", ")}`}
                  </p>
                  {s.assigned && (
                    <p className="text-[13px] font-medium text-green-700">
                      Vous êtes affecté sur le planning publié.
                    </p>
                  )}
                  <label className="block text-[13px]">
                    Ma disponibilité
                    <select
                      className="eb-input mt-1 block w-full"
                      disabled={busy}
                      value={s.response || "unknown"}
                      onChange={(e) => void save(e.target.value, s.id)}
                    >
                      <option value="unknown">Selon ma disponibilité habituelle</option>
                      {Object.entries(statuses)
                        .filter(([k]) => k !== "unknown")
                        .map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                    </select>
                  </label>
                  <p className="text-[12px] text-eb-muted">
                    Pris en compte : {statuses[s.effective] || "À confirmer"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
