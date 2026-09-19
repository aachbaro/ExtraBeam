import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { createClientContact, deleteClientContact } from "../../api";
import type { ClientContact } from "../../types";

interface Props {
  token: string;
  initialContacts: ClientContact[];
}

function buildAddress(contact: ClientContact): string | null {
  const parts = [
    contact.profile.address_line1,
    contact.profile.address_line2,
    [contact.profile.postal_code, contact.profile.city].filter(Boolean).join(" "),
    contact.profile.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function ClientContactsSection({ token, initialContacts }: Props) {
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [profileSlug, setProfileSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContacts(initialContacts);
  }, [initialContacts]);

  async function handleAddContact(event: React.FormEvent) {
    event.preventDefault();
    if (!profileSlug.trim()) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createClientContact(profileSlug.trim(), token);
      setContacts((current) => {
        const existing = current.find((contact) => contact.id === created.id);
        if (existing) {
          return current;
        }
        return [created, ...current];
      });
      setProfileSlug("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter ce contact.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(contactId: number) {
    if (!window.confirm("Supprimer ce contact ?")) return;
    await deleteClientContact(contactId, token);
    setContacts((current) => current.filter((contact) => contact.id !== contactId));
  }

  return (
    <section className="rounded-eb-card border border-eb-layout bg-white p-4">
      <div className="mb-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
          Contacts
        </p>
        <p className="mt-1 text-[13px] text-eb-secondary">
          Enregistre les profils freelance que tu veux retrouver vite.
        </p>
      </div>

      {contacts.length > 0 ? (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const address = buildAddress(contact);
            return (
              <article key={contact.id} className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-semibold text-eb-text">
                        {contact.profile.display_name}
                      </h3>
                      <Link
                        to={`/extras/${contact.profile.slug}`}
                        className="text-[12px] font-medium text-eb-primary hover:underline"
                      >
                        Voir le profil
                      </Link>
                    </div>
                    {contact.profile.job_title ? (
                      <p className="mt-0.5 text-[14px] text-eb-secondary">
                        {contact.profile.job_title}
                      </p>
                    ) : null}
                    {contact.profile.location ? (
                      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-eb-muted">
                        {contact.profile.location}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(contact.id)}
                    className="text-[13px] text-eb-google hover:underline"
                  >
                    Supprimer
                  </button>
                </div>

                <div className="mt-3 space-y-1 text-[13px] leading-6 text-eb-secondary">
                  <p>{contact.profile.email}</p>
                  {contact.profile.phone ? <p>{contact.profile.phone}</p> : null}
                  {address ? <p>{address}</p> : null}
                </div>

                {contact.profile.bio ? (
                  <p className="mt-3 line-clamp-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                    {contact.profile.bio}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Aucun contact enregistre pour le moment.
        </p>
      )}

      <form onSubmit={(event) => void handleAddContact(event)} className="mt-4 rounded-eb border border-eb-layout bg-eb-page p-4">
        <label className="mb-2 block text-[13px] font-medium text-eb-text">
          Ajouter un profil freelance par son slug
        </label>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            className="eb-input flex-1"
            value={profileSlug}
            onChange={(event) => setProfileSlug(event.target.value)}
            placeholder="ex: chef-de-rang-lille"
          />
          <button type="submit" disabled={saving} className="eb-btn-primary shrink-0">
            {saving ? "Ajout..." : "Ajouter"}
          </button>
        </div>
        {error ? <p className="mt-2 text-[13px] text-eb-google">{error}</p> : null}
      </form>
    </section>
  );
}
