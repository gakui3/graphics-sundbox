uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform samplerCube uCubeRef;     // 同解像度に落とした cubemap
uniform samplerCube uCubeTruth;   // フル解像度 (グラウンドトゥルース)
uniform mat3 uDpBasis;            // world -> DP
uniform float uR;
uniform float uBlendWidth;
uniform float uHardSwitch;
uniform float uUseMipmap;
uniform int uPathLeft;            // 0: DP / 1: cubemap ref / 2: ground truth
uniform int uPathRight;
uniform int uDisplayMode;         // 0: 単独 / 1: 分割 / 2: 差分
uniform float uSplitX;            // 0..1
uniform float uDiffGain;
uniform vec2 uResolution;

varying vec3 v2f_normal;
varying vec3 v2f_worldPos;

#include <dpMath>

vec3 sampleMapA(vec3 dDp) {
    vec2 uv = dpStToUv(dpForwardA(dDp), uR);
    return (uUseMipmap > 0.5) ? texture2D(uMapA, uv).rgb : textureLod(uMapA, uv, 0.0).rgb;
}

vec3 sampleMapB(vec3 dDp) {
    vec2 uv = dpStToUv(dpForwardB(dDp), uR);
    return (uUseMipmap > 0.5) ? texture2D(uMapB, uv).rgb : textureLod(uMapB, uv, 0.0).rgb;
}

vec3 sampleDp(vec3 dWorld) {
    vec3 d = normalize(uDpBasis * dWorld);

    // 2 枚とも無条件に引く。分岐の中で暗黙 LOD を使うと画面微分が未定義になり、
    // 分岐が分かれるピクセルで無関係なミップが選ばれて継ぎ目に破線が出る。
    vec3 cA = sampleMapA(d);
    vec3 cB = sampleMapB(d);

    if (uHardSwitch > 0.5) {
        return (d.z < 0.0) ? cA : cB;
    }
    float w = uBlendWidth;
    float a = smoothstep(-w, w, d.z);
    return mix(cA, cB, a);
}

vec3 samplePath(int path, vec3 dWorld) {
    if (path == 0) return sampleDp(dWorld);
    if (path == 1) return textureCube(uCubeRef, dWorld).rgb;
    return textureCube(uCubeTruth, dWorld).rgb;
}

void main() {
    vec3 n = normalize(v2f_normal);
    vec3 viewDir = normalize(v2f_worldPos - cameraPosition);
    vec3 r = reflect(viewDir, n);

    vec3 col;
    if (uDisplayMode == 2) {
        vec3 a = samplePath(uPathLeft, r);
        vec3 b = samplePath(uPathRight, r);
        col = abs(a - b) * uDiffGain;
    } else if (uDisplayMode == 1) {
        float side = step(uSplitX * uResolution.x, gl_FragCoord.x);
        col = (side < 0.5) ? samplePath(uPathLeft, r) : samplePath(uPathRight, r);
    } else {
        col = samplePath(uPathLeft, r);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
