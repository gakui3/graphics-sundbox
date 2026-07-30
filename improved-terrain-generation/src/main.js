import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import {
  generateHeightmap,
  defaultNoiseParams,
  mulberry32,
} from "./terrain.js";
import { ErosionSimulator, defaultErosionParams } from "./erosion.js";
import { TerrainMesh } from "./terrainMesh.js";

// ========= 設定 =========
const MAP_SIZE = 256;
const WORLD_SIZE = 200;
const HEIGHT_SCALE = 55;

const noiseParams = { ...defaultNoiseParams };
const erosionParams = { ...defaultErosionParams };
const simSettings = { particlesPerFrame: 200, dropletBudget: 100000 };

let seed = 1234;
let heightmap = generateHeightmap(MAP_SIZE, noiseParams, seed);
let initialHeightmap = heightmap.slice();
let totalDroplets = 0;
let playing = false;

const simulator = new ErosionSimulator(MAP_SIZE, erosionParams);
const dropletRng = mulberry32(seed ^ 0x9e3779b9);

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

const terrain = new TerrainMesh(MAP_SIZE, WORLD_SIZE, HEIGHT_SCALE);
scene.add(terrain.mesh);
terrain.update(heightmap);

// ========= UI =========
const playBtn = document.getElementById("playBtn");
const counter = document.getElementById("counter");

function updateCounter() {
  counter.textContent = `${totalDroplets.toLocaleString()} / ${simSettings.dropletBudget.toLocaleString()} droplets`;
}

function setPlaying(value) {
  playing = value;
  playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
}

playBtn.addEventListener("click", () => setPlaying(!playing));

document.getElementById("resetBtn").addEventListener("click", () => {
  setPlaying(false);
  heightmap = initialHeightmap.slice();
  totalDroplets = 0;
  terrain.update(heightmap);
  updateCounter();
});

function regenerate() {
  setPlaying(false);
  heightmap = generateHeightmap(MAP_SIZE, noiseParams, seed);
  initialHeightmap = heightmap.slice();
  totalDroplets = 0;
  terrain.update(heightmap);
  updateCounter();
}

document.getElementById("regenBtn").addEventListener("click", () => {
  seed = (Math.random() * 0xffffffff) >>> 0;
  regenerate();
});

const gui = new GUI({ title: "Parameters" });
const erosionFolder = gui.addFolder("Erosion");
erosionFolder.add(erosionParams, "inertia", 0, 1, 0.01);
erosionFolder.add(erosionParams, "dropCapacity", 0.1, 30, 0.1);
erosionFolder.add(erosionParams, "depositionRate", 0, 1, 0.01);
erosionFolder.add(erosionParams, "erosionRate", 0, 1, 0.01);
erosionFolder.add(erosionParams, "evaporationRate", 0, 0.2, 0.001);
erosionFolder.add(erosionParams, "erosionRadius", 1, 8, 1);
erosionFolder.add(erosionParams, "maxLifetime", 10, 600, 10);
erosionFolder.add(simSettings, "particlesPerFrame", 10, 1000, 10);
erosionFolder.add(simSettings, "dropletBudget", 10000, 500000, 10000).onChange(updateCounter);
const noiseFolder = gui.addFolder("Noise (Regenerate で反映)");
noiseFolder.add(noiseParams, "octaves", 1, 8, 1);
noiseFolder.add(noiseParams, "frequency", 0.002, 0.05, 0.001);
noiseFolder.add(noiseParams, "persistence", 0.1, 0.9, 0.01);
noiseFolder.add(noiseParams, "falloff");
noiseFolder.onFinishChange(regenerate);

// ========= ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (playing) {
    // 予算を使い切ったら自動停止（延々と平坦化させない）
    const n = Math.min(
      simSettings.particlesPerFrame,
      simSettings.dropletBudget - totalDroplets,
    );
    for (let i = 0; i < n; i++) {
      simulator.simulateDroplet(heightmap, dropletRng);
    }
    totalDroplets += n;
    terrain.update(heightmap);
    updateCounter();
    if (totalDroplets >= simSettings.dropletBudget) setPlaying(false);
  }
  controls.update();
  renderer.render(scene, camera);
});

updateCounter();
