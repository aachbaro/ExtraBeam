import { useState } from "react";
export type TimeRange = { date: string; start_time: string; end_time: string };
export type TimeEvent = {
  id: number;
  date: string;
  start: string;
  end: string;
  label: string;
  detail: string;
  draft?: boolean;
};
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const time = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export default function WeekTimeGrid({
  days,
  events,
  editable,
  onSelect,
  onOpen,
}: {
  days: string[];
  events: TimeEvent[];
  editable: boolean;
  onSelect: (range: TimeRange) => void;
  onOpen: (id: number) => void;
}) {
  const [drag, setDrag] = useState<{
    date: string;
    start: number;
    end: number;
  } | null>(null);
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid #e2e6e2",
        borderRadius: 12,
        background: "white",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "45px repeat(7,minmax(115px,1fr))",
          minWidth: 850,
        }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day}
            style={{
              padding: 10,
              textAlign: "center",
              borderBottom: "1px solid #e2e6e2",
            }}
          >
            {new Date(day + "T12:00:00").toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
            })}
          </div>
        ))}
        <div style={{ position: "relative", height: 960 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <small
              key={h}
              style={{ position: "absolute", top: h * 40, left: 5 }}
            >
              {h} h
            </small>
          ))}
        </div>
        {days.map((day) => {
          const rows = events
            .filter((e) => e.date === day)
            .sort((a, b) => minute(a.start) - minute(b.start));
          const layout = new Map<number, { lane: number; count: number }>();
          let group: TimeEvent[] = [];
          let groupEnd = -1;
          function flush() {
            const lanes: number[] = [];
            for (const event of group) {
              let lane = lanes.findIndex((end) => end <= minute(event.start));
              if (lane < 0) lane = lanes.length;
              lanes[lane] =
                minute(event.end) <= minute(event.start)
                  ? 1440
                  : minute(event.end);
              layout.set(event.id, { lane, count: 0 });
            }
            for (const event of group)
              layout.get(event.id)!.count = lanes.length;
            group = [];
          }
          for (const event of rows) {
            if (minute(event.start) >= groupEnd) flush();
            group.push(event);
            groupEnd = Math.max(
              groupEnd,
              minute(event.end) <= minute(event.start)
                ? 1440
                : minute(event.end),
            );
          }
          flush();
          return (
            <div
              key={day}
              style={{
                position: "relative",
                height: 960,
                borderLeft: "1px solid #edf0eb",
                background:
                  "repeating-linear-gradient(to bottom,transparent 0,transparent 19px,#edf0eb 20px)",
                touchAction: "pan-y",
              }}
              onPointerDown={(e) => {
                if (
                  !editable ||
                  e.pointerType === "touch" ||
                  (e.target as HTMLElement).closest("button")
                )
                  return;
                const m = Math.min(
                  1410,
                  Math.max(
                    0,
                    Math.floor(
                      (e.clientY -
                        e.currentTarget.getBoundingClientRect().top) /
                        20,
                    ) * 30,
                  ),
                );
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ date: day, start: m, end: m + 30 });
              }}
              onPointerMove={(e) => {
                if (drag?.date === day) {
                  const m = Math.min(
                    1440,
                    Math.max(
                      0,
                      Math.ceil(
                        (e.clientY -
                          e.currentTarget.getBoundingClientRect().top) /
                          20,
                      ) * 30,
                    ),
                  );
                  setDrag({ ...drag, end: m });
                }
              }}
              onPointerCancel={() => setDrag(null)}
              onPointerUp={() => {
                if (drag?.date === day) {
                  const a = Math.min(drag.start, drag.end),
                    b = Math.max(drag.start + 30, drag.end);
                  onSelect({
                    date: day,
                    start_time: time(a),
                    end_time: time(b),
                  });
                  setDrag(null);
                }
              }}
            >
              {editable && (
                <button
                  aria-label={`Créer un service le ${day}`}
                  onClick={() =>
                    onSelect({
                      date: day,
                      start_time: "11:00",
                      end_time: "15:30",
                    })
                  }
                  style={{
                    position: "absolute",
                    right: 4,
                    top: 3,
                    zIndex: 2,
                    fontSize: 12,
                  }}
                >
                  ＋
                </button>
              )}
              {drag?.date === day && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: Math.min(drag.start, drag.end) / 1.5,
                    height: Math.max(30, Math.abs(drag.end - drag.start)) / 1.5,
                    background: "#b5cebf88",
                    pointerEvents: "none",
                  }}
                />
              )}
              {rows.map((event) => {
                const start = minute(event.start),
                  rawEnd = minute(event.end),
                  end = rawEnd <= start ? 1440 : rawEnd;
                const { lane, count } = layout.get(event.id)!;
                return (
                  <button
                    key={event.id}
                    onClick={() => onOpen(event.id)}
                    title={`${event.label} · ${event.start}–${event.end} · ${event.detail}`}
                    style={{
                      position: "absolute",
                      top: start / 1.5,
                      height: Math.max(20, (end - start) / 1.5 - 3),
                      left: `${(lane * 100) / count}%`,
                      width: `${100 / count}%`,
                      padding: 5,
                      overflow: "hidden",
                      textAlign: "left",
                      border: "1px solid #b5cebf",
                      borderRadius: 6,
                      background: event.draft ? "#f5eddb" : "#dfebe3",
                      fontSize: 11,
                    }}
                  >
                    <strong>
                      {event.start.slice(0, 5)}–{event.end.slice(0, 5)}
                      {rawEnd <= start ? " (+1 j)" : ""}
                    </strong>
                    <div>{event.label}</div>
                    <small>{event.detail}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
