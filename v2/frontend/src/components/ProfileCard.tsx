/**
 * src/components/ProfileCard.tsx
 * Layer  : Frontend — composants
 * Role   : Carte de profil d'un freelance avec edition inline.
 *          Gere aussi l'upload d'avatar, son recadrage circulaire et
 *          la compression avant envoi au backend.
 * Used by: FreelancerProfilePage
 */

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { addSkill, deleteSkill, updateProfile } from "../api";
import { useUserContext } from "../context/UserContext";
import {
  getAvatarRenderMetrics,
  loadAvatarFile,
  renderAvatarUploadData,
  type LoadedAvatarImage,
} from "../lib/avatarImage";
import type { FreelancerProfile, Skill } from "../types";

interface Props {
  profile: FreelancerProfile;
  isOwner: boolean;
  onProfileUpdated?: (updated: FreelancerProfile) => void;
  noCard?: boolean;
}

interface ProfileFormState {
  display_name: string;
  job_title: string;
  location: string;
  bio: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  city: string;
  country: string;
  siret: string;
  legal_status: string;
  vat_number: string;
  vat_notice: string;
  iban: string;
  bic: string;
  hourly_rate: string;
  hourly_rate_public: boolean;
  currency: string;
  payment_terms: string;
  late_penalties: string;
  avatar_url: string;
}

const AVATAR_PREVIEW_SIZE = 112;

