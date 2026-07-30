import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { evalBSpline } from "./bspline.js";
import { createFireProfileTexture } from "./fireProfile.js";
import { createFireMaterial } from "./fireMaterial.js";

// ========= 設定 =========
const CONTROL_POINTS = 5;
const DEGREE = 3;
const CURVE_SAMPLES = 64;
const MAX_SLICES = 240;

// ========= レンダラー / シーン / カメラ =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#08080c");

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 5.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.55;

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(8, 48),
  new THREE.MeshBasicMaterial({ color: "#141216" })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.PolarGridHelper(8, 8, 8, 48, 0x2a2a33, 0x1d1d24));

// ========= テクスチャ =========
const texLoader = new THREE.TextureLoader();

// firetex.png: Fire Profile (画像の上が根元なので flipY で合わせる)
const imageProfileTexture = await texLoader.loadAsync("./assets/firetex.png");
imageProfileTexture.flipY = true;
imageProfileTexture.colorSpace = THREE.SRGBColorSpace;
imageProfileTexture.wrapS = imageProfileTexture.wrapT = THREE.ClampToEdgeWrapping;
imageProfileTexture.minFilter = imageProfileTexture.magFilter = THREE.LinearFilter;
imageProfileTexture.generateMipmaps = false;

// nzw.png: ノイズハッシュ用ランダムRGB
const noiseTexture = await texLoader.loadAsync("./assets/nzw.png");
noiseTexture.flipY = false;
noiseTexture.colorSpace = THREE.NoColorSpace;
noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
noiseTexture.minFilter = noiseTexture.magFilter = THREE.NearestFilter;
noiseTexture.generateMipmaps = false;

// ========= パラメータ =========
const params = {
  profile: "image",
  noiseSource: "texture",
  slices: 127,
  octaves: 4,
  frequency: 7.4,
  gain: 0.5,
  lacunarity: 2.0,
  stability: 0.28,
  fireSpeed: 1.55,
  radius: 0.68,
  height: 2.55,
  windX: -0.16,
  windZ: 0.0,
  sway: 0.33,
  swaySpeed: 1.15,
  intensity: 1.55,
  tint: "#ffffff",
  showSpline: false,
};

// ========= 曲線と DataTexture =========
const controlPoints = Array.from({ length: CONTROL_POINTS }, () => [0, 0]);
const curveData = new Float32Array(CURVE_SAMPLES * 4);
const curveTexture = new THREE.DataTexture(
  curveData, CURVE_SAMPLES, 1, THREE.RGBAFormat, THREE.FloatType
);
curveTexture.minFilter = curveTexture.magFilter = THREE.LinearFilter;
curveTexture.wrapS = curveTexture.wrapT = THREE.ClampToEdgeWrapping;

let maxCurveOffset = 0;

// 制御点を風 + 高さ比例のスウェイで動かす (根元は固定)
function updateControlPoints(t) {
  for (let i = 0; i < CONTROL_POINTS; i++) {
    const hN = i / (CONTROL_POINTS - 1);
    const amp = params.sway * Math.pow(hN, 1.5);
    const ws = params.swaySpeed;
    controlPoints[i][0] =
      amp * (Math.sin(t * ws + i * 1.7) + 0.5 * Math.sin(t * ws * 2.33 + i * 3.07)) +
      params.windX * hN;
    controlPoints[i][1] =
      amp * (Math.cos(t * ws * 0.87 + i * 2.1) + 0.5 * Math.sin(t * ws * 1.93 + i * 1.31)) +
      params.windZ * hN;
  }
}

function updateCurveTexture() {
  maxCurveOffset = 0;
  for (let s = 0; s < CURVE_SAMPLES; s++) {
    const t = s / (CURVE_SAMPLES - 1);
    const [x, z] = evalBSpline(controlPoints, DEGREE, t);
    curveData[s * 4] = x;
    curveData[s * 4 + 1] = z;
    curveData[s * 4 + 2] = params.radius;
    curveData[s * 4 + 3] = 1;
    maxCurveOffset = Math.max(maxCurveOffset, Math.hypot(x, z));
  }
  curveTexture.needsUpdate = true;
}

// ========= スライスジオメトリ =========
const plane = new THREE.PlaneGeometry(2, 2);
const sliceGeometry = new THREE.InstancedBufferGeometry();
sliceGeometry.index = plane.index;
sliceGeometry.setAttribute("position", plane.getAttribute("position"));
const sliceIndex = new Float32Array(MAX_SLICES);
for (let i = 0; i < MAX_SLICES; i++) sliceIndex[i] = i;
sliceGeometry.setAttribute("aSlice", new THREE.InstancedBufferAttribute(sliceIndex, 1));
sliceGeometry.instanceCount = params.slices;

const proceduralProfileTexture = createFireProfileTexture();
const fireMaterial = await createFireMaterial(imageProfileTexture, curveTexture);
fireMaterial.uniforms.uProfileIsImage.value = 1;
fireMaterial.uniforms.uNoiseTex.value = noiseTexture;
fireMaterial.uniforms.uUseNoiseTex.value = 1;
fireMaterial.uniforms.uNoiseOffset.value.set(Math.random() * 100, Math.random() * 100, Math.random() * 100);

