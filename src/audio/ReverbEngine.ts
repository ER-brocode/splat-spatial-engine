import { ReverbOptions } from './types.js';

/**
 * Procedural Volumetric Impulse Response Generator and Convolver Reverb node.
 * Simulates volumetric acoustic reflections for indoor 3D Gaussian Splat scenes.
 */
export class ReverbEngine {
  private audioContext: AudioContext;
  private convolverNode: ConvolverNode;
  private dryGainNode: GainNode;
  private wetGainNode: GainNode;
  public inputNode: GainNode;
  public outputNode: GainNode;

  constructor(audioContext: AudioContext, options?: ReverbOptions) {
    this.audioContext = audioContext;

    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();
    this.dryGainNode = audioContext.createGain();
    this.wetGainNode = audioContext.createGain();
    this.convolverNode = audioContext.createConvolver();

    // Default balance
    this.dryGainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
    this.wetGainNode.gain.setValueAtTime(0.3, audioContext.currentTime);

    // Routing
    this.inputNode.connect(this.dryGainNode);
    this.dryGainNode.connect(this.outputNode);

    this.inputNode.connect(this.convolverNode);
    this.convolverNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.outputNode);

    // Build synthetic impulse response
    const duration = options?.duration ?? 2.0;
    const decay = options?.decay ?? 2.0;
    const reverse = options?.reverse ?? false;

    this.convolverNode.buffer = ReverbEngine.generateImpulseResponse(
      audioContext,
      duration,
      decay,
      reverse
    );
  }

  /**
   * Procedural algorithmic impulse response generation with exponential decay and Gaussian noise.
   */
  public static generateImpulseResponse(
    ctx: AudioContext | { sampleRate: number; createBuffer: (c: number, l: number, s: number) => AudioBuffer },
    duration: number = 2.0,
    decay: number = 2.0,
    reverse: boolean = false
  ): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * Math.max(0.01, duration));
    const impulse = ctx.createBuffer(2, length, sampleRate);

    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Exponential decay envelope
      const env = reverse
        ? Math.exp(-decay * (1.0 - t))
        : Math.exp(-decay * t);

      // Stereo uncorrelated noise reflections
      const noiseL = (Math.random() * 2.0 - 1.0) * env;
      const noiseR = (Math.random() * 2.0 - 1.0) * env;

      left[i] = noiseL;
      right[i] = noiseR;
    }

    return impulse;
  }

  public setWetDryRatio(wetLevel: number): void {
    const clamped = Math.max(0.0, Math.min(1.0, wetLevel));
    this.wetGainNode.gain.setValueAtTime(clamped, this.audioContext.currentTime);
    this.dryGainNode.gain.setValueAtTime(1.0 - clamped, this.audioContext.currentTime);
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.convolverNode.disconnect();
    this.dryGainNode.disconnect();
    this.wetGainNode.disconnect();
    this.outputNode.disconnect();
  }
}
