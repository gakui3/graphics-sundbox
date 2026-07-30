#include <common>
#include <skinning_pars_vertex>

uniform float uShift;
varying vec2 v2f_uv;
varying vec3 v2f_normalView;
varying vec3 v2f_viewPos;

void main() {
    v2f_uv = uv;
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>

    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
    // 視線の接線方向へスライドさせて凸レンズ上をハイライトが滑る動きを作る
    vec3 vd = normalize(cameraPosition - wp.xyz);
    wp.xyz += (vd - wn * dot(vd, wn)) * uShift;

    v2f_normalView = normalize(normalMatrix * objectNormal);
    vec4 mvPos = viewMatrix * wp;
    v2f_viewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
}
