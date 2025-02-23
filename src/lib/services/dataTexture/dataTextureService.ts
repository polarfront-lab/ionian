import { DefaultEventEmitter } from '@/lib/events/defaultEventEmitter';
import pool from '@/lib/services/dataTexture/worker/workerPool';
import { MeshData, ServiceState } from '@/lib/types';
import { createDataTexture } from '@/lib/utils';
import * as THREE from 'three';

/**
 * DataTextureManager is responsible for managing data textures used for mesh sampling.
 */
export class DataTextureService {
  private textureSize: number;
  private dataTextures: Map<string, THREE.DataTexture>;
  private eventEmitter;

  /**
   * Creates a new DataTextureManager instance.
   * @param eventEmitter
   * @param textureSize
   */
  constructor(eventEmitter: DefaultEventEmitter, textureSize: number) {
    this.eventEmitter = eventEmitter;
    this.textureSize = textureSize;
    this.dataTextures = new Map<string, THREE.DataTexture>();
    this.updateServiceState('ready');
  }

  setTextureSize(textureSize: number) {
    if (this.textureSize === textureSize) return;
    this.textureSize = textureSize;
    this.dataTextures.forEach((texture) => texture.dispose());
    this.dataTextures.clear();
  }

  /**
   * Prepares a mesh for sampling.
   * @returns The prepared data texture.
   * @param asset The asset to prepare.
   */
  async getDataTexture(asset: THREE.Mesh) {
    const texture = this.dataTextures.get(asset.name);
    if (texture) {
      return texture; // already prepared
    }

    const meshData = parseMeshData(asset);
    const worker = await pool.acquire();

    try {
      const array = await worker.sampleMesh(meshData, this.textureSize);
      const dataTexture = createDataTexture(array, this.textureSize);
      dataTexture.name = asset.name;
      return dataTexture;
    } finally {
      await pool.release(worker);
    }
  }

  async dispose() {
    this.dataTextures.clear();
    this.updateServiceState('disposed');
  }

  private updateServiceState(serviceState: ServiceState) {
    this.eventEmitter.emit('serviceStateUpdated', { type: 'data-texture', state: serviceState });
  }
}

/**
 * Parses mesh data into a simplified format.
 * @param mesh The mesh to parse.
 * @returns The parsed mesh data.
 */
function parseMeshData(mesh: THREE.Mesh): MeshData {
  return {
    position: mesh.geometry.attributes.position.array,
    normal: (mesh.geometry.attributes.normal as THREE.BufferAttribute)?.array,
    scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
  };
}
