// パーティクルベースの水力侵食

export const defaultErosionParams = {
  inertia: 0.3,
  dropCapacity: 10.0,
  depositionRate: 0.08,
  erosionRate: 0.7,
  gravity: 9.81,
  evaporationRate: 0.02,
  erosionRadius: 5,
  maxLifetime: 300,
  minHeight: 0.0,
};

export class ErosionSimulator {
  constructor(size, params) {
    this.size = size;
    this.params = params;
    this.brushCache = new Map();
  }

  // 浮動小数点位置の高さと勾配を双線形補間で求める
  heightAndGradient(map, x, y) {
    const size = this.size;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = x - xi;
    const v = y - yi;
    const i = yi * size + xi;
    const h00 = map[i];
    const h10 = map[i + 1];
    const h01 = map[i + size];
    const h11 = map[i + size + 1];
    return {
      height:
        h00 * (1 - u) * (1 - v) +
        h10 * u * (1 - v) +
        h01 * (1 - u) * v +
        h11 * u * v,
      gradX: (h10 - h00) * (1 - v) + (h11 - h01) * v,
      gradY: (h01 - h00) * (1 - u) + (h11 - h10) * u,
    };
  }

  // 堆積は周囲4セルへ双線形に分配する
  deposit(map, x, y, amount) {
    const size = this.size;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = x - xi;
    const v = y - yi;
    const i = yi * size + xi;
    map[i] += amount * (1 - u) * (1 - v);
    map[i + 1] += amount * u * (1 - v);
    map[i + size] += amount * (1 - u) * v;
    map[i + size + 1] += amount * u * v;
  }

  // weight = max(0, radius - dist) を正規化したブラシ（半径ごとにキャッシュ）
  brush(radius) {
    let b = this.brushCache.get(radius);
    if (b) return b;
    const offsets = [];
    let total = 0;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const w = radius - Math.sqrt(dx * dx + dy * dy);
        if (w > 0) {
          offsets.push({ dx, dy, w });
          total += w;
        }
      }
    }
    for (const o of offsets) o.w /= total;
    this.brushCache.set(radius, offsets);
    return offsets;
  }

  // 半径内に重み付きで侵食する。minHeight 未満には削らない（質量保存のため実削除量を返す）
  erode(map, x, y, amount) {
    const size = this.size;
    const { erosionRadius, minHeight } = this.params;
    const cx = Math.round(x);
    const cy = Math.round(y);
    let removed = 0;
    for (const { dx, dy, w } of this.brush(erosionRadius)) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= size || py < 0 || py >= size) continue;
      const i = py * size + px;
      const d = Math.min(amount * w, map[i] - minHeight);
      if (d > 0) {
        map[i] -= d;
        removed += d;
      }
    }
    return removed;
  }

  // 雨粒1つ分のシミュレーション
  simulateDroplet(map, rng) {
    const p = this.params;
    const size = this.size;
    let x = rng() * (size - 1);
    let y = rng() * (size - 1);
    let dirX = 0;
    let dirY = 0;
    let velocity = 1;
    let water = 1;
    let sediment = 0;

    for (let life = 0; life < p.maxLifetime; life++) {
      const { height, gradX, gradY } = this.heightAndGradient(map, x, y);

      dirX = dirX * p.inertia - gradX * (1 - p.inertia);
      dirY = dirY * p.inertia - gradY * (1 - p.inertia);
      let len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len < 1e-8) {
        const a = rng() * Math.PI * 2;
        dirX = Math.cos(a);
        dirY = Math.sin(a);
        len = 1;
      }
      dirX /= len;
      dirY /= len;

      const nx = x + dirX;
      const ny = y + dirY;
      if (nx < 0 || nx >= size - 1 || ny < 0 || ny >= size - 1) break;

      const newHeight = this.heightAndGradient(map, nx, ny).height;
      const heightDif = newHeight - height;

      if (heightDif > 0) {
        // 上り坂: 窪地を埋めるように旧位置へ堆積
        const amount = Math.min(sediment, heightDif);
        this.deposit(map, x, y, amount);
        sediment -= amount;
      } else {
        const capacity = -heightDif * velocity * water * p.dropCapacity;
        if (sediment > capacity) {
          const amount = (sediment - capacity) * p.depositionRate;
          this.deposit(map, x, y, amount);
          sediment -= amount;
        } else {
          const amount = Math.min(
            (capacity - sediment) * p.erosionRate,
            -heightDif,
          );
          sediment += this.erode(map, x, y, amount);
        }
      }

      velocity = Math.sqrt(
        Math.max(0, velocity * velocity - heightDif * p.gravity),
      );
      water *= 1 - p.evaporationRate;
      if (water < 0.005) break;

      x = nx;
      y = ny;
    }
  }
}
