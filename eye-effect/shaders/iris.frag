uniform sampler2D tIris;
uniform sampler2D tHighlightA;
uniform sampler2D tHighlightB;
uniform sampler2D tMatcap;
uniform vec2 uIrisCenter;
uniform float uIrisSize;
uniform float uParallax;
uniform float uHighlightParallax;
uniform float uIrisIntensity;
uniform float uGlowIntensity;
uniform vec3 uGlowColor;
uniform float uHighlightIntensity;
uniform float uMatcapIntensity;
uniform float uBlackLevel;

varying vec2 v2f_uv;
varying vec3 v2f_normalView;
varying vec3 v2f_viewPos;

mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
    vec3 dp1 = dFdx(p);
    vec3 dp2 = dFdy(p);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
    return mat3(T * invmax, B * invmax, N);
}

// アトラスUV(1024x512) -> 虹彩ローカルUV [0,1] (ピクセル正方形補正付き)
vec2 toLocal(vec2 uv, vec2 offset) {
    vec2 d = uv + offset - uIrisCenter;
    d.y *= 0.5;
    return d / uIrisSize * 0.5 + vec2(0.5);
}

vec3 sampleLayer(sampler2D t, vec2 luv) {
    float inside = step(abs(luv.x - 0.5), 0.5) * step(abs(luv.y - 0.5), 0.5);
    vec3 c = texture2D(t, clamp(luv, 0.0, 1.0)).rgb;
    // 書籍写真の黒浮きを減算で除去
    return max(c - uBlackLevel, 0.0) * inside;
}

void main() {
    vec3 n = normalize(v2f_normalView);
    vec3 viewDir = normalize(-v2f_viewPos);
    mat3 tbn = cotangentFrame(n, v2f_viewPos, v2f_uv);
    vec3 tv = normalize(transpose(tbn) * viewDir);
    vec2 par = (tv.xy / max(abs(tv.z), 0.35)) * uParallax;

    // 凹面の虹彩は視線方向へ沈み、凸レンズのハイライトは逆へ滑る
    vec3 iris = sampleLayer(tIris, toLocal(v2f_uv, par));
    vec3 hlA = sampleLayer(tHighlightA, toLocal(v2f_uv, -par * uHighlightParallax));
    vec3 hlB = sampleLayer(tHighlightB, toLocal(v2f_uv, -par * uHighlightParallax * 1.8));

    float irisMask = 1.0 - smoothstep(0.42, 0.52, length(toLocal(v2f_uv, vec2(0.0)) - 0.5));

    float lum = max(iris.r, max(iris.g, iris.b));
    vec3 glow = uGlowColor * pow(lum, 1.5) * uGlowIntensity;

    vec2 muv = n.xy * 0.5 + 0.5;
    vec3 matcap = max(texture2D(tMatcap, muv).rgb - uBlackLevel, 0.0) * uMatcapIntensity * irisMask;

    vec3 col = iris * uIrisIntensity
             + glow
             + (hlA + hlB) * uHighlightIntensity
             + matcap;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
