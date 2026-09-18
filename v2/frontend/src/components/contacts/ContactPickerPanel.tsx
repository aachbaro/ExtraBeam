/**
 * ContactPickerPanel
 * Panneau latéral compact pour choisir un extra depuis ses contacts.
 * Utilisé depuis le planning restaurant pour pré-remplir une proposition de mission.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchContacts } from "../../api";
import type { ProfileContact } from "../../types";

interface Props {
  token: string;
  /** Date de la semaine courante (YYYY-MM-DD) pour pré-remplir la proposition */
  currentWeekStart?: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  freelance: "Extra",
  client: "Restaurateur",
  admin: "Admin",
};

export default function ContactPickerPanel({ token, currentWeekStart, onClose }: Props) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<ProfileContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchContacts(token)
      .then(setContacts)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  const extras = contacts.filter(
    (c) =>
      c.profile.role === "freelance" &&
      (!query ||
        c.profile.display_name.toLowerCase().includes(query.toLowerCase()) ||
        (c.profile.job_title ?? "").toLowerCase().includes(query.toLowerCase()))
  );

  function handleSelect(slug: string) {
    const params = new URLSearchParams();
    if (currentWeekStart) params.set("propose_date", currentWeekStart);
    navigate(`/extras/${slug}?${params.toString()}`);
    onClose();
  }

  return (
    <div className="rounded-eb-card border border-eb-layout bg-white shadow-sm overflow-hidden w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-eb-layout">
        <p className="text-[13px] font-semibold text-eb-text">Réserver un extra</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[16px] text-eb-muted hover:text-eb-text transition-colors leading-none"
        >
          ×
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-eb-layout">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom ou poste…"
          className="eb-input w-full text-[12px]"
          autoFocus
        />
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-72 divide-y divide-eb-layout">
        {loading ? (
          <p className="px-4 py-6 text-center text-[12px] text-eb-muted">Chargement…</p>
        ) : extras.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[12px] text-eb-muted">
              {contacts.filter((c) => c.profile.role === "freelance").length === 0
                ? "Aucun extra dans vos contacts. Ajoutez-en depuis un profil."
                : "Aucun résultat pour cette recherche."}
            </p>
          </div>
        ) : (
          extras.map((c) => {
            const p = c.profile;
            const initials = (p.display_name || "?").trim().charAt(0).toUpperCase();
            return (
              <button
                key={c.link_id}
                type="button"
                onClick={() => handleSelect(p.slug)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-eb-page transition-colors"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-eb-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[12px] font-semibold text-eb-primary">{initials}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-eb-text truncate">{p.display_name}</p>
                  <p className="text-[11px] text-eb-muted truncate">
                    {ROLE_LABELS[p.role] ?? p.role}
                    {p.job_title ? ` · ${p.job_title}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-eb-primary ml-auto">Proposer →</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
