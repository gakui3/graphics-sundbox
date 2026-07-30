// dpMath.js と同じ式。片方だけ直すと食い違うので注意。
// MAP_A = -Z 側、MAP_B = +Z 側。

vec2 dpForwardA(vec3 d) {
    float k = 1.0 - d.z;
    return vec2(d.x / k, d.y / k);
}

vec2 dpForwardB(vec3 d) {
    float k = 1.0 + d.z;
    return vec2(-d.x / k, -d.y / k);
}

vec3 dpInverseA(vec2 st) {
    float q = dot(st, st);
    return vec3(2.0 * st.x, 2.0 * st.y, q - 1.0) / (q + 1.0);
}

vec3 dpInverseB(vec2 st) {
    float q = dot(st, st);
    return vec3(-2.0 * st.x, -2.0 * st.y, 1.0 - q) / (q + 1.0);
}

vec2 dpStToUv(vec2 st, float R) {
    return (st / R + 1.0) * 0.5;
}

vec2 dpUvToSt(vec2 uv, float R) {
    return (uv * 2.0 - 1.0) * R;
}
