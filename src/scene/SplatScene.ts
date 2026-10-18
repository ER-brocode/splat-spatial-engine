import * as THREE from 'three';
import { SplatMesh } from '../splat/SplatMesh.js';
import { SpatialAudioListener, SpatialAudioSource } from '../audio/SpatialAudioSource.js';
import { InteractiveControls } from './InteractiveControls.js';
import { FPSCounter } from './FPSCounter.js';

export interface SplatSceneOptions {
  canvas?: HTMLCanvasElement;
  enableAudio?: boolean;
}

/**
 * SplatScene orchestrates the Three.js WebGL/WebGPU render loop, 3D Gaussian Splatting
 * sorting, spatial audio listener updates, and user interactive camera navigation.
 */
export class SplatScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer | null = null;
  public controls: InteractiveControls;
  public fpsCounter: FPSCounter;
  public audioContext: AudioContext | null = null;
  public audioListener: SpatialAudioListener | null = null;

  private splatMeshes: SplatMesh[] = [];
  private audioSources: SpatialAudioSource[] = [];
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;

  constructor(options?: SplatSceneOptions) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0b10);

    const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000.0);
    this.camera.position.set(0, 1.5, 4);

    this.fpsCounter = new FPSCounter();
    this.controls = new InteractiveControls(this.camera, options?.canvas);

    if (typeof window !== 'undefined' && (options?.canvas || typeof document !== 'undefined')) {
      const canvas = options?.canvas ?? document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false, // Gaussian splatting performs its own continuous antialiasing
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      window.addEventListener('resize', this.onWindowResize);
    }

    if (options?.enableAudio && typeof AudioContext !== 'undefined') {
      this.audioContext = new AudioContext();
      this.audioListener = new SpatialAudioListener(this.audioContext);
    }
  }

  private onWindowResize = (): void => {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public addSplatMesh(splatMesh: SplatMesh): void {
    this.splatMeshes.push(splatMesh);
    this.scene.add(splatMesh);
  }

  public removeSplatMesh(splatMesh: SplatMesh): void {
    const idx = this.splatMeshes.indexOf(splatMesh);
    if (idx !== -1) {
      this.splatMeshes.splice(idx, 1);
      this.scene.remove(splatMesh);
    }
  }

  public addAudioSource(source: SpatialAudioSource): void {
    this.audioSources.push(source);
  }

  public removeAudioSource(source: SpatialAudioSource): void {
    const idx = this.audioSources.indexOf(source);
    if (idx !== -1) {
      this.audioSources.splice(idx, 1);
    }
  }

  /**
   * Starts the high-performance rendering loop.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const loop = (now: number): void => {
      if (!this.isRunning) return;
      const deltaTime = Math.min(0.1, (now - this.lastFrameTime) / 1000.0);
      this.lastFrameTime = now;

      this.step(deltaTime, now);

      if (typeof requestAnimationFrame !== 'undefined') {
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(loop);
    }
  }

  /**
   * Executes a single simulation and render step.
   */
  public step(deltaTime: number, now?: number): void {
    // 1. Update interactive camera position & controls
    this.controls.update(deltaTime);
    this.camera.updateMatrixWorld();

    // 2. Synchronize Web Audio 3D listener pose to camera
    if (this.audioListener) {
      const pos = this.camera.position;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.audioListener.updatePose(pos.x, pos.y, pos.z, forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }

    // 3. Update Gaussian splat meshes with back-to-front depth sorting
    const width = this.renderer ? this.renderer.domElement.width : 1920;
    const height = this.renderer ? this.renderer.domElement.height : 1080;

    for (const splat of this.splatMeshes) {
      splat.update(this.camera, width, height);
    }

    // 4. Render scene
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }

    // 5. Update FPS metrics
    this.fpsCounter.update(now);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public dispose(): void {
    this.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onWindowResize);
    }
    this.controls.detachListeners();
    for (const splat of this.splatMeshes) {
      splat.dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}
