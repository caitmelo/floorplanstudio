// Camera axes: right +X, up +Y, backwards +Z. Quaternions are [x,y,z,w].
export type Quaternion = [number, number, number, number];
export const IDENTITY: Quaternion = [0, 0, 0, 1];
export function integrate(
  q: Quaternion,
  rate: { alpha: number; beta: number; gamma: number },
  dt: number,
): Quaternion {
  if (!(dt > 0 && dt < 0.25)) return q;
  // Expo's iOS implementation emits rotationRate z,y,x as alpha,beta,gamma (deg/s).
  const k = Math.PI / 180,
    x = rate.gamma * k,
    y = rate.beta * k,
    z = rate.alpha * k;
  const speed = Math.hypot(x, y, z),
    h = (speed * dt) / 2;
  if (!speed) return q;
  const t = Math.sin(h) / speed,
    a = x * t,
    b = y * t,
    c = z * t,
    d = Math.cos(h);
  const [u, v, w, s] = q;
  const r: Quaternion = [
    s * a + u * d + v * c - w * b,
    s * b - u * c + v * d + w * a,
    s * c + u * b - v * a + w * d,
    s * d - u * a - v * b - w * c,
  ];
  const n = Math.hypot(...r);
  return r.map((v) => v / n) as Quaternion;
}
// Row-major camera-to-world matrix.
export function matrix(q: Quaternion): number[] {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}
export function aim(q: Quaternion) {
  const m = matrix(q);
  return {
    yaw: (Math.atan2(-m[2], m[8]) * 180) / Math.PI,
    pitch: (Math.asin(Math.max(-1, Math.min(1, -m[5]))) * 180) / Math.PI,
  };
}
export const wrap = (a: number) => ((a + 540) % 360) - 180;
export function distance(a: Quaternion, b: Quaternion) {
  return (
    (2 *
      Math.acos(Math.min(1, Math.abs(a.reduce((s, v, i) => s + v * b[i], 0)))) *
      180) /
    Math.PI
  );
}
export const TARGETS = [
  ...Array.from({ length: 12 }, (_, i) => ({ yaw: i * 30, pitch: 0 })),
  ...Array.from({ length: 12 }, (_, i) => ({ yaw: i * 30, pitch: 55 })),
  ...Array.from({ length: 12 }, (_, i) => ({ yaw: i * 30, pitch: -55 })),
  { yaw: 0, pitch: 90 },
  { yaw: 0, pitch: -90 },
];
export function focalPixels(width: number, height: number, f35: unknown) {
  const focal = Number(f35);
  const valid = Number.isFinite(focal) && focal >= 10 && focal <= 100;
  return {
    focal:
      (Math.hypot(width, height) * (valid ? focal : 24)) / Math.hypot(36, 24),
    estimated: !valid,
  };
}
