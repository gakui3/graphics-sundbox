varying vec2 v2f_uv;

void main() {
    v2f_uv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
