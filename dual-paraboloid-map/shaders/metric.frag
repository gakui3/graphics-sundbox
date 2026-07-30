// 反射方向ごとに 経路A と 経路B の誤差を出す。readPixels で集計するため
// r: 差の二乗和, g: 真値の二乗和, b: 差の最大値, a: 有効フラグ
precision highp float;

uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform samplerCube uCubeRef;
uniform samplerCube uCubeTruth;
uniform mat3 uDpBasis;
uniform float uR;
uniform float uBlendWidth;
uniform float uHardSwitch;
uniform float uUseMipmap;
uniform int uPathLeft;
uniform int uPathRight;
uniform sampler2D uDirBuffer;   // 反射方向 (xyz) と有効フラグ (w)

varying vec2 v2f_uv;

#include <dpMath>

// 計測では全経路を明示 LOD 0 で引く。画面微分に由来する暗黙 LOD を使うと
// 経路ごとに違うミップが選ばれ、「ぼけた真値 vs 鋭い DP」を比べることになる。
vec3 sampleMapA(vec3 dDp) {
    return textureLod(uMapA, dpStToUv(dpForwardA(dDp), uR), 0.0).rgb;
}

vec3 sampleMapB(vec3 dDp) {
    return textureLod(uMapB, dpStToUv(dpForwardB(dDp), uR), 0.0).rgb;
}

vec3 sampleDp(vec3 dWorld) {
    vec3 d = normalize(uDpBasis * dWorld);
    if (uHardSwitch > 0.5) {
        return (d.z < 0.0) ? sampleMapA(d) : sampleMapB(d);
    }
    float w = uBlendWidth;
    float a = smoothstep(-w, w, d.z);
    if (a <= 0.0) return sampleMapA(d);
    if (a >= 1.0) return sampleMapB(d);
    return mix(sampleMapA(d), sampleMapB(d), a);
}

vec3 samplePath(int path, vec3 dWorld) {
    if (path == 0) return sampleDp(dWorld);
    if (path == 1) return textureLod(uCubeRef, dWorld, 0.0).rgb;
    return textureLod(uCubeTruth, dWorld, 0.0).rgb;
}

void main() {
    vec4 dir = texture(uDirBuffer, v2f_uv);
    if (dir.w < 0.5) {
        gl_FragColor = vec4(0.0);
        return;
    }
    vec3 r = normalize(dir.xyz);
    vec3 a = samplePath(uPathLeft, r);
    vec3 b = samplePath(uPathRight, r);
    vec3 diff = a - b;
    float sq = dot(diff, diff);
    float ref = dot(b, b);
    gl_FragColor = vec4(sq, ref, max(abs(diff.r), max(abs(diff.g), abs(diff.b))), 1.0);
}
