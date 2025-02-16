import { AssetEntry, Assets } from '@/types';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler';

/**
 * Checks if a map exists and contains a specific key.
 * @param items - The map to check.
 * @param key - The key to look for.
 * @returns True if the map exists and contains the key, false otherwise.
 */
export function existsAndContainsKey<K, T>(items?: Map<K, T>, key?: K) {
  if (items) {
    if (key) {
      return items.has(key);
    }
  }
  return true;
}

/**
 * Creates a new DataTexture from the given data and size.
 * @param data - The data for the texture.
 * @param size - The size of the texture.
 * @returns The created DataTexture.
 */
export function createDataTexture(data: Float32Array, size: number) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a blank DataTexture with the given size.
 * @param size - The size of the texture.
 * @returns The created blank DataTexture.
 */
export function createBlankDataTexture(size: number) {
  return createDataTexture(new Float32Array(4 * size * size), size);
}

/**
 * Samples a mesh surface to create a DataTexture.
 * @param mesh - The mesh to sample.
 * @param size - The size of the texture.
 * @returns The created DataTexture.
 */
export function sampleMesh(mesh: THREE.Mesh, size: number) {
  const sampler = new MeshSurfaceSampler(mesh).build();
  const data = new Float32Array(size * size * 4);
  const position = new THREE.Vector3();

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      sampler.sample(position);
      data[4 * index] = position.x * mesh.scale.x;
      data[4 * index + 1] = position.y = mesh.scale.y;
      data[4 * index + 2] = position.z = mesh.scale.z;
      data[4 * index + 3] = (Math.random() - 0.5) * 0.01;
    }
  }
  return createDataTexture(data, size);
}

/**
 * Creates a DataTexture representing a sphere.
 * @param size - The size of the texture.
 * @returns The created DataTexture.
 */
export function createSpherePoints(size: number) {
  const data = new Float32Array(size * size * 4);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;

      let theta = Math.random() * Math.PI * 2;
      let phi = Math.acos(Math.random() * 2 - 1);
      let x = Math.sin(phi) * Math.cos(theta);
      let y = Math.sin(phi) * Math.sin(theta);
      let z = Math.cos(phi);

      data[4 * index] = x;
      data[4 * index + 1] = y;
      data[4 * index + 2] = z;
      data[4 * index + 3] = (Math.random() - 0.5) * 0.01;
    }
  }

  return createDataTexture(data, size);
}

/**
 * Disposes of an object if it's disposable.
 * @param object - The object to dispose.
 */
export function disposeIfPossible(object: unknown) {
  if (typeof object === 'object' && object !== null && 'dispose' in object && typeof object['dispose'] === 'function') {
    object.dispose();
  }
}

/**
 * Disposes of a map.
 * @param map - The map to dispose.
 */
export function disposeMap<K, T>(map: Map<K, T>) {
  map.forEach((value) => disposeIfPossible(value));
  map.clear();
}

/**
 * Disposes of assets.
 * @param assets - The assets to dispose.
 */
export function disposeAssets<T>(assets: Assets<T>) {
  assets.forEach((textures) => {
    textures.forEach((texture) => {
      disposeIfPossible(texture);
    });
    textures.clear();
  });
  assets.clear();
}

/**
 * Creates a copy of an AssetEntry or an array of AssetEntries.
 * @param source - The source to copy from.
 * @returns A map containing the copied entries.
 */
export function copyOf<T>(source?: AssetEntry<T> | AssetEntry<T>[]): Map<string, T> {
  const map = new Map<string, T>();
  if (source) {
    if (Array.isArray(source)) {
      source.forEach(({ id, item }) => map.set(id, item));
    } else {
      map.set(source.id, source.item);
    }
  }
  return map;
}

export function clamp(value: number, min: number, max: number): number {
  value = Math.min(value, max);
  value = Math.max(value, min);
  return value;
}
