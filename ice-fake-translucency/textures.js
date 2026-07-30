import * as THREE from "three";

// シード付き乱数 (再現性のため)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = [1, 1] } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

/** 芝目ストライプ + 白線のグラウンド */
export function createGroundTexture() {
  const size = 1024;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#3d7c37";
  ctx.fillRect(0, 0, size, size);
  const stripes = 10;
  for (let i = 0; i < stripes; i++) {
    if (i % 2 === 0) continue;
    ctx.fillStyle = "#478f40";
    ctx.fillRect(0, (size / stripes) * i, size, size / stripes);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 6;
  const m = 110;
  ctx.strokeRect(m, m, size - m * 2, size - m * 2);
  ctx.beginPath();
  ctx.moveTo(m, size / 2);
  ctx.lineTo(size - m, size / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();

  return toTexture(c);
}

/** 観客席 (ランダムな点の群れ) */
export function createCrowdTexture() {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const rand = mulberry32(42);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#14161f");
  grad.addColorStop(1, "#232633");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const palette = ["#c9a27e", "#e0b894", "#8899cc", "#cc8888", "#88bb88", "#ccccaa", "#aa88bb", "#d8d8e8"];
  for (let i = 0; i < 3200; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.82;
    const r = 1 + rand() * 1.8;
    ctx.fillStyle = palette[(rand() * palette.length) | 0];
    ctx.globalAlpha = 0.5 + rand() * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#2c2f3a";
  ctx.fillRect(0, h * 0.86, w, h * 0.14);

  return toTexture(c, { repeat: [8, 1] });
}

/** 広告看板 */
export function createAdTexture() {
  const w = 512;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const rand = mulberry32(7);

  ctx.fillStyle = "#efe3a0";
  ctx.fillRect(0, 0, w, h);

  const palette = ["#e05545", "#f0a030", "#4a9c50", "#3a6cc0", "#d0d0c0"];
  for (let i = 0; i < 40; i++) {
    const x = rand() * w;
    const y = 15 + rand() * (h - 40);
    const rw = 14 + rand() * 40;
    const rh = 10 + rand() * 28;
    ctx.fillStyle = palette[(rand() * palette.length) | 0];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(x, y, rw, rh, 6);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#3a3a30";
  ctx.fillRect(0, 0, w, 8);
  ctx.fillRect(0, h - 8, w, 8);

  return toTexture(c, { repeat: [10, 1] });
}

/** 氷のディテール (fBm + リッジノイズ) */
export function createIceDetailTexture() {
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const rand = mulberry32(1234);

  const gridN = 64;
  const grid = new Float32Array(gridN * gridN);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, y) => grid[((y % gridN + gridN) % gridN) * gridN + ((x % gridN + gridN) % gridN)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const valueNoise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const d = at(xi, yi + 1);
    const e = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (d - a) * yf + (a - b - d + e) * xf * yf;
  };

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fbm = 0;
      let amp = 0.5;
      let freq = 4 / size;
      for (let o = 0; o < 5; o++) {
        fbm += valueNoise(x * freq * gridN / 4, y * freq * gridN / 4) * amp;
        amp *= 0.5;
        freq *= 2;
      }
      // リッジノイズで亀裂っぽい筋を足す
      const r1 = 1 - Math.abs(2 * valueNoise(x * 0.035, y * 0.012) - 1);
      const r2 = 1 - Math.abs(2 * valueNoise(x * 0.012 + 31.7, y * 0.04 + 11.3) - 1);
      const ridge = Math.pow(Math.max(r1, r2), 6);
      let v = fbm * 0.6 + ridge * 0.55;
      v = Math.min(1, Math.max(0, v));
      const i = (y * size + x) * 4;
      const g = Math.round(v * 255);
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
