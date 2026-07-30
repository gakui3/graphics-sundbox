import * as THREE from "three";

// DP 空間は軸を Z とする。MAP_A が -Z 側、MAP_B が +Z 側。
export const MAP_A = 0;
export const MAP_B = 1;

/** 方向 -> 平面座標 (s, t) */
export function forward(d, map) {
  if (map === MAP_A) {
    const k = 1.0 - d.z;
    return { s: d.x / k, t: d.y / k };
  }
  const k = 1.0 + d.z;
  return { s: -d.x / k, t: -d.y / k };
}

/** 平面座標 (s, t) -> 方向。q に関係なく常に単位長になる */
export function inverse(s, t, map) {
  const q = s * s + t * t;
  const inv = 1.0 / (q + 1.0);
  if (map === MAP_A) {
    return { x: 2.0 * s * inv, y: 2.0 * t * inv, z: (q - 1.0) * inv };
  }
  return { x: -2.0 * s * inv, y: -2.0 * t * inv, z: (1.0 - q) * inv };
}

/** (s, t) -> テクスチャ UV。R はガードバンド倍率 */
export function stToUv(s, t, R) {
  return { u: (s / R + 1.0) * 0.5, v: (t / R + 1.0) * 0.5 };
}

/** テクスチャ UV -> (s, t) */
export function uvToSt(u, v, R) {
  return { s: (u * 2.0 - 1.0) * R, t: (v * 2.0 - 1.0) * R };
}

/** ガードバンド R でブレンド可能な半幅の上限 */
export function maxBlendWidth(R) {
  return (R * R - 1.0) / (R * R + 1.0);
}

/**
 * 既定の dpBasis。ワールド +Y を DP +Z に写す回転（行列式 +1）
 * 行: [1,0,0] / [0,0,-1] / [0,1,0]
 */
export function defaultBasis() {
  const m = new THREE.Matrix3();
  m.set(
    1, 0, 0,
    0, 0, -1,
    0, 1, 0,
  );
  return m;
}
