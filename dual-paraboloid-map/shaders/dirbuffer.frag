// 反射体の反射方向を書き出す。RMSE 集計はこのバッファに対して行うので、
// 背景を含まず「オブジェクト画素だけ」で誤差が取れる。
varying vec3 v2f_normal;
varying vec3 v2f_worldPos;

void main() {
    vec3 n = normalize(v2f_normal);
    vec3 viewDir = normalize(v2f_worldPos - cameraPosition);
    gl_FragColor = vec4(reflect(viewDir, n), 1.0);
}
