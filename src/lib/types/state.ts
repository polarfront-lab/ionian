import * as THREE from 'three';

/**
 * Represents the current state of the system.
 */
export interface EngineState {
  pointerPosition: THREE.Vector2Like;
  textureSize: number;

  originMeshID: string;
  destinationMeshID: string;
  dataTextureTransitionProgress: number;
  velocityTractionForce: number;
  positionalTractionForce: number;
  maxRepelDistance: number;

  originMatcapID: string;
  destinationMatcapID: string;
  matcapTransitionProgress: number;
  instanceGeometryScale: THREE.Vector3Like;

  useIntersect: boolean;
}
