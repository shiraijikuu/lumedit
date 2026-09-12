import type { CurveParams, CurvePoint } from '@/types/EditParams';

export const CURVE_LUT_SIZE = 256;

/** 控制点是否为默认线性（两点对角） */
export function isLinearCurve(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const [a, b] = points;
  return a.x === 0 && a.y === 0 && b.x === 1 && b.y === 1;
}

export function isIdentityCurve(curve: CurveParams): boolean {
  return (
    isLinearCurve(curve.master) &&
    isLinearCurve(curve.red) &&
    isLinearCurve(curve.green) &&
    isLinearCurve(curve.blue)
  );
}

/** 对单条曲线在 t∈[0,1] 处做分段线性插值（控制点需按 x 升序） */
export function evalCurve(points: CurvePoint[], t: number): number {
  if (points.length === 0) return t;
  if (t <= points[0].x) return points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (t >= a.x && t <= b.x) {
      const f = b.x === a.x ? 0 : (t - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * f;
    }
  }
  return points[points.length - 1].y;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 烘焙四条曲线为 256×1 RGBA8：
 * R=主曲线(master) G=红通道 B=绿通道 A=蓝通道。着色器先采 master 再采通道曲线。
 */
export function bakeCurveLut(curve: CurveParams): Uint8Array {
  const n = CURVE_LUT_SIZE;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out[i * 4 + 0] = Math.round(clamp01(evalCurve(curve.master, t)) * 255);
    out[i * 4 + 1] = Math.round(clamp01(evalCurve(curve.red, t)) * 255);
    out[i * 4 + 2] = Math.round(clamp01(evalCurve(curve.green, t)) * 255);
    out[i * 4 + 3] = Math.round(clamp01(evalCurve(curve.blue, t)) * 255);
  }
  return out;
}
