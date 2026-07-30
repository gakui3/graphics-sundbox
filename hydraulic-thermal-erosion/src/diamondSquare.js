// Diamond-square 法（非再帰・ガウス乱数）で初期地形と硬度マップ R(x,y) を作る

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller 法によるガウス乱数（平均0, 標準偏差1）
export function gaussian(rng) {
  let spare = null;
  return function () {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = 0;
    while (u1 === 0) u1 = rng();
    const u2 = rng();
    const mag = Math.sqrt(-2 * Math.log(u1));
    spare = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
}

// outSize×outSize の 0..1 正規化ハイトマップを返す
export function generateTerrain(outSize, roughness, seed) {
  // 2^k + 1 のグリッドで生成して切り出す
  let grid = 2;
  while (grid + 1 < outSize + 1) grid *= 2;
  const size = grid + 1;
  const m = new Float32Array(size * size);
  const gauss = gaussian(mulberry32(seed));

  m[0] = gauss();
  m[size - 1] = gauss();
  m[(size - 1) * size] = gauss();
  m[size * size - 1] = gauss();

  let step = size - 1;
  let scale = 1;
  while (step > 1) {
    const half = step / 2;

    // diamond step
    for (let y = half; y < size; y += step) {
      for (let x = half; x < size; x += step) {
        const avg =
          (m[(y - half) * size + (x - half)] +
            m[(y - half) * size + (x + half)] +
            m[(y + half) * size + (x - half)] +
            m[(y + half) * size + (x + half)]) /
          4;
        m[y * size + x] = avg + gauss() * scale;
      }
    }

    // square step
    for (let y = 0; y < size; y += half) {
      for (let x = (y / half) % 2 === 0 ? half : 0; x < size; x += step) {
        let sum = 0;
        let count = 0;
        if (x - half >= 0) {
          sum += m[y * size + (x - half)];
          count++;
        }
        if (x + half < size) {
          sum += m[y * size + (x + half)];
          count++;
        }
        if (y - half >= 0) {
          sum += m[(y - half) * size + x];
          count++;
        }
        if (y + half < size) {
          sum += m[(y + half) * size + x];
          count++;
        }
        m[y * size + x] = sum / count + gauss() * scale;
      }
    }

    scale *= Math.pow(2, -roughness);
    step = half;
  }

  // 切り出し + 0..1 正規化
  const out = new Float32Array(outSize * outSize);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      const h = m[y * size + x];
      out[y * outSize + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
  return out;
}

// 論文 §4: ハイトマップの反転スケール + ノイズ + ぼかし。
// R は 0..1 で小さいほど硬い（高所ほど硬い）
export function generateHardness(heights01, size, seed, Rmin) {
  const rng = mulberry32(seed ^ 0x5f3759df);
  const tmp = new Float32Array(size * size);
  for (let i = 0; i < tmp.length; i++) {
    tmp[i] = 0.3 + 0.6 * (1 - heights01[i]) + (rng() - 0.5) * 0.3;
  }
  // 簡易ガウスフィルタ（半径2のボックスぼかし2回）
  const out = new Float32Array(size * size);
  const radius = 2;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? tmp : out;
    const dst = pass === 0 ? out : tmp;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px < 0 || px >= size || py < 0 || py >= size) continue;
            sum += src[py * size + px];
            count++;
          }
        }
        dst[y * size + x] = sum / count;
      }
    }
  }
  for (let i = 0; i < tmp.length; i++) {
    out[i] = Math.min(1, Math.max(Rmin, tmp[i]));
  }
  return out;
}
