import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { generateTerrain, generateHardness } from "./diamondSquare.js";
import { ErosionSimulation, defaultParams } from "./simulation.js";
import { TerrainMesh } from "./terrainMesh.js";
import { WaterMesh } from "./waterMesh.js";

// ========= 設定 =========
const MAP_SIZE = 1024;
const WORLD_SIZE = 200;

const params = { ...defaultParams };
const terrainSettings = {
  amplitude: 160, // 地形の最大高さ（シミュレーション単位 = セル幅）
  roughness: 1.0,
};
const viewSettings = {
  showWater: true,
  waterMinDepth: 0.08,
  iterationsPerFrame: 2,
};

let seed = 1234;
let playing = false;

const sim = new ErosionSimulation(MAP_SIZE, params);

function buildTerrain() {
  const h01 = generateTerrain(MAP_SIZE, terrainSettings.roughness, seed);
  const terrain = new Float32Array(h01.length);
  for (let i = 0; i < h01.length; i++) {
    terrain[i] = h01[i] * terrainSettings.amplitude;
  }
  const hardness = generateHardness(h01, MAP_SIZE, seed, params.Rmin);
  return { terrain, hardness };
}

let initial = buildTerrain();
sim.reset(initial.terrain, initial.hardness);

// ========= three.js シーン =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bbbd4);
scene.fog = new THREE.Fog(0x9bbbd4, 350, 700);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(150, 120, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 15, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x5a4a3a, 0.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(120, 180, 80);
scene.add(sun);

const terrainMesh = new TerrainMesh(MAP_SIZE, WORLD_SIZE);
scene.add(terrainMesh.mesh);
const waterMesh = new WaterMesh(MAP_SIZE, WORLD_SIZE);
scene.add(waterMesh.mesh);

function refreshMeshes() {
  terrainMesh.update(sim.b);
  const stats = waterMesh.update(
    sim.b,
    sim.d,
    sim.s,
    viewSettings.waterMinDepth,
  );
  return stats;
}

terrainMesh.setHeightRef(initial.terrain);
refreshMeshes();

// ========= UI =========
const playBtn = document.getElementById("playBtn");
const counter = document.getElementById("counter");

function updateCounter(stats) {
  let text = `${sim.iteration.toLocaleString()} iterations`;
  if (stats) {
    text += ` | water max ${stats.maxWater.toFixed(2)} | sed max ${stats.maxSediment.toFixed(3)}`;
  }
  counter.textContent = text;
}

function setPlaying(value) {
  playing = value;
  playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
}

playBtn.addEventListener("click", () => setPlaying(!playing));

document.getElementById("resetBtn").addEventListener("click", () => {
  setPlaying(false);
  sim.reset(initial.terrain, initial.hardness);
  updateCounter(refreshMeshes());
});

function regenerate() {
  setPlaying(false);
  initial = buildTerrain();
  sim.reset(initial.terrain, initial.hardness);
  terrainMesh.setHeightRef(initial.terrain);
  updateCounter(refreshMeshes());
}

document.getElementById("regenBtn").addEventListener("click", () => {
  seed = (Math.random() * 0xffffffff) >>> 0;
  regenerate();
});

const gui = new GUI({ title: "Parameters" });
const simFolder = gui.addFolder("Simulation");
simFolder.add(params, "dt", 0.001, 0.05, 0.001);
simFolder.add(viewSettings, "iterationsPerFrame", 1, 50, 1);
const waterFolder = gui.addFolder("Water");
waterFolder.add(params, "rainEnabled").name("rain");
waterFolder.add(params, "Kr", 0, 0.05, 0.001).name("Kr (rain rate)");
waterFolder.add(params, "Ke", 0, 0.05, 0.001).name("Ke (evaporation)");
waterFolder.add(params, "A", 0.1, 60, 0.1).name("A (pipe area)");
waterFolder.add(params, "drainEdges").name("drain edges");
waterFolder.add(viewSettings, "showWater").onChange((v) => {
  waterMesh.mesh.visible = v;
});
waterFolder.add(viewSettings, "waterMinDepth", 0, 0.5, 0.01);
const hydroFolder = gui.addFolder("Hydraulic erosion");
hydroFolder.add(params, "hydraulicEnabled").name("enabled");
hydroFolder.add(params, "Kc", 0.1, 3, 0.05).name("Kc (capacity)");
hydroFolder.add(params, "Ks", 0.1, 2, 0.05).name("Ks (suspension)");
hydroFolder.add(params, "Kd", 0.1, 3, 0.05).name("Kd (deposition)");
hydroFolder.add(params, "Kh", 0, 10, 0.1).name("Kh (softening)");
hydroFolder.add(params, "Kdmax", 0.1, 40, 0.1).name("Kdmax (max depth)");
const thermalFolder = gui.addFolder("Thermal erosion");
thermalFolder.add(params, "thermalEnabled").name("enabled");
thermalFolder.add(params, "Kt", 0, 3, 0.01).name("Kt (rate)");
thermalFolder.add(params, "Ka", 0, 1, 0.01).name("Ka (talus coeff)");
thermalFolder.add(params, "Ki", 0, 1, 0.01).name("Ki (talus bias)");
const terrainFolder = gui.addFolder("Terrain (Regenerate で反映)");
terrainFolder.add(terrainSettings, "amplitude", 20, 320, 1);
terrainFolder.add(terrainSettings, "roughness", 0.4, 1.2, 0.01);
terrainFolder.onFinishChange(regenerate);

// ========= ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (playing) {
    for (let i = 0; i < viewSettings.iterationsPerFrame; i++) {
      sim.step();
    }
    updateCounter(refreshMeshes());
  }
  controls.update();
  renderer.render(scene, camera);
});

updateCounter();
