import * as THREE from "three";

const loadText = (url) => fetch(url).then((res) => res.text());

/**
 * 虹彩レイヤー (eyes+ メッシュ) 用の加算マテリアルを作成
 * 視差付き虹彩 + 加算グロー + レンズハイライト + マットキャップを重ねる
 */
export async function createIrisLayerMaterial({ irisTexture, highlightATexture, highlightBTexture, matcapTexture }) {
  const [vertexShader, fragmentShader] = await Promise.all([
    loadText("./shaders/eye.vert"),
    loadText("./shaders/iris.frag"),
  ]);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tIris: { value: irisTexture },
      tHighlightA: { value: highlightATexture },
      tHighlightB: { value: highlightBTexture },
      tMatcap: { value: matcapTexture },
      uIrisCenter: { value: new THREE.Vector2(0.752, 0.49) },
      uIrisSize: { value: 0.185 },
      uShift: { value: 0 },
      uParallax: { value: 0.025 },
      uHighlightParallax: { value: 1.5 },
      uIrisIntensity: { value: 0.9 },
      uGlowIntensity: { value: 0.4 },
      uGlowColor: { value: new THREE.Color("#7a5cff") },
      uHighlightIntensity: { value: 1.0 },
      uMatcapIntensity: { value: 0.5 },
      uBlackLevel: { value: 0.1 },
    },
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * HLメッシュ用のハイライトマテリアルを作成 (uShift で視線方向に移動)
 */
export async function createHighlightMaterial(eyeTexture) {
  const [vertexShader, fragmentShader] = await Promise.all([
    loadText("./shaders/eye.vert"),
    loadText("./shaders/highlight.frag"),
  ]);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tEye: { value: eyeTexture },
      uShift: { value: 0 },
      uIntensity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
  });
}
