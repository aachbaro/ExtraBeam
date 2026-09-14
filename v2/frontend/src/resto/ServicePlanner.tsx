import { useEffect, useState } from "react";
import type {
  Restaurant,
  RestaurantMember,
  RestaurantService,
  ServiceDefinition,
  ServiceTemplate,
} from "../types";
import {
  fetchServices,
  fetchServiceTemplates,
  prepareServices,
  fetchMembers,
  editService,
  deleteService,
  deleteServiceTemplate,
  generateRestaurantPlanning,
  fetchRestaurantHours,
  type MonthlyMemberHours,
} from "../api";
import WeekTimeGrid, {
  type TimeRange,
} from "../components/agenda/WeekTimeGrid";
import HoursGauge from "../components/HoursGauge";
import RestoShiftGrid from "./RestoShiftGrid";
import ServiceEditor, { weekdays, serviceDefinition } from "./ServiceEditor";
function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function ServicePlanner({
  restaurant,
  members,
  token,
  onMembersChanged,
}: {
  restaurant: Restaurant;
  members: RestaurantMember[];
  token: string;
  onMembersChanged: (members: RestaurantMember[]) => void;
}) {
  const slug = restaurant.slug,
    manager = !!restaurant.is_manager;
  const [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [services, setServices] = useState<RestaurantService[]>([]),
    [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [selected, setSelected] = useState<number | null>(null),
    [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<{
    initial?: TimeRange;
    service?: RestaurantService;
    template?: ServiceTemplate;
    prefill?: ServiceDefinition;
  } | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(1),
    [month, setMonth] = useState(""),
    [hours, setHours] = useState<MonthlyMemberHours[]>([]);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return localDay(d);
  });
  const from = days[0],
    to = days[6],
    viewMonth = month || from.slice(0, 7);
  const [deleting, setDeleting] = useState<RestaurantService | null>(null);
  const [deleteScope, setDeleteScope] = useState<"this" | "future">("this");
  const active = services.find((s) => s.id === selected);
  const reload = () => setRefresh((n) => n + 1);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      prepareServices(slug, from, to, token).then(() =>
        fetchServices(slug, from, to, token),
      ),
      manager ? fetchServiceTemplates(slug, token) : Promise.resolve([]),
    ])
      .then(([s, t]) => {
        if (alive) {
          setServices(s);
          setTemplates(t);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, token, from, to, refresh, manager]);
  useEffect(() => {
    let alive = true;
    fetchRestaurantHours(slug, viewMonth, token)
      .then((r) => {
        if (alive) setHours(r);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [slug, token, viewMonth, refresh]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    await action(async () => {
      const end = new Date(to + "T12:00:00");
      end.setDate(end.getDate() + (weeks - 1) * 7);
      const result = await prepareServices(slug, from, localDay(end), token);
      setNotice(
        `${result.created} service(s) préparé(s). Les services hebdomadaires apparaissent automatiquement en consultant chaque semaine.`,
      );
    });
  }
  async function generate() {
    await action(async () => {
      const end = new Date(to + "T12:00:00");
      end.setDate(end.getDate() + (weeks - 1) * 7);
      const result = await generateRestaurantPlanning(
        slug,
        from,
        localDay(end),
        token,
      );
      const missing = result.warnings.reduce((sum, w) => sum + w.missing, 0);
      setNotice(
        missing
          ? `${missing} poste(s) restent à pourvoir. Ouvrez les services pour voir les contraintes.`
          : "Proposition générée. Les affectations manuelles ont été conservées.",
      );
    });
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 items-center">
          <button
            className="border rounded p-2"
            onClick={() => {
              setOffset((n) => n - 1);
              setSelected(null);
            }}
          >
            ←
          </button>
          <span className="text-sm">
            {from} → {to}
          </span>
          <button
            className="border rounded p-2"
            onClick={() => {
              setOffset((n) => n + 1);
              setSelected(null);
            }}
          >
            →
          </button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="text-sm underline">
              Aujourd’hui
            </button>
          )}
        </div>
        {manager && (
          <button
            className="bg-eb-primary text-white px-4 py-2 rounded-lg"
            onClick={() =>
              setEditor({
                initial: { date: from, start_time: "12:00", end_time: "15:30" },
              })
            }
          >
            + Nouveau service
          </button>
        )}
      </div>
      {manager && (
        <details className="bg-white border rounded-xl p-4">
          <summary className="cursor-pointer font-medium">
            Modèles de la semaine · {templates.length}
          </summary>
          <p className="text-sm text-eb-secondary my-3">
            Définissez les besoins habituels, puis préparez les semaines. Chaque
            service daté peut ensuite être ajusté.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="border rounded-lg p-3">
                <p className="text-xs text-eb-secondary">
                  {weekdays[t.weekday]}
                </p>
                <h3 className="font-medium">{t.name}</h3>
                <p className="text-sm">
                  {t.definition.start_time}–{t.definition.end_time} ·{" "}
                  {t.definition.slots.reduce(
                    (n, s) => n + s.positions_needed,
                    0,
                  )}{" "}
                  postes · {t.definition.tasks.length} tâches
                </p>
                <div className="flex gap-3 text-sm mt-2">
                  <button
                    className="underline"
                    onClick={() => setEditor({ template: t })}
                  >
                    Modifier le modèle
                  </button>
                  <button
                    disabled={busy}
                    className="text-red-700"
                    onClick={() => {
                      if (
                        confirm(
                          "Supprimer ce modèle ? Les services déjà créés seront conservés.",
                        )
                      )
                        void action(() =>
                          deleteServiceTemplate(slug, t.id, token),
                        );
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!templates.length && (
            <p className="text-sm">
              Créez ou modifiez un service et cochez « Service hebdomadaire ».
            </p>
          )}
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Afficher{" "}
          <select
            className="border rounded p-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Toute l’équipe</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {manager && (
          <>
            <label className="text-sm">
              Période{" "}
              <select
                className="border rounded p-2"
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} semaine(s)
                  </option>
                ))}
              </select>
            </label>
            <button
              className="border rounded p-2 text-sm"
              disabled={busy || !templates.length}
              onClick={() => void prepare()}
            >
              Préparer depuis les modèles
            </button>
            <button
              className="border rounded p-2 text-sm"
              disabled={busy}
              onClick={() => void generate()}
            >
              Générer les affectations
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-eb-secondary">
        L’agenda affiche les services, de l’ouverture aux clients à la fin
        estimée du rangement. Ouvrez un service pour gérer les postes, leurs
        horaires et les tâches.
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm">
          Chargement du planning…
        </p>
      )}
      <WeekTimeGrid
        days={days}
        editable={manager && !busy}
        events={services
          .filter(
            (s) =>
              !filter ||
              s.shifts.some((p) =>
                p.assignments.some(
                  (a) =>
                    a.member_id === Number(filter) && a.status !== "declined",
                ),
              ),
          )
          .map((s) => ({
            id: s.id,
            date: s.date,
            start: s.start_time,
            end: s.end_time,
            label: s.title,
            detail: `${s.shifts.reduce((n, p) => n + p.assigned_count, 0)}/${s.shifts.reduce((n, p) => n + p.positions_needed, 0)} postes · ${s.tasks.filter((t) => t.done).length}/${s.tasks.length} tâches`,
            draft:
              s.shifts.some((p) => p.status === "draft") || !s.shifts.length,
          }))}
        onSelect={(initial) => setEditor({ initial })}
        onOpen={setSelected}
      />
      {active && (
        <section className="bg-white rounded-xl border p-4 space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {active.title} · {active.date}
              </h2>
              <p className="text-sm text-eb-secondary">
                Clients : {active.start_time} · Cuisine jusqu’à{" "}
                {active.kitchen_end_time} · Rangement jusqu’à {active.end_time}
              </p>
              {active.template_id && (
                <p className="text-xs">
                  Modèle hebdomadaire
                  {active.customized ? " · Ajustements sur cette date" : ""}
                </p>
              )}
            </div>
            <div className="flex gap-3 text-sm">
              {manager && (
                <>
                  <button
                    onClick={() => setEditor({ service: active })}
                    className="underline"
                  >
                    Modifier ce service
                  </button>
                  <button
                    onClick={() => setEditor({ prefill: serviceDefinition(active) })}
                    className="underline"
                  >
                    Dupliquer
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDeleting(active);
                      setDeleteScope("this");
                    }}
                  >
                    Supprimer
                  </button>
                </>
              )}
              <button onClick={() => setSelected(null)}>Fermer</button>
            </div>
          </div>
          {active.notes && (
            <p className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm whitespace-pre-wrap">
              {active.notes}
            </p>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            {(["opening", "during", "closing"] as const).map((phase, i) => (
              <section key={phase}>
                <h3 className="text-sm font-medium mb-2">
                  {
                    [
                      "Début de service",
                      "Pendant le service",
                      "Fin de service",
                    ][i]
                  }
                </h3>
                {active.tasks
                  .filter((t) => t.phase === phase)
                  .map((t) => (
                    <label
                      key={t.key}
                      className="flex gap-2 items-start text-sm py-1"
                    >
                      <input
                        className="mt-1"
                        type="checkbox"
                        disabled={busy}
                        checked={t.done}
                        onChange={(e) =>
                          void action(() =>
                            editService(
                              slug,
                              active.id,
                              { task_key: t.key, done: e.target.checked },
                              token,
                            ),
                          )
                        }
                      />
                      <span
                        className={
                          t.done ? "line-through text-eb-secondary" : ""
                        }
                      >
                        {t.label}
                      </span>
                    </label>
                  ))}
              </section>
            ))}
          </div>
          <h3 className="font-medium">Postes et affectations</h3>
          {!active.shifts.length && (
            <p className="text-sm">
              Aucun poste défini. Modifiez ce service pour ajouter les rôles
              nécessaires.
            </p>
          )}
          {active.shifts.length > 0 && (
            <RestoShiftGrid
              shifts={active.shifts}
              members={members}
              week={{ from: active.date, to: active.date }}
              isManager={manager}
              myMemberId={restaurant.my_member_id ?? null}
              token={token}
              restaurantSlug={slug}
              onShiftUpdated={reload}
              onShiftDeleted={reload}
            />
          )}
        </section>
      )}
      <section className="bg-white rounded-xl border p-4 space-y-3">
        <div className="flex justify-between gap-3">
          <h2 className="font-medium">Heures prévues dans le mois</h2>
          <input
            aria-label="Mois des heures"
            type="month"
            value={viewMonth}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <p className="text-xs text-eb-secondary">
          Foncé : publié · clair : brouillon. Calcul sur les horaires des
          postes, pauses déduites. Objectif : contrat hebdomadaire × jours du
          mois ÷ 7.
        </p>
        {hours
          .filter((r) => !filter || r.member_id === Number(filter))
          .map((r) => (
            <HoursGauge
              key={r.member_id}
              name={r.name}
              published={r.published_minutes}
              draft={r.draft_minutes}
              target={r.target_minutes}
            />
          ))}
      </section>
      {deleting && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Supprimer le service"
        >
          <div className="bg-white rounded-xl p-6 max-w-md space-y-4">
            <h2 className="font-semibold">
              Supprimer {deleting.title} du {deleting.date} ?
            </h2>
            <p className="text-sm">
              Les postes, affectations, réponses de disponibilité, notes et
              tâches des services supprimés seront retirés.
            </p>
            {deleting.template_id && (
              <label className="block text-sm">
                Portée de la suppression
                <select
                  className="w-full border rounded p-2 mt-2"
                  value={deleteScope}
                  onChange={(e) =>
                    setDeleteScope(e.target.value as typeof deleteScope)
                  }
                >
                  <option value="this">Cette date uniquement</option>
                  <option value="future">
                    Cette date et les suivantes : arrêter la récurrence
                  </option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="text-red-700 text-sm">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button disabled={busy} onClick={() => setDeleting(null)}>
                Annuler
              </button>
              <button
                className="bg-red-700 text-white rounded px-3 py-2"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await deleteService(slug, deleting.id, token, deleteScope);
                    setDeleting(null);
                    setSelected(null);
                  })
                }
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
      {editor && (
        <ServiceEditor
          slug={slug}
          token={token}
          {...editor}
          templates={templates}
          members={members}
          onSkillsChanged={() => {
            void fetchMembers(slug, token)
              .then(onMembersChanged)
              .catch((e) => setError(String(e)));
          }}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            reload();
            setNotice("Enregistré.");
          }}
        />
      )}
    </div>
  );
}
