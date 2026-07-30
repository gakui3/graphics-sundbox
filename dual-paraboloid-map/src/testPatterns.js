import * as THREE from "three";

// cubemap の面ごとの基底。three.js の面順 (+X, -X, +Y, -Y, +Z, -Z) に合わせる。
const FACES = [
  { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] },
  { forward: [-1, 0, 0], right: [0, 0, 1], up: [0, -1, 0] },
  { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { forward: [0, 0, 1], right: [1, 0, 0], up: [0, -1, 0] },
  { forward: [0, 0, -1], right: [-1, 0, 0], up: [0, -1, 0] },
];

function faceDirection(face, u, v) {
  const a = u * 2 - 1;
  const b = v * 2 - 1;
  const d = [
    face.forward[0] + face.right[0] * a + face.up[0] * b,
    face.forward[1] + face.right[1] * a + face.up[1] * b,
    face.forward[2] + face.right[2] * a + face.up[2] * b,
  ];
  const len = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / len, d[1] / len, d[2] / len];
}

function buildCubeTexture(size, shade) {
  const faces = [];
  for (const face of FACES) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = faceDirection(face, (x + 0.5) / size, (y + 0.5) / size);
        const c = shade(d);
        const i = (y * size + x) * 4;
        img.data[i] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
        img.data[i + 1] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
        img.data[i + 2] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    faces.push(canvas);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 緯度経度グリッド。線の太さは角度基準なので極でも潰れない
 */
export function createLatLongGrid(size = 512, stepDeg = 10) {
  const step = THREE.MathUtils.degToRad(stepDeg);
  const lineWidth = THREE.MathUtils.degToRad(0.6);
  return buildCubeTexture(size, (d) => {
    const lat = Math.asin(Math.min(1, Math.max(-1, d[1])));
    const lon = Math.atan2(d[2], d[0]);
    // 各線からの角度距離
    const dLat = Math.abs(((lat + Math.PI * 0.5) % step) - step * 0.5);
    const latDist = Math.min(dLat, step - dLat);
    const dLon = Math.abs(((lon + Math.PI * 2) % step) - step * 0.5);
    // 経線は緯度が高いほど密になるので cos(lat) を掛けて角度距離に直す
    const lonDist = Math.min(dLon, step - dLon) * Math.cos(lat);

    const onLat = latDist < lineWidth;
    const onLon = lonDist < lineWidth;
    const equator = Math.abs(lat) < lineWidth * 2;
    const bg = d[1] > 0 ? 0.14 : 0.07;
    if (equator) return [1.0, 0.35, 0.2];
    if (onLat && onLon) return [1, 1, 1];
    if (onLat) return [0.35, 0.85, 1.0];
    if (onLon) return [0.5, 1.0, 0.45];
    return [bg, bg, bg + 0.02];
  });
}

/** dir * 0.5 + 0.5 の方向カラーマップ */
export function createDirectionColor(size = 256) {
  return buildCubeTexture(size, (d) => [
    d[0] * 0.5 + 0.5,
    d[1] * 0.5 + 0.5,
    d[2] * 0.5 + 0.5,
  ]);
}

/** 指定方向に立体角固定の明るいディスク */
export function createBrightDisc(size = 512, dirDeg = { lat: 20, lon: 0 }, radiusDeg = 5) {
  const lat = THREE.MathUtils.degToRad(dirDeg.lat);
  const lon = THREE.MathUtils.degToRad(dirDeg.lon);
  const center = [
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  ];
  const cosR = Math.cos(THREE.MathUtils.degToRad(radiusDeg));
  return buildCubeTexture(size, (d) => {
    const dot = d[0] * center[0] + d[1] * center[1] + d[2] * center[2];
    if (dot > cosR) return [1, 1, 1];
    return [0.02, 0.02, 0.03];
  });
}
