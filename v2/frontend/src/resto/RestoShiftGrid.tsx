import { useState } from "react";
import type { RestaurantMember, RestaurantShift } from "../types";
import { deleteShift, setAvailability, assignMember } from "../api";
import RestoShiftCard from "./RestoShiftCard";

interface Props {
  shifts: RestaurantShift[];
  members: RestaurantMember[];
  week: { from: string; to: string };
  isManager: boolean;
  myMemberId: number | null;
  token: string | null;
  restaurantSlug: string;
  onShiftUpdated: (shift: RestaurantShift) => void;
  onShiftDeleted: (id: number) => void;
}

function getWeekDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function RestoShiftGrid({
  shifts, members, week, isManager, myMemberId, token, restaurantSlug,
  onShiftUpdated, onShiftDeleted,
}: Props) {
  const [busy, setBusy] = useState<number | null>(null);

  const days = getWeekDays(week.from, week.to);

  async function handleSetAvailability(shiftId: number, status: "available" | "unavailable" | "maybe") {
    if (!token) return;
    setBusy(shiftId);
    try {
      const updated = await setAvailability(restaurantSlug, shiftId, status, token);
      const shift = shifts.find((s) => s.id === shiftId);
      if (!shift) return;
      const avs = shift.availabilities.filter((a) => a.id !== updated.id);
      onShiftUpdated({ ...shift, availabilities: [...avs, updated] });
    } catch { /* ignore */ } finally {
      setBusy(null);
    }
  }

  async function handleAssign(shiftId: number, memberId: number) {
    if (!token) return;
    setBusy(shiftId);
    try {
      const assignment = await assignMember(restaurantSlug, shiftId, memberId, token);
      const shift = shifts.find((s) => s.id === shiftId);
      if (!shift) return;
      onShiftUpdated({
        ...shift,
        assignments: [...shift.assignments, assignment],
        assigned_count: shift.assigned_count + 1,
      });
    } catch { /* ignore */ } finally {
      setBusy(null);
    }
  }

  async function handleDelete(shiftId: number) {
    if (!token || !window.confirm("Supprimer ce shift ?")) return;
    setBusy(shiftId);
    try {
      await deleteShift(restaurantSlug, shiftId, token);
      onShiftDeleted(shiftId);
    } catch { /* ignore */ } finally {
      setBusy(null);
    }
  }

  const shiftsByDay = Object.fromEntries(
    days.map((d) => [d, shifts.filter((s) => s.date === d)])
  );

  const hasAny = shifts.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-eb-card border border-eb-layout bg-white p-8 text-center">
        <p className="text-eb-secondary text-sm">Aucun shift cette semaine.</p>
        {isManager && (
          <p className="mt-1 text-[12px] text-eb-secondary">
            Créez des shifts avec le bouton "Nouveau shift".
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day, idx) => (
        <div key={day} className="min-w-0">
          <div className="mb-2 text-center">
            <p className="text-[11px] font-medium text-eb-secondary">{DAY_LABELS[idx]}</p>
            <p className="text-[12px] text-eb-primary">{day.slice(8)}</p>
          </div>
          <div className="flex flex-col gap-2">
            {shiftsByDay[day]?.length === 0 && (
              <div className="rounded-lg border border-dashed border-eb-layout h-12" />
            )}
            {shiftsByDay[day]?.map((shift) => (
              <RestoShiftCard
                key={shift.id}
                shift={shift}
                members={members}
                isManager={isManager}
                myMemberId={myMemberId}
                busy={busy === shift.id}
                onSetAvailability={(status) => void handleSetAvailability(shift.id, status)}
                onAssign={(memberId) => void handleAssign(shift.id, memberId)}
                onDelete={() => void handleDelete(shift.id)}
                onUpdated={onShiftUpdated}
                token={token}
                restaurantSlug={restaurantSlug}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
