// 開一様Bスプライン。ノット値は 0 (i<=degree) / (i-degree)/(n-degree) / 1。

const knotCache = new Map();

function openUniformKnots(n, degree) {
  const key = `${n}:${degree}`;
  if (knotCache.has(key)) return knotCache.get(key);
  const knots = [];
  for (let i = 0; i <= n + degree; i++) {
    if (i <= degree) knots.push(0);
    else if (i < n) knots.push((i - degree) / (n - degree));
    else knots.push(1);
  }
  knotCache.set(key, knots);
  return knots;
}

// Cox-de Boor 再帰
function basis(i, p, t, knots) {
  if (p === 0) {
    return knots[i] <= t && t < knots[i + 1] ? 1 : 0;
  }
  let a = 0;
  const d1 = knots[i + p] - knots[i];
  if (d1 > 0) a = ((t - knots[i]) / d1) * basis(i, p - 1, t, knots);
  let b = 0;
  const d2 = knots[i + p + 1] - knots[i + 1];
  if (d2 > 0) b = ((knots[i + p + 1] - t) / d2) * basis(i + 1, p - 1, t, knots);
  return a + b;
}

/**
 * C(t) を評価
 * @param {Array<[number, number]>} points - 制御点 [x, z] の配列
 * @param {number} degree - 次数
 * @param {number} t - 0..1
 * @returns {[number, number]}
 */
export function evalBSpline(points, degree, t) {
  const n = points.length;
  const knots = openUniformKnots(n, degree);
  const tt = Math.min(t, 1 - 1e-6);
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    const w = basis(i, degree, tt, knots);
    x += w * points[i][0];
    z += w * points[i][1];
  }
  return [x, z];
}
