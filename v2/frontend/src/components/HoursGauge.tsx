export function formatMinutes(value: number) {
  const n = Math.round(value);
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")}`;
}

export default function HoursGauge({
  name,
  published,
  draft,
  target,
}: {
  name: string;
  published: number;
  draft: number;
  target: number;
}) {
  const total = published + draft;
  const scale = Math.max(target, total, 1);
  return (
    <div style={{ padding: "12px 0" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 13,
        }}
      >
        <strong>{name}</strong>
        <span>
          {formatMinutes(total)} / {formatMinutes(target)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Heures prévues de ${name}`}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={total}
        aria-valuetext={`${formatMinutes(published)} publiées, ${formatMinutes(draft)} en proposition, objectif ${formatMinutes(target)}`}
        style={{
          position: "relative",
          display: "flex",
          height: 10,
          borderRadius: 5,
          background: "#edf0eb",
          margin: "8px 0",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            width: `${(published / scale) * 100}%`,
            background: "#31594d",
          }}
        />
        <span
          style={{ width: `${(draft / scale) * 100}%`, background: "#b5cebf" }}
        />
        {total > target && target > 0 && (
          <span
            style={{
              position: "absolute",
              left: `${(target / scale) * 100}%`,
              height: "100%",
              borderLeft: "2px solid #a54a32",
            }}
          />
        )}
      </div>
      <small>
        {formatMinutes(published)} publiées · {formatMinutes(draft)} à confirmer
        {total > target
          ? ` · dépassement de ${formatMinutes(total - target)}`
          : ""}
      </small>
    </div>
  );
}
