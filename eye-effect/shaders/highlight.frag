uniform sampler2D tEye;
uniform float uIntensity;

varying vec2 v2f_uv;
varying vec3 v2f_normalView;
varying vec3 v2f_viewPos;

void main() {
    // アトラスの白い光点だけを輝度キーで抜き出す
    vec3 t = texture2D(tEye, v2f_uv).rgb;
    float m = smoothstep(0.55, 0.8, min(t.r, min(t.g, t.b)));
    if (m < 0.01) discard;
    gl_FragColor = vec4(vec3(1.0), m * uIntensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
