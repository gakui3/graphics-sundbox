import { createNoise2D } from "simplex-noise";

export const defaultNoiseParams = {
  octaves: 5,
  frequency: 0.012,
  persistence: 0.45,
  lacunarity: 2.0,
  falloff: true,
};

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateHeightmap(size, params, seed) {
  const noise2D = createNoise2D(mulberry32(seed));
  const map = new Float32Array(size * size);
  const half = (size - 1) / 2;
  let min = Infinity;
  let max = -Infinity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1;
      let freq = params.frequency;
      let h = 0;
      for (let o = 0; o < params.octaves; o++) {
        h += noise2D(x * freq, y * freq) * amp;
        amp *= params.persistence;
        freq *= params.lacunarity;
      }
      if (params.falloff) {
        // 端のドレインバレーを抑えるため、縁に向かってなだらかに下げる
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        h = (h + 1) * (1 - d * d * 0.75) - 1;
      }
      map[y * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  const range = max - min || 1;
  for (let i = 0; i < map.length; i++) {
    map[i] = (map[i] - min) / range;
  }
  return map;
}
