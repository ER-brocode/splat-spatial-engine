import { SortResult } from './types.js';

/**
 * High-performance 16-bit / 8-bit Radix Sort for sorting Gaussian splats by camera depth.
 * Gaussian Splatting volume rendering requires strict back-to-front alpha compositing.
 */
export class RadixSort {
  private indicesA: Uint32Array;
  private indicesB: Uint32Array;
  private depths: Float32Array;
  private integerKeys: Uint32Array;
  private capacity: number;

  constructor(maxSplats: number = 262144) {
    this.capacity = maxSplats;
    this.indicesA = new Uint32Array(maxSplats);
    this.indicesB = new Uint32Array(maxSplats);
    this.depths = new Float32Array(maxSplats);
    this.integerKeys = new Uint32Array(maxSplats);
  }

  /**
   * Resizes internal memory buffers if point count exceeds capacity.
   */
  private ensureCapacity(count: number): void {
    if (count > this.capacity) {
      let newCap = Math.max(count, this.capacity * 2);
      this.capacity = newCap;
      this.indicesA = new Uint32Array(newCap);
      this.indicesB = new Uint32Array(newCap);
      this.depths = new Float32Array(newCap);
      this.integerKeys = new Uint32Array(newCap);
    }
  }

  /**
   * Calculates view-space depth for each splat along camera forward direction:
   * depth = viewMatrix[2] * x + viewMatrix[6] * y + viewMatrix[10] * z + viewMatrix[14]
   *
   * @param positions Float32Array of [x, y, z] splat positions
   * @param count number of splats
   * @param viewMatrix 4x4 column-major camera view matrix
   * @returns SortResult with sortedIndices ordered back-to-front (furthest to nearest)
   */
  public sort(
    positions: Float32Array,
    count: number,
    viewMatrix: Float32Array | number[]
  ): SortResult {
    this.ensureCapacity(count);

    const m2 = viewMatrix[2] ?? 0;
    const m6 = viewMatrix[6] ?? 0;
    const m10 = viewMatrix[10] ?? -1;
    const m14 = viewMatrix[14] ?? 0;

    let minDepth = Infinity;
    let maxDepth = -Infinity;

    // Calculate depths and track bounds
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const x = positions[idx] ?? 0;
      const y = positions[idx + 1] ?? 0;
      const z = positions[idx + 2] ?? 0;

      // Depth along camera viewing direction
      const depth = m2 * x + m6 * y + m10 * z + m14;
      this.depths[i] = depth;

      if (depth < minDepth) minDepth = depth;
      if (depth > maxDepth) maxDepth = depth;
    }

    const depthRange = maxDepth - minDepth;
    const scale = depthRange > 1e-7 ? 65535.0 / depthRange : 1.0;

    // Quantize depths to 16-bit unsigned integers
    // For back-to-front rendering: we want larger depth (more negative or furthest away) rendered first
    // In standard OpenGL/Three.js view-space, camera looks down -Z, so objects further away have more negative Z.
    // If m10 is negative, further objects have lower depth values. We invert or keep consistent according to sign.
    for (let i = 0; i < count; i++) {
      this.indicesA[i] = i;
      const d = (this.depths[i] ?? 0) - minDepth;
      // Quantize to 16 bits [0, 65535]
      const key = Math.min(65535, Math.max(0, Math.floor(d * scale)));
      // Store 16-bit key
      this.integerKeys[i] = key;
    }

    // 16-bit Radix sort with 2 passes of 8 bits (radix 256)
    // Pass 0: bits 0..7
    this.radixPass(count, 0, this.indicesA, this.indicesB);
    // Pass 1: bits 8..15
    this.radixPass(count, 8, this.indicesB, this.indicesA);

    return {
      sortedIndices: this.indicesA.subarray(0, count),
      depths: this.depths.subarray(0, count)
    };
  }

  private radixPass(
    count: number,
    bitShift: number,
    sourceIndices: Uint32Array,
    destIndices: Uint32Array
  ): void {
    const counts = new Uint32Array(256);

    // Compute frequency counts
    for (let i = 0; i < count; i++) {
      const idx = sourceIndices[i] ?? 0;
      const key = (this.integerKeys[idx] ?? 0) >> bitShift;
      const bucket = key & 0xff;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    // Compute prefix sums (offsets)
    const offsets = new Uint32Array(256);
    let runningSum = 0;
    for (let i = 0; i < 256; i++) {
      offsets[i] = runningSum;
      runningSum += counts[i] ?? 0;
    }

    // Scatter elements into destination array
    for (let i = 0; i < count; i++) {
      const idx = sourceIndices[i] ?? 0;
      const key = (this.integerKeys[idx] ?? 0) >> bitShift;
      const bucket = key & 0xff;
      const destPos = offsets[bucket] ?? 0;
      destIndices[destPos] = idx;
      offsets[bucket] = destPos + 1;
    }
  }
}
