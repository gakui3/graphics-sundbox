import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import GUI from "lil-gui";
import { createGroundTexture, createCrowdTexture, createAdTexture, createIceDetailTexture } from "./textures.js";
import { createIceMaterial } from "./iceMaterial.js";

// ========= レンダラー / シーン / カメラ =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b0d13");
scene.fog = new THREE.Fog("#0b0d13", 40, 90);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 3.4, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 4;
controls.maxDistance = 30;

// ========= スタジアム背景 =========
const stadium = new THREE.Group();
scene.add(stadium);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
stadium.add(ground);

const crowdWall = new THREE.Mesh(
  new THREE.CylinderGeometry(38, 38, 14, 64, 1, true),
  new THREE.MeshStandardMaterial({ map: createCrowdTexture(), side: THREE.BackSide, roughness: 1 })
);
crowdWall.position.y = 9.5;
stadium.add(crowdWall);

const adBand = new THREE.Mesh(
  new THREE.CylinderGeometry(37.5, 37.5, 2.6, 64, 1, true),
  new THREE.MeshStandardMaterial({ map: createAdTexture(), side: THREE.BackSide, roughness: 1 })
);
adBand.position.y = 1.3;
stadium.add(adBand);

// ライト
scene.add(new THREE.HemisphereLight("#bdd2ff", "#2a3a1e", 1.0));
const sun = new THREE.DirectionalLight("#fff4e0", 2.0);
sun.position.set(8, 18, 10);
scene.add(sun);

for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
  const x = Math.cos(angle) * 34;
  const z = Math.sin(angle) * 34;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.4),
    new THREE.MeshBasicMaterial({ color: "#e8f0ff" })
  );
  panel.position.set(x, 17, z);
  panel.lookAt(0, 2, 0);
  stadium.add(panel);
  const light = new THREE.PointLight("#cfe0ff", 220, 80, 1.8);
  light.position.set(x * 0.9, 15, z * 0.9);
  stadium.add(light);
}

// ========= 背景切り替え (スタジアム / cubemap) =========
const cubeMap = new THREE.CubeTextureLoader()
  .setPath("./Yokohama3/")
  .load(["posx.jpg", "negx.jpg", "posy.jpg", "negy.jpg", "posz.jpg", "negz.jpg"]);
cubeMap.colorSpace = THREE.SRGBColorSpace;

const stadiumBgColor = new THREE.Color("#0b0d13");
const stadiumFog = scene.fog;

function setBackground(mode) {
  const useCube = mode === "cubemap";
  stadium.visible = !useCube;
  scene.background = useCube ? cubeMap : stadiumBgColor;
  scene.fog = useCube ? null : stadiumFog;
}
setBackground("cubemap");

// ========= 氷柱 =========
function createIceGeometry() {
  let geo = new THREE.ConeGeometry(1.5, 4.6, 96, 48, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const angle = Math.atan2(v.z, v.x);
    const h = (v.y + 2.3) / 4.6;
    const bump =
      0.10 * Math.sin(angle * 3 + h * 5) +
      0.07 * Math.sin(angle * 7 + 2.0 + h * 11) +
      0.05 * Math.sin(angle * 13 + h * 23 + 5.0) +
      0.04 * Math.sin(h * 40 + angle * 2);
    pos.setX(i, v.x * (1.0 + bump));
    pos.setZ(i, v.z * (1.0 + bump));
  }
  // シームで法線が割れないよう頂点を結合してから再計算
  geo.deleteAttribute("uv");
  geo.deleteAttribute("normal");
  geo = BufferGeometryUtils.mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  return geo;
}

const drawingSize = new THREE.Vector2();
renderer.getDrawingBufferSize(drawingSize);
const backgroundRT = new THREE.WebGLRenderTarget(drawingSize.x, drawingSize.y, { samples: 4 });

const resolution = new THREE.Vector2(drawingSize.x, drawingSize.y);
const iceMaterial = await createIceMaterial(backgroundRT.texture, createIceDetailTexture(), resolution);
const ice = new THREE.Mesh(createIceGeometry(), iceMaterial);
ice.position.y = 2.3;
scene.add(ice);

// ========= GUI =========
const params = {
  stage: 3,
  background: "cubemap",
  autoRotate: false,
};
const stageLabels = {
  "A: Base Model + Rim Light": 0,
  "B: Project Framebuffer": 1,
  "C: Distort by Normals": 2,
  "D: Composite Ice Detail": 3,
};

const gui = new GUI({ title: "Opaque Ice" });
gui.add(params, "stage", stageLabels).name("Stage").onChange((v) => {
  iceMaterial.uniforms.uStage.value = v;
});
gui.add(params, "background", { "Yokohama3 (cubemap)": "cubemap", "Stadium": "stadium" })
  .name("Background").onChange(setBackground);
gui.add(iceMaterial.uniforms.uDistortion, "value", 0, 0.3, 0.005).name("Distortion (C)");
gui.add(iceMaterial.uniforms.uDetailRefraction, "value", 0, 0.15, 0.005).name("Detail Refraction (D)");
gui.add(iceMaterial.uniforms.uDetailStrength, "value", 0, 1, 0.01).name("Detail Strength (D)");
gui.add(iceMaterial.uniforms.uDetailScale, "value", 0.1, 2, 0.05).name("Detail Scale");
gui.add(iceMaterial.uniforms.uRimIntensity, "value", 0, 3, 0.05).name("Rim Intensity");
gui.add(iceMaterial.uniforms.uRimPower, "value", 0.5, 8, 0.1).name("Rim Power");
gui.addColor({ tint: "#5fb8f0" }, "tint").name("Tint (D)").onChange((v) => {
  iceMaterial.uniforms.uTint.value.set(v);
});
gui.add(params, "autoRotate").name("Auto Rotate").onChange((v) => {
  controls.autoRotate = v;
});

window.iceDebug = {
  setStage(n) {
    params.stage = n;
    iceMaterial.uniforms.uStage.value = n;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
  setBackground(mode) {
    params.background = mode;
    setBackground(mode);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
};

// ========= リサイズ / ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.getDrawingBufferSize(drawingSize);
  backgroundRT.setSize(drawingSize.x, drawingSize.y);
  resolution.set(drawingSize.x, drawingSize.y);
});

// 氷を隠して背景だけRTへ描き、氷のシェーダーからスクリーン投影で参照する
renderer.setAnimationLoop(() => {
  controls.update();

  ice.visible = false;
  renderer.setRenderTarget(backgroundRT);
  renderer.render(scene, camera);

  ice.visible = true;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
});
