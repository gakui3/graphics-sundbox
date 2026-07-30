varying vec3 v2f_normalView;
varying vec3 v2f_normalObj;
varying vec3 v2f_viewPos;
varying vec3 v2f_objPos;

void main() {
    v2f_objPos = position;
    v2f_normalObj = normal;
    v2f_normalView = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    v2f_viewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
}
