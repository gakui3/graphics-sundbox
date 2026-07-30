import * as THREE from "three";

/**
 * 入力 cubemap を指定解像度に落としたリファレンスを作る。
 * DP と同じ情報量で比べるため、CubeCamera で焼き直す。
 */
export class ReferenceCube {
  constructor(renderer) {
    this.renderer = renderer;
    this.resolution = 0;
    this.target = null;
    this.scene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSource: { value: null } },
      vertexShader: `
varying vec3 v2f_dir;
void main() {
    v2f_dir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform samplerCube uSource;
varying vec3 v2f_dir;
void main() {
    gl_FragColor = vec4(textureCube(uSource, normalize(v2f_dir)).rgb, 1.0);
}`,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this.material);
    box.frustumCulled = false;
    this.scene.add(box);
  }

  build(source, resolution) {
    if (this.resolution !== resolution) {
      if (this.target) this.target.dispose();
      this.target = new THREE.WebGLCubeRenderTarget(resolution, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
      });
      this.target.texture.colorSpace = THREE.NoColorSpace;
      this.resolution = resolution;
    }

    this.material.uniforms.uSource.value = source;
    const camera = new THREE.CubeCamera(0.1, 100, this.target);
    const prevTarget = this.renderer.getRenderTarget();
    camera.update(this.renderer, this.scene);
    this.renderer.setRenderTarget(prevTarget);

    return this.target.texture;
  }
}
