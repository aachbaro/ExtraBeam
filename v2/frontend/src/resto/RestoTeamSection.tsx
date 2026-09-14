import { useState } from "react";
import type { RestaurantMember } from "../types";
import { addMember, removeMember, updateMember } from "../api";

const POSITIONS = [
  { value: "serveur", label: "Serveur·se" },
  { value: "chef_de_rang", label: "Chef de rang" },
  { value: "barman", label: "Barman / Barmaid" },
  { value: "sommelier", label: "Sommelier·e" },
  { value: "hote_accueil", label: "Hôte·sse d'accueil" },
  { value: "chef_cuisine", label: "Chef de cuisine" },
  { value: "cuisinier", label: "Cuisinier·e" },
  { value: "plongeur", label: "Plongeur·se" },
  { value: "manager", label: "Manager" },
  { value: "autre", label: "Autre" },
];

const POSITION_LABELS = Object.fromEntries(POSITIONS.map((p) => [p.value, p.label]));

interface Props {
  restaurantSlug: string;
  members: RestaurantMember[];
  isManager: boolean;
  token: string | null;
  onMembersChanged: (members: RestaurantMember[]) => void;
}

interface AddForm {
  name: string;
  position: string;
  email: string;
  is_manager: boolean;
  extra_slug: string;
}

export default function RestoTeamSection({
  restaurantSlug, members, isManager, token, onMembersChanged,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({
    name: "", position: "serveur", email: "", is_manager: false, extra_slug: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAdd(field: keyof AddForm, value: string | boolean) {
    setAddForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Parameters<typeof addMember>[1] = {
        name: addForm.name.trim(),
        position: addForm.position,
        is_manager: addForm.is_manager,
      };
      if (addForm.email.trim()) payload.email = addForm.email.trim();
      if (addForm.extra_slug.trim()) payload.extra_slug = addForm.extra_slug.trim();
      const member = await addMember(restaurantSlug, payload, token);
      onMembersChanged([...members, member]);
      setShowAdd(false);
      setAddForm({ name: "", position: "serveur", email: "", is_manager: false, extra_slug: "" });
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(member: RestaurantMember) {
    if (!token) return;
    try {
      const updated = await updateMember(restaurantSlug, member.id, { is_active: !member.is_active }, token);
      onMembersChanged(members.map((m) => (m.id === updated.id ? updated : m)));
    } catch { /* ignore */ }
  }

  async function handleToggleManager(member: RestaurantMember) {
    if (!token) return;
    try {
      const updated = await updateMember(restaurantSlug, member.id, { is_manager: !member.is_manager }, token);
      onMembersChanged(members.map((m) => (m.id === updated.id ? updated : m)));
    } catch { /* ignore */ }
  }

  async function handleRemove(member: RestaurantMember) {
    if (!token || !window.confirm(`Retirer ${member.name} de l'équipe ?`)) return;
    try {
      await removeMember(restaurantSlug, member.id, token);
      onMembersChanged(members.filter((m) => m.id !== member.id));
    } catch { /* ignore */ }
  }

  const active = members.filter((m) => m.is_active);
  const inactive = members.filter((m) => !m.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-eb-primary">
          Équipe ({active.length} actif{active.length !== 1 ? "s" : ""})
        </h2>
        {isManager && (
          <button
            type="button"
            onClick={() => setShowAdd((o) => !o)}
            className="rounded-lg bg-eb-primary px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity"
          >
            {showAdd ? "Annuler" : "+ Ajouter"}
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && isManager && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="rounded-eb-card border border-eb-layout bg-white p-4 space-y-3"
        >
          <h3 className="text-[13px] font-medium text-eb-primary">Nouveau membre</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-eb-secondary mb-1">Nom *</label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAdd("name", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
            <div>
              <label className="block text-[12px] text-eb-secondary mb-1">Poste</label>
              <select
                value={addForm.position}
                onChange={(e) => setAdd("position", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-eb-secondary mb-1">Email (opt.)</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAdd("email", e.target.value)}
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
            <div>
              <label className="block text-[12px] text-eb-secondary mb-1">Slug Rivebelle (opt.)</label>
              <input
                type="text"
                value={addForm.extra_slug}
                onChange={(e) => setAdd("extra_slug", e.target.value)}
                placeholder="ex : marie-dupont"
                className="w-full rounded-lg border border-eb-layout px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-eb-primary/30"
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-eb-secondary select-none">
            <input
              type="checkbox"
              checked={addForm.is_manager}
              onChange={(e) => setAdd("is_manager", e.target.checked)}
              className="h-4 w-4 rounded accent-eb-primary"
            />
            Responsable (manager)
          </label>
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded-lg border border-eb-layout py-2 text-sm text-eb-secondary hover:bg-eb-page transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-eb-primary py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {busy ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      )}

      {/* Active members */}
      <div className="rounded-eb-card border border-eb-layout bg-white divide-y divide-eb-layout">
        {active.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-eb-secondary">Aucun membre actif.</p>
        ) : (
          active.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isManager={isManager}
              positionLabel={POSITION_LABELS[member.position] ?? member.position}
              onToggleActive={() => void handleToggleActive(member)}
              onToggleManager={() => void handleToggleManager(member)}
              onRemove={() => void handleRemove(member)}
            />
          ))
        )}
      </div>

      {/* Inactive members */}
      {inactive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[12px] text-eb-secondary hover:text-eb-primary py-2">
            {inactive.length} membre{inactive.length !== 1 ? "s" : ""} inactif{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 rounded-eb-card border border-eb-layout bg-white divide-y divide-eb-layout opacity-60">
            {inactive.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isManager={isManager}
                positionLabel={POSITION_LABELS[member.position] ?? member.position}
                onToggleActive={() => void handleToggleActive(member)}
                onToggleManager={() => void handleToggleManager(member)}
                onRemove={() => void handleRemove(member)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MemberRow({
  member, isManager, positionLabel,
  onToggleActive, onToggleManager, onRemove,
}: {
  member: RestaurantMember;
  isManager: boolean;
  positionLabel: string;
  onToggleActive: () => void;
  onToggleManager: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-eb-layout flex items-center justify-center text-[13px] font-medium text-eb-secondary">
          {member.name.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-eb-primary truncate">{member.name}</p>
        <p className="text-[11px] text-eb-secondary">{positionLabel}</p>
      </div>
      {member.is_manager && (
        <span className="rounded-full bg-eb-primary/10 px-2 py-0.5 text-[10px] font-medium text-eb-primary">
          Manager
        </span>
      )}
      {member.extra_slug && (
        <a
          href={`/extras/${member.extra_slug}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-eb-secondary hover:text-eb-primary underline"
        >
          Profil
        </a>
      )}
      {isManager && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggleActive}
            title={member.is_active ? "Désactiver" : "Réactiver"}
            className="rounded px-2 py-1 text-[10px] text-eb-secondary hover:bg-eb-layout transition-colors"
          >
            {member.is_active ? "Désact." : "Réact."}
          </button>
          <button
            type="button"
            onClick={onToggleManager}
            title={member.is_manager ? "Retirer le rôle manager" : "Passer manager"}
            className="rounded px-2 py-1 text-[10px] text-eb-secondary hover:bg-eb-layout transition-colors"
          >
            {member.is_manager ? "Retirer mgr" : "→ Mgr"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 transition-colors"
          >
            Retirer
          </button>
        </div>
      )}
    </div>
  );
}
