import { useState } from "react";
import type { Restaurant } from "../types";
import { updateRestaurant } from "../api";

const fields = [
  { key: "cycle_start_day", label: "Jour de début du cycle mensuel", initial: 1, min: 1, max: 31, step: 1 },
  { key: "max_daily_hours", label: "Maximum d’heures nettes par jour", initial: 10, min: 1, max: 24, step: 0.5 },
  { key: "max_weekly_hours", label: "Maximum d’heures nettes par semaine", initial: 48, min: 1, max: 168, step: 0.5 },
  { key: "min_rest_hours", label: "Repos minimum entre deux journées (h)", initial: 11, min: 0, max: 48, step: 0.5 },
  { key: "max_days", label: "Maximum de jours travaillés par semaine", initial: 6, min: 1, max: 7, step: 1 },
];

export default function RestaurantSettings({ restaurant, token, onSaved }: { restaurant: Restaurant; token: string; onSaved: (restaurant: Restaurant) => void }) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(fields.map(f => [f.key, restaurant.planning_rules?.[f.key] ?? f.initial])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return <section className="bg-white border rounded-xl p-5 max-w-2xl space-y-4">
    <h1 className="font-semibold">Paramètres du planning</h1>
    <p className="text-sm text-eb-secondary">Le cycle définit la période d’équilibrage des heures. Le 1er correspond au mois civil ; le 15 couvre le 15 au 14 suivant. Si le jour choisi n’existe pas, le cycle commence le dernier jour du mois.</p>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(""); setNotice("");
      try {
        const updated = await updateRestaurant(restaurant.slug, { planning_rules: values }, token);
        onSaved({ ...restaurant, ...updated, is_manager: restaurant.is_manager, is_owner: restaurant.is_owner });
        setNotice("Paramètres enregistrés. Ils seront utilisés pour les prochaines propositions et affectations.");
      } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>
      {fields.map(f => <label key={f.key} className="block text-sm">{f.label}
        <input type="number" required min={f.min} max={f.max} step={f.step} value={values[f.key]} onChange={e => setValues(v => ({ ...v, [f.key]: Number(e.target.value) }))} className="block w-full border rounded-lg p-2 mt-1" />
      </label>)}
      <p className="text-xs text-eb-secondary">Les heures nettes excluent les pauses. Les limites hebdomadaires s’appliquent du lundi au dimanche, même si le cycle est décalé. Les affectations déjà enregistrées ne sont pas supprimées quand vous changez ces paramètres.</p>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <button disabled={busy} className="bg-eb-primary text-white rounded-lg px-4 py-2 text-sm">{busy ? "Enregistrement…" : "Enregistrer les paramètres"}</button>
    </form>
  </section>;
}
