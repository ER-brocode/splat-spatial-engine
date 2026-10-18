export type AttenuationModel = 'linear' | 'inverse' | 'exponential';

export interface SpatialAudioOptions {
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
  attenuationModel?: AttenuationModel;
}

export interface ReverbOptions {
  duration?: number;
  decay?: number;
  reverse?: boolean;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}
