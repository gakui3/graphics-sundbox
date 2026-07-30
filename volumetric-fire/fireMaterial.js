import * as THREE from "three";

const loadText = (url) => fetch(url).then((res) => res.text());

/**
 * ビュー整列スライス + 加算ブレンドで描く炎のマテリアルを作成
 * @param {THREE.Texture} profileTexture - Fire Profile Texture (u=半径, v=高さ)
 * @param {THREE.DataTexture} curveTexture - Bスプライン曲線 (x,y=オフセット, z=半径)
 */
export async function createFireMaterial(profileTexture, curveTexture) {
  const [vertexShader, fragmentShader] = await Promise.all([
    loadText("./shaders/fire.vert"),
    loadText("./shaders/fire.frag"),
  ]);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uProfile: { value: profileTexture },
      uNoiseTex: { value: null },
      uUseNoiseTex: { value: 0 },
      uProfileIsImage: { value: 0 },
      uCurveTex: { value: curveTexture },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamForward: { value: new THREE.Vector3(0, 0, -1) },
      uFireCenter: { value: new THREE.Vector3(0, 1, 0) },
      uBoundsRadius: { value: 1.5 },
      uSliceCount: { value: 127 },
      uHeight: { value: 2.55 },
      uTime: { value: 0 },
      uScroll: { value: 1 },
      uFrequency: { value: 7.4 },
      uOctaves: { value: 4 },
      uGain: { value: 0.5 },
      uLacunarity: { value: 2 },
      uStability: { value: 0.28 },
      uIntensity: { value: 1.55 },
      uTint: { value: new THREE.Color("#ffffff") },
      uNoiseOffset: { value: new THREE.Vector3() },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
