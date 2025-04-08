import * as THREE from 'three';
import { TextureSequence } from './index';

/**
 * Represents the current state of the system.
 */
export interface EngineState {
  pointerPosition: THREE.Vector2Like;
  textureSize: number;

  meshSequence: string[]; // ADDED: Array of mesh IDs in sequence
  overallProgress: number; // ADDED: Progress through the entire sequence (0.0 to 1.0)

  velocityTractionForce: number;
  positionalTractionForce: number;
  maxRepelDistance: number;

  textureSequence: TextureSequence;

  instanceGeometryScale: THREE.Vector3Like;
  useIntersect: boolean;
}
