import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AudioAttenuation } from '../src/audio/AudioAttenuation.js';
import { ReverbEngine } from '../src/audio/ReverbEngine.js';

describe('3D Spatial Audio Attenuation and Reverberation Tests', () => {
  it('should calculate accurate 3D Euclidean distances between source and listener', () => {
    const source = { x: 3, y: 0, z: 4 };
    const listener = { x: 0, y: 0, z: 0 };
    const dist = AudioAttenuation.calculateDistance(source, listener);
    assert.strictEqual(dist, 5.0);

    const source2 = { x: 1, y: 2, z: 2 };
    const listener2 = { x: 4, y: 6, z: 2 };
    // dx=3, dy=4, dz=0 => dist=5
    assert.strictEqual(AudioAttenuation.calculateDistance(source2, listener2), 5.0);
  });

  it('should calculate inverse distance attenuation gain according to Web Audio spec', () => {
    const refDistance = 1.0;
    const maxDistance = 100.0;
    const rolloff = 1.0;

    // At ref distance, gain is 1.0
    const gainAtRef = AudioAttenuation.calculateGain(1.0, refDistance, maxDistance, rolloff, 'inverse');
    assert.strictEqual(gainAtRef, 1.0);

    // Below ref distance, clamped to ref distance -> gain 1.0
    const gainBelowRef = AudioAttenuation.calculateGain(0.5, refDistance, maxDistance, rolloff, 'inverse');
    assert.strictEqual(gainBelowRef, 1.0);

    // At distance 2.0 with rolloff 1.0: 1.0 / (1.0 + 1.0 * (2.0 - 1.0)) = 1 / 2 = 0.5
    const gainAt2 = AudioAttenuation.calculateGain(2.0, refDistance, maxDistance, rolloff, 'inverse');
    assert.strictEqual(gainAt2, 0.5);

    // At distance 5.0 with rolloff 1.0: 1.0 / (1.0 + 1.0 * (5.0 - 1.0)) = 1 / 5 = 0.2
    const gainAt5 = AudioAttenuation.calculateGain(5.0, refDistance, maxDistance, rolloff, 'inverse');
    assert.strictEqual(gainAt5, 0.2);
  });

  it('should calculate linear distance attenuation gain accurately', () => {
    const refDistance = 10.0;
    const maxDistance = 110.0;
    const rolloff = 1.0;

    // At ref distance: gain = 1.0
    assert.strictEqual(AudioAttenuation.calculateGain(10.0, refDistance, maxDistance, rolloff, 'linear'), 1.0);

    // Halfway (60.0): factor = (60 - 10) / 100 = 0.5 => gain = 0.5
    assert.strictEqual(AudioAttenuation.calculateGain(60.0, refDistance, maxDistance, rolloff, 'linear'), 0.5);

    // At max distance: factor = 1.0 => gain = 0.0
    assert.strictEqual(AudioAttenuation.calculateGain(110.0, refDistance, maxDistance, rolloff, 'linear'), 0.0);
  });

  it('should calculate directional cone attenuation', () => {
    const sourcePos = { x: 0, y: 0, z: 0 };
    const orientation = { x: 0, y: 0, z: -1 }; // pointing down -Z

    // Listener directly in front of emitter
    const frontListener = { x: 0, y: 0, z: -5 };
    const coneGainFront = AudioAttenuation.calculateConeGain(
      sourcePos,
      orientation,
      frontListener,
      90, // inner cone 90 deg (+-45 deg)
      180, // outer cone 180 deg (+-90 deg)
      0.1
    );
    assert.strictEqual(coneGainFront, 1.0);

    // Listener directly behind emitter
    const backListener = { x: 0, y: 0, z: 5 };
    const coneGainBack = AudioAttenuation.calculateConeGain(
      sourcePos,
      orientation,
      backListener,
      90,
      180,
      0.1
    );
    assert.strictEqual(coneGainBack, 0.1);
  });

  it('should generate valid impulse responses for algorithmic reverberation', () => {
    // Mock audio context buffer creator
    const mockCtx = {
      sampleRate: 44100,
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const buffers = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: (ch: number) => buffers[ch]!
        } as unknown as AudioBuffer;
      }
    };

    const impulse = ReverbEngine.generateImpulseResponse(mockCtx, 1.0, 3.0, false);
    assert.strictEqual(impulse.numberOfChannels, 2);
    assert.strictEqual(impulse.length, 44100);

    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    // Initial reflections should have non-zero energy
    let energyStart = 0;
    for (let i = 0; i < 100; i++) {
      energyStart += Math.abs(left[i] ?? 0) + Math.abs(right[i] ?? 0);
    }
    assert.ok(energyStart > 0);

    // End reflections should decay significantly
    let energyEnd = 0;
    for (let i = 44000; i < 44100; i++) {
      energyEnd += Math.abs(left[i] ?? 0) + Math.abs(right[i] ?? 0);
    }
    assert.ok(energyStart > energyEnd);
  });
});
