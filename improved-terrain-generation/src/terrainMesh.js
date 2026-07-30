import * as THREE from "three";

const COLOR_GRASS = [0.3, 0.46, 0.22];
const COLOR_DIRT = [0.42, 0.36, 0.26];
const COLOR_ROCK = [0.46, 0.44, 0.42];
const COLOR_SNOW = [0.93, 0.94, 0.96];

function lerp3(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class TerrainMesh {
  constructor(size, worldSize, heightScale) {
    this.size = size;
    this.heightScale = heightScale;
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
      roughness: 0.95,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
  }

  update(heightmap) {
    const position = this.mesh.geometry.attributes.position;
    for (let i = 0; i < heightmap.length; i++) {
      position.setY(i, heightmap[i] * this.heightScale);
    }
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.updateColors(heightmap);
  }

  updateColors(heightmap) {
    const colors = this.mesh.geometry.attributes.color;
    const normals = this.mesh.geometry.attributes.normal;
    const c = [0, 0, 0];
    for (let i = 0; i < heightmap.length; i++) {
      const h = heightmap[i];
      const slope = 1 - normals.getY(i);

      lerp3(c, COLOR_DIRT, COLOR_GRASS, smoothstep(0.15, 0.35, h));
      lerp3(c, c, COLOR_SNOW, smoothstep(0.62, 0.8, h));
      lerp3(c, c, COLOR_ROCK, smoothstep(0.18, 0.45, slope));
      colors.setXYZ(i, c[0], c[1], c[2]);
    }
    colors.needsUpdate = true;
  }
}
