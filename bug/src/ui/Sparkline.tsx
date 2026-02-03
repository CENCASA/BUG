import React from "react";

export function Sparkline({ values }: { values: number[] }) {
  const w = 240;
  const h = 64;
  const pad = 6;

  if (!values || values.length < 2) {
    return <svg className="spark" viewBox={`0 0 ${w} ${h}`} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) * (h - pad * 2)) / range;
    return { x, y };
  });

  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const last = pts[pts.length - 1];

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="rgba(233,236,248,.85)" strokeWidth="2.2" />
      <circle cx={last.x} cy={last.y} r="3.2" fill="rgba(24,194,255,.85)" />
    </svg>
  );
}
