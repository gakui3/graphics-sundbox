import * as THREE from "three";

// Fire Profile Texture の手続き生成版。u(横)=中心軸からの半径、v(縦)=高さ。
// [t, r, g, b, a] 温度スケール: 0=外縁 -> 1=中心コア
const STOPS = [
  [0.00, 0.00, 0.00, 0.00, 0.00],
  [0.12, 0.45, 0.00, 0.00, 0.08],
  [0.30, 0.90, 0.15, 0.00, 0.35],
  [0.55, 1.00, 0.50, 0.00, 0.80],
  [0.80, 1.00, 0.85, 0.30, 1.00],
  [1.00, 1.00, 1.00, 0.95, 1.00],
];

function palette(t) {
  const x = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, ...c0] = STOPS[i - 1];
      const [t1, ...c1] = STOPS[i];
      const k = (x - t0) / (t1 - t0);
      return c0.map((v, j) => v + (c1[j] - v) * k);
    }
  }
  return STOPS[STOPS.length - 1].slice(1);
}

/** 涙滴型の炎プロファイルテクスチャを生成 (flipY=false で v=0 が根元) */
export function createFireProfileTexture() {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);

      // 高さに応じて細くなる外縁
      const edge = 0.92 * (1 - 0.75 * Math.pow(v, 1.6)) * (0.55 + 0.45 * Math.min(v / 0.18, 1));
      let t = (edge - u) / edge;
      t = Math.min(Math.max(t, 0), 1);
      t *= 1.0 - 0.55 * Math.pow(v, 2.2);
      t *= 1.0 - Math.pow(Math.max(v - 0.82, 0) / 0.18, 2);

      const [r, g, b, a] = palette(Math.pow(t, 1.25));
      const i = (y * size + x) * 4;
      img.data[i] = Math.round(r * 255);
      img.data[i + 1] = Math.round(g * 255);
      img.data[i + 2] = Math.round(b * 255);
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}
