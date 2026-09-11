// 3D LUT 数据：立方体边长 size，RGB 顺序排列（红色变化最快，与 .cube 标准一致）
export interface LutData {
  size: number;
  data: Uint8ClampedArray;
}
