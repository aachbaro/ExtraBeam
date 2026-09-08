import { useState } from "react";
import type { RestaurantMember, RestaurantShift, AvailabilityStatus } from "../types";
import { updateShift, updateAssignment, removeAssignment } from "../api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
};

const AV_COLORS: Record<string, string> = {
  available: "bg-green-500",
  unavailable: "bg-red-400",
  maybe: "bg-amber-400",
};

const AV_LABELS: Record<string, string> = {
  available: "Dispo",
  unavailable: "Indispo",
  maybe: "Peut-être",
};

interface Props {
  shift: RestaurantShift;
  members: RestaurantMember[];
  isManager: boolean;
  myMemberId: number | null;
  busy: boolean;
  token: string | null;
  restaurantSlug: string;
  onSetAvailability: (status: AvailabilityStatus) => void;
  onAssign: (memberId: number) => void;
  onDelete: () => void;
  onUpdated: (shift: RestaurantShift) => void;
}

export default function RestoShiftCard({
  shift, members, isManager, myMemberId, busy, token, restaurantSlug,
  onSetAvailability, onAssign, onDelete, onUpdated,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);

  const myAv = myMemberId
    ? shift.availabilities.find((a) => a.member_id === myMemberId)
    : null;

  const assignedCount = shift.assignments.filter((a) => a.status !== "declined").length;
  const isFull = assignedCount >= shift.positions_needed;

  async function handlePublish() {
    if (!token) return;
    try {
      const updated = await updateShift(restaurantSlug, shift.id, { status: "published" }, token);
      onUpdated(updated);
    } catch { /* ignore */ }
  }

  async function handleRemoveAssignment(assignmentId: number) {
    if (!token) return;
    try {
      await removeAssignment(restaurantSlug, shift.id, assignmentId, token);
      onUpdated({
        ...shift,
        assignments: shift.assignments.filter((a) => a.id !== assignmentId),
        assigned_count: Math.max(0, shift.assigned_count - 1),
      });
    } catch { /* ignore */ }
  }

  async function handleMemberResponse(assignmentId: number, status: "confirmed" | "declined") {
    if (!token) return;
    try {
      const updated = await updateAssignment(restaurantSlug, shift.id, assignmentId, status, token);
      onUpdated({
        ...shift,
        assignments: shift.assignments.map((a) => (a.id === assignmentId ? updated : a)),
      });
    } catch { /* ignore */ }
  }

  const unassignedMembers = members.filter(
    (m) => m.is_active && !shift.assignments.some((a) => a.member_id === m.id && a.status !== "declined")
  );

  return (
    <div
      className={`rounded-lg border border-eb-layout bg-white overflow-hidden transition-shadow ${busy ? "opacity-60" : ""}`}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="w-full p-2 text-left hover:bg-eb-page transition-colors"
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-eb-primary truncate">
              {shift.title || shift.position}
            </p>
            <p className="text-[10px] text-eb-secondary">
              {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
            </p>
          </div>
          <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${STATUS_COLORS[shift.status]}`}>
            {shift.status === "published" ? "Pub." : "Brouill."}
          </span>
        </div>

        {/* Availability dots */}
        {shift.availabilities.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {shift.availabilities.map((av) => (
              <span
                key={av.id}
                title={`${av.member_name} : ${AV_LABELS[av.status]}`}
                className={`h-2 w-2 rounded-full ${AV_COLORS[av.status]}`}
              />
            ))}
          </div>
        )}

        {/* Fill indicator */}
        <div className="mt-1.5 flex items-center gap-1">
          <div className="h-1 flex-1 rounded-full bg-eb-layout overflow-hidden">
            <div
              className={`h-1 rounded-full transition-all ${isFull ? "bg-green-500" : "bg-eb-primary"}`}
              style={{ width: `${Math.min(100, (assignedCount / shift.positions_needed) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-eb-secondary">{assignedCount}/{shift.positions_needed}</span>
        </div>
      </button>

      {/* Expanded detail */}
      <div style={{ maxHeight: expanded ? "999px" : "0", overflow: "hidden", transition: "max-height 0.3s ease" }}>
        <div className="border-t border-eb-layout p-2 space-y-2">

          {/* My availability (non-manager member) */}
          {myMemberId && !isManager && (
            <div>
              <p className="text-[10px] font-medium text-eb-secondary mb-1">Ma dispo</p>
              <div className="flex gap-1">
                {(["available", "maybe", "unavailable"] as AvailabilityStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => onSetAvailability(s)}
                    className={`flex-1 rounded py-1 text-[10px] font-medium transition-colors ${
                      myAv?.status === s
                        ? s === "available" ? "bg-green-500 text-white"
                          : s === "unavailable" ? "bg-red-400 text-white"
                          : "bg-amber-400 text-white"
                        : "bg-eb-page text-eb-secondary hover:bg-eb-layout"
                    }`}
                  >
                    {AV_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Assignments */}
          {shift.assignments.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-eb-secondary mb-1">Assignés</p>
              <div className="space-y-1">
                {shift.assignments.map((a) => {
                  const isMe = a.member_id === myMemberId;
                  return (
                    <div key={a.id} className="flex items-center gap-1">
                      {a.avatar_url ? (
                        <img src={a.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-eb-layout flex items-center justify-center text-[8px] text-eb-secondary">
                          {a.member_name.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 text-[10px] text-eb-primary truncate">{a.member_name}</span>
                      <span className={`text-[9px] rounded px-1 ${
                        a.status === "confirmed" ? "bg-green-100 text-green-700"
                          : a.status === "declined" ? "bg-red-100 text-red-600"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {a.status === "confirmed" ? "✓" : a.status === "declined" ? "✗" : "?"}
                      </span>
                      {isMe && a.status === "proposed" && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleMemberResponse(a.id, "confirmed")}
                            className="text-[10px] rounded bg-green-500 text-white px-1"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMemberResponse(a.id, "declined")}
                            className="text-[10px] rounded bg-red-400 text-white px-1"
                          >
                            Non
                          </button>
                        </>
                      )}
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveAssignment(a.id)}
                          className="text-[10px] text-eb-secondary hover:text-red-500"
                          title="Retirer"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manager actions */}
          {isManager && (
            <div className="flex flex-wrap gap-1 pt-1 border-t border-eb-layout">
              {/* Assign member */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAssignMenuOpen((o) => !o)}
                  disabled={isFull || unassignedMembers.length === 0}
                  className="rounded bg-eb-page px-2 py-1 text-[10px] text-eb-secondary hover:bg-eb-layout disabled:opacity-40 transition-colors"
                >
                  + Assigner
                </button>
                {assignMenuOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 w-40 rounded-lg border border-eb-layout bg-white shadow-lg">
                    {unassignedMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { onAssign(m.id); setAssignMenuOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-[11px] hover:bg-eb-page text-left"
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-eb-layout flex items-center justify-center text-[9px]">
                            {m.name.charAt(0)}
                          </div>
                        )}
                        <span className="truncate">{m.name}</span>
                      </button>
                    ))}
                    {unassignedMembers.length === 0 && (
                      <p className="px-3 py-2 text-[11px] text-eb-secondary">Aucun membre dispo</p>
                    )}
                  </div>
                )}
              </div>

              {shift.status === "draft" && (
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  className="rounded bg-green-500 px-2 py-1 text-[10px] text-white hover:bg-green-600 transition-colors"
                >
                  Publier
                </button>
              )}

              <button
                type="button"
                onClick={onDelete}
                className="rounded bg-eb-page px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 transition-colors"
              >
                Suppr.
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
