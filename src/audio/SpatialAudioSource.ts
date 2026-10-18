import { SpatialAudioOptions, Vector3D } from './types.js';
import { AudioAttenuation } from './AudioAttenuation.js';
import { ReverbEngine } from './ReverbEngine.js';

/**
 * High-fidelity 3D Spatial Audio Node using Web Audio HRTF Panning,
 * Distance attenuation, and Convolution Reverb.
 */
export class SpatialAudioSource {
  private audioContext: AudioContext;
  private pannerNode: PannerNode;
  private gainNode: GainNode;
  private reverb: ReverbEngine | null = null;
  private position: Vector3D = { x: 0, y: 0, z: 0 };
  private orientation: Vector3D = { x: 1, y: 0, z: 0 };

  constructor(audioContext: AudioContext, options?: SpatialAudioOptions) {
    this.audioContext = audioContext;

    this.pannerNode = audioContext.createPanner();
    this.pannerNode.panningModel = 'HRTF';
    this.pannerNode.distanceModel = options?.attenuationModel ?? 'inverse';
    this.pannerNode.refDistance = options?.refDistance ?? 1.0;
    this.pannerNode.maxDistance = options?.maxDistance ?? 1000.0;
    this.pannerNode.rolloffFactor = options?.rolloffFactor ?? 1.0;
    this.pannerNode.coneInnerAngle = options?.coneInnerAngle ?? 360;
    this.pannerNode.coneOuterAngle = options?.coneOuterAngle ?? 360;
    this.pannerNode.coneOuterGain = options?.coneOuterGain ?? 0;

    this.gainNode = audioContext.createGain();
    this.gainNode.gain.setValueAtTime(1.0, audioContext.currentTime);

    // Audio graph: Source -> Panner -> Gain -> Destination / Reverb
    this.pannerNode.connect(this.gainNode);
  }

  public enableReverb(reverb: ReverbEngine): void {
    this.reverb = reverb;
    this.gainNode.connect(reverb.inputNode);
  }

  public setPosition(x: number, y: number, z: number): void {
    this.position = { x, y, z };
    const time = this.audioContext.currentTime;

    if (this.pannerNode.positionX) {
      this.pannerNode.positionX.setValueAtTime(x, time);
      this.pannerNode.positionY.setValueAtTime(y, time);
      this.pannerNode.positionZ.setValueAtTime(z, time);
    } else {
      // Legacy Web Audio fallback
      this.pannerNode.setPosition(x, y, z);
    }
  }

  public setOrientation(x: number, y: number, z: number): void {
    this.orientation = { x, y, z };
    const time = this.audioContext.currentTime;

    if (this.pannerNode.orientationX) {
      this.pannerNode.orientationX.setValueAtTime(x, time);
      this.pannerNode.orientationY.setValueAtTime(y, time);
      this.pannerNode.orientationZ.setValueAtTime(z, time);
    } else {
      // Legacy Web Audio fallback
      this.pannerNode.setOrientation(x, y, z);
    }
  }

  public setGain(volume: number): void {
    this.gainNode.gain.setValueAtTime(Math.max(0, volume), this.audioContext.currentTime);
  }

  public getInputNode(): AudioNode {
    return this.pannerNode;
  }

  public getOutputNode(): AudioNode {
    return this.gainNode;
  }

  public getPosition(): Vector3D {
    return { ...this.position };
  }

  public getOrientation(): Vector3D {
    return { ...this.orientation };
  }

  public calculateSimulatedGainAt(listenerPos: Vector3D): number {
    const dist = AudioAttenuation.calculateDistance(this.position, listenerPos);
    return AudioAttenuation.calculateGain(
      dist,
      this.pannerNode.refDistance,
      this.pannerNode.maxDistance,
      this.pannerNode.rolloffFactor,
      this.pannerNode.distanceModel as any
    );
  }

  public dispose(): void {
    this.pannerNode.disconnect();
    this.gainNode.disconnect();
    if (this.reverb) {
      this.reverb = null;
    }
  }
}

/**
 * Spatial Audio Listener wrapper matching the camera position/orientation in the 3D scene.
 */
export class SpatialAudioListener {
  private audioContext: AudioContext;
  private listener: AudioListener;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.listener = audioContext.listener;
  }

  public updatePose(
    posX: number,
    posY: number,
    posZ: number,
    forwardX: number,
    forwardY: number,
    forwardZ: number,
    upX: number = 0,
    upY: number = 1,
    upZ: number = 0
  ): void {
    const time = this.audioContext.currentTime;

    if (this.listener.positionX) {
      this.listener.positionX.setValueAtTime(posX, time);
      this.listener.positionY.setValueAtTime(posY, time);
      this.listener.positionZ.setValueAtTime(posZ, time);
      this.listener.forwardX.setValueAtTime(forwardX, time);
      this.listener.forwardY.setValueAtTime(forwardY, time);
      this.listener.forwardZ.setValueAtTime(forwardZ, time);
      this.listener.upX.setValueAtTime(upX, time);
      this.listener.upY.setValueAtTime(upY, time);
      this.listener.upZ.setValueAtTime(upZ, time);
    } else {
      // Legacy Web Audio fallback
      this.listener.setPosition(posX, posY, posZ);
      this.listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
    }
  }
}
