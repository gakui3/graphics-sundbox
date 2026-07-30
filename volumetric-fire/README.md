# volumetric-fire

Fuller らの論文 "Real-Time Procedural Volumetric Fire" (I3D 2007、同梱PDF) の three.js 実装。
Fire Profile Texture + Bスプライン変形 + ビュー整列スライスの加算ブレンド + ノイズで v をオフセット。
変形は高さ毎の曲線オフセットによるせん断近似 (完全なFFDではない)。

assets/ の firetex.png はプロファイル、nzw.png はノイズハッシュ用。
