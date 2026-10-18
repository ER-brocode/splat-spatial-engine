/**
 * Represents a single 3D Gaussian splat with position, covariance scale, rotation quaternion, opacity, and color.
 */
export interface GaussianSplat {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotW: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  opacity: number;
  r: number;
  g: number;
  b: number;
  sphericalHarmonics?: Float32Array;
}

/**
 * Packed structure of Gaussian Splat point cloud data stored in typed arrays for high performance rendering.
 */
export interface SplatPointCloud {
  count: number;
  positions: Float32Array;  // [x, y, z] * count
  scales: Float32Array;     // [sx, sy, sz] * count
  rotations: Float32Array;  // [qx, qy, qz, qw] * count
  colors: Float32Array;     // [r, g, b, a] * count (normalized 0..1)
  covariances?: Float32Array; // 3D symmetric covariance matrix elements [c11, c12, c13, c22, c23, c33]
}

/**
 * Result of radix depth sort
 */
export interface SortResult {
  sortedIndices: Uint32Array;
  depths: Float32Array;
}
