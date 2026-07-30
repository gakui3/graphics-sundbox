import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import { createIrisLayerMaterial, createHighlightMaterial } from "./eyeMaterials.js";

// ========= レンダラー / シーン / カメラ =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1c1e26");

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ========= 書籍から切り出したテクスチャ =========
const texLoader = new THREE.TextureLoader();
function loadBookTexture(url, { flipY = false } = {}) {
  return texLoader.loadAsync(url).then((tex) => {
    tex.flipY = flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}
const [irisTexture, highlightATexture, highlightBTexture, matcapTexture] = await Promise.all([
  loadBookTexture("./assets/iris_albedo.png"),
  loadBookTexture("./assets/lens_highlight_a.png"),
  loadBookTexture("./assets/lens_highlight_b.png"),
  loadBookTexture("./assets/matcap.png", { flipY: true }),
]);

// ========= モデル読み込み =========
const gltf = await new GLTFLoader().loadAsync("./miku.glb");
scene.add(gltf.scene);
gltf.scene.updateMatrixWorld(true);

let eyeBase = null;
let eyePlus = null;
let eyeHL = null;
gltf.scene.traverse((o) => {
  if (!o.isMesh && !o.isSkinnedMesh) return;
  const mat = o.material && o.material.name;
  if (mat === "eyes") eyeBase = o;
  else if (mat === "eyes_7") eyePlus = o;
  else if (mat === "material_8") eyeHL = o;
});
if (!eyeBase || !eyePlus || !eyeHL) {
  throw new Error(`eye meshes not found: base=${!!eyeBase} plus=${!!eyePlus} HL=${!!eyeHL}`);
}

// ========= 目のマテリアル差し替え =========
const eyeTexture = eyeBase.material.map;
const originalPlusMaterial = eyePlus.material;
const originalHLMaterial = eyeHL.material;

const irisMaterial = await createIrisLayerMaterial({ irisTexture, highlightATexture, highlightBTexture, matcapTexture });
const highlightMaterial = await createHighlightMaterial(eyeTexture);
eyePlus.material = irisMaterial;
eyePlus.renderOrder = 2;
eyeHL.material = highlightMaterial;
eyeHL.renderOrder = 3;

// ========= カメラを目の高さにフレーミング =========
const eyeBox = new THREE.Box3().setFromObject(eyeBase);
const eyeCenter = eyeBox.getCenter(new THREE.Vector3());
const eyeSize = eyeBox.getSize(new THREE.Vector3());
const eyeWidth = Math.max(eyeSize.x, eyeSize.y, eyeSize.z);

const modelBox = new THREE.Box3().setFromObject(gltf.scene);
const modelCenter = modelBox.getCenter(new THREE.Vector3());

// 目は頭の前面にあるので「モデル中心 -> 目」の水平方向が正面
const front = eyeCenter.clone().sub(modelCenter);
front.y = 0;
front.normalize();

controls.target.copy(eyeCenter);
camera.position.copy(eyeCenter).addScaledVector(front, eyeWidth * 3.2);
camera.position.y += eyeWidth * 0.15;
controls.update();

const shiftScale = eyeWidth;

// ========= GUI =========
const params = {
  effects: true,
  irisCenterU: 0.752,
  irisCenterV: 0.49,
  irisSize: 0.185,
  irisParallax: 0.025,
  irisIntensity: 0.9,
  glowIntensity: 0.4,
  glowColor: "#7a5cff",
  lensHighlight: 1.0,
  lensHighlightParallax: 1.5,
  matcapIntensity: 0.5,
  blackLevel: 0.1,
  hlMeshShift: 0.06,
  hlMeshIntensity: 1.0,
  cameraSway: false,
};

function applyParams() {
  irisMaterial.uniforms.uIrisCenter.value.set(params.irisCenterU, params.irisCenterV);
  irisMaterial.uniforms.uIrisSize.value = params.irisSize;
  irisMaterial.uniforms.uParallax.value = params.irisParallax;
  irisMaterial.uniforms.uIrisIntensity.value = params.irisIntensity;
  irisMaterial.uniforms.uGlowIntensity.value = params.glowIntensity;
  irisMaterial.uniforms.uGlowColor.value.set(params.glowColor);
  irisMaterial.uniforms.uHighlightIntensity.value = params.lensHighlight;
  irisMaterial.uniforms.uHighlightParallax.value = params.lensHighlightParallax;
  irisMaterial.uniforms.uMatcapIntensity.value = params.matcapIntensity;
  irisMaterial.uniforms.uBlackLevel.value = params.blackLevel;
  highlightMaterial.uniforms.uShift.value = params.hlMeshShift * shiftScale;
  highlightMaterial.uniforms.uIntensity.value = params.hlMeshIntensity;
}
applyParams();

function setEffects(on) {
  eyePlus.material = on ? irisMaterial : originalPlusMaterial;
  eyeHL.material = on ? highlightMaterial : originalHLMaterial;
}

const gui = new GUI({ title: "Eye Lens" });
gui.add(params, "effects").name("Effects").onChange(setEffects);
gui.add(params, "irisParallax", -0.08, 0.08, 0.001).name("Iris Parallax (B)").onChange(applyParams);
gui.add(params, "irisIntensity", 0, 2, 0.01).name("Iris Albedo (C)").onChange(applyParams);
gui.add(params, "glowIntensity", 0, 2, 0.01).name("Pupil Glow (D)").onChange(applyParams);
gui.addColor(params, "glowColor").name("Glow Color (D)").onChange(applyParams);
gui.add(params, "lensHighlight", 0, 2, 0.01).name("Lens Highlight (E)").onChange(applyParams);
gui.add(params, "lensHighlightParallax", 0, 4, 0.05).name("HL Parallax (E)").onChange(applyParams);
gui.add(params, "matcapIntensity", 0, 2, 0.01).name("Matcap (F)").onChange(applyParams);

const fitFolder = gui.addFolder("Iris Fit");
fitFolder.close();
fitFolder.add(params, "irisCenterU", 0.6, 0.9, 0.001).name("Center U").onChange(applyParams);
fitFolder.add(params, "irisCenterV", 0.2, 0.7, 0.001).name("Center V").onChange(applyParams);
fitFolder.add(params, "irisSize", 0.05, 0.25, 0.001).name("Size").onChange(applyParams);
fitFolder.add(params, "blackLevel", 0, 0.3, 0.005).name("Black Level").onChange(applyParams);

const hlFolder = gui.addFolder("HL Mesh");
hlFolder.close();
hlFolder.add(params, "hlMeshShift", -0.2, 0.2, 0.005).name("Shift").onChange(applyParams);
hlFolder.add(params, "hlMeshIntensity", 0, 2, 0.01).name("Intensity").onChange(applyParams);

gui.add(params, "cameraSway").name("Camera Sway");

window.eyeDebug = {
  params,
  applyParams,
  setEffects,
  orbit(rad) {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  },
};

// ========= リサイズ / ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const basePosition = camera.position.clone();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  if (params.cameraSway) {
    const t = clock.getElapsedTime();
    const offset = basePosition.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.8) * 0.35);
    camera.position.copy(controls.target).add(offset);
    camera.position.y += Math.sin(t * 0.5) * eyeWidth * 0.1;
  }
  controls.update();
  renderer.render(scene, camera);
});
