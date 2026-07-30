import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { defaultBasis, forward, maxBlendWidth, MAP_A, MAP_B } from "./dpMath.js";
import { DualParaboloidBaker, defaultBakeParams } from "./bake.js";
import { ReferenceCube } from "./referenceCube.js";
import { MetricPass } from "./compare.js";
import { runSelfTest, runGpuTest } from "./selfTest.js";
import { loadShader } from "./shaderLoader.js";
import { createLatLongGrid, createDirectionColor, createBrightDisc } from "./testPatterns.js";

// ========= 設定 =========
const PATHS = { "DP map": 0, "Cubemap (same res)": 1, "Ground truth": 2 };
const DISPLAY = { Single: 0, Split: 1, Difference: 2 };

// ========= レンダラー / シーン / カメラ =========
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;

// ========= 環境マップ =========
const sources = {};
sources.Yokohama = new THREE.CubeTextureLoader()
  .setPath("../dual-paraboloid-map/Yokohama/")
  .load(["posx.jpg", "negx.jpg", "posy.jpg", "negy.jpg", "posz.jpg", "negz.jpg"]);
sources.Yokohama.colorSpace = THREE.SRGBColorSpace;
sources["Lat/long grid"] = createLatLongGrid(512, 10);
sources["Direction color"] = createDirectionColor(256);
sources["Bright disc"] = createBrightDisc(512, { lat: 20, lon: 0 }, 5);

// ========= パラメータ =========
const params = {
  source: "Yokohama",
  resolution: defaultBakeParams.resolution,
  R: defaultBakeParams.R,
  supersamples: defaultBakeParams.supersamples,
  useAnalyticLod: true,
  generateMipmaps: true,
  blendWidth: 0.12,
  hardSwitch: false,
  useMipmap: true,
  shape: "Sphere",
  pathLeft: 0,
  pathRight: 2,
  display: 0,
  splitX: 0.5,
  diffGain: 8,
  showMaps: true,
};

const dpBasis = defaultBasis();

// ========= 反射体 =========
const shapes = {
  Sphere: new THREE.SphereGeometry(1, 128, 96),
  "Flat up-facing": new THREE.BoxGeometry(2.4, 0.12, 1.8, 1, 1, 1),
  "Torus knot": new THREE.TorusKnotGeometry(0.75, 0.26, 256, 48),
};

const baker = new DualParaboloidBaker(renderer);
const referenceCube = new ReferenceCube(renderer);
const metric = new MetricPass(renderer);

const [reflectVert, reflectFrag, fullscreenVert, gpuTestFrag] = await Promise.all([
  loadShader("./shaders/reflect.vert"),
  loadShader("./shaders/reflect.frag"),
  loadShader("./shaders/fullscreen.vert"),
  loadShader("./shaders/gputest.frag"),
]);
await baker.init();
await metric.init();

