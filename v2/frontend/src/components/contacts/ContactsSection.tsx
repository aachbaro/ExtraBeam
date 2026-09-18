/**
 * ContactsSection
 * Composant partagé : liste de contacts mutuels + recherche + ajout.
 * Utilisé dans FreelancerProfilePage (onglet Contacts) et ClientDashboardPage.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { addContact, fetchContacts, removeContact, searchProfiles } from "../../api";
import type { ContactProfile, ProfileContact } from "../../types";

const ROLE_LABELS: Record<string, string> = {
  freelance: "Extra",
  client: "Restaurateur",
  admin: "Admin",
};

function Avatar({ profile, size = 40 }: { profile: ContactProfile; size?: number }) {
  const initials = (profile.display_name || "?").trim().charAt(0).toUpperCase();
  return profile.avatar_url ? (
    <img
      src={profile.avatar_url}
      alt={profile.display_name}
      style={{ width: size, height: size }}
      className="rounded-full object-cover shrink-0"
    />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-eb-primary/10 flex items-center justify-center shrink-0"
    >
      <span className="text-[14px] font-semibold text-eb-primary">{initials}</span>
    </div>
  );
}

function ContactCard({
  contact,
  onRemove,
}: {
  contact: ProfileContact;
  onRemove: (slug: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const p = contact.profile;

  return (
    <article className="flex items-center gap-4 px-5 py-4 hover:bg-eb-page/60 transition-colors">
      <Avatar profile={p} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/extras/${p.slug}`}
            className="text-[14px] font-semibold text-eb-text hover:text-eb-primary transition-colors"
          >
            {p.display_name}
          </Link>
          <span className="text-[10px] bg-eb-page border border-eb-layout rounded-full px-2 py-0.5 text-eb-muted font-medium">
            {ROLE_LABELS[p.role] ?? p.role}
          </span>
        </div>
        {p.job_title && (
          <p className="mt-0.5 text-[12px] text-eb-secondary truncate">{p.job_title}</p>
        )}
        {p.location && (
          <p className="text-[11px] text-eb-muted">{p.location}</p>
        )}
      </div>
      <div className="shrink-0">
        {confirming ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onRemove(p.slug); setConfirming(false); }}
              className="text-[12px] text-red-600 hover:underline"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[12px] text-eb-muted hover:text-eb-text"
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[12px] text-eb-muted hover:text-eb-text transition-colors"
          >
            Retirer
          </button>
        )}
      </div>
    </article>
  );
}

function SearchResultCard({
  profile,
  isContact,
  onAdd,
  adding,
}: {
  profile: ContactProfile;
  isContact: boolean;
  onAdd: (slug: string) => void;
  adding: boolean;
}) {
  return (
    <article className="flex items-center gap-3 px-4 py-3 hover:bg-eb-page/60 transition-colors">
      <Avatar profile={profile} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-eb-text truncate">{profile.display_name}</p>
        <p className="text-[11px] text-eb-muted truncate">
          {ROLE_LABELS[profile.role] ?? profile.role}
          {profile.job_title ? ` · ${profile.job_title}` : ""}
          {profile.location ? ` · ${profile.location}` : ""}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <Link to={`/extras/${profile.slug}`} className="text-[11px] text-eb-secondary hover:text-eb-text">
          Profil
        </Link>
        {isContact ? (
          <span className="text-[11px] text-eb-primary font-medium">Contact ✓</span>
        ) : (
          <button
            type="button"
            disabled={adding}
            onClick={() => onAdd(profile.slug)}
            className="rounded-eb bg-eb-primary px-3 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {adding ? "…" : "Ajouter"}
          </button>
        )}
      </div>
    </article>
  );
}

interface Props {
  token: string;
}

export default function ContactsSection({ token }: Props) {
  const [contacts, setContacts] = useState<ProfileContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContactProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  const [adding, setAdding] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchContacts(token)
      .then(setContacts)
      .catch(() => undefined)
      .finally(() => setLoadingContacts(false));
  }, [token]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setSearchActive(false);
      return;
    }
    setSearchActive(true);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchProfiles(value.trim(), token);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  async function handleAdd(slug: string) {
    setAdding((s) => new Set(s).add(slug));
    try {
      const contact = await addContact(slug, token);
      setContacts((prev) => {
        if (prev.find((c) => c.link_id === contact.link_id)) return prev;
        return [contact, ...prev];
      });
    } catch {
      // silent
    } finally {
      setAdding((s) => { const n = new Set(s); n.delete(slug); return n; });
    }
  }

  async function handleRemove(slug: string) {
    try {
      await removeContact(slug, token);
      setContacts((prev) => prev.filter((c) => c.profile.slug !== slug));
    } catch {
      // silent
    }
  }

  const contactSlugs = new Set(contacts.map((c) => c.profile.slug));

  return (
    <div className="space-y-4 max-w-[860px]">
      {/* Header + recherche */}
      <section className="rounded-eb-card border border-eb-layout bg-white p-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">Contacts</p>
        <h2 className="mt-2 text-[22px] font-semibold text-eb-text">Mes contacts</h2>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Extras et restaurateurs que tu veux retrouver rapidement.
        </p>

        <div className="mt-4 relative">
          <input
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => query.trim() && setSearchActive(true)}
            onBlur={() => setTimeout(() => setSearchActive(false), 200)}
            placeholder="Rechercher par nom, poste, ville…"
            className="eb-input w-full pr-10"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-eb-muted">…</span>
          )}
        </div>

        {/* Résultats de recherche */}
        {searchActive && (
          <div className="mt-2 rounded-eb border border-eb-layout bg-white shadow-sm overflow-hidden divide-y divide-eb-layout">
            {searchResults.length === 0 && !searching ? (
              <p className="px-4 py-3 text-[13px] text-eb-muted">
                {query.trim().length < 2 ? "Tape au moins 2 caractères…" : "Aucun résultat."}
              </p>
            ) : (
              searchResults.map((p) => (
                <SearchResultCard
                  key={p.slug}
                  profile={p}
                  isContact={contactSlugs.has(p.slug)}
                  onAdd={handleAdd}
                  adding={adding.has(p.slug)}
                />
              ))
            )}
          </div>
        )}
      </section>

      {/* Liste des contacts */}
      <section className="rounded-eb-card border border-eb-layout bg-white overflow-hidden">
        {loadingContacts ? (
          <p className="px-6 py-8 text-center text-[13px] text-eb-muted">Chargement…</p>
        ) : contacts.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[14px] font-medium text-eb-text">Aucun contact pour le moment</p>
            <p className="mt-1 text-[12px] text-eb-muted">
              Recherche un profil ci-dessus ou clique "Ajouter aux contacts" sur un profil.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-eb-layout">
            {contacts.map((c) => (
              <ContactCard key={c.link_id} contact={c} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
