/**
 * src/components/agenda/Agenda.tsx
 * Layer  : Frontend — composants / agenda
 * Role   : Agenda hebdomadaire (07h–24h, 7 colonnes).
 *          - Slots colorés par mission (palette déterministe par mission_id)
 *          - Drag pour créer → SlotModal (avec sélecteur de mission)
 *          - Click sur slot existant → SlotEditModal (modifier titre, horaires, mission)
 *          - Unavailabilities superposées en gris semi-transparent
 * Used by: FreelancerProfilePage
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createSlot, deleteSlot, deleteUnavailability, fetchSlots, updateSlot } from "../../api";
import { useUserContext } from "../../context/UserContext";
import { buildOccurrenceForDate } from "../../lib/unavailability";
import type { Mission, Slot, Unavailability } from "../../types";
import AgendaDayColumn from "./AgendaDayColumn";
import AgendaHeader from "./AgendaHeader";
import SlotEditModal from "./SlotEditModal";
import SlotModal from "./SlotModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgendaDisplaySlot =
  | (Slot & { type: "slot"; color: string })
  | (Unavailability & { type: "unavailability"; color: string; start: string; end: string });

interface PendingRange {
  date: string;
  start: string; // "HH:MM"
  end: string;
}

interface Props {
  slug: string;
  isOwner: boolean;
  unavailabilities: Unavailability[];
  onUnavailabilitiesChange?: Dispatch<SetStateAction<Unavailability[]>>;
  onSlotsChange?: Dispatch<SetStateAction<Slot[]>>;
  missions: Mission[];
  onPublicCellClick?: (date: string, start: string, end: string) => void;
}

// ---------------------------------------------------------------------------
// Palette de couleurs pour les missions (déterministe par id)
// ---------------------------------------------------------------------------
const MISSION_COLORS = [
  "#2563eb", // bleu
  "#7c3aed", // violet
  "#059669", // vert
  "#d97706", // ambre
  "#db2777", // rose
  "#0891b2", // cyan
  "#65a30d", // lime
  "#ea580c", // orange
];

function missionColor(missionId: number | null | undefined): string {
  if (!missionId) return "#2563eb"; // bleu par défaut (slot libre)
  return MISSION_COLORS[missionId % MISSION_COLORS.length];
}

// ---------------------------------------------------------------------------
// Helpers de date
// ---------------------------------------------------------------------------

function getMonday(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toLocalDate(date: Date): string {
  return date.toLocaleDateString("fr-CA");
}

function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const TOTAL_HOURS = 17; // 07h → 24h

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function Agenda({
  slug,
  isOwner,
  unavailabilities,
  onUnavailabilitiesChange,
  onSlotsChange,
  missions,
  onPublicCellClick,
}: Props) {
  const { user } = useUserContext();
  const todayMonday = useRef(getMonday()).current;
  const [activeWeek, setActiveWeek]   = useState<Date>(todayMonday);
  const [slots, setSlots]             = useState<Slot[]>([]);
  const [loading, setLoading]         = useState(false);
  const [pendingRange, setPendingRange] = useState<PendingRange | null>(null);
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null);
  const [creating, setCreating]       = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(activeWeek, i);
    return { name: DAY_NAMES[i], date: formatDayMonth(d), fullDate: toLocalDate(d) };
  });

  const weekLabel = `${formatDayMonth(activeWeek)} – ${formatDayMonth(addDays(activeWeek, 6))}`;
  const isCurrentWeek = activeWeek.getTime() === todayMonday.getTime();

  // --- Fetch slots ---
  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const from = toLocalDate(activeWeek);
      const to = toLocalDate(addDays(activeWeek, 7));
      const data = await fetchSlots(slug, from, to, user?.token);
      setSlots(data);
      onSlotsChange?.(data);
    } catch (err) {
      console.error("Erreur chargement créneaux :", err);
    } finally {
      setLoading(false);
    }
  }, [slug, activeWeek, user?.token, onSlotsChange]);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  // --- Slots à afficher par jour ---
  function getDaySlots(fullDate: string): AgendaDisplaySlot[] {
    const daySlots: AgendaDisplaySlot[] = slots
      .filter((s) => s.start.startsWith(fullDate))
      .map((s) => ({
        ...s,
        type: "slot" as const,
        color: missionColor(s.mission_id),
      }));

    const dayUnavail: AgendaDisplaySlot[] = unavailabilities.flatMap((u) => {
      const occurrence = buildOccurrenceForDate(u, fullDate);
      if (!occurrence) return [];
      return [{
        ...u,
        type: "unavailability" as const,
        color: "#9CA3AF",
        start: occurrence.start,
        end: occurrence.end,
      }];
    });

    return [...daySlots, ...dayUnavail];
  }

  // --- Création ---
  async function handleCreateSlot(title: string, startIso: string, endIso: string, missionId: number | null) {
    if (!user?.token || !pendingRange) return;
    setCreating(true);
    try {
      const slot = await createSlot(slug, { title, start: startIso, end: endIso, mission_id: missionId }, user.token);
      const updater = (prev: Slot[]) => [...prev, slot].sort((a, b) => a.start.localeCompare(b.start));
      setSlots(updater);
      onSlotsChange?.(updater);
      setPendingRange(null);
    } catch (err) {
      console.error("Erreur création créneau :", err);
    } finally {
      setCreating(false);
    }
  }

  // --- Édition ---
  async function handleSaveSlot(
    id: number,
    data: { title: string; start: string; end: string; mission_id: number | null }
  ) {
    if (!user?.token) return;
    const updated = await updateSlot(slug, id, data, user.token);
    const updater = (prev: Slot[]) => prev.map((s) => (s.id === id ? updated : s));
    setSlots(updater);
    onSlotsChange?.(updater);
    setEditingSlot(null);
  }

  // --- Suppression ---
  async function handleDeleteSlot(id: number) {
    if (!user?.token) return;
    await deleteSlot(slug, id, user.token);
    const updater = (prev: Slot[]) => prev.filter((s) => s.id !== id);
    setSlots(updater);
    onSlotsChange?.(updater);
    setEditingSlot(null);
  }

  async function handleDeleteAgendaItem(slot: AgendaDisplaySlot) {
    if (!isOwner || !user?.token) return;

    if (slot.type === "slot") {
      await handleDeleteSlot(slot.id);
      return;
    }

    const message = slot.recurrence_type === "weekly"
      ? "Supprimer cette indisponibilité récurrente de l'agenda ?"
      : "Supprimer cette indisponibilité de l'agenda ?";
    if (!window.confirm(message)) return;

    await deleteUnavailability(slug, slot.id, user.token);
    onUnavailabilitiesChange?.((current) => current.filter((item) => item.id !== slot.id));
  }

  // --- Click slot existant ---
  function handleSlotClick(slot: AgendaDisplaySlot) {
    if (!isOwner || slot.type !== "slot") return;
    // On retrouve le Slot complet (avec mission_id) depuis la liste
    const full = slots.find((s) => s.id === slot.id);
    if (full) setEditingSlot(full);
  }

  // --- Navigation ---
  function prevWeek() {
    const prev = addDays(activeWeek, -7);
    if (prev < todayMonday) return;
    setActiveWeek(prev);
  }
  function nextWeek() { setActiveWeek(addDays(activeWeek, 7)); }

  // Colonne heures
  const hourLabels = Array.from({ length: TOTAL_HOURS }, (_, i) => `${String(i + 7).padStart(2, "0")}h`);

  return (
    <div className="relative flex h-full flex-col bg-[#fffdf7]">
      <AgendaHeader
        weekLabel={weekLabel}
        isCurrentWeek={isCurrentWeek}
        onPrev={prevWeek}
        onNext={nextWeek}
      />

      {loading && (
        <p className="text-center text-[11px] text-eb-muted pb-2">Chargement…</p>
      )}

      {/* Légende missions */}
      {missions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 pb-2 sm:justify-start">
          {missions.filter((m) => m.status !== "refusée").map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: missionColor(m.id) }}
            >
              {m.title}
            </span>
          ))}
        </div>
      )}

      {/* Grille */}
      <div className="flex min-h-0 flex-1 overflow-x-auto rounded-eb border border-eb-layout">
        {/* Colonne heures */}
        <div className="flex w-9 shrink-0 flex-col border-r border-eb-layout sm:w-10">
          <div className="h-12 shrink-0 border-b border-eb-layout" />
          <div className="flex-1 relative">
            {hourLabels.map((label, i) => (
              <div key={i} className="absolute right-1 text-[9px] text-eb-muted"
                style={{ top: `${(i / TOTAL_HOURS) * 100}%` }}>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Colonnes jours */}
        {days.map((day) => (
          <AgendaDayColumn
            key={day.fullDate}
            day={day}
            slots={getDaySlots(day.fullDate)}
            isOwner={isOwner}
            onCreateSlot={setPendingRange}
            onDeleteSlot={handleDeleteAgendaItem}
            onSlotClick={handleSlotClick}
            onPublicClick={onPublicCellClick}
          />
        ))}
      </div>

      {/* Modal création */}
      {pendingRange && (
        <SlotModal
          date={pendingRange.date}
          start={pendingRange.start}
          end={pendingRange.end}
          missions={missions.filter((m) => m.status !== "refusée" && m.status !== "terminée")}
          onConfirm={handleCreateSlot}
          onCancel={() => setPendingRange(null)}
          saving={creating}
        />
      )}

      {/* Modal édition slot */}
      {editingSlot && (
        <SlotEditModal
          slot={editingSlot}
          missions={missions.filter((m) => m.status !== "refusée" && m.status !== "terminée")}
          onSave={handleSaveSlot}
          onDelete={handleDeleteSlot}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
