import { useEffect, useMemo, useState } from "react";

import {
  addExperience,
  deleteExperience,
  updateExperience,
  type ExperiencePayload,
} from "../../api";
import type { Experience } from "../../types";
import ExperienceForm from "./ExperienceForm";

interface Props {
  slug: string;
  isOwner: boolean;
  token?: string | null;
  initialExperiences: Experience[];
  noCard?: boolean;
}

function formatMonth(date: string | null): string | null {
  if (!date) return null;
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function formatPeriod(experience: Experience): string {
  const start = formatMonth(experience.start_date);
  const end = experience.is_current ? "Aujourd'hui" : formatMonth(experience.end_date);
  if (start && end) return `${start} – ${end}`;
  return start || end || "Période non renseignée";
}

export default function ExperiencesSection({
  slug,
  isOwner,
  token,
  initialExperiences,
  noCard = false,
}: Props) {
  const [experiences, setExperiences] = useState<Experience[]>(initialExperiences);
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Experience | null>(null);

  useEffect(() => {
    setExperiences(initialExperiences);
  }, [initialExperiences]);

  const sortedExperiences = useMemo(() => {
    return [...experiences].sort((a, b) => {
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
      const aDate = a.start_date ?? "";
      const bDate = b.start_date ?? "";
      const periodOrder = bDate.localeCompare(aDate);
      if (periodOrder !== 0) return periodOrder;
      return b.id - a.id;
    });
  }, [experiences]);

  const canToggle = sortedExperiences.length > 0;

  async function handleCreate(data: ExperiencePayload) {
    if (!token) return;
    const created = await addExperience(slug, data, token);
    setExperiences((current) => [created, ...current]);
    setCollapsed(false);
  }

  async function handleEdit(data: ExperiencePayload) {
    if (!token || !editing) return;
    const updated = await updateExperience(slug, editing.id, data, token);
    setExperiences((current) =>
      current.map((experience) =>
        experience.id === editing.id ? updated : experience
      )
    );
  }

  async function handleDelete() {
    if (!token || !editing) return;
    await deleteExperience(slug, editing.id, token);
    setExperiences((current) =>
      current.filter((experience) => experience.id !== editing.id)
    );
  }

  const Tag = noCard ? "div" : "section";
  const cardClass = noCard ? "p-4" : "rounded-eb-card border border-eb-layout bg-[#fffdf7] p-4";

  return (
    <Tag className={cardClass}>
      <div
        className={`flex items-center justify-between gap-3 ${canToggle ? "cursor-pointer select-none" : ""}`}
        onClick={canToggle ? () => setCollapsed((c) => !c) : undefined}
      >
        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-eb-muted">
            Expériences
            {collapsed && sortedExperiences.length > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal text-eb-muted">
                ({sortedExperiences.length})
              </span>
            )}
          </p>
          {!collapsed && (
            <p className="mt-1 text-[13px] text-eb-secondary">
              Parcours, postes et établissements de restauration.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isOwner && (
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
          )}
          {canToggle && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex h-7 w-7 items-center justify-center rounded text-eb-secondary transition-colors hover:bg-eb-page hover:text-eb-text"
              aria-label={collapsed ? "Développer" : "Réduire"}
            >
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 transition-transform duration-300"
                style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <polyline points="1,8 6,3 11,8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          maxHeight: collapsed ? "0px" : "4000px",
          overflow: "hidden",
          transition: "max-height 0.35s ease",
        }}
      >
        <div className="mt-4">
        {sortedExperiences.length > 0 ? (
        <div className="space-y-3">
          {sortedExperiences.map((experience) => (
            <article
              key={experience.id}
              className="rounded-eb border border-eb-layout bg-[#FBFDFF] p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-eb-text">
                    {experience.title}
                  </h3>
                  {experience.company && (
                    <p className="mt-0.5 text-[14px] text-eb-secondary">
                      {experience.company}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-eb-muted">
                    {formatPeriod(experience)}
                  </p>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(experience);
                      setShowForm(true);
                    }}
                    className="text-[13px] text-eb-secondary hover:text-eb-text"
                  >
                    Modifier
                  </button>
                )}
              </div>

              {experience.description && (
                <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-eb-text">
                  {experience.description}
                </p>
              )}
            </article>
          ))}
        </div>
        ) : (
          <p className="py-4 text-center text-[13px] text-eb-muted">
            Aucune expérience renseignée.
          </p>
        )}
        </div>
      </div>

      {showForm && (
        <ExperienceForm
          initial={editing ?? undefined}
          onSave={editing ? handleEdit : handleCreate}
          onDelete={editing ? handleDelete : undefined}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </Tag>
  );
}
