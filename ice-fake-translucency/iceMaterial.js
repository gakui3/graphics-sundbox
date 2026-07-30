import * as THREE from "three";

const loadText = (url) => fetch(url).then((res) => res.text());

/**
 * 氷の疑似半透明マテリアルを作成
 * @param {THREE.Texture} backgroundTexture - 背景を描いたレンダーターゲット
 * @param {THREE.Texture} detailTexture - 氷のディテールノイズ
 * @param {THREE.Vector2} resolution - 描画バッファ解像度
 */
export async function createIceMaterial(backgroundTexture, detailTexture, resolution) {
  const [vertexShader, fragmentShader] = await Promise.all([
    loadText("./shaders/ice.vert"),
    loadText("./shaders/ice.frag"),
  ]);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tBackground: { value: backgroundTexture },
      tDetail: { value: detailTexture },
      uResolution: { value: resolution },
      uStage: { value: 3 },
      uDistortion: { value: 0.05 },
      uDetailRefraction: { value: 0.01 },
      uRimPower: { value: 3.0 },
      uRimIntensity: { value: 1.8 },
      uRimColor: { value: new THREE.Color("#bfe0ff") },
      uBaseColor: { value: new THREE.Color("#0a0e18") },
      uTint: { value: new THREE.Color("#5fb8f0") },
      uDetailScale: { value: 0.2 },
      uDetailStrength: { value: 0.2 },
    },
  });
}
