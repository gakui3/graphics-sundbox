// 1 イテレーション = 降雨 → 流れ → 熱侵食流出 → 侵食/堆積 → 土砂移流 → 熱侵食 → 蒸発

// 論文 Table 2 の典型値
export const defaultParams = {
  dt: 0.02, // Δt 時間刻み
  Kr: 0.012, // 降雨率
  Ke: 0.015, // 蒸発率
  A: 20, // 仮想パイプ断面積
  g: 9.81, // 重力
  Kc: 1.0, // 土砂容量係数
  Ks: 0.5, // 溶解（侵食）速度
  Kd: 1.0, // 堆積速度
  Kh: 5.0, // 土砂軟化速度
  Kdmax: 10.0, // 最大侵食水深（lmax ランプ）
  Ka: 0.8, // 安息角タンジェント係数
  Ki: 0.1, // 安息角タンジェントバイアス
  Kt: 0.15, // 熱侵食速度
  minSinAlpha: 0.05, // 平地でも僅かに侵食させる sin(α) の下限
  Rmin: 0.1, // 硬度の下限
  rainEnabled: true,
  hydraulicEnabled: true,
  thermalEnabled: true,
  // マップ端で水と土砂を排出する（論文は閉境界だが、長時間再生すると
  // 雨の平衡水位 Kr/Ke で全面が冠水するため既定で ON）
  drainEdges: true,
};

// 浅いセルで 流量÷水深 の速度が発散しないようにする上限（セル/時間単位）
const MAX_VELOCITY = 10;

// 8 近傍（熱侵食用）: dx, dy, 距離
const NEIGHBORS8 = [
  { dx: -1, dy: -1, dist: Math.SQRT2 },
  { dx: 0, dy: -1, dist: 1 },
  { dx: 1, dy: -1, dist: Math.SQRT2 },
  { dx: -1, dy: 0, dist: 1 },
  { dx: 1, dy: 0, dist: 1 },
  { dx: -1, dy: 1, dist: Math.SQRT2 },
  { dx: 0, dy: 1, dist: 1 },
  { dx: 1, dy: 1, dist: Math.SQRT2 },
];
// 反対方向のパイプ番号（流入の参照に使う）
const OPPOSITE = [7, 6, 5, 4, 3, 2, 1, 0];

export class ErosionSimulation {
  constructor(size, params) {
    this.size = size;
    this.params = params;
    const n = size * size;
    this.b = new Float32Array(n); // 地形高さ
    this.d = new Float32Array(n); // 水深
    this.s = new Float32Array(n); // 浮遊土砂
    this.sTmp = new Float32Array(n);
    this.bTmp = new Float32Array(n);
    this.fL = new Float32Array(n); // 流出フラックス（仮想パイプ4本）
    this.fR = new Float32Array(n);
    this.fT = new Float32Array(n); // T = +y 方向
    this.fB = new Float32Array(n); // B = -y 方向
    this.u = new Float32Array(n); // 速度場
    this.v = new Float32Array(n);
    this.R = new Float32Array(n); // 局所硬度 0..1（小さいほど硬い）
    this.thermalPipes = NEIGHBORS8.map(() => new Float32Array(n));
    this.iteration = 0;
  }

  // 地形・硬度を設定し、水・土砂・フラックスを初期化する
  reset(terrain, hardness) {
    this.b.set(terrain);
    this.R.set(hardness);
    this.d.fill(0);
    this.s.fill(0);
    this.fL.fill(0);
    this.fR.fill(0);
    this.fT.fill(0);
    this.fB.fill(0);
    this.u.fill(0);
    this.v.fill(0);
    this.iteration = 0;
  }

  step() {
    const p = this.params;
    if (p.rainEnabled) this.rain();
    this.flow();
    if (p.thermalEnabled) this.thermalOutflow();
    if (p.hydraulicEnabled) {
      this.erodeDeposit();
      this.advectSediment();
    }
    if (p.thermalEnabled) this.thermalApply();
    this.evaporate();
    if (p.drainEdges) this.drainEdges();
    this.iteration++;
  }

  // マップ端のセルから水と土砂を系外へ排出する
  drainEdges() {
    const { size } = this;
    const { d, s } = this;
    for (let x = 0; x < size; x++) {
      d[x] = 0;
      s[x] = 0;
      d[(size - 1) * size + x] = 0;
      s[(size - 1) * size + x] = 0;
    }
    for (let y = 0; y < size; y++) {
      d[y * size] = 0;
      s[y * size] = 0;
      d[y * size + size - 1] = 0;
      s[y * size + size - 1] = 0;
    }
  }