const reflectMaterial = new THREE.ShaderMaterial({
  vertexShader: reflectVert,
  fragmentShader: reflectFrag,
  uniforms: {
    uMapA: { value: null },
    uMapB: { value: null },
    uCubeRef: { value: null },
    uCubeTruth: { value: sources.Yokohama },
    uDpBasis: { value: dpBasis.clone() },
    uR: { value: params.R },
    uBlendWidth: { value: params.blendWidth },
    uHardSwitch: { value: 0 },
    uUseMipmap: { value: 1 },
    uPathLeft: { value: params.pathLeft },
    uPathRight: { value: params.pathRight },
    uDisplayMode: { value: params.display },
    uSplitX: { value: params.splitX },
    uDiffGain: { value: params.diffGain },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
});

const reflector = new THREE.Mesh(shapes.Sphere, reflectMaterial);
scene.add(reflector);

// ========= DP マップのデバッグ表示 =========
const mapPreview = new THREE.Group();
const previewScene = new THREE.Scene();
const previewCamera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
previewScene.add(mapPreview);

const previewMaterials = [];
for (let i = 0; i < 2; i++) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uMap: { value: null }, uR: { value: params.R } },
    vertexShader: `
varying vec2 v2f_uv;
void main() {
    v2f_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
uniform sampler2D uMap;
uniform float uR;
varying vec2 v2f_uv;
void main() {
    vec3 c = texture2D(uMap, v2f_uv).rgb;
    // 単位円 (q=1) と R の枠を重ねる
    vec2 st = (v2f_uv * 2.0 - 1.0) * uR;
    float r = length(st);
    float unitCircle = smoothstep(0.012, 0.0, abs(r - 1.0));
    float border = smoothstep(0.012, 0.0, abs(max(abs(st.x), abs(st.y)) - uR));
    c = mix(c, vec3(1.0, 0.35, 0.2), unitCircle);
    c = mix(c, vec3(0.3, 0.8, 1.0), border);
    gl_FragColor = vec4(c, 1.0);
}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  quad.position.set(0.5, 0.5, 0);
  mapPreview.add(quad);
  previewMaterials.push(mat);
}

// ========= ベイク =========
let bakeResult = null;

function rebake() {
  const source = sources[params.source];
  bakeResult = baker.bake(source, dpBasis, {
    resolution: params.resolution,
    R: params.R,
    supersamples: params.supersamples,
    useAnalyticLod: params.useAnalyticLod,
    generateMipmaps: params.generateMipmaps,
  });
  const refTex = referenceCube.build(source, params.resolution);

  const u = reflectMaterial.uniforms;
  u.uMapA.value = bakeResult.mapA;
  u.uMapB.value = bakeResult.mapB;
  u.uCubeRef.value = refTex;
  u.uCubeTruth.value = source;
  u.uR.value = params.R;
  previewMaterials[0].uniforms.uMap.value = bakeResult.mapA;
  previewMaterials[1].uniforms.uMap.value = bakeResult.mapB;
  previewMaterials[0].uniforms.uR.value = params.R;
  previewMaterials[1].uniforms.uR.value = params.R;
}

// テクスチャの読み込みを待ってから焼く
await new Promise((resolve) => {
  if (sources.Yokohama.image && sources.Yokohama.image.length === 6) return resolve();
  const timer = setInterval(() => {
    if (sources.Yokohama.image && sources.Yokohama.image.length === 6) {
      clearInterval(timer);
      resolve();
    }
  }, 50);
});
rebake();

// ========= セルフテスト (仕様 7-1 / 7-2) =========
const testResults = runSelfTest(dpBasis, { R: params.R, blendWidth: params.blendWidth });
testResults.push(...runGpuTests());

function runGpuTests() {
  // JS 側で方向と (s,t) を作り、テクスチャで GPU に渡す
  const size = 64;
  const dirData = new Float32Array(size * size * 4);
  const refData = new Float32Array(size * size * 4);
  let seed = 12345;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const z = rng() * 2 - 1;
    const phi = rng() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const d = { x: r * Math.cos(phi), y: r * Math.sin(phi), z };
    const map = d.z < 0 ? MAP_A : MAP_B;
    const st = forward(d, map);
    dirData[i * 4] = d.x;
    dirData[i * 4 + 1] = d.y;
    dirData[i * 4 + 2] = d.z;
    dirData[i * 4 + 3] = map === MAP_B ? 1 : 0;
    refData[i * 4] = st.s;
    refData[i * 4 + 1] = st.t;
  }

  const dirTex = new THREE.DataTexture(dirData, size, size, THREE.RGBAFormat, THREE.FloatType);
  dirTex.needsUpdate = true;
  const refTex = new THREE.DataTexture(refData, size, size, THREE.RGBAFormat, THREE.FloatType);
  refTex.needsUpdate = true;

  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: `precision highp float;
in vec3 position;
in vec2 uv;
out vec2 v2f_uv;
void main() {
  v2f_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
    fragmentShader: gpuTestFrag
      .replace(/varying/g, "in")
      .replace(/gl_FragColor/g, "fragColor")
      .replace("precision highp float;", "precision highp float;\nout vec4 fragColor;"),
    uniforms: { uDirs: { value: dirTex }, uRefSt: { value: refTex } },
  });

  return runGpuTest(renderer, mat, size);
}

// ========= GUI =========
const gui = new GUI({ title: "Dual-Paraboloid" });

const bakeFolder = gui.addFolder("Bake (changing re-bakes)");
bakeFolder.add(params, "source", Object.keys(sources)).name("Environment").onChange(rebake);
bakeFolder.add(params, "resolution", [64, 128, 256, 512, 1024]).name("Map resolution").onChange(rebake);
bakeFolder.add(params, "R", 1.0, 1.5, 0.01).name("Guard band R").onChange(() => {
  rebake();
  updateBlendLimit();
});
bakeFolder.add(params, "supersamples", [1, 2, 4, 8, 16, 32]).name("Samples per axis (N)").onChange(rebake);
bakeFolder.add(params, "useAnalyticLod").name("Use analytic LOD").onChange(rebake);
bakeFolder.add(params, "generateMipmaps").name("Generate mipmaps").onChange(rebake);

