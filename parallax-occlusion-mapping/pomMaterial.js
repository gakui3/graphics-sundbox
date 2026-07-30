import * as THREE from "three";

const loadText = (url) => fetch(url).then((res) => res.text());

/**
 * POM / SPOM マテリアルを作成
 * @param {{color: THREE.Texture, normal: THREE.Texture, shga: THREE.Texture}} textures
 */
export async function createPOMMaterial(textures) {
  const [vertexShader, fragmentShader] = await Promise.all([
    loadText("./shaders/pom.vert"),
    loadText("./shaders/pom.frag"),
  ]);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tColor: { value: textures.color },
      tNormal: { value: textures.normal },
      tSHGA: { value: textures.shga },
      uTechnique: { value: 2 },
      uRepeat: { value: 1 },
      uHeightScale: { value: 0.048 },
      uMinSteps: { value: 12 },
      uMaxSteps: { value: 26 },
      uSelfShadow: { value: 1 },
      uShadowStrength: { value: 0.05 },
      uLightDir: { value: new THREE.Vector3(-1, -0.7, -0.5).normalize() },
      uLightColor: { value: new THREE.Color("#fff2dd") },
      uAmbient: { value: 0.28 },
      uShininess: { value: 32 },
      uSpecIntensity: { value: 0.5 },
    },
  });
}
