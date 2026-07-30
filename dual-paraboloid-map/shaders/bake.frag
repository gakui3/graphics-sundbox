precision highp float;

uniform samplerCube uSource;
uniform mat3 uDpBasisInv;   // DP -> world
uniform float uR;
uniform float uSupersamples;
uniform float uResolution;
uniform float uSourceSize;  // 入力 cubemap の一辺
uniform float uUseAnalyticLod;
uniform int uMapIndex;      // 0 = MAP_A, 1 = MAP_B

varying vec2 v2f_uv;

#include <dpMath>

// (s,t) 面の一様サンプルが張る立体角から、cubemap 側の適切な LOD を出す。
// DP テクセルの立体角は dω/dA = 4/(q+1)^2 に比例し、cubemap テクセルは
// 面上で 1/(sourceSize^2) を基準に方向によって変わる。比の平方根が
// 「入力テクセル何個ぶんを1テクセルに詰めるか」なので log2 を取る。
float analyticLod(vec2 st, float q) {
    float texelSt = (2.0 * uR / uResolution);          // (s,t) 空間でのテクセル幅
    float dpSolid = texelSt * texelSt * 4.0 / ((q + 1.0) * (q + 1.0));
    float srcSolid = (4.0 * PI) / (6.0 * uSourceSize * uSourceSize);
    return max(0.0, 0.5 * log2(max(dpSolid / srcSolid, 1e-12)));
}

// 決定的なジッタ（テクセルごとに固定。焼き直しでちらつかせない）
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    float n = max(1.0, uSupersamples);
    vec2 texel = vec2(1.0) / uResolution;

    vec3 sum = vec3(0.0);
    float count = 0.0;

    for (int iy = 0; iy < 32; iy++) {
        if (float(iy) >= n) break;
        for (int ix = 0; ix < 32; ix++) {
            if (float(ix) >= n) break;

            // テクセル内の層化サンプル + ジッタ
            vec2 cell = (vec2(float(ix), float(iy)) + 0.5) / n;
            vec2 jitter = vec2(
                hash12(gl_FragCoord.xy + vec2(float(ix), float(iy))),
                hash12(gl_FragCoord.yx + vec2(float(iy), float(ix)) + 7.13)
            ) - 0.5;
            vec2 uv = v2f_uv + (cell - 0.5 + jitter / n) * texel;

            vec2 st = dpUvToSt(uv, uR);
            float q = dot(st, st);
            vec3 dDp = (uMapIndex == 0) ? dpInverseA(st) : dpInverseB(st);
            vec3 dWorld = normalize(uDpBasisInv * dDp);

            float lod = (uUseAnalyticLod > 0.5) ? analyticLod(st, q) : 0.0;
            vec3 c = textureLod(uSource, dWorld, lod).rgb;
            // EXR 等で負値や NaN が来ても伝播させない
            c = max(c, vec3(0.0));
            if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);

            sum += c;
            count += 1.0;
        }
    }

    gl_FragColor = vec4(sum / max(count, 1.0), 1.0);
}
