import * as THREE from "three";
import { loadShader } from "./shaderLoader.js";

const METRIC_SIZE = 256;

/**
 * 反射方向バッファを作り、そこから 2 経路の相対 RMSE と最大誤差を集計する。
 * 画面全体ではなく反射体の画素だけを対象にする。
 */
export class MetricPass {
  constructor(renderer) {
    this.renderer = renderer;
    this.dirTarget = new THREE.WebGLRenderTarget(METRIC_SIZE, METRIC_SIZE, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.metricTarget = new THREE.WebGLRenderTarget(METRIC_SIZE, METRIC_SIZE, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
    });
    this.pixels = new Float32Array(METRIC_SIZE * METRIC_SIZE * 4);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  async init() {
    const [vert, dirFrag, metricFrag, reflectVert] = await Promise.all([
      loadShader("./shaders/fullscreen.vert"),
      loadShader("./shaders/dirbuffer.frag"),
      loadShader("./shaders/metric.frag"),
      loadShader("./shaders/reflect.vert"),
    ]);

    this.dirMaterial = new THREE.ShaderMaterial({
      vertexShader: reflectVert,
      fragmentShader: dirFrag,
      side: THREE.DoubleSide,
    });

    this.metricMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `precision highp float;
in vec3 position;
in vec2 uv;
out vec2 v2f_uv;
void main() {
  v2f_uv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,
      fragmentShader: metricFrag
        .replace(/varying/g, "in")
        .replace(/gl_FragColor/g, "fragColor")
        .replace("precision highp float;", "precision highp float;\nout vec4 fragColor;"),
      uniforms: {
        uMapA: { value: null },
        uMapB: { value: null },
        uCubeRef: { value: null },
        uCubeTruth: { value: null },
        uDpBasis: { value: new THREE.Matrix3() },
        uR: { value: 1.15 },
        uBlendWidth: { value: 0.12 },
        uHardSwitch: { value: 0 },
        uUseMipmap: { value: 1 },
        uPathLeft: { value: 0 },
        uPathRight: { value: 2 },
        uDirBuffer: { value: this.dirTarget.texture },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.metricMaterial);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** 反射体を方向バッファへ描く */
  renderDirections(mesh, camera) {
    const prevMaterial = mesh.material;
    const prevTarget = this.renderer.getRenderTarget();
    const scene = mesh.parent;

    mesh.material = this.dirMaterial;
    this.renderer.setRenderTarget(this.dirTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(prevTarget);
    mesh.material = prevMaterial;
  }

  /** 相対 RMSE と最大誤差を返す */
  measure(uniforms) {
    const u = this.metricMaterial.uniforms;
    u.uMapA.value = uniforms.uMapA.value;
    u.uMapB.value = uniforms.uMapB.value;
    u.uCubeRef.value = uniforms.uCubeRef.value;
    u.uCubeTruth.value = uniforms.uCubeTruth.value;
    u.uDpBasis.value.copy(uniforms.uDpBasis.value);
    u.uR.value = uniforms.uR.value;
    u.uBlendWidth.value = uniforms.uBlendWidth.value;
    u.uHardSwitch.value = uniforms.uHardSwitch.value;
    u.uUseMipmap.value = uniforms.uUseMipmap.value;
    u.uPathLeft.value = uniforms.uPathLeft.value;
    u.uPathRight.value = uniforms.uPathRight.value;

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.metricTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(
      this.metricTarget, 0, 0, METRIC_SIZE, METRIC_SIZE, this.pixels,
    );
    this.renderer.setRenderTarget(prevTarget);

    let sumSq = 0;
    let sumRef = 0;
    let maxErr = 0;
    let count = 0;
    for (let i = 0; i < this.pixels.length; i += 4) {
      if (this.pixels[i + 3] < 0.5) continue;
      sumSq += this.pixels[i];
      sumRef += this.pixels[i + 1];
      maxErr = Math.max(maxErr, this.pixels[i + 2]);
      count++;
    }
    if (count === 0) return { rmse: 0, relRmse: 0, maxErr: 0, count: 0 };

    const rmse = Math.sqrt(sumSq / (count * 3));
    const refRms = Math.sqrt(sumRef / (count * 3));
    return {
      rmse,
      relRmse: refRms > 1e-6 ? rmse / refRms : 0,
      maxErr,
      count,
    };
  }
}
