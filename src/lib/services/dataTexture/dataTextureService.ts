import { DefaultEventEmitter } from '@/lib/events/defaultEventEmitter';
import pool from '@/lib/services/dataTexture/worker/workerPool';
import { AssetEntry, MeshData, ServiceState } from '@/lib/types';
import { copyOf, createDataTexture } from '@/lib/utils';
import * as THREE from 'three';

/**
 * DataTextureManager is responsible for managing data textures used for mesh sampling.
 */
export class DataTextureService {
  private textureSize: number;
  private meshes: Map<string, THREE.Mesh>;
  private dataTextures: Map<string, THREE.DataTexture>;
  private eventEmitter;

  /**
   * Creates a new DataTextureManager instance.
   * @param eventEmitter
   * @param textureSize
   * @param meshes Optional initial meshes.
   */
  constructor(eventEmitter: DefaultEventEmitter, textureSize: number, meshes?: AssetEntry<THREE.Mesh> | AssetEntry<THREE.Mesh>[]) {
    this.eventEmitter = eventEmitter;
    this.textureSize = textureSize;
    this.meshes = copyOf(meshes);
    this.dataTextures = new Map<string, THREE.DataTexture>();
    this.updateServiceState('ready');
  }

  /**
   * Registers a mesh.
   * @param id The ID of the mesh.
   * @param mesh The mesh to register.
   */
  async register(id: string, mesh: THREE.Mesh) {
    this.meshes.set(id, mesh);
  }

  setTextureSize(textureSize: number) {
    if (this.textureSize === textureSize) return;
    this.textureSize = textureSize;
    this.dataTextures.forEach((texture) => texture.dispose());
    this.dataTextures.clear();
  }

  getMesh(id: string): THREE.Mesh | undefined {
    return this.meshes.get(id);
  }

  /**
   * Gets the data texture for the specified mesh ID and current texture size.
   * Returns the fallback data texture if the specified mesh ID is not found.
   * @param id The ID of the mesh.
   * @returns The data texture, or undefined if not found and no fallback is available.
   */
  async getDataTexture(id: string): Promise<THREE.DataTexture> {
    return await this.prepareMesh(id);
  }

  /**
   * Prepares a mesh for sampling.
   * @param id The ID of the mesh to prepare.
   */
  async prepareMesh(id: string) {
    if (!this.meshes.has(id)) {
      throw new Error(`Mesh with id "${id}" does not exist.`);
    }

    const texture = this.dataTextures.get(id);
    if (texture) {
      return texture; // already prepared
    }

    const mesh = this.meshes.get(id)!;
    const meshData = parseMeshData(mesh);
    const worker = await pool.acquire();

    try {
      const data = await worker.sampleMesh(meshData, this.textureSize);
      const texture = createDataTexture(data, this.textureSize);
      texture.name = id;
      return texture;
    } finally {
      await pool.release(worker);
    }
  }

  async dispose() {
    this.meshes.clear();
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
