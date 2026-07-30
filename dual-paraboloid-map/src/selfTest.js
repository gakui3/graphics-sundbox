import * as THREE from "three";
import { forward, inverse, maxBlendWidth, MAP_A, MAP_B } from "./dpMath.js";

function randomDirection(rng) {
  // 球面一様
  const z = rng() * 2 - 1;
  const phi = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dirError(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

/**
 * 仕様 7-1 の往復テスト一式
 * @param {THREE.Matrix3} basis
 * @param {{R: number, blendWidth: number}} params
 */
export function runSelfTest(basis, params) {
  const results = [];
  const rng = mulberry32(20260730);
  const N = 10000;

  // 往復: d.z < 0 は MAP_A、d.z > 0 は MAP_B
  let worstRound = 0;
  for (let i = 0; i < N; i++) {
    const d = randomDirection(rng);
    const map = d.z < 0 ? MAP_A : MAP_B;
    const { s, t } = forward(d, map);
    const back = inverse(s, t, map);
    worstRound = Math.max(worstRound, dirError(d, back));
  }
  results.push({
    name: "forward -> inverse (10,000 dirs)",
    pass: worstRound < 1e-5,
    detail: `max err ${worstRound.toExponential(2)} (< 1e-5)`,
  });

  // ガードバンド帯では両方のマップで成立すること
  const band = params.blendWidth;
  let worstBand = 0;
  let bandCount = 0;
  for (let i = 0; i < N; i++) {
    const d = randomDirection(rng);
    if (Math.abs(d.z) >= band) continue;
    bandCount++;
    for (const map of [MAP_A, MAP_B]) {
      const { s, t } = forward(d, map);
      const back = inverse(s, t, map);
      worstBand = Math.max(worstBand, dirError(d, back));
    }
  }
  results.push({
    name: `both maps valid in |d.z| < ${band}`,
    pass: bandCount > 0 && worstBand < 1e-5,
    detail: `${bandCount} dirs, max err ${worstBand.toExponential(2)}`,
  });

  // inverse は q の全域で単位長
  const qMax = 2 * params.R * params.R;
  let worstLen = 0;
  for (let i = 0; i < N; i++) {
    const q = rng() * qMax;
    const angle = rng() * Math.PI * 2;
    const rad = Math.sqrt(q);
    const s = rad * Math.cos(angle);
    const t = rad * Math.sin(angle);
    for (const map of [MAP_A, MAP_B]) {
      const d = inverse(s, t, map);
      const len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
      worstLen = Math.max(worstLen, Math.abs(len - 1));
    }
  }
  results.push({
    name: `inverse is unit length over q in [0, ${qMax.toFixed(2)}]`,
    pass: worstLen < 1e-6,
    detail: `max |len-1| ${worstLen.toExponential(2)} (< 1e-6)`,
  });

  // basis の行列式は +1 (鏡映になっていないこと)
  const det = basis.determinant();
  results.push({
    name: "dpBasis determinant is +1 (not a mirror)",
    pass: Math.abs(det - 1) < 1e-6,
    detail: `det = ${det.toFixed(9)}`,
  });

  // R と w の整合
  const wMax = maxBlendWidth(params.R);
  results.push({
    name: "blend width within guard band limit",
    pass: params.blendWidth <= wMax + 1e-9,
    detail: `w = ${params.blendWidth} <= w_max = ${wMax.toFixed(4)} (R = ${params.R})`,
  });

  return results;
}

/**
 * 仕様 7-2: GLSL 側の forward/inverse を GPU で往復させ、JS 実装と突き合わせる
 */
export function runGpuTest(renderer, material, size = 64) {
  const target = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixels = new Float32Array(size * size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
  renderer.setRenderTarget(prev);

  // r: GPU 往復誤差, g: JS との差
  let maxRound = 0;
  let maxDelta = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    maxRound = Math.max(maxRound, pixels[i]);
    maxDelta = Math.max(maxDelta, pixels[i + 1]);
  }

  target.dispose();
  quad.geometry.dispose();

  return [
    {
      name: "GLSL forward -> inverse round trip",
      pass: maxRound < 1e-4,
      detail: `max err ${maxRound.toExponential(2)} (< 1e-4)`,
    },
    {
      name: "GLSL matches JS implementation",
      pass: maxDelta < 1e-4,
      detail: `max diff ${maxDelta.toExponential(2)} (< 1e-4)`,
    },
  ];
}
