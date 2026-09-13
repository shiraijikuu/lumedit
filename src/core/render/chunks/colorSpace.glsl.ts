// sRGB 传递函数（IEC 61966-2-1），分段公式与 three.js ColorManagement 一致（MIT）。
//
// 「局部线性化」策略（混合工作空间，非全管线线性）：
// 只在物理运算（曝光、白平衡乘性增益、晕影等光量运算）的 shader 内部
// sRGB→linear→运算→转回 sRGB；而色调曲线 / HSL / 颜色分级 / 3D LUT 仍保留在 sRGB
// 感知/编码域——前者是因为用户按所见亮度打点，后者是因为 .cube 行业惯例定义在 sRGB 编码值。
// 这样既修正了「在 gamma 编码值上直接乘」的色偏，又不改变老工程的参数语义与手感。
export const SRGB_TRANSFER_GLSL = /* glsl */ `
float srgbToLinear1(float c) {
  float x = max(c, 0.0);
  return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4);
}
vec3 srgbToLinear(vec3 c) {
  return vec3(srgbToLinear1(c.r), srgbToLinear1(c.g), srgbToLinear1(c.b));
}
float linearToSrgb1(float c) {
  float x = max(c, 0.0);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}
vec3 linearToSrgb(vec3 c) {
  return vec3(linearToSrgb1(c.r), linearToSrgb1(c.g), linearToSrgb1(c.b));
}
`;
