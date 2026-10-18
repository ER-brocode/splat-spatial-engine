import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PlyParser } from '../src/splat/PlyParser.js';
import { RadixSort } from '../src/splat/RadixSort.js';
import { SplatPointCloud } from '../src/splat/types.js';

describe('Gaussian Splatting PLY Parser and Radix Sort Tests', () => {
  it('should serialize and parse binary PLY 3D Gaussian Splat point clouds correctly', () => {
    const originalCloud: SplatPointCloud = {
      count: 3,
      positions: new Float32Array([
        0.0, 1.0, 2.0,
        -1.0, 0.5, 3.0,
        2.5, -0.5, 1.5
      ]),
      scales: new Float32Array([
        0.1, 0.2, 0.3,
        0.05, 0.05, 0.1,
        0.2, 0.15, 0.3
      ]),
      rotations: new Float32Array([
        0.0, 0.0, 0.0, 1.0,
        0.7071, 0.0, 0.7071, 0.0,
        0.0, 0.38268, 0.0, 0.92388
      ]),
      colors: new Float32Array([
        0.8, 0.2, 0.1, 0.9,
        0.1, 0.9, 0.3, 0.7,
        0.2, 0.4, 0.95, 0.85
      ])
    };

    // Serialize to binary PLY format
    const buffer = PlyParser.serializePly(originalCloud);
    assert.ok(buffer instanceof ArrayBuffer);
    assert.ok(buffer.byteLength > 0);

    // Parse back from buffer
    const parsedCloud = PlyParser.parsePly(buffer);
    assert.strictEqual(parsedCloud.count, 3);
    assert.strictEqual(parsedCloud.positions.length, 9);
    assert.strictEqual(parsedCloud.scales.length, 9);
    assert.strictEqual(parsedCloud.rotations.length, 12);
    assert.strictEqual(parsedCloud.colors.length, 12);

    // Verify coordinates with float precision tolerance
    assert.ok(Math.abs((parsedCloud.positions[0] ?? 0) - 0.0) < 1e-4);
    assert.ok(Math.abs((parsedCloud.positions[1] ?? 0) - 1.0) < 1e-4);
    assert.ok(Math.abs((parsedCloud.positions[2] ?? 0) - 2.0) < 1e-4);

    // Verify computed 3D covariances exist
    assert.ok(parsedCloud.covariances);
    assert.strictEqual(parsedCloud.covariances.length, 3 * 6);
    // Covariance diagonal (variance) must be strictly non-negative
    assert.ok((parsedCloud.covariances[0] ?? 0) >= 0);
    assert.ok((parsedCloud.covariances[3] ?? 0) >= 0);
    assert.ok((parsedCloud.covariances[5] ?? 0) >= 0);
  });

  it('should correctly sort 3D splats by camera depth using RadixSort', () => {
    const radix = new RadixSort(10);
    const positions = new Float32Array([
      0.0, 0.0, 10.0, // furthest along Z
      0.0, 0.0, 2.0,  // closest
      0.0, 0.0, 5.0   // middle
    ]);

    // View matrix looking straight along negative Z (OpenGL standard)
    // viewMatrix[10] = -1.0, depth = -z
    const viewMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1
    ];

    const { sortedIndices, depths } = radix.sort(positions, 3, viewMatrix);

    assert.strictEqual(sortedIndices.length, 3);
    assert.strictEqual(depths.length, 3);

    // Verify depths are calculated
    assert.strictEqual(depths[0], -10.0);
    assert.strictEqual(depths[1], -2.0);
    assert.strictEqual(depths[2], -5.0);

    // Furthest depth is -10.0 (index 0), then -5.0 (index 2), then -2.0 (index 1)
    assert.strictEqual(sortedIndices[0], 0);
    assert.strictEqual(sortedIndices[1], 2);
    assert.strictEqual(sortedIndices[2], 1);
  });
});
