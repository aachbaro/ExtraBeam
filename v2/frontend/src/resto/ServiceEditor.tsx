import { useState } from "react";
import type {
  RestaurantService,
  RestaurantMember,
  ServiceDefinition,
  ServiceTemplate,
  ServiceSlot,
} from "../types";
import SkillsPicker from "./SkillsPicker";
import TimePicker from "../components/TimePicker";
import { createService, editService, saveServiceTemplate } from "../api";
import type { TimeRange } from "../components/agenda/WeekTimeGrid";
export const weekdays = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
export const positions: Record<string, string> = {
  serveur: "Serveur",
  chef_de_rang: "Chef de rang",
  barman: "Bar",
  sommelier: "Sommelier",
  hote_accueil: "Accueil",
  chef_cuisine: "Chef de cuisine",
  cuisinier: "Cuisinier",
  plongeur: "Plonge",
  manager: "Responsable",
  autre: "Autre",
};
const key = () => crypto.randomUUID();
const slot = (): ServiceSlot => ({
  key: key(),
  title: "",
  position: "serveur",
  positions_needed: 1,
  start_time: "11:00",
  end_time: "15:30",
  break_minutes: 30,
  required_skills: [],
});
export function serviceDefinition(s: ServiceDefinition): ServiceDefinition {
  return structuredClone({
    title: s.title,
    start_time: s.start_time.slice(0, 5),
    kitchen_end_time: s.kitchen_end_time.slice(0, 5),
    end_time: s.end_time.slice(0, 5),
    notes: s.notes,
    tasks: s.tasks,
    slots: s.slots,
  });
}
export default function ServiceEditor({
  slug,
  token,
  initial,
  service,
  template,
  prefill,
  templateMode = false,
  initialWeekday,
  templates,
  members,
  onSkillsChanged,
  onClose,
  onSaved,
}: {
  slug: string;
  token: string;
  initial?: TimeRange;
  service?: RestaurantService;
  template?: ServiceTemplate;
  prefill?: ServiceDefinition;
  templateMode?: boolean;
  initialWeekday?: number;
  templates: ServiceTemplate[];
  members: RestaurantMember[];
  onSkillsChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(
    service?.date || initial?.date || new Date().toLocaleDateString("en-CA"),
  );
  const [definition, setDefinition] = useState<ServiceDefinition>(() =>
    service
      ? serviceDefinition(service)
      : template
        ? serviceDefinition(template.definition)
        : prefill
          ? serviceDefinition(prefill)
          : {
              title: "Service du midi",
              start_time: initial?.start_time || "12:00",
              kitchen_end_time: initial?.end_time || "14:30",
              end_time: initial?.end_time || "15:30",
              notes: "",
              tasks: [],
              slots: [{ ...slot(), positions_needed: 3 }],
            },
  );
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [recurring, setRecurring] = useState(!!service?.template_id);
  const [scope, setScope] = useState<"this" | "future">("this");
  const [weekday, setWeekday] = useState(
    initialWeekday ?? template?.weekday ?? (new Date(day + "T12:00:00").getDay() + 6) % 7,
  );

  const [applyFuture, setApplyFuture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skillBusy, setSkillBusy] = useState(false);
  const [error, setError] = useState("");
  function field<K extends keyof ServiceDefinition>(
    name: K,
    value: ServiceDefinition[K],
  ) {
    setDefinition((d) => ({ ...d, [name]: value }));
  }
  function updateSlot(i: number, value: Partial<ServiceSlot>) {
    field(
      "slots",
      definition.slots.map((s, n) => (n === i ? { ...s, ...value } : s)),
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (template || templateMode)
        await saveServiceTemplate(
          slug,
          template?.id ?? null,
          { definition, weekday, apply_future: applyFuture },
          token,
        );
      else if (service)
        await editService(
          slug,
          service.id,
          { definition, recurring, scope },
          token,
        );
      else
        await createService(
          slug,
          { date: day, definition, template_id: templateId, recurring },
          token,
        );
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const input =
    "w-full rounded-lg border border-eb-layout p-2 bg-white text-sm";
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-center items-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-editor-title"
    >
      <form
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            e.target instanceof HTMLInputElement &&
            e.target.type !== "submit"
          ) {
            e.preventDefault();
            e.target.blur();
          }
        }}
        onSubmit={submit}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-5"
      >
        <div className="flex justify-between">
          <h2 id="service-editor-title" className="font-semibold">
            {template
              ? "Modifier la semaine type"
              : templateMode
                ? "Ajouter un service à la semaine type"
              : service
                ? "Modifier ce service"
                : prefill
                  ? "Dupliquer ce service"
                  : "Nouveau service"}
          </h2>
          <button type="button" disabled={busy || skillBusy} onClick={onClose}>
            Fermer
          </button>
        </div>
        {!service && !template && !templateMode && (
          <label className="block">
            Partir d’un modèle
            <select
              className={input}
              value={templateId || ""}
              onChange={(e) => {
                const t = templates.find(
                  (t) => t.id === Number(e.target.value),
                );
                setTemplateId(t?.id);
                setRecurring(!!t);
                if (t) setDefinition(serviceDefinition(t.definition));
              }}
            >
              <option value="">Service personnalisé</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {weekdays[t.weekday]} · {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <label>
            Nom du service
            <input
              required
              maxLength={120}
              className={input}
              value={definition.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          {template || templateMode ? (
            <label>
              Jour habituel
              <select
                className={input}
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {weekdays.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Date
              <input
                required
                type="date"
                disabled={!!service}
                className={input}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              ["start_time", "Ouverture aux clients"],
              ["kitchen_end_time", "Fermeture de la cuisine"],
              ["end_time", "Fin estimée du rangement"],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <TimePicker
                required
                className={input}
                value={definition[k]}
                onChange={(v) => field(k, v)}
              />
            </label>
          ))}
        </div>
        <section className="space-y-3">
          <h3 className="font-semibold">Postes à pourvoir</h3>
          <p className="text-xs text-eb-secondary">
            Les horaires de travail incluent la préparation et le rangement.
            Chaque ligne définit un rôle et le nombre de personnes nécessaires.
          </p>
          {definition.slots.map((s, i) => (
            <div
              key={s.key}
              className="border rounded-xl p-3 space-y-2 bg-eb-page"
            >
              <div className="flex gap-2 items-end">
                <label className="flex-1">
                  Rôle
                  <select
                    className={input}
                    value={s.position}
                    onChange={(e) =>
                      updateSlot(i, { position: e.target.value })
                    }
                  >
                    {Object.entries(positions).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-20">
                  Nombre
                  <input
                    type="number"
                    min={1}
                    max={50}
                    required
                    className={input}
                    value={s.positions_needed}
                    onChange={(e) =>
                      updateSlot(i, {
                        positions_needed: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="p-2"
                  aria-label={`Retirer le poste ${i + 1}`}
                  onClick={() =>
                    field(
                      "slots",
                      definition.slots.filter((_, n) => i !== n),
                    )
                  }
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label>
                  Début
                  <TimePicker
                    required
                    className={input}
                    value={s.start_time}
                    onChange={(v) => updateSlot(i, { start_time: v })}
                  />
                </label>
                <label>
                  Fin
                  <TimePicker
                    required
                    className={input}
                    value={s.end_time}
                    onChange={(v) => updateSlot(i, { end_time: v })}
                  />
                </label>
                <label>
                  Pause (min)
                  <input
                    type="number"
                    min={0}
                    max={180}
                    required
                    className={input}
                    value={s.break_minutes}
                    onChange={(e) =>
                      updateSlot(i, { break_minutes: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <label>
                  Précision
                  <input
                    className={input}
                    maxLength={120}
                    placeholder="Ouverture, renfort…"
                    value={s.title}
                    onChange={(e) => updateSlot(i, { title: e.target.value })}
                  />
                </label>
                <div>
                  <p className="mb-1">Compétences requises</p>
                  <SkillsPicker
                    slug={slug}
                    token={token}
                    members={members}
                    value={s.required_skills}
                    onChange={(required_skills) =>
                      updateSlot(i, { required_skills })
                    }
                    onCreated={onSkillsChanged}
                    onBusy={setSkillBusy}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="border rounded-lg px-3 py-2"
            onClick={() => field("slots", [...definition.slots, slot()])}
          >
            + Ajouter un rôle / des postes
          </button>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">
            {service ? "Tâches de ce service" : "Tâches récurrentes"}
          </h3>
          <p className="text-xs text-eb-secondary">
            Chaque nouveau service commence avec toutes les tâches à faire.
          </p>
          {definition.tasks.map((t, i) => (
            <div key={t.key} className="flex gap-2">
              <select
                aria-label="Moment de la tâche"
                className="border rounded p-2 text-sm"
                value={t.phase}
                onChange={(e) =>
                  field(
                    "tasks",
                    definition.tasks.map((x, n) =>
                      i === n
                        ? { ...x, phase: e.target.value as typeof t.phase }
                        : x,
                    ),
                  )
                }
              >
                <option value="opening">Début</option>
                <option value="during">Pendant</option>
                <option value="closing">Fin</option>
              </select>
              <input
                aria-label="Tâche"
                required
                maxLength={300}
                className={input}
                value={t.label}
                onChange={(e) =>
                  field(
                    "tasks",
                    definition.tasks.map((x, n) =>
                      i === n ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label="Retirer la tâche"
                onClick={() =>
                  field(
                    "tasks",
                    definition.tasks.filter((_, n) => i !== n),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="border rounded-lg px-3 py-2"
            onClick={() =>
              field("tasks", [
                ...definition.tasks,
                { key: key(), label: "", phase: "during", done: false },
              ])
            }
          >
            + Ajouter une tâche
          </button>
        </section>
        <label className="block">
          Notes {service ? "ponctuelles" : "du service"}
          <textarea
            className={input}
            maxLength={10000}
            placeholder="Livraison, affluence particulière, consignes…"
            value={definition.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
        {!template && !templateMode && (
          <section className="border-t pt-3 space-y-3">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={recurring}
                disabled={!!service?.template_id || !!templateId}
                onChange={(e) => setRecurring(e.target.checked)}
              />
              Service hebdomadaire, sans date de fin
            </label>
            {recurring && (
              <p className="text-xs text-eb-secondary">
                Ce service sera proposé chaque semaine le même jour. Chaque date
                garde ses tâches et ses ajustements.
              </p>
            )}
            {service?.template_id && (
              <label className="block text-sm">
                Appliquer les modifications
                <select
                  className={input}
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  <option value="this">
                    Seulement à ce service, à cette date
                  </option>
                  <option value="future">
                    À ce service et aux suivants (brouillons)
                  </option>
                </select>
              </label>
            )}
          </section>
        )}
        {template && (
          <label className="block border rounded p-3 text-sm">
            <input
              type="checkbox"
              checked={applyFuture}
              onChange={(e) => setApplyFuture(e.target.checked)}
            />{" "}
            Appliquer aux prochains services encore en brouillon, en conservant
            leurs ajustements ponctuels. Les dates déjà créées ne changent pas.
          </label>
        )}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={busy || skillBusy} onClick={onClose}>
            Annuler
          </button>
          <button
            disabled={busy || skillBusy}
            className="rounded-lg bg-eb-primary text-white px-4 py-2"
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
