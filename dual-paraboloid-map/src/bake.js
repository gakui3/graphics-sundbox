import * as THREE from "three";
import { loadShader } from "./shaderLoader.js";

export const defaultBakeParams = {
  resolution: 128,
  R: 1.15,
  supersamples: 8,
  useAnalyticLod: true,
  generateMipmaps: true,
};

export class DualParaboloidBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.targets = [null, null];
    this.resolution = 0;
  }

  async init() {
    const [vert, frag] = await Promise.all([
      loadShader("./shaders/fullscreen.vert"),
      loadShader("./shaders/bake.frag"),
    ]);

    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: toGlsl3Vert(vert),
      fragmentShader: toGlsl3Frag(frag),
      uniforms: {
        uSource: { value: null },
        uDpBasisInv: { value: new THREE.Matrix3() },
        uR: { value: defaultBakeParams.R },
        uSupersamples: { value: defaultBakeParams.supersamples },
        uResolution: { value: defaultBakeParams.resolution },
        uSourceSize: { value: 512 },
        uUseAnalyticLod: { value: 1 },
        uMapIndex: { value: 0 },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  allocate(resolution, generateMipmaps) {
    if (this.resolution === resolution && this.targets[0]) {
      const needsMip = !!this.targets[0].texture.generateMipmaps;
      if (needsMip === generateMipmaps) return;
    }
    for (const t of this.targets) if (t) t.dispose();
    for (let i = 0; i < 2; i++) {
      // MAP_A / MAP_B は別テクスチャ。アトラスにするとミップで滲む
      this.targets[i] = new THREE.WebGLRenderTarget(resolution, resolution, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        generateMipmaps,
        depthBuffer: false,
        stencilBuffer: false,
      });
      this.targets[i].texture.colorSpace = THREE.NoColorSpace;
    }
    this.resolution = resolution;
  }

  /**
   * cubemap から DP マップ2枚を焼く
   * @param {THREE.CubeTexture} source - 入力 cubemap
   * @param {THREE.Matrix3} dpBasis - world -> DP
   * @param {object} params - defaultBakeParams と同じ形
   */
  bake(source, dpBasis, params) {
    this.allocate(params.resolution, params.generateMipmaps);

    const basisInv = new THREE.Matrix3().copy(dpBasis).invert();
    const u = this.material.uniforms;
    u.uSource.value = source;
    u.uDpBasisInv.value.copy(basisInv);
    u.uR.value = params.R;
    u.uSupersamples.value = Math.min(32, Math.max(1, params.supersamples));
    u.uResolution.value = params.resolution;
    u.uSourceSize.value = sourceSize(source);
    u.uUseAnalyticLod.value = params.useAnalyticLod ? 1 : 0;

    const prevTarget = this.renderer.getRenderTarget();
    for (let i = 0; i < 2; i++) {
      u.uMapIndex.value = i;
      this.renderer.setRenderTarget(this.targets[i]);
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.setRenderTarget(prevTarget);

    return { mapA: this.targets[0].texture, mapB: this.targets[1].texture };
  }
}

function sourceSize(source) {
  const img = source && source.image;
  if (Array.isArray(img) && img[0]) return img[0].width || img[0].naturalWidth || 512;
  if (img && img.width) return img.width;
  return 512;
}

// RawShaderMaterial + GLSL3 用に varying などを書き換える
function toGlsl3Vert(src) {
  return `precision highp float;
in vec3 position;
in vec2 uv;
${src.replace(/varying/g, "out")}`;
}

function toGlsl3Frag(src) {
  return `${src
    .replace(/varying/g, "in")
    .replace(/gl_FragColor/g, "fragColor")}`
    .replace("precision highp float;", "precision highp float;\nout vec4 fragColor;\nconst float PI = 3.141592653589793;");
}
