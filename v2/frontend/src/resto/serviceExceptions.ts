import type { RestaurantService } from "../types";

/** Compare with the version used for this occurrence, never today's template. */
export function serviceExceptions(service: RestaurantService, templateMode: boolean) {
  const tasks = new Set<string>();
  const notes = new Set<number>();
  const slots = new Map<string, "added" | "modified">();
  const baseline = service.template_snapshot;
  // Older API responses cannot reliably identify exceptions on recurring services.
  if (templateMode || (service.template_id && !baseline)) return { tasks, notes, slots };
  for (const task of service.tasks) {
    const original = baseline?.tasks.find(t => t.key === task.key);
    if (!original || original.label !== task.label || original.phase !== task.phase) tasks.add(task.key);
  }
  const remaining = (baseline?.notes || "").split("\n").filter(Boolean);
  service.notes.split("\n").filter(Boolean).forEach((note, i) => {
    const match = remaining.indexOf(note);
    if (match < 0) notes.add(i);
    else remaining.splice(match, 1);
  });
  for (const slot of service.slots) {
    const original = baseline?.slots.find(s => s.key === slot.key);
    if (!original) slots.set(slot.key, "added");
    else if (["title", "position", "positions_needed", "start_time", "end_time", "break_minutes"]
      .some(key => slot[key as keyof typeof slot] !== original[key as keyof typeof original]) ||
      JSON.stringify([...slot.required_skills].sort()) !== JSON.stringify([...original.required_skills].sort())) slots.set(slot.key, "modified");
  }
  return { tasks, notes, slots };
}
