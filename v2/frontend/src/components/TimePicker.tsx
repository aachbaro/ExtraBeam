/**
 * TimePicker
 * - Survol la partie heures ou minutes + molette → ajuste directement
 * - Clic → ouvre un popup scrollable pour sélection précise
 * - Minutes limités aux quarts d'heure (0, 15, 30, 45)
 * - Interface identique à <input type="time"> : value="HH:MM", onChange(value: string)
 */

import { useEffect, useRef, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const ITEM_H = 36;

function pad(n: number) { return String(n).padStart(2, "0"); }

function parseTime(v: string) {
  const parts = (v || "00:00").split(":");
  return {
    h: Math.min(23, Math.max(0, parseInt(parts[0] ?? "0", 10))),
    m: parseInt(parts[1] ?? "0", 10),
  };
}

function snapMinute(m: number) {
  return MINUTES.reduce((p, c) => (Math.abs(c - m) < Math.abs(p - m) ? c : p));
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  "aria-label"?: string;
  autoFocus?: boolean;
}

export default function TimePicker({
  value,
  onChange,
  className = "eb-input",
  required,
  "aria-label": ariaLabel,
  autoFocus,
}: Props) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.h);
  const [minute, setMinute] = useState(snapMinute(parsed.m));
  const [open, setOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const hourSpanRef = useRef<HTMLSpanElement>(null);
  const minSpanRef = useRef<HTMLSpanElement>(null);
  const popupHourRef = useRef<HTMLDivElement>(null);
  const popupMinRef = useRef<HTMLDivElement>(null);

  // Refs pour accéder aux valeurs courantes dans les listeners non-React
  const currentRef = useRef({ h: hour, m: minute });
  currentRef.current = { h: hour, m: minute };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const { h, m } = parseTime(value);
    setHour(h);
    setMinute(snapMinute(m));
  }, [value]);

  // Fermeture sur clic extérieur
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Wheel non-passif sur les spans heures / minutes du trigger
  useEffect(() => {
    const hEl = hourSpanRef.current;
    const mEl = minSpanRef.current;
    if (!hEl || !mEl) return;

    function onHourWheel(e: WheelEvent) {
      e.preventDefault();
      const next = (currentRef.current.h + (e.deltaY > 0 ? 1 : -1) + 24) % 24;
      setHour(next);
      onChangeRef.current(`${pad(next)}:${pad(currentRef.current.m)}`);
    }

    function onMinWheel(e: WheelEvent) {
      e.preventDefault();
      const idx = MINUTES.indexOf(currentRef.current.m);
      const next = MINUTES[(idx + (e.deltaY > 0 ? 1 : -1) + MINUTES.length) % MINUTES.length];
      setMinute(next);
      onChangeRef.current(`${pad(currentRef.current.h)}:${pad(next)}`);
    }

    hEl.addEventListener("wheel", onHourWheel, { passive: false });
    mEl.addEventListener("wheel", onMinWheel, { passive: false });
    return () => {
      hEl.removeEventListener("wheel", onHourWheel);
      mEl.removeEventListener("wheel", onMinWheel);
    };
  }, []); // mount uniquement — refs gèrent les valeurs courantes

  function scrollToIdx(el: HTMLDivElement | null, idx: number, smooth = true) {
    el?.scrollTo({ top: idx * ITEM_H, behavior: smooth ? "smooth" : "instant" });
  }

  // Scroll dans popup jusqu'à la valeur courante à l'ouverture
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      scrollToIdx(popupHourRef.current, hour, false);
      scrollToIdx(popupMinRef.current, MINUTES.indexOf(minute), false);
    }, 20);
    return () => clearTimeout(t);
  }, [open]); // intentionnellement pas de dépendances sur hour/minute

  function commit(h: number, m: number) { onChange(`${pad(h)}:${pad(m)}`); }

  function pickHour(h: number) {
    setHour(h);
    commit(h, minute);
    scrollToIdx(popupHourRef.current, h);
  }

  function pickMinute(m: number) {
    setMinute(m);
    commit(hour, m);
    scrollToIdx(popupMinRef.current, MINUTES.indexOf(m));
  }

  function onPopupHourWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = (hour + (e.deltaY > 0 ? 1 : -1) + 24) % 24;
    pickHour(next);
  }

  function onPopupMinWheel(e: React.WheelEvent) {
    e.preventDefault();
    const idx = MINUTES.indexOf(minute);
    const next = MINUTES[(idx + (e.deltaY > 0 ? 1 : -1) + MINUTES.length) % MINUTES.length];
    pickMinute(next);
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger : scroll inline sur heures/minutes, clic ouvre le popup */}
      <button
        type="button"
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? `Heure : ${pad(hour)}:${pad(minute)}`}
        className={`${className} flex w-full items-center gap-0.5`}
        onClick={() => setOpen((v) => !v)}
        data-required={required}
      >
        <span className="flex items-center">
          <span
            ref={hourSpanRef}
            title="Défiler pour changer les heures"
            className="font-mono tabular-nums rounded px-0.5 cursor-ns-resize hover:bg-black/8 transition-colors"
          >
            {pad(hour)}
          </span>
          <span className="text-eb-muted pointer-events-none select-none">:</span>
          <span
            ref={minSpanRef}
            title="Défiler pour changer les minutes"
            className="font-mono tabular-nums rounded px-0.5 cursor-ns-resize hover:bg-black/8 transition-colors"
          >
            {pad(minute)}
          </span>
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 ml-auto opacity-35"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {/* Popup scrollable (clic) */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 flex overflow-hidden rounded-lg border border-eb-layout bg-white shadow-lg select-none">
          {/* Heures */}
          <div
            ref={popupHourRef}
            onWheel={onPopupHourWheel}
            style={{ height: ITEM_H * 4, width: 52, scrollbarWidth: "none", overflowY: "auto" }}
          >
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => pickHour(h)}
                className={`flex w-full items-center justify-center font-mono tabular-nums text-[14px] transition-colors ${
                  h === hour
                    ? "text-eb-primary font-semibold bg-[#EFF6FF]"
                    : "text-eb-secondary hover:text-eb-text hover:bg-eb-page"
                }`}
                style={{ height: ITEM_H }}
              >
                {pad(h)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center px-1 text-[16px] font-bold text-eb-muted pointer-events-none">
            :
          </div>
          {/* Minutes (quarts d'heure) */}
          <div
            ref={popupMinRef}
            onWheel={onPopupMinWheel}
            style={{ height: ITEM_H * 4, width: 52, scrollbarWidth: "none", overflowY: "auto" }}
          >
            {MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => pickMinute(m)}
                className={`flex w-full items-center justify-center font-mono tabular-nums text-[14px] transition-colors ${
                  m === minute
                    ? "text-eb-primary font-semibold bg-[#EFF6FF]"
                    : "text-eb-secondary hover:text-eb-text hover:bg-eb-page"
                }`}
                style={{ height: ITEM_H }}
              >
                {pad(m)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
