import * as THREE from 'three';
import { SplatPointCloud } from './types.js';
import { RadixSort } from './RadixSort.js';
import { WebGLSplatVertexShader, WebGLSplatFragmentShader } from './shaders.js';

export interface SplatMeshOptions {
  maxSplats?: number;
}

/**
 * Three.js Mesh implementation for real-time Volumetric Gaussian Splatting rendering.
 * Utilizes instanced geometry rendering with 2D billboards and dynamically sorted instances.
 */
export class SplatMesh extends THREE.Mesh {
  private pointCloud: SplatPointCloud;
  private radixSort: RadixSort;
  private customMaterial: THREE.RawShaderMaterial;
  private centerAttribute: THREE.InstancedBufferAttribute;
  private colorAttribute: THREE.InstancedBufferAttribute;
  private covAAttribute: THREE.InstancedBufferAttribute;
  private covBAttribute: THREE.InstancedBufferAttribute;

  // Staging buffers for back-to-front depth sorted splats
  private sortedCenters: Float32Array;
  private sortedColors: Float32Array;
  private sortedCovA: Float32Array;
  private sortedCovB: Float32Array;

  constructor(pointCloud: SplatPointCloud, options?: SplatMeshOptions) {
    const count = pointCloud.count;
    const geometry = new THREE.InstancedBufferGeometry();

    // Base billboard quad geometry [-1, 1]
    const quadVertices = new Float32Array([
      -1, -1, 0,
       1, -1, 0,
       1,  1, 0,
      -1, -1, 0,
       1,  1, 0,
      -1,  1, 0
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(quadVertices, 3));

    // Staging buffers
    const sortedCenters = new Float32Array(count * 3);
    const sortedColors = new Float32Array(count * 4);
    const sortedCovA = new Float32Array(count * 4);
    const sortedCovB = new Float32Array(count * 2);

    const centerAttribute = new THREE.InstancedBufferAttribute(sortedCenters, 3);
    const colorAttribute = new THREE.InstancedBufferAttribute(sortedColors, 4);
    const covAAttribute = new THREE.InstancedBufferAttribute(sortedCovA, 4);
    const covBAttribute = new THREE.InstancedBufferAttribute(sortedCovB, 2);

    centerAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    covAAttribute.setUsage(THREE.DynamicDrawUsage);
    covBAttribute.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('splatCenter', centerAttribute);
    geometry.setAttribute('splatColor', colorAttribute);
    geometry.setAttribute('splatCovA', covAAttribute);
    geometry.setAttribute('splatCovB', covBAttribute);
    geometry.instanceCount = count;

    const material = new THREE.RawShaderMaterial({
      vertexShader: WebGLSplatVertexShader,
      fragmentShader: WebGLSplatFragmentShader,
      uniforms: {
        focalLength: { value: new THREE.Vector2(1000, 1000) },
        viewportSize: { value: new THREE.Vector2(window.innerWidth || 1920, window.innerHeight || 1080) }
      },
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation
    });

    super(geometry, material);

    this.pointCloud = pointCloud;
    this.radixSort = new RadixSort(options?.maxSplats ?? count);
    this.customMaterial = material;
    this.centerAttribute = centerAttribute;
    this.colorAttribute = colorAttribute;
    this.covAAttribute = covAAttribute;
    this.covBAttribute = covBAttribute;
    this.sortedCenters = sortedCenters;
    this.sortedColors = sortedColors;
    this.sortedCovA = sortedCovA;
    this.sortedCovB = sortedCovB;

    this.frustumCulled = false;
  }

  /**
   * Updates camera depth sorting and updates instanced buffers for frame rendering.
   */
  public update(camera: THREE.Camera, viewportWidth: number, viewportHeight: number): void {
    const count = this.pointCloud.count;
    if (count === 0) return;

    // Update material uniforms
    if (camera instanceof THREE.PerspectiveCamera) {
      const fovRad = (camera.fov * Math.PI) / 180.0;
      const focalY = (viewportHeight / 2.0) / Math.tan(fovRad / 2.0);
      const focalX = focalY; // Aspect ratio is handled in viewport size
      this.customMaterial.uniforms['focalLength']!.value.set(focalX, focalY);
    }
    this.customMaterial.uniforms['viewportSize']!.value.set(viewportWidth, viewportHeight);

    // Compute view-matrix
    const viewMatrix = camera.matrixWorldInverse.elements;

    // Sort Gaussian splats back-to-front
    const { sortedIndices } = this.radixSort.sort(this.pointCloud.positions, count, viewMatrix);

    const positions = this.pointCloud.positions;
    const colors = this.pointCloud.colors;
    const covs = this.pointCloud.covariances;

    for (let i = 0; i < count; i++) {
      const origIdx = sortedIndices[i] ?? 0;

      const p3 = origIdx * 3;
      const p4 = origIdx * 4;
      const p6 = origIdx * 6;

      const d3 = i * 3;
      const d4 = i * 4;
      const d2 = i * 2;

      // Position
      this.sortedCenters[d3] = positions[p3] ?? 0;
      this.sortedCenters[d3 + 1] = positions[p3 + 1] ?? 0;
      this.sortedCenters[d3 + 2] = positions[p3 + 2] ?? 0;

      // Color & Opacity
      this.sortedColors[d4] = colors[p4] ?? 1;
      this.sortedColors[d4 + 1] = colors[p4 + 1] ?? 1;
      this.sortedColors[d4 + 2] = colors[p4 + 2] ?? 1;
      this.sortedColors[d4 + 3] = colors[p4 + 3] ?? 1;

      // Covariance
      if (covs) {
        this.sortedCovA[d4] = covs[p6] ?? 0;
        this.sortedCovA[d4 + 1] = covs[p6 + 1] ?? 0;
        this.sortedCovA[d4 + 2] = covs[p6 + 2] ?? 0;
        this.sortedCovA[d4 + 3] = covs[p6 + 3] ?? 0;

        this.sortedCovB[d2] = covs[p6 + 4] ?? 0;
        this.sortedCovB[d2 + 1] = covs[p6 + 5] ?? 0;
      }
    }

    this.centerAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.covAAttribute.needsUpdate = true;
    this.covBAttribute.needsUpdate = true;
  }

  public getPointCloud(): SplatPointCloud {
    return this.pointCloud;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.customMaterial.dispose();
  }
}