function buildInitialForm(profile: FreelancerProfile): ProfileFormState {
  return {
    display_name: profile.display_name,
    job_title: profile.job_title,
    location: profile.location,
    bio: profile.bio,
    phone: profile.phone,
    address_line1: profile.address_line1,
    address_line2: profile.address_line2,
    postal_code: profile.postal_code,
    city: profile.city,
    country: profile.country,
    siret: profile.siret,
    legal_status: profile.legal_status,
    vat_number: profile.vat_number,
    vat_notice: profile.vat_notice,
    iban: profile.iban,
    bic: profile.bic,
    hourly_rate: profile.hourly_rate ?? "",
    hourly_rate_public: profile.hourly_rate_public,
    currency: profile.currency,
    payment_terms: profile.payment_terms,
    late_penalties: profile.late_penalties,
    avatar_url: profile.avatar_url ?? "",
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatHourlyRate(value: string | null, currency: string): string | null {
  if (!value) return null;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}/h`;
  return `${amount.toFixed(2)} ${currency}/h`;
}

function DetailBlock({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;

  return (
    <div className="rounded-eb border border-eb-layout bg-eb-page px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-eb-muted">{label}</p>
      <p className={`mt-2 text-[14px] text-eb-text ${multiline ? "whitespace-pre-line leading-6" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-eb-muted">
        {children}
      </p>
    </div>
  );
}

export default function ProfileCard({ profile, isOwner, onProfileUpdated, noCard = false }: Props) {
  const { user, setUser } = useUserContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(buildInitialForm(profile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [skills, setSkills] = useState<Skill[]>(profile.skills);
  const [newSkill, setNewSkill] = useState("");

  const [avatarDraft, setAvatarDraft] = useState<LoadedAvatarImage | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);

  useEffect(() => {
    setSkills(profile.skills);
  }, [profile.skills]);

  function resetAvatarEditor() {
    setAvatarDraft(null);
    setAvatarZoom(1);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function startEditing() {
    setError(null);
    setForm(buildInitialForm(profile));
    resetAvatarEditor();
    setEditing(true);
  }

  function stopEditing() {
    setError(null);
    setEditing(false);
    setForm(buildInitialForm(profile));
    resetAvatarEditor();
  }

  async function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const loaded = await loadAvatarFile(file);
      setAvatarDraft(loaded);
      setAvatarZoom(1);
      setAvatarOffsetX(0);
      setAvatarOffsetY(0);
      setForm((current) => ({ ...current, avatar_url: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de preparer cette image.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSave() {
    if (!user?.token) return;

    setSaving(true);
    setError(null);

    try {
      const payload: Parameters<typeof updateProfile>[1] = {
        display_name: form.display_name.trim(),
        job_title: form.job_title.trim(),
        location: form.location.trim(),
        bio: form.bio,
        phone: form.phone.trim(),
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim(),
        postal_code: form.postal_code.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        siret: form.siret.trim(),
        legal_status: form.legal_status.trim(),
        vat_number: form.vat_number.trim(),
        vat_notice: form.vat_notice.trim(),
        iban: form.iban.trim(),
        bic: form.bic.trim(),
        hourly_rate: form.hourly_rate.trim() ? form.hourly_rate.trim() : null,
        hourly_rate_public: form.hourly_rate_public,
        currency: form.currency.trim(),
        payment_terms: form.payment_terms.trim(),
        late_penalties: form.late_penalties.trim(),
      };

      if (avatarDraft) {
        payload.avatar_upload_data = await renderAvatarUploadData(avatarDraft, {
          zoom: avatarZoom,
          offsetX: avatarOffsetX,
          offsetY: avatarOffsetY,
        });
      } else if (!form.avatar_url.trim() && profile.avatar_url) {
        payload.avatar_remove = true;
      } else if (form.avatar_url.trim() !== (profile.avatar_url ?? "").trim()) {
        payload.avatar_url = form.avatar_url.trim();
      }

      const updated = await updateProfile(profile.slug, payload, user.token);
      onProfileUpdated?.({ ...profile, ...updated, skills });
      setUser({
        ...user,
        display_name: updated.display_name,
        avatar_url: updated.avatar_url,
      });
      setEditing(false);
      resetAvatarEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer le profil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSkill(event: FormEvent) {
    event.preventDefault();
    const name = newSkill.trim();
    if (!name || !user?.token) return;
    try {
      const skill = await addSkill(profile.slug, name, user.token);
      setSkills((prev) => [...prev, skill]);
      setNewSkill("");
    } catch (err) {
      console.error("Erreur ajout competence :", err);
    }
  }

  async function handleDeleteSkill(id: number) {
    if (!user?.token) return;
    try {
      await deleteSkill(profile.slug, id, user.token);
      setSkills((prev) => prev.filter((skill) => skill.id !== id));
    } catch (err) {
      console.error("Erreur suppression competence :", err);
    }
  }

  const initial = (editing ? form.display_name : profile.display_name)?.[0]?.toUpperCase() ?? "?";
  const displayAvatarUrl = editing ? form.avatar_url.trim() || null : profile.avatar_url;
  const avatarPreviewMetrics = avatarDraft
    ? getAvatarRenderMetrics(avatarDraft, AVATAR_PREVIEW_SIZE, {
        zoom: avatarZoom,
        offsetX: avatarOffsetX,
        offsetY: avatarOffsetY,
      })
    : null;

  const ownerBusinessRate = formatHourlyRate(profile.hourly_rate, profile.currency || "EUR");
  const hasOwnerBusinessDetails = isOwner && Boolean(
    profile.siret
      || profile.legal_status
      || profile.vat_number
      || profile.vat_notice
      || profile.iban
      || profile.bic
      || ownerBusinessRate
      || profile.payment_terms
      || profile.late_penalties
  );

  const cardClass = noCard ? "p-6" : "rounded-eb-card border border-eb-layout bg-white p-6";

  return (
    <div className={cardClass}>
      <div className="flex flex-col items-center gap-5 md:flex-row md:items-start">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-eb-primary/10">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <span className="text-[28px] font-medium text-eb-primary">{initial}</span>
          )}
        </div>

        <div className="min-w-0 flex-1 self-stretch">
          {editing ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[150px,1fr]">
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-3 rounded-eb-card border border-eb-layout bg-[#F8FAFF] p-4">
                    <div className="relative h-28 w-28 overflow-hidden rounded-full bg-eb-primary/10">
                      {avatarDraft && avatarPreviewMetrics ? (
                        <img
                          src={avatarDraft.dataUrl}
                          alt="Apercu avatar"
                          className="absolute left-1/2 top-1/2 max-w-none"
                          style={{
                            width: `${avatarPreviewMetrics.renderedWidth}px`,
                            height: `${avatarPreviewMetrics.renderedHeight}px`,
                            transform: `translate(-50%, -50%) translate(${avatarPreviewMetrics.translateX}px, ${avatarPreviewMetrics.translateY}px)`,
                          }}
                        />
                      ) : displayAvatarUrl ? (
                        <img
                          src={displayAvatarUrl}
                          alt={form.display_name || profile.display_name}
                          className="h-full w-full object-cover object-center"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[34px] font-medium text-eb-primary">
                          {initial}
                        </div>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleAvatarSelection}
                      />
                      <button
                        type="button"
                        className="eb-btn-primary w-full justify-center"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {avatarDraft || displayAvatarUrl ? "Remplacer l'image" : "Choisir une image"}
                      </button>
                      {(avatarDraft || displayAvatarUrl) && (
                        <button
                          type="button"
                          className="eb-btn-ghost w-full justify-center"
                          onClick={() => {
                            resetAvatarEditor();
                            setForm((current) => ({ ...current, avatar_url: "" }));
                          }}
                        >
                          Retirer l'avatar
                        </button>
                      )}
                    </div>

                    <p className="text-center text-[12px] leading-5 text-eb-secondary">
                      JPG, PNG ou WebP. L'image sera recadree en carre puis compressee automatiquement.
                    </p>

                    {avatarDraft && (
                      <p className="text-center text-[12px] leading-5 text-eb-muted">
                        {avatarDraft.fileName} · {formatFileSize(avatarDraft.fileSize)}
                      </p>
                    )}
                  </div>

                  {avatarDraft && (
                    <div className="space-y-3 rounded-eb-card border border-eb-layout bg-white p-4">
                      <label className="block space-y-2 text-[13px] text-eb-secondary">
                        <span className="font-medium text-eb-text">Zoom</span>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="0.01"
                          value={avatarZoom}
                          onChange={(event) => setAvatarZoom(Number(event.target.value))}
                          className="w-full"
                        />
                      </label>

                      <label className="block space-y-2 text-[13px] text-eb-secondary">
                        <span className="font-medium text-eb-text">Placement horizontal</span>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={avatarOffsetX}
                          onChange={(event) => setAvatarOffsetX(Number(event.target.value))}
                          className="w-full"
                        />
                      </label>

                      <label className="block space-y-2 text-[13px] text-eb-secondary">
                        <span className="font-medium text-eb-text">Placement vertical</span>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={avatarOffsetY}
                          onChange={(event) => setAvatarOffsetY(Number(event.target.value))}
                          className="w-full"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  <SectionTitle>Identite Publique</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="eb-input md:col-span-2"
                      value={form.display_name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, display_name: event.target.value }))
                      }
                      placeholder="Nom affiche"
                    />
                    <input
                      className="eb-input"
                      value={form.job_title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, job_title: event.target.value }))
                      }
                      placeholder="Ex : Chef de rang freelance"
                    />
                    <input
                      className="eb-input"
                      value={form.location}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, location: event.target.value }))
                      }
                      placeholder="Zone / localisation visible"
                    />
                    <input
                      className="eb-input"
                      value={form.phone}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      placeholder="Telephone public"
                    />
                    <input
                      className="eb-input"
                      value={profile.email}
                      disabled
                      placeholder="Email du compte"
                    />
                    <input
                      className="eb-input md:col-span-2"
                      value={form.avatar_url}
                      onChange={(event) => {
                        resetAvatarEditor();
                        setForm((current) => ({ ...current, avatar_url: event.target.value }));
                      }}
                      placeholder="URL externe de l'avatar (optionnel)"
                    />
                    <textarea
                      className="eb-input md:col-span-2 min-h-[120px] resize-y"
                      value={form.bio}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, bio: event.target.value }))
                      }
                      placeholder="Bio..."
                    />
                  </div>

                  <SectionTitle>Coordonnees</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="eb-input md:col-span-2"
                      value={form.address_line1}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, address_line1: event.target.value }))
                      }
                      placeholder="Adresse (ligne 1)"
                    />
                    <input
                      className="eb-input md:col-span-2"
                      value={form.address_line2}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, address_line2: event.target.value }))
                      }
                      placeholder="Adresse (ligne 2)"
                    />
                    <input
                      className="eb-input"
                      value={form.postal_code}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, postal_code: event.target.value }))
                      }
                      placeholder="Code postal"
                    />
                    <input
                      className="eb-input"
                      value={form.city}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, city: event.target.value }))
                      }
                      placeholder="Ville"
                    />
                    <input
                      className="eb-input md:col-span-2"
                      value={form.country}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, country: event.target.value }))
                      }
                      placeholder="Pays"
                    />
                  </div>

                  <SectionTitle>Informations Legales</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="eb-input"
                      value={form.siret}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, siret: event.target.value }))
                      }
                      placeholder="SIRET"
                    />
                    <input
                      className="eb-input"
                      value={form.legal_status}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, legal_status: event.target.value }))
                      }
                      placeholder="Statut juridique"
                    />
                    <input
                      className="eb-input"
                      value={form.vat_number}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, vat_number: event.target.value }))
                      }
                      placeholder="TVA intracom"
                    />
                    <input
                      className="eb-input"
                      value={form.currency}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, currency: event.target.value }))
                      }
                      placeholder="Devise"
                    />
                    <textarea
                      className="eb-input md:col-span-2 min-h-[88px] resize-y"
                      value={form.vat_notice}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, vat_notice: event.target.value }))
                      }
                      placeholder="Mention TVA"
                    />
                  </div>

                  <SectionTitle>Banque Et Conditions</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className="eb-input"
                      value={form.iban}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, iban: event.target.value }))
                      }
                      placeholder="IBAN"
                    />
                    <input
                      className="eb-input"
                      value={form.bic}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, bic: event.target.value }))
                      }
                      placeholder="BIC"
                    />
                    <div className="space-y-2">
                      <input
                        type="number"
                        step="0.01"
                        className="eb-input"
                        value={form.hourly_rate}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, hourly_rate: event.target.value }))
                        }
                        placeholder="Taux horaire (€/h)"
                      />
                      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-eb-secondary select-none">
                        <input
                          type="checkbox"
                          checked={form.hourly_rate_public}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, hourly_rate_public: event.target.checked }))
                          }
                          className="h-4 w-4 rounded accent-eb-primary"
                        />
                        Afficher mon taux horaire sur mon profil public
                      </label>
                    </div>
                    <div className="rounded-eb border border-eb-layout bg-[#F8FAFF] px-4 py-3 text-[13px] leading-6 text-eb-secondary">
                      Ces informations restent privees et servent de base pour ton profil entreprise.
                    </div>
                    <textarea
                      className="eb-input md:col-span-2 min-h-[88px] resize-y"
                      value={form.payment_terms}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, payment_terms: event.target.value }))
                      }
                      placeholder="Conditions de paiement"
                    />
                    <textarea
                      className="eb-input md:col-span-2 min-h-[88px] resize-y"
                      value={form.late_penalties}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, late_penalties: event.target.value }))
                      }
                      placeholder="Penalites de retard"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-[13px] leading-5 text-eb-google">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" className="eb-btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button type="button" className="eb-btn-ghost" onClick={stopEditing} disabled={saving}>
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-center md:text-left">
                <div className="flex flex-col items-center justify-between gap-3 md:flex-row md:items-center">
                  <h1 className="text-[22px] font-semibold leading-tight text-eb-text md:truncate">
                    {profile.display_name || "-"}
                  </h1>
                  {isOwner && (
                    <button type="button" className="eb-btn-ghost shrink-0" onClick={startEditing}>
                      Modifier
                    </button>
                  )}
                </div>
                {profile.job_title && (
                  <p className="mt-0.5 text-[14px] text-eb-secondary">{profile.job_title}</p>
                )}
                {profile.location && <p className="text-[13px] text-eb-muted">{profile.location}</p>}
                {profile.bio && (
                  <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                    {profile.bio}
                  </p>
                )}
              </div>

              {hasOwnerBusinessDetails && (
                <div className="space-y-3">
                  <SectionTitle>Informations Entreprise</SectionTitle>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <DetailBlock label="SIRET" value={profile.siret} />
                    <DetailBlock label="Statut juridique" value={profile.legal_status} />
                    <DetailBlock label="TVA intracom" value={profile.vat_number} />
                    <DetailBlock label="Mention TVA" value={profile.vat_notice} multiline />
                    <DetailBlock label="IBAN" value={profile.iban} />
                    <DetailBlock label="BIC" value={profile.bic} />
                    <DetailBlock label="Taux horaire" value={ownerBusinessRate} />
                    <DetailBlock label="Conditions de paiement" value={profile.payment_terms} multiline />
                    <DetailBlock label="Penalites de retard" value={profile.late_penalties} multiline />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(skills.length > 0 || isOwner) && (
        <div className="mt-5 space-y-3">
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill.id} className="eb-chip">
                  {skill.name}
                  {isOwner && (
                    <button
                      type="button"
                      className="ml-1.5 opacity-50 transition-opacity hover:text-eb-google hover:opacity-100"
                      onClick={() => handleDeleteSkill(skill.id)}
                      aria-label={`Supprimer ${skill.name}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {isOwner && (
            <form onSubmit={handleAddSkill} className="flex gap-2">
              <input
                className="eb-input flex-1"
                value={newSkill}
                onChange={(event) => setNewSkill(event.target.value)}
                placeholder="Ajouter une competence..."
              />
              <button
                type="submit"
                className="eb-btn-primary px-3"
                disabled={!newSkill.trim()}
              >
                +
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
