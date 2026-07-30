import * as THREE from "three";

const COLOR_WATER = [0.15, 0.35, 0.65];
const COLOR_SEDIMENT = [0.55, 0.28, 0.15]; // 論文 Fig.7 の「水中の土砂は赤系」に倣う

export class WaterMesh {
  constructor(size, worldSize) {
    this.size = size;
    this.yScale = worldSize / (size - 1);
    const geometry = new THREE.PlaneGeometry(
      worldSize,
      worldSize,
      size - 1,
      size - 1,
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(size * size * 3), 3),
    );
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      roughness: 0.15,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
  }

  // 水面は b + d − minDepth に描く。水深が minDepth 未満のセルは
  // 地形の下に潜って見えなくなる（論文 §3 と同じ手法）。
  // 戻り値は水深・土砂の最大値（デバッグ表示用）。
  update(terrain, water, sediment, minDepth) {
    const position = this.mesh.geometry.attributes.position;
    const colors = this.mesh.geometry.attributes.color;
    let maxWater = 0;
    let maxSediment = 0;
    for (let i = 0; i < terrain.length; i++) {
      const d = water[i];
      if (d > maxWater) maxWater = d;
      if (sediment[i] > maxSediment) maxSediment = sediment[i];
      position.setY(i, (terrain[i] + d - minDepth) * this.yScale);

      const t = Math.min(1, sediment[i] * 4);
      colors.setXYZ(
        i,
        COLOR_WATER[0] + (COLOR_SEDIMENT[0] - COLOR_WATER[0]) * t,
        COLOR_WATER[1] + (COLOR_SEDIMENT[1] - COLOR_WATER[1]) * t,
        COLOR_WATER[2] + (COLOR_SEDIMENT[2] - COLOR_WATER[2]) * t,
      );
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    return { maxWater, maxSediment };
  }
}
