import { useEffect, useState } from "react";
import { fetchRestaurantSkills, createRestaurantSkill } from "../api";
import type { RestaurantMember } from "../types";
export default function SkillsPicker({
  slug,
  token,
  value,
  onChange,
  members,
  onCreated,
  onBusy,
}: {
  slug: string;
  token: string;
  value: string[];
  onChange: (value: string[]) => void;
  members: RestaurantMember[];
  onCreated?: () => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [chosen, setChosen] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRestaurantSkills(slug, token)
        .then((r) => {
          if (alive) setCatalog(r);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    };
    load();
    window.addEventListener("resto-skills-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("resto-skills-changed", load);
    };
  }, [slug, token]);
  const matches = catalog.filter(
    (s) =>
      s.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      !value.includes(s),
  );
  const exact = catalog.find(
    (s) => s.toLocaleLowerCase() === query.trim().toLocaleLowerCase(),
  );
  function add(name: string) {
    onChange([...new Set([...value, name])]);
    setQuery("");
    setCreating(false);
  }
  function confirm() {
    if (exact) add(exact);
    else if (query.trim()) setCreating(true);
  }
  async function create() {
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const result = await createRestaurantSkill(
        slug,
        query.trim(),
        chosen,
        token,
      );
      add(result.name);
      setChosen([]);
      window.dispatchEvent(new Event("resto-skills-changed"));
      onCreated?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((name) => (
          <span
            key={name}
            className="rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm"
          >
            {name}
            <button
              type="button"
              className="ml-2"
              aria-label={`Retirer ${name}`}
              onClick={() => onChange(value.filter((v) => v !== name))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          aria-label="Rechercher une compétence"
          maxLength={40}
          placeholder="Choisir ou créer une compétence"
          className="border rounded-lg p-2 text-sm min-w-0 flex-1"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCreating(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              confirm();
            }
          }}
        />
        {query.trim() && (
          <button
            type="button"
            className="border rounded px-2 text-sm"
            onClick={confirm}
          >
            {exact ? "Ajouter" : "Créer"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {matches.slice(0, 12).map((name) => (
          <button
            key={name}
            type="button"
            className="border rounded-full px-3 py-1 text-xs hover:bg-blue-50"
            onClick={() => add(name)}
          >
            + {name}
          </button>
        ))}
      </div>
      {creating && (
        <div className="border rounded-lg bg-blue-50/50 p-3 space-y-2">
          <p className="text-sm font-medium">
            Qui possède la compétence « {query.trim()} » ?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {members
              .filter((m) => m.is_active)
              .map((m) => (
                <label key={m.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(m.id)}
                    onChange={(e) =>
                      setChosen(
                        e.target.checked
                          ? [...chosen, m.id]
                          : chosen.filter((id) => id !== m.id),
                      )
                    }
                  />
                  {m.name}
                </label>
              ))}
          </div>
          <button
            type="button"
            disabled={busy || !chosen.length}
            className="border rounded bg-white px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => void create()}
          >
            {busy ? "Enregistrement…" : "Créer la compétence et attribuer"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
