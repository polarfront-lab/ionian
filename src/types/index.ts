import * as THREE from 'three';

/**
 * Represents an entry for an asset, pairing an ID with the asset itself.
 * @template T The type of the asset.
 */
export type AssetEntry<T> = { id: string; item: T };
/**
 * Represents a collection of assets, organized by asset ID and further
 * categorized by numerical keys (e.g., texture size).
 * @template T The type of the asset.
 */
export type Assets<T> = Map<string, Map<number, T>>;
/**
 * Represents the data of a mesh, including its position, normal, and scale.
 */
export type MeshData = {
  position: ArrayLike<number>;
  normal?: ArrayLike<number>;
  scale: { x: number; y: number; z: number };
};

/**
 * Represents an easing function.
 */
export interface EasingFunction {
  (n: number): number;
}

export type DataTextureEntry = {
  textureSize: number;
  dataTexture: THREE.DataTexture;
};

export type ServiceType = 'data-texture' | 'matcap' | 'instanced-mesh' | 'simulation';
export type ServiceState = 'created' | 'initializing' | 'ready' | 'disposed' | 'error' | 'loading';

export type TransitionType = 'data-texture' | 'matcap';

export interface TransitionDetail {
  duration: number;
  easing: EasingFunction;
}

export type TransitionCallback = (progress: number) => void;
export type Callback = () => void;
export type TransitionOptions = {
  onTransitionBegin?: Callback;
  onTransitionProgress?: TransitionCallback;
  onTransitionFinished?: Callback;
  onTransitionCancelled?: Callback;
};
