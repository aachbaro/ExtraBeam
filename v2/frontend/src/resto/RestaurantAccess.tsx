import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { employeeApi, linkRivebelleAccount } from "../api";
import { useUserContext } from "../context/UserContext";
type StaffSlot = {
  id: number;
  date: string;
  title: string;
  start: string;
  end: string;
  role: string;
  required: string[];
  response: string;
  effective: string;
  assigned: boolean;
  break_minutes: number;
};
type Board = { name: string; default_availability: string; slots: StaffSlot[] };
const statuses: Record<string, string> = {
  unknown: "À confirmer",
  available: "Disponible",
  maybe: "De préférence non",
  unavailable: "Indisponible",
};
function date(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export default function RestaurantAccess() {
  const { slug = "" } = useParams();
  const { user } = useUserContext();
  const storage = `resto-pin:${slug}`;
  const [token, setToken] = useState(
      () => sessionStorage.getItem(storage) || "",
    ),
    [people, setPeople] = useState<{ id: number; name: string }[]>([]),
    [restaurant, setRestaurant] = useState("Restaurant"),
    [person, setPerson] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [board, setBoard] = useState<Board | null>(null),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [notice, setNotice] = useState(""),
    [linked, setLinked] = useState(false);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const from = date(monday),
    to = date(end);
  useEffect(() => {
    let alive = true;
    employeeApi<{ restaurant: string; people: typeof people }>(
      slug,
      "people",
      null,
    )
      .then((r) => {
        if (alive) {
          setPeople(r.people);
          setRestaurant(r.restaurant);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setError("");
    setBoard(null);
    employeeApi<Board>(slug, "board", token, { from, to })
      .then((r) => {
        if (alive) setBoard(r);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [slug, token, from, to, refresh]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await employeeApi<{ token: string }>(slug, "login", null, {
        member_id: Number(person),
        pin,
      });
      sessionStorage.setItem(storage, r.token);
      setToken(r.token);
      setPin("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(status: string, shift_id?: number) {
    setBusy(true);
    setError("");
    try {
      await employeeApi(slug, "availability", token, { status, shift_id });
      setRefresh((n) => n + 1);
      setNotice("Disponibilité enregistrée.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function linkAccount() {
    if (!user?.token) return;
    setBusy(true);
    setError("");
    try {
      const r = await linkRivebelleAccount(slug, token, user.token);
      setLinked(true);
      setNotice(`Compte lié : ${r.member_name} ↔ ${user.display_name ?? user.token.slice(0, 8)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la liaison.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await employeeApi(slug, "logout", token, {});
      sessionStorage.removeItem(storage);
      setToken("");
      setBoard(null);
      setNotice("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-eb-page px-4 py-10">
      <div className={`${token ? "max-w-4xl" : "max-w-md"} mx-auto space-y-5`}>
        <header>
          <h1 className="text-2xl font-semibold text-eb-primary">
            {restaurant}
          </h1>
          <p className="text-sm text-eb-secondary">
            Espace employés · disponibilités et planning
          </p>
        </header>
        {error && (
          <p
            role="alert"
            className="border border-red-200 bg-red-50 rounded p-3 text-red-700"
          >
            {error}
          </p>
        )}
        {!token ? (
          <form
            onSubmit={login}
            className="bg-white border rounded-xl p-6 space-y-4"
          >
            <label className="block">
              Votre nom
              <select
                required
                className="w-full border rounded-lg p-3 mt-1"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
              >
                <option value="">Sélectionner votre nom</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Code PIN
              <input
                required
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                minLength={4}
                maxLength={8}
                autoComplete="current-password"
                className="w-full border rounded-lg p-3 mt-1"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="w-full bg-eb-primary text-white rounded-lg p-3"
            >
              {busy ? "Connexion…" : "Se connecter"}
            </button>
            <p className="text-xs text-eb-secondary">
              Votre nom n’apparaît pas ou vous avez oublié votre PIN ? Demandez
              au responsable de configurer votre accès.
            </p>
            <Link className="block text-sm underline" to={`/resto/${slug}`}>
              Espace responsable
            </Link>
          </form>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">{board?.name}</h2>
              <button
                disabled={busy}
                onClick={() => void logout()}
                className="border rounded px-3 py-2 text-sm"
              >
                Se déconnecter
              </button>
            </div>
            {user?.token && !linked && (
              <div className="bg-white border rounded-xl p-4 text-sm space-y-2">
                <p className="font-medium">Lier avec mon compte Rivebelle</p>
                <p className="text-eb-secondary">
                  Connecté en tant que <strong>{user.display_name ?? "Rivebelle"}</strong>.
                  La liaison permet d&apos;accéder à votre planning directement depuis votre compte.
                </p>
                <button
                  disabled={busy}
                  onClick={() => void linkAccount()}
                  className="bg-eb-primary text-white rounded-lg px-4 py-2"
                >
                  {busy ? "Liaison…" : "Lier ce compte"}
                </button>
              </div>
            )}
            {linked && (
              <p className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                Compte Rivebelle lié. Vous pouvez maintenant accéder à vos disponibilités depuis l&apos;onglet &quot;Mes disponibilités&quot; du restaurant.
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                className="border rounded p-2"
                onClick={() => setOffset((n) => n - 1)}
              >
                ←
              </button>
              <span className="text-sm">
                {from} → {to}
              </span>
              <button
                className="border rounded p-2"
                onClick={() => setOffset((n) => n + 1)}
              >
                →
              </button>
            </div>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            {board && (
              <>
                <label className="block bg-white border rounded-xl p-4 text-sm">
                  Disponibilité habituelle, sans réponse particulière
                  <select
                    className="block w-full mt-2 border rounded p-2"
                    disabled={busy}
                    value={board.default_availability}
                    onChange={(e) => void save(e.target.value)}
                  >
                    {Object.entries(statuses).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <span className="block mt-2 text-xs text-eb-secondary">
                    Vos réponses par poste sont prioritaires. Vos
                    indisponibilités de profil restent prises en compte si votre
                    compte y est relié.
                  </span>
                </label>
                {board.slots.length === 0 && (
                  <p className="bg-white border rounded-xl p-4 text-sm">
                    Aucun poste correspondant à vos compétences cette semaine.
                  </p>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  {board.slots.map((s) => (
                    <article
                      key={s.id}
                      className="bg-white border rounded-xl p-4 space-y-2"
                    >
                      <h3 className="font-medium">
                        {s.title} · {s.date}
                      </h3>
                      <p className="text-sm">
                        {s.start.slice(0, 5)}–{s.end.slice(0, 5)} · pause{" "}
                        {s.break_minutes} min{" "}
                        {s.required.length ? `· ${s.required.join(", ")}` : ""}
                      </p>
                      {s.assigned && (
                        <p className="text-green-700 text-sm font-medium">
                          Vous êtes affecté sur le planning publié.
                        </p>
                      )}
                      <label className="block text-sm">
                        Ma disponibilité
                        <select
                          className="w-full border rounded p-2 mt-1"
                          disabled={busy}
                          value={s.response || "unknown"}
                          onChange={(e) => void save(e.target.value, s.id)}
                        >
                          <option value="unknown">
                            Selon ma disponibilité habituelle
                          </option>
                          {Object.entries(statuses)
                            .filter(([k]) => k !== "unknown")
                            .map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="text-xs text-eb-secondary">
                        Pris en compte :{" "}
                        {statuses[s.effective] || "À confirmer"}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