  // (1) 降雨: d1 = d + Δt·r·Kr（r = 1 で全セル一様）
  rain() {
    const { dt, Kr } = this.params;
    const add = dt * Kr;
    const d = this.d;
    for (let i = 0; i < d.length; i++) d[i] += add;
  }

  // (2) 仮想パイプによる流出フラックス更新と水深・速度場の計算
  flow() {
    const { size } = this;
    const { dt, A, g } = this.params;
    const { b, d, fL, fR, fT, fB, u, v } = this;
    const k = (dt * A * g) / 1; // パイプ長 l = 1

    // フラックス更新（eq.2〜5）。境界の外向きパイプは常に 0（閉境界）
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const h = b[i] + d[i];
        let outL = x > 0 ? Math.max(0, fL[i] + k * (h - b[i - 1] - d[i - 1])) : 0;
        let outR =
          x < size - 1 ? Math.max(0, fR[i] + k * (h - b[i + 1] - d[i + 1])) : 0;
        let outB = y > 0 ? Math.max(0, fB[i] + k * (h - b[i - size] - d[i - size])) : 0;
        let outT =
          y < size - 1
            ? Math.max(0, fT[i] + k * (h - b[i + size] - d[i + size]))
            : 0;
        const sum = outL + outR + outT + outB;
        if (sum > 0) {
          // 総流出はセルの水量を超えない（eq.4）
          const scale = Math.min(1, d[i] / (sum * dt));
          outL *= scale;
          outR *= scale;
          outT *= scale;
          outB *= scale;
        }
        fL[i] = outL;
        fR[i] = outR;
        fT[i] = outT;
        fB[i] = outB;
      }
    }

    // 水深更新（eq.6,7）と速度場（eq.8）
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const inL = x > 0 ? fR[i - 1] : 0; // 左隣から右向きに流入
        const inR = x < size - 1 ? fL[i + 1] : 0;
        const inB = y > 0 ? fT[i - size] : 0;
        const inT = y < size - 1 ? fB[i + size] : 0;
        const outflow = fL[i] + fR[i] + fT[i] + fB[i];
        const dV = dt * (inL + inR + inB + inT - outflow);
        const dOld = d[i];
        d[i] = Math.max(0, dOld + dV);

        // セルを通過する平均流量から速度を求める（Mei らに従い平均水深で割る）
        const dAvg = (dOld + d[i]) * 0.5;
        if (dAvg > 1e-4) {
          const dWx = 0.5 * (inL - fL[i] + fR[i] - inR);
          const dWy = 0.5 * (inB - fB[i] + fT[i] - inT);
          u[i] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, dWx / dAvg));
          v[i] = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, dWy / dAvg));
        } else {
          u[i] = 0;
          v[i] = 0;
        }
      }
    }
  }

  // (3) 熱侵食: 安息角を超える斜面の土砂量を 8 方向パイプへ分配（eq.17,18）
  thermalOutflow() {
    const { size } = this;
    const { dt, Kt, Ka, Ki } = this.params;
    const { b, R, thermalPipes } = this;
    const heightDifs = new Array(8);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const bi = b[i];
        let H = 0;
        let totalW = 0;
        for (let k = 0; k < 8; k++) {
          thermalPipes[k][i] = 0;
          heightDifs[k] = 0;
          const nb = NEIGHBORS8[k];
          const px = x + nb.dx;
          const py = y + nb.dy;
          if (px < 0 || px >= size || py < 0 || py >= size) continue;
          const dif = bi - b[py * size + px];
          if (dif <= 0) continue;
          if (dif > H) H = dif;
          // talus 条件: tan(α) が R·Ka + Ki を超える斜面のみ崩れる
          if (dif / nb.dist > R[i] * Ka + Ki) {
            heightDifs[k] = dif;
            totalW += dif;
          }
        }
        if (totalW <= 0 || H <= 0) continue;
        const dS = dt * Kt * R[i] * H * 0.5; // セル面積 a = 1
        for (let k = 0; k < 8; k++) {
          if (heightDifs[k] > 0) {
            thermalPipes[k][i] = (dS * heightDifs[k]) / totalW;
          }
        }
      }
    }
  }

  // (4) 侵食・堆積（eq.10〜14）
  erodeDeposit() {
    const { size } = this;
    const { dt, Kc, Ks, Kd, Kh, Kdmax, minSinAlpha, Rmin } = this.params;
    const { b, bTmp, d, s, u, v, R } = this;
    // 勾配・侵食上限はイテレーション開始時の地形から評価する
    // （インプレース更新だと走査方向に侵食が伝播して偏る）
    bTmp.set(b);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // 勾配から局所傾斜角を求める（境界は片側差分）
        const bl = x > 0 ? bTmp[i - 1] : bTmp[i];
        const br = x < size - 1 ? bTmp[i + 1] : bTmp[i];
        const bb = y > 0 ? bTmp[i - size] : bTmp[i];
        const bt = y < size - 1 ? bTmp[i + size] : bTmp[i];
        const dbdx = (br - bl) * 0.5;
        const dbdy = (bt - bb) * 0.5;
        const grad2 = dbdx * dbdx + dbdy * dbdy;
        const sinAlpha = Math.max(
          minSinAlpha,
          Math.sqrt(grad2) / Math.sqrt(1 + grad2),
        );
        // 最低隣接セルより深くは掘らせず、最高隣接セルより高くは積もらせない
        // （窪み・突起が勾配を増して加速度的に成長する発散を防ぐ）
        const minNb = Math.min(bl, br, bb, bt);
        const maxNb = Math.max(bl, br, bb, bt);
        const maxErode = Math.max(0, bTmp[i] - minNb);

        const vel = Math.sqrt(u[i] * u[i] + v[i] * v[i]);
        // lmax（eq.10）の置き換え: テント型の水深係数。
        // 浅い側では水量に比例（土砂濃度が水量に対して際限なく増えて、水が引いた
        // 瞬間にまとめて堆積しスパイク化するのを防ぐ）。深い側は論文の意図
        // （Kdmax より深い水底は侵食しない）どおり 0 へ減衰させる
        const lm =
          Math.min(d[i], 1) * Math.min(1, Math.max(0, 1 - d[i] / Kdmax));
        const C = Kc * sinAlpha * vel * lm;

        const st = s[i];
        if (st < C) {
          // 溶解（eq.12a-c）。論文の記述どおり溶解量は水深でクランプし、
          // 浅い高速流での侵食暴走を防ぐ
          const amount = Math.min(dt * R[i] * Ks * (C - st), d[i], maxErode);
          b[i] -= amount;
          s[i] = st + amount;
          d[i] += amount;
        } else if (st > C) {
          // 堆積（eq.13a-c）。土砂量・水深を超えず、最高隣接セルより上には
          // 積もらないようにクランプする
          const amount = Math.min(
            dt * Kd * (st - C),
            st,
            d[i],
            Math.max(0, maxNb - b[i]),
          );
          b[i] += amount;
          s[i] = st - amount;
          d[i] -= amount;
          // 堆積した土砂は軟化する（eq.14）
          R[i] = Math.max(Rmin, R[i] - dt * Kh * Ks * (st - C));
        }
        // 濃度上限: 水量に対して過剰な土砂は懸濁できないので、その場で堆積させる。
        // 移流は s を d と独立に運ぶため、これが無いと水の引いたセルに土砂が
        // 濃縮され、一括堆積によるスパイクが成長する
        const excess = s[i] - d[i];
        if (excess > 0) {
          const dep = Math.min(excess, Math.max(0, maxNb - b[i]));
          b[i] += dep;
          s[i] -= dep;
        }
      }
    }
  }

  // (5) 土砂の移流: セミラグランジュ法（eq.15）
  advectSediment() {
    const { size } = this;
    const { dt } = this.params;
    const { s, sTmp, u, v } = this;
    sTmp.set(s);
    const max = size - 1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const sx = Math.min(max, Math.max(0, x - u[i] * dt));
        const sy = Math.min(max, Math.max(0, y - v[i] * dt));
        const x0 = Math.min(max - 1, Math.floor(sx));
        const y0 = Math.min(max - 1, Math.floor(sy));
        const fx = sx - x0;
        const fy = sy - y0;
        const j = y0 * size + x0;
        s[i] =
          sTmp[j] * (1 - fx) * (1 - fy) +
          sTmp[j + 1] * fx * (1 - fy) +
          sTmp[j + size] * (1 - fx) * fy +
          sTmp[j + size + 1] * fx * fy;
      }
    }
  }

  // (6) 熱侵食パイプの適用: 流入 − 流出 を地形高さへ反映
  thermalApply() {
    const { size } = this;
    const { b, thermalPipes } = this;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        let delta = 0;
        for (let k = 0; k < 8; k++) {
          delta -= thermalPipes[k][i];
          const nb = NEIGHBORS8[k];
          const px = x + nb.dx;
          const py = y + nb.dy;
          if (px < 0 || px >= size || py < 0 || py >= size) continue;
          // 隣接セルから自分へ向かうパイプ（反対方向）の流入
          delta += thermalPipes[OPPOSITE[k]][py * size + px];
        }
        b[i] += delta;
      }
    }
  }

  // (7) 蒸発（eq.16）
  evaporate() {
    const { dt, Ke } = this.params;
    const factor = 1 - Ke * dt;
    const d = this.d;
    for (let i = 0; i < d.length; i++) d[i] *= factor;
  }
}
