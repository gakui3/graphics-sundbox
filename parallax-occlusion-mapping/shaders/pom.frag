uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tSHGA;      // r: スペキュラ, g: ハイト
uniform float uTechnique;     // 0: Normal / 1: POM / 2: SPOM
uniform float uRepeat;
uniform float uHeightScale;
uniform float uMinSteps;
uniform float uMaxSteps;
uniform float uSelfShadow;
uniform float uShadowStrength;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uAmbient;
uniform float uShininess;
uniform float uSpecIntensity;

varying vec2 v2f_uv;
varying vec3 v2f_normal;
varying vec3 v2f_worldPos;

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

float depthAt(vec2 uv) {
    return 1.0 - texture2D(tSHGA, uv).g;
}

void main() {
    vec3 N = normalize(v2f_normal);
    vec3 V = normalize(cameraPosition - v2f_worldPos);
    vec2 uvR = v2f_uv * uRepeat;
    mat3 TBN = cotangentFrame(N, v2f_worldPos, uvR);
    mat3 invTBN = mat3(
        vec3(TBN[0].x, TBN[1].x, TBN[2].x),
        vec3(TBN[0].y, TBN[1].y, TBN[2].y),
        vec3(TBN[0].z, TBN[1].z, TBN[2].z)
    );
    vec3 vT = normalize(invTBN * V);

    vec2 finalUV = uvR;
    float finalDepth = 0.0;

    if (uTechnique > 0.5) {
        // 視角が浅いほどステップを増やす
        float numLayers = mix(uMaxSteps, uMinSteps, clamp(vT.z, 0.0, 1.0));
        float layerDepth = 1.0 / numLayers;
        vec2 delta = (vT.xy / max(vT.z, 0.05)) * uHeightScale / numLayers;

        vec2 uv = uvR;
        float curLayer = 0.0;
        float d = depthAt(uv);
        for (int i = 0; i < 64; i++) {
            if (curLayer >= d || float(i) >= numLayers) break;
            uv -= delta;
            curLayer += layerDepth;
            d = depthAt(uv);
        }
        // 直前レイヤーとの線形補間で交点を精密化
        vec2 prevUV = uv + delta;
        float after = d - curLayer;
        float before = depthAt(prevUV) - (curLayer - layerDepth);
        float w = clamp(after / (after - before), 0.0, 1.0);
        finalUV = mix(uv, prevUV, w);
        finalDepth = curLayer - w * layerDepth;

        // SPOM: マーチ結果が面のUV範囲を越えたら破棄してシルエットを彫る
        if (uTechnique > 1.5) {
            if (finalUV.x < 0.0 || finalUV.y < 0.0 || finalUV.x > uRepeat || finalUV.y > uRepeat) {
                discard;
            }
        }
    }

    vec3 nT = texture2D(tNormal, finalUV).rgb * 2.0 - 1.0;
    vec3 Np = normalize(TBN * nT);

    vec3 L = normalize(-uLightDir);
    float diff = max(dot(Np, L), 0.0);

    // セルフシャドウ: 交点からライト方向へマーチ
    float shadow = 1.0;
    if (uSelfShadow > 0.5 && uTechnique > 0.5 && diff > 0.0) {
        vec3 lT = normalize(invTBN * L);
        if (lT.z > 0.01) {
            const float SHADOW_STEPS = 24.0;
            vec2 sDelta = (lT.xy / lT.z) * uHeightScale / SHADOW_STEPS;
            float sLayer = finalDepth / SHADOW_STEPS;
            vec2 uv = finalUV;
            float rayDepth = finalDepth;
            float occ = 0.0;
            for (int i = 0; i < 24; i++) {
                uv += sDelta;
                rayDepth -= sLayer;
                float d = depthAt(uv);
                occ = max(occ, (rayDepth - d) * (1.0 - float(i) / SHADOW_STEPS));
            }
            shadow = 1.0 - clamp(occ * uShadowStrength * 8.0, 0.0, 1.0);
        }
    }

    vec3 albedo = texture2D(tColor, finalUV).rgb;
    float specMask = texture2D(tSHGA, finalUV).r;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(Np, H), 0.0), uShininess) * specMask * uSpecIntensity;

    vec3 col = albedo * (uAmbient + uLightColor * diff * shadow)
             + uLightColor * spec * shadow;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
