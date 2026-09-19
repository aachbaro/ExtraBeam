import { useEffect, useRef, useState } from "react";
import type { RestaurantMember, RestaurantService, RestaurantShift, ServiceDefinition, ServiceTemplate } from "../types";
import { saveServiceTemplate } from "../api";
import { serviceDefinition, weekdays } from "./ServiceEditor";
import ServiceDayCard from "./ServiceDayCard";

const emptyService = (): ServiceDefinition => ({ title: "Service", start_time: "12:00", kitchen_end_time: "14:30", end_time: "15:30", notes: "", tasks: [], slots: [] });

// Presentation adapter only: these shift IDs are slot indices, never API IDs.
function templateCard(t: ServiceTemplate, members: RestaurantMember[]): RestaurantService {
  return { ...t.definition, id: t.id, date: "", template_id: t.id, customized: false,
    shifts: t.definition.slots.map((slot, index): RestaurantShift => {
      const assignments = (slot.fixed_member_ids || []).map(id => {
        const member = members.find(m => m.id === id);
        return { id, member_id: id, member_name: member?.name || "Employé", member_position: member?.position || "serveur", avatar_url: null, status: "confirmed" as const, locked: true, note: "", created_at: "" };
      });
      return { ...slot, position: slot.position as RestaurantShift["position"], id: index, date: "", service: "midi", series_id: null, notes: "", status: "draft", created_at: "", updated_at: "", availabilities: [], candidates: [], assignments, assigned_count: assignments.length, available_count: 0 };
    }),
  };
}

