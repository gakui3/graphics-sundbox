uniform sampler2D tBackground;
uniform sampler2D tDetail;
uniform vec2 uResolution;
uniform float uStage;
uniform float uDistortion;
uniform float uDetailRefraction;
uniform float uRimPower;
uniform float uRimIntensity;
uniform vec3 uRimColor;
uniform vec3 uBaseColor;
uniform vec3 uTint;
uniform float uDetailScale;
uniform float uDetailStrength;

varying vec3 v2f_normalView;
varying vec3 v2f_normalObj;
varying vec3 v2f_viewPos;
varying vec3 v2f_objPos;

float sampleDetail(vec3 p, vec3 n) {
    vec3 w = abs(n);
    w /= (w.x + w.y + w.z);
    float dx = texture2D(tDetail, p.zy * uDetailScale).r;
    float dy = texture2D(tDetail, p.xz * uDetailScale).r;
    float dz = texture2D(tDetail, p.xy * uDetailScale).r;
    return dx * w.x + dy * w.y + dz * w.z;
}

void main() {
    vec3 n = normalize(v2f_normalView);
    vec3 viewDir = normalize(-v2f_viewPos);
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), uRimPower);
    vec3 rim = uRimColor * fres * uRimIntensity;

    vec3 col;

    if (uStage < 0.5) {
        col = uBaseColor + rim;
    } else {
        float d = sampleDetail(v2f_objPos, normalize(v2f_normalObj));

        vec2 uv = screenUV;
        if (uStage > 1.5) {
            uv += n.xy * uDistortion;
        }
        if (uStage > 2.5) {
            uv += (d - 0.5) * uDetailRefraction;
        }
        vec3 bg = texture2D(tBackground, uv).rgb;

        if (uStage < 2.5) {
            col = bg * vec3(0.92, 0.96, 1.05);
            col = mix(col, vec3(0.80, 0.88, 0.98), fres * 0.30);
            col += rim;
        } else {
            float dc = smoothstep(0.15, 0.95, d);
            vec3 deep = vec3(0.03, 0.22, 0.55);
            vec3 light = vec3(0.62, 0.93, 1.0);
            vec3 detailCol = mix(deep, light, dc);
            col = mix(bg * uTint, detailCol, uDetailStrength * (0.35 + 0.65 * dc));
            col += light * pow(dc, 3.0) * 0.45;
            col += rim;
        }
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
