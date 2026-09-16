import { FloorPlan, Surface } from "./model";
export function bounds(surfaces: Surface[]) {
  const points = surfaces
    .flatMap((s) => [s.a, s.b])
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return { x: -1, y: -1, width: 2, height: 2 };
  const x = Math.min(...points.map((p) => p.x)) - 0.45;
  const y = Math.min(...points.map((p) => p.y)) - 0.45;
  return {
    x,
    y,
    width: Math.max(0.9, Math.max(...points.map((p) => p.x)) - x + 0.45),
    height: Math.max(0.9, Math.max(...points.map((p) => p.y)) - y + 0.45),
  };
}
export function escapeHTML(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function planSVG(plan: FloorPlan, name: string) {
  const b = bounds(plan.surfaces);
  const labels = plan.labels?.length
    ? plan.labels
    : [
        {
          roomId: "room",
          name,
          position: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        },
      ];
  const labelSVG = labels
    .map(
      (label) =>
        `<text x="${label.position.x}" y="${label.position.y}" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(0.18, Math.max(b.width, b.height) * 0.023)}" fill="#153b32">${escapeHTML(label.name)}</text>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="600" height="420"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#f4f6f2"/>${[
    ...plan.surfaces,
  ]
    .sort((a, b) => Number(a.kind !== "wall") - Number(b.kind !== "wall"))
    .map(
      (s) =>
        `<line x1="${s.a.x}" y1="${s.a.y}" x2="${s.b.x}" y2="${s.b.y}" stroke="${s.kind === "wall" ? "#153b32" : s.kind === "window" ? "#459bc0" : "#c9a75c"}" stroke-width=".07"/>`,
    )
    .join("")} ${labelSVG}</svg>`;
}
