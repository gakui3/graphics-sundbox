// 仕様 7-2。JS が作った方向テクスチャを読み、GLSL 側で forward -> inverse を
// 往復させて誤差を出す。同時に JS が計算した (s,t) との差も出す。
// r: 往復誤差, g: JS の (s,t) との差
precision highp float;

uniform sampler2D uDirs;      // xyz: 方向, w: マップ番号 (0 or 1)
uniform sampler2D uRefSt;     // xy: JS が計算した (s,t)

varying vec2 v2f_uv;

#include <dpMath>

void main() {
    vec4 d4 = texture(uDirs, v2f_uv);
    vec3 d = normalize(d4.xyz);
    bool isB = d4.w > 0.5;

    vec2 st = isB ? dpForwardB(d) : dpForwardA(d);
    vec3 back = isB ? dpInverseB(st) : dpInverseA(st);

    float roundTrip = max(max(abs(back.x - d.x), abs(back.y - d.y)), abs(back.z - d.z));

    vec2 refSt = texture(uRefSt, v2f_uv).xy;
    float delta = max(abs(st.x - refSt.x), abs(st.y - refSt.y));

    gl_FragColor = vec4(roundTrip, delta, 0.0, 1.0);
}