function setProfile(mode) {
  const useImage = mode === "image";
  fireMaterial.uniforms.uProfile.value = useImage ? imageProfileTexture : proceduralProfileTexture;
  fireMaterial.uniforms.uProfileIsImage.value = useImage ? 1 : 0;
}

const fire = new THREE.Mesh(sliceGeometry, fireMaterial);
fire.frustumCulled = false;
scene.add(fire);

// ========= スプラインのデバッグ表示 =========
const splineGroup = new THREE.Group();
splineGroup.visible = false;
scene.add(splineGroup);

const splinePositions = new Float32Array(CURVE_SAMPLES * 3);
const splineGeom = new THREE.BufferGeometry();
splineGeom.setAttribute("position", new THREE.BufferAttribute(splinePositions, 3));
splineGroup.add(new THREE.Line(splineGeom, new THREE.LineBasicMaterial({ color: "#4dd2ff" })));

const cpMeshes = [];
for (let i = 0; i < CONTROL_POINTS; i++) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 12),
    new THREE.MeshBasicMaterial({ color: "#7dffa0" })
  );
  splineGroup.add(m);
  cpMeshes.push(m);
}

function updateSplineHelper() {
  for (let s = 0; s < CURVE_SAMPLES; s++) {
    splinePositions[s * 3] = curveData[s * 4];
    splinePositions[s * 3 + 1] = (s / (CURVE_SAMPLES - 1)) * params.height;
    splinePositions[s * 3 + 2] = curveData[s * 4 + 1];
  }
  splineGeom.attributes.position.needsUpdate = true;
  for (let i = 0; i < CONTROL_POINTS; i++) {
    cpMeshes[i].position.set(
      controlPoints[i][0],
      (i / (CONTROL_POINTS - 1)) * params.height,
      controlPoints[i][1]
    );
  }
}

// ========= GUI =========
const gui = new GUI({ title: "Volumetric Fire" });
const u = fireMaterial.uniforms;
gui.add(params, "profile", { "firetex.png": "image", "Procedural": "procedural" })
  .name("Fire Profile").onChange(setProfile);
gui.add(params, "noiseSource", { "nzw.png": "texture", "Procedural Perlin": "procedural" })
  .name("Noise Source").onChange((v) => {
    u.uUseNoiseTex.value = v === "texture" ? 1 : 0;
  });
gui.add(params, "slices", 16, MAX_SLICES, 1).name("Slices").onChange((v) => {
  sliceGeometry.instanceCount = v;
  u.uSliceCount.value = v;
});
gui.add(params, "octaves", 1, 4, 0.1).name("Octaves").onChange((v) => (u.uOctaves.value = v));
gui.add(params, "frequency", 0.5, 8, 0.1).name("Noise Frequency").onChange((v) => (u.uFrequency.value = v));
gui.add(params, "gain", 0.3, 0.7, 0.01).name("Gain").onChange((v) => (u.uGain.value = v));
gui.add(params, "lacunarity", 1.5, 3, 0.05).name("Lacunarity").onChange((v) => (u.uLacunarity.value = v));
gui.add(params, "stability", 0, 0.6, 0.01).name("Stability").onChange((v) => (u.uStability.value = v));
gui.add(params, "fireSpeed", 0, 3, 0.05).name("Fire Speed");
gui.add(params, "radius", 0.2, 1.2, 0.01).name("Radius");
gui.add(params, "height", 0.8, 4, 0.05).name("Height").onChange((v) => (u.uHeight.value = v));
gui.add(params, "windX", -1.5, 1.5, 0.01).name("Wind X");
gui.add(params, "windZ", -1.5, 1.5, 0.01).name("Wind Z");
gui.add(params, "sway", 0, 0.6, 0.01).name("Sway");
gui.add(params, "swaySpeed", 0, 3, 0.05).name("Sway Speed");
gui.add(params, "intensity", 0, 3, 0.05).name("Intensity").onChange((v) => (u.uIntensity.value = v));
gui.addColor(params, "tint").name("Tint").onChange((v) => u.uTint.value.set(v));
gui.add(params, "showSpline").name("Show Spline").onChange((v) => (splineGroup.visible = v));

window.fireDebug = { params, uniforms: u, gui, setTime: null };

// ========= リサイズ / ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let fireTime = 0;
let swayTime = 0;
let timeOverride = null;
window.fireDebug.setTime = (t) => { timeOverride = t; };

const camForward = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  fireTime += dt * params.fireSpeed;
  swayTime += dt;
  if (timeOverride !== null) {
    fireTime = timeOverride;
    swayTime = timeOverride;
  }
  controls.update();

  updateControlPoints(swayTime);
  updateCurveTexture();
  if (splineGroup.visible) updateSplineHelper();

  // スライスをカメラに正対させる
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  camRight.set(e[0], e[1], e[2]);
  camUp.set(e[4], e[5], e[6]);
  u.uCamRight.value.copy(camRight);
  u.uCamUp.value.copy(camUp);
  u.uFireCenter.value.set(0, params.height / 2, 0);
  camForward.copy(u.uFireCenter.value).sub(camera.position).normalize();
  u.uCamForward.value.copy(camForward);

  const horiz = maxCurveOffset + params.radius * 1.35;
  u.uBoundsRadius.value = Math.hypot(horiz, params.height / 2) * 1.05;

  u.uTime.value = fireTime;

  renderer.render(scene, camera);
});