const drawFolder = gui.addFolder("Reflection");
drawFolder.add(params, "shape", Object.keys(shapes)).name("Shape").onChange((v) => {
  reflector.geometry = shapes[v];
});
const blendCtrl = drawFolder.add(params, "blendWidth", 0, 0.3, 0.005).name("Blend half-width w")
  .onChange((v) => (reflectMaterial.uniforms.uBlendWidth.value = v));
drawFolder.add(params, "hardSwitch").name("Hard switch at the seam")
  .onChange((v) => (reflectMaterial.uniforms.uHardSwitch.value = v ? 1 : 0));
drawFolder.add(params, "useMipmap").name("Use mipmaps when sampling")
  .onChange((v) => (reflectMaterial.uniforms.uUseMipmap.value = v ? 1 : 0));

const compareFolder = gui.addFolder("Compare");
compareFolder.add(params, "display", DISPLAY).name("Display mode")
  .onChange((v) => (reflectMaterial.uniforms.uDisplayMode.value = v));
compareFolder.add(params, "pathLeft", PATHS).name("Path A (left)")
  .onChange((v) => (reflectMaterial.uniforms.uPathLeft.value = v));
compareFolder.add(params, "pathRight", PATHS).name("Path B (right)")
  .onChange((v) => (reflectMaterial.uniforms.uPathRight.value = v));
compareFolder.add(params, "splitX", 0, 1, 0.01).name("Split position")
  .onChange((v) => (reflectMaterial.uniforms.uSplitX.value = v));
compareFolder.add(params, "diffGain", 1, 64, 1).name("Difference gain")
  .onChange((v) => (reflectMaterial.uniforms.uDiffGain.value = v));
compareFolder.add(params, "showMaps").name("Show baked maps");

// 計測結果。表示専用なので触れないようにしておく
const metrics = { relRmse: "0", maxError: "0", samples: "0" };
const metricFolder = gui.addFolder("Error vs path B");
metricFolder.add(metrics, "relRmse").name("relative RMSE").listen().disable();
metricFolder.add(metrics, "maxError").name("max error").listen().disable();
metricFolder.add(metrics, "samples").name("samples").listen().disable();

function updateBlendLimit() {
  const wMax = maxBlendWidth(params.R);
  blendCtrl.max(Math.max(0.001, wMax));
  if (params.blendWidth > wMax) {
    params.blendWidth = wMax;
    reflectMaterial.uniforms.uBlendWidth.value = wMax;
  }
  blendCtrl.updateDisplay();
}
updateBlendLimit();

gui.folders.forEach((f) => f.close());

window.dpDebug = {
  params,
  gui,
  rebake,
  set(prop, value) {
    const c = gui.controllersRecursive().find((x) => x.property === prop);
    c.setValue(value);
    return `${prop} = ${value}`;
  },
  get stats() {
    return stats;
  },
  get tests() {
    return testResults;
  },
};

// ========= 計測値 =========
let stats = { relRmse: 0, maxErr: 0, count: 0 };

function updateMetrics() {
  metrics.relRmse = stats.relRmse.toFixed(5);
  metrics.maxError = stats.maxErr.toFixed(5);
  metrics.samples = String(stats.count);
}

// セルフテストの結果は console に出す
console.table(testResults.map((r) => ({ result: r.pass ? "PASS" : "FAIL", name: r.name, detail: r.detail })));

// ========= リサイズ / ループ =========
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  reflectMaterial.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

let frame = 0;
renderer.setAnimationLoop(() => {
  controls.update();

  // 数値は毎フレームだと重いので数フレームおき
  if (frame % 10 === 0) {
    metric.renderDirections(reflector, camera);
    stats = metric.measure(reflectMaterial.uniforms);
    updateMetrics();
  }
  frame++;

  renderer.render(scene, camera);

  if (params.showMaps) {
    const size = Math.min(180, window.innerWidth * 0.16);
    const gap = 8;
    renderer.autoClear = false;
    for (let i = 0; i < 2; i++) {
      const x = window.innerWidth - (2 - i) * (size + gap);
      const y = gap;
      renderer.setViewport(x, y, size, size);
      renderer.setScissor(x, y, size, size);
      renderer.setScissorTest(true);
      mapPreview.children[0].visible = i === 0;
      mapPreview.children[1].visible = i === 1;
      renderer.render(previewScene, previewCamera);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.autoClear = true;
  }
});
