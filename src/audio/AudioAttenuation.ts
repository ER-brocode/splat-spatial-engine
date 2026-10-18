import { AttenuationModel, Vector3D } from './types.js';

/**
 * Computes standard 3D spatial audio distance attenuation curves matching Web Audio API specification.
 */
export class AudioAttenuation {
  /**
   * Calculates Euclidean distance between 3D source and listener.
   */
  public static calculateDistance(source: Vector3D, listener: Vector3D): number {
    const dx = source.x - listener.x;
    const dy = source.y - listener.y;
    const dz = source.z - listener.z;
    return Math.hypot(dx, dy, dz);
  }

  /**
   * Calculates gain multiplier based on Web Audio standard attenuation models:
   * - 'linear': 1 - rolloff * (clamp(d) - ref) / (max - ref)
   * - 'inverse': ref / (ref + rolloff * (clamp(d) - ref))
   * - 'exponential': (clamp(d) / ref) ^ (-rolloff)
   */
  public static calculateGain(
    distance: number,
    refDistance: number = 1.0,
    maxDistance: number = 1000.0,
    rolloffFactor: number = 1.0,
    model: AttenuationModel = 'inverse'
  ): number {
    if (refDistance <= 0) refDistance = 1.0;
    if (maxDistance < refDistance) maxDistance = refDistance;

    const clampedDist = Math.min(Math.max(distance, refDistance), maxDistance);

    switch (model) {
      case 'linear': {
        const factor = (clampedDist - refDistance) / Math.max(1e-6, maxDistance - refDistance);
        return Math.max(0.0, Math.min(1.0, 1.0 - rolloffFactor * factor));
      }
      case 'exponential': {
        const factor = clampedDist / refDistance;
        return Math.pow(factor, -rolloffFactor);
      }
      case 'inverse':
      default: {
        return refDistance / (refDistance + rolloffFactor * (clampedDist - refDistance));
      }
    }
  }

  /**
   * Calculates directional cone gain for directional sound emitters.
   */
  public static calculateConeGain(
    sourcePos: Vector3D,
    sourceOrientation: Vector3D,
    listenerPos: Vector3D,
    coneInnerAngle: number = 360,
    coneOuterAngle: number = 360,
    coneOuterGain: number = 0
  ): number {
    if (coneInnerAngle >= 360 && coneOuterAngle >= 360) {
      return 1.0;
    }

    const toListener = {
      x: listenerPos.x - sourcePos.x,
      y: listenerPos.y - sourcePos.y,
      z: listenerPos.z - sourcePos.z
    };

    const dist = Math.hypot(toListener.x, toListener.y, toListener.z);
    if (dist <= 1e-6) return 1.0;

    const normListener = {
      x: toListener.x / dist,
      y: toListener.y / dist,
      z: toListener.z / dist
    };

    const oriDist = Math.hypot(sourceOrientation.x, sourceOrientation.y, sourceOrientation.z);
    if (oriDist <= 1e-6) return 1.0;

    const normOri = {
      x: sourceOrientation.x / oriDist,
      y: sourceOrientation.y / oriDist,
      z: sourceOrientation.z / oriDist
    };

    const dot = Math.max(-1.0, Math.min(1.0, 
      normListener.x * normOri.x + normListener.y * normOri.y + normListener.z * normOri.z
    ));

    const angleDeg = (Math.acos(dot) * 180.0) / Math.PI;

    const halfInner = coneInnerAngle / 2.0;
    const halfOuter = coneOuterAngle / 2.0;

    if (angleDeg <= halfInner) {
      return 1.0;
    } else if (angleDeg >= halfOuter) {
      return coneOuterGain;
    } else {
      const t = (angleDeg - halfInner) / (halfOuter - halfInner);
      return 1.0 + t * (coneOuterGain - 1.0);
    }
  }
}
