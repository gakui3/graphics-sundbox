import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { createPOMMaterial } from "./pomMaterial.js";

// ========= 設定 =========
const SETS = ["wall1", "wall2", "wall3", "wall4"];

// ========= レンダラー / シーン / カメラ =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#101318");

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2.6, 2.4, 3.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;

// ========= テクスチャ読み込み =========
const texLoader = new THREE.TextureLoader();
function loadTex(url, { srgb = false, mipmap = true } = {}) {
  return texLoader.loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (!mipmap) {
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
    }
    return t;
  });
}

const textureSets = {};
await Promise.all(
  SETS.map(async (name) => {
    const base = `./wezu_tex_cc_by/${name}`;
    const [color, normal, shga] = await Promise.all([
      loadTex(`${base}_color.png`, { srgb: true }),
      loadTex(`${base}_n.png`),
      // ハイトはレイマーチ中の暗黙LODを避けるためミップマップなし
      loadTex(`${base}_shga.png`, { mipmap: false }),
    ]);
    textureSets[name] = { color, normal, shga };
  })
);

// ========= オブジェクト =========
const material = await createPOMMaterial(textureSets.wall3);

const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
cube.position.y = 1.1;
scene.add(cube);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material);
wall.position.set(0, 1.1, 0);
wall.visible = false;
scene.add(wall);

const lightArrow = new THREE.ArrowHelper(
  new THREE.Vector3(1, -1, 0.5).normalize(),
  new THREE.Vector3(-2.4, 3.2, -1.2), 1.2, 0xffd28a, 0.3, 0.18
);
scene.add(lightArrow);

// ========= GUI =========
const params = {
  technique: 2,
  object: "cube",
  textureSet: "wall3",
  heightScale: 0.048,
  minSteps: 12,
  maxSteps: 26,
  repeat: 1,
  selfShadow: true,
  shadowStrength: 0.05,
  lightAzimuth: 205,
  lightElevation: 34,
  autoRotate: false,
  showLightArrow: false,
};
lightArrow.visible = params.showLightArrow;

const u = material.uniforms;

function updateLight() {
  const az = THREE.MathUtils.degToRad(params.lightAzimuth);
  const el = THREE.MathUtils.degToRad(params.lightElevation);
  const dir = new THREE.Vector3(
    -Math.cos(el) * Math.sin(az),
    -Math.sin(el),
    -Math.cos(el) * Math.cos(az)
  ).normalize();
  u.uLightDir.value.copy(dir);
  lightArrow.setDirection(dir);
  lightArrow.position.copy(dir.clone().multiplyScalar(-3.2)).add(new THREE.Vector3(0, 1.1, 0));
}
updateLight();

const gui = new GUI({ title: "Parallax Occlusion" });
gui.add(params, "technique", { "Normal Map Only": 0, "POM": 1, "SPOM (Silhouette)": 2 })
  .name("Technique").onChange((v) => (u.uTechnique.value = v));
gui.add(params, "object", { Cube: "cube", Wall: "wall" }).name("Object").onChange((v) => {
  cube.visible = v === "cube";
  wall.visible = v === "wall";
});
gui.add(params, "textureSet", SETS).name("Texture").onChange((v) => {
  u.tColor.value = textureSets[v].color;
  u.tNormal.value = textureSets[v].normal;
  u.tSHGA.value = textureSets[v].shga;
});
gui.add(params, "heightScale", 0, 0.15, 0.002).name("Height Scale").onChange((v) => (u.uHeightScale.value = v));
gui.add(params, "minSteps", 4, 32, 1).name("Min Steps").onChange((v) => (u.uMinSteps.value = v));
gui.add(params, "maxSteps", 16, 64, 1).name("Max Steps").onChange((v) => (u.uMaxSteps.value = v));
gui.add(params, "repeat", 1, 4, 1).name("Tiling").onChange((v) => (u.uRepeat.value = v));
gui.add(params, "selfShadow").name("Self Shadow").onChange((v) => (u.uSelfShadow.value = v ? 1 : 0));
gui.add(params, "shadowStrength", 0, 2, 0.05).name("Shadow Strength").onChange((v) => (u.uShadowStrength.value = v));
gui.add(params, "lightAzimuth", 0, 360, 1).name("Light Azimuth").onChange(updateLight);
gui.add(params, "lightElevation", 5, 85, 1).name("Light Elevation").onChange(updateLight);
gui.add(params, "autoRotate").name("Auto Rotate");
gui.add(params, "showLightArrow").name("Show Light").onChange((v) => (lightArrow.visible = v));

window.pomDebug = { params, uniforms: u, gui, camera, controls };

// ========= リサイズ / ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (params.autoRotate) {
    cube.rotation.y += 0.004;
    wall.rotation.y += 0.004;
  }
  controls.update();
  renderer.render(scene, camera);
});
