varying vec2 v2f_uv;
varying vec3 v2f_normal;
varying vec3 v2f_worldPos;

void main() {
    v2f_uv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    v2f_worldPos = wp.xyz;
    v2f_normal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
}
