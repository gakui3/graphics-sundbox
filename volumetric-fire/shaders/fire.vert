attribute float aSlice;

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform vec3 uFireCenter;
uniform float uBoundsRadius;
uniform float uSliceCount;

varying vec3 v2f_worldPos;

void main() {
    // aSlice=0 が最も奥。奥から手前の順で描く
    float depth = (0.5 - (aSlice + 0.5) / uSliceCount) * 2.0 * uBoundsRadius;
    v2f_worldPos = uFireCenter
        + uCamForward * depth
        + (position.x * uCamRight + position.y * uCamUp) * uBoundsRadius;
    gl_Position = projectionMatrix * viewMatrix * vec4(v2f_worldPos, 1.0);
}
