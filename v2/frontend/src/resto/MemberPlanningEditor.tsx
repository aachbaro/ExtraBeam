import { useState } from "react";
import { updateMember } from "../api";
import type { RestaurantMember } from "../types";

export default function MemberPlanningEditor({
  members,
  slug,
  token,
  onChange,
}: {
  members: RestaurantMember[];
  slug: string;
  token: string;
  onChange: (rows: RestaurantMember[]) => void;
}) {
  return (
    <section className="mt-5 rounded-xl border bg-white p-4">
      <h2>Contrats et préférences de planification</h2>
      <p className="text-xs my-2">
        Les compétences complètent le poste principal. La disponibilité
        habituelle ne remplace pas les indisponibilités du profil ni les
        réponses données pour un service.
      </p>
      {members.map((m) => (
        <MemberRow
          key={`${m.id}-${m.weekly_hours}-${JSON.stringify(m.preferences)}-${m.default_availability}-${m.skills.join()}`}
          member={m}
          save={async (data) => {
            const updated = await updateMember(slug, m.id, data, token);
            onChange(members.map((row) => (row.id === m.id ? updated : row)));
          }}
        />
      ))}
    </section>
  );
}
function MemberRow({
  member,
  save,
}: {
  member: RestaurantMember;
  save: (data: Parameters<typeof updateMember>[2]) => Promise<void>;
}) {
  const [hours, setHours] = useState(member.weekly_hours);
  const [skills, setSkills] = useState(member.skills.join(", "));

  const [prefs, setPrefs] = useState(member.preferences);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="border-t py-3">
      <summary>
        {member.name} · {member.weekly_hours} h / semaine
      </summary>
      <form
        className="grid gap-3 sm:grid-cols-2 py-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({
              weekly_hours: Number(hours),
              skills: skills
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              preferences: prefs,
            });
            setMessage("Enregistré.");
          } catch (err) {
            setMessage(String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Contrat hebdomadaire
          <input
            aria-label={`Contrat de ${member.name}`}
            className="border rounded p-2 w-full"
            type="number"
            min="0"
            max="60"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <p className="text-xs text-eb-secondary">
          Disponibilités renseignées par l’employé depuis son accès PIN.
        </p>
        <label>
          Autres postes et compétences
          <input
            className="border rounded p-2 w-full"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="serveur, clés, ouverture"
          />
        </label>
        {Object.entries({
          compact: "Regrouper les jours",
          split: "Éviter les coupures",
          weekends: "Éviter les week-ends",
          evenings: "Éviter les soirs",
          lunches: "Éviter les midis",
          stable: "Horaires stables",
          variety: "Varier les collègues",
        }).map(([k, label]) => (
          <label key={k}>
            {label}
            <select
              className="border rounded p-2 w-full"
              value={prefs[k] || 0}
              onChange={(e) =>
                setPrefs({ ...prefs, [k]: Number(e.target.value) })
              }
            >
              <option value="0">Sans préférence</option>
              <option value="1">Si possible</option>
              <option value="2">Préférence forte</option>
            </select>
          </label>
        ))}
        <button disabled={busy} className="border rounded p-2">
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