type Props = { templates: ServiceTemplate[]; members: RestaurantMember[]; busy: boolean; slug: string; token: string; onReload: () => void; onDelete: (template: ServiceTemplate) => void };
export default function WeeklyTemplateBoard({ templates, members, busy, slug, token, onReload, onDelete }: Props) {
  const [selection, setSelection] = useState<number[]>([]);
  const [copied, setCopied] = useState<ServiceDefinition[]>([]);
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const [dragDay, setDragDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [applyFuture, setApplyFuture] = useState(false);
  const [newId, setNewId] = useState<number | null>(null);
  const today = new Date().toLocaleDateString("en-CA");
  const active = templates.filter(t => !t.ends_on || t.ends_on >= today);
  const ended = templates.filter(t => t.ends_on && t.ends_on < today);
  const blocked = busy || saving;
  async function create(weekday: number, definitions = [emptyService()]) {
    if (savingRef.current || busy) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      for (const source of definitions) {
        const definition = serviceDefinition(source);
        definition.tasks = definition.tasks.map(t => ({ ...t, done: false }));
        const result = await saveServiceTemplate(slug, null, { weekday, definition }, token);
        setNewId(result.id); setSelection([result.id]);
      }
    } catch (e) { setError(String(e)); }
    finally { savingRef.current = false; setSaving(false); onReload(); }
  }
  async function write(id: number, definition: ServiceDefinition) {
    const template = templates.find(t => t.id === id);
    if (!template) throw new Error("Le modèle n’est plus disponible. Actualisez la page.");
    return saveServiceTemplate(slug, id, { weekday: template.weekday, definition, apply_future: applyFuture }, token);
  }
  function copySelected() {
    setCopied(active.filter(t => selection.includes(t.id)).map(t => serviceDefinition(t.definition)));
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (blocked || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selection.length) { e.preventDefault(); copySelected(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && copied.length && focusedDay !== null) { e.preventDefault(); void create(focusedDay, copied); }
      if (e.key === "Escape") { setSelection([]); setCopied([]); setFocusedDay(null); }
    }
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [selection, copied, focusedDay, templates, blocked]);
  return <section className="space-y-4" aria-label="Semaine type">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Semaine type</h2><p className="text-sm text-eb-secondary mt-1">Cliquez sur les éléments d’un service pour les modifier. Les ajustements datés se font dans le planning.</p></div>
      <button disabled={blocked} className="bg-eb-primary text-white rounded-lg px-4 py-2 text-sm" onClick={() => void create(focusedDay ?? 0)}>+ Service</button>
    </div>
    <label className="flex items-start gap-2 text-xs text-eb-secondary"><input type="checkbox" checked={applyFuture} onChange={e => setApplyFuture(e.target.checked)} />Appliquer aussi mes modifications aux prochains brouillons, en conservant leurs ajustements. Les services publiés restent inchangés.</label>
    {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    <div className="overflow-x-auto pb-3" tabIndex={0} aria-label="Services habituels du lundi au dimanche">
      <div className="flex gap-3" style={{ minWidth: 1470 }}>
        {weekdays.map((day, weekday) => <div key={day} data-template-day={weekday} className={`flex-1 min-w-[200px] space-y-2 rounded-xl transition-all ${dragDay === weekday || focusedDay === weekday ? "ring-2 ring-eb-primary/40" : ""}`}
          onClick={e => { if (!(e.target as HTMLElement).closest("[data-template-card], button, input, select")) { setFocusedDay(weekday); setSelection([]); } }}
          onDragOver={e => { if (!e.dataTransfer.types.includes("application/x-eb-template")) return; e.preventDefault(); setDragDay(weekday); e.dataTransfer.dropEffect = "copy"; }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragDay(null); }}
          onDrop={e => { setDragDay(null); if (!e.dataTransfer.types.includes("application/x-eb-template")) return; e.preventDefault(); const t = active.find(t => String(t.id) === e.dataTransfer.getData("application/x-eb-template")); if (t && !blocked) void create(weekday, [t.definition]); }}>
          <button className="w-full bg-white border rounded-lg py-3 text-center text-sm text-eb-secondary" onClick={() => { setFocusedDay(weekday); if (copied.length) void create(weekday, copied); }}>{day}</button>
          {active.filter(t => t.weekday === weekday).sort((a,b) => a.definition.start_time.localeCompare(b.definition.start_time) || a.id-b.id).map(t => <div key={t.id} data-template-card={t.id} draggable={!blocked}
            className={`rounded-xl transition-all ${selection.includes(t.id) ? "ring-2 ring-eb-primary" : ""}`}
            onClick={e => { if ((e.target as HTMLElement).closest("button, input, select, textarea, [role=dialog], [role=button]")) return; setSelection(e.shiftKey ? (selection.includes(t.id) ? selection.filter(id => id !== t.id) : [...selection,t.id]) : [t.id]); }}
            onDragStart={e => { e.dataTransfer.effectAllowed="copy"; e.dataTransfer.setData("application/x-eb-template", String(t.id)); }}>
            <ServiceDayCard service={templateCard(t,members)} members={members} manager={!blocked} token={token} slug={slug} templateMode writeDefinition={write}
              isNew={newId === t.id} onReload={onReload} onDelete={() => onDelete(t)}
              onCopy={() => { setSelection([t.id]); setCopied([serviceDefinition(t.definition)]); }}
              onDuplicate={definition => void create(weekday,[definition])} />
          </div>)}
          <button disabled={blocked} aria-label={`Ajouter un service le ${day.toLowerCase()}`} className="w-full rounded-lg border border-dashed py-2 text-xs text-eb-secondary hover:border-eb-primary hover:text-eb-primary transition-colors" onClick={() => void create(weekday)}>+ Service</button>
          {!!copied.length && <button disabled={blocked} className="w-full border rounded-lg py-2 text-xs text-eb-primary bg-white" onClick={() => void create(weekday,copied)}>Coller ici</button>}
        </div>)}
      </div>
    </div>
    {!!selection.length && <div className="flex gap-3 items-center text-xs"><span>{selection.length} service(s) sélectionné(s)</span><button className="underline" onClick={copySelected}>Copier la sélection</button><button className="underline" onClick={() => setSelection([])}>Désélectionner</button></div>}
    {!!copied.length && <p role="status" className="text-xs">{copied.length} service(s) copié(s). Choisissez un jour ou utilisez Ctrl+V. <button className="underline" onClick={() => setCopied([])}>Annuler</button></p>}
    {!!ended.length && <details className="text-sm"><summary>Récurrences terminées ({ended.length})</summary>{ended.map(t => <p key={t.id}>{weekdays[t.weekday]} · {t.name}</p>)}</details>}
  </section>;
}
