import { useEffect, useMemo, useState } from "react";

import {
  createClientTemplate,
  deleteClientTemplate,
  updateClientTemplate,
  type MissionTemplatePayload,
} from "../../api";
import type { MissionTemplate } from "../../types";
import ClientTemplateForm from "./ClientTemplateForm";

interface Props {
  token: string;
  initialTemplates: MissionTemplate[];
}

function formatMode(value: MissionTemplate["mode"]): string {
  return value === "salarie" ? "Salarie" : "Freelance";
}

function buildAddress(template: MissionTemplate): string | null {
  const parts = [
    template.establishment_address_line1,
    template.establishment_address_line2,
    [template.establishment_postal_code, template.establishment_city].filter(Boolean).join(" "),
    template.establishment_country,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

export default function ClientTemplatesSection({ token, initialTemplates }: Props) {
  const [templates, setTemplates] = useState<MissionTemplate[]>(initialTemplates);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MissionTemplate | null>(null);

  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => b.id - a.id),
    [templates]
  );

  async function handleCreate(data: MissionTemplatePayload) {
    const created = await createClientTemplate(data, token);
    setTemplates((current) => [created, ...current]);
  }

  async function handleUpdate(data: MissionTemplatePayload) {
    if (!editing) return;
    const updated = await updateClientTemplate(editing.id, data, token);
    setTemplates((current) =>
      current.map((template) => (template.id === editing.id ? updated : template))
    );
  }

  async function handleDelete() {
    if (!editing) return;
    await deleteClientTemplate(editing.id, token);
    setTemplates((current) => current.filter((template) => template.id !== editing.id));
  }

  return (
    <section className="eb-content-stagger rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Modeles de mission
          </p>
          <p className="mt-1 text-[13px] text-eb-secondary">
            Garde tes briefs, contacts et adresses prets pour tes prochaines demandes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="eb-btn-primary shrink-0 px-3 py-1.5 text-[12px]"
        >
          + Ajouter
        </button>
      </div>

      {sortedTemplates.length > 0 ? (
        <div className="eb-content-stagger space-y-3">
          {sortedTemplates.map((template) => {
            const address = buildAddress(template);
            return (
              <article key={template.id} className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold text-eb-text">{template.name}</h3>
                    <p className="mt-0.5 text-[14px] text-eb-secondary">{template.establishment}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-eb-muted">
                      Mode {formatMode(template.mode)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(template);
                      setShowForm(true);
                    }}
                    className="text-[13px] text-eb-secondary hover:text-eb-text"
                  >
                    Modifier
                  </button>
                </div>

                {(template.contact_name || template.contact_email || template.contact_phone || address) && (
                  <div className="mt-3 space-y-1 text-[13px] leading-6 text-eb-secondary">
                    {template.contact_name ? <p>Contact: {template.contact_name}</p> : null}
                    {template.contact_email ? <p>Email: {template.contact_email}</p> : null}
                    {template.contact_phone ? <p>Telephone: {template.contact_phone}</p> : null}
                    {address ? <p>Adresse: {address}</p> : null}
                  </div>
                )}

                {template.instructions ? (
                  <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                    {template.instructions}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="py-4 text-center text-[13px] text-eb-muted">
          Aucun modele enregistre pour le moment.
        </p>
      )}

      {showForm ? (
        <ClientTemplateForm
          initial={editing ?? undefined}
          onSave={editing ? handleUpdate : handleCreate}
          onDelete={editing ? handleDelete : undefined}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}
