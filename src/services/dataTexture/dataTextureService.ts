import { DefaultEventEmitter } from '@/events/defaultEventEmitter';
import { AssetEntry, MeshData, ServiceState } from '@/types';
import { copyOf, createDataTexture } from '@/utils';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

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
    } else {
      const mesh = this.meshes.get(id)!;
      const meshData = parseMeshData(mesh);

      const data = sampleMesh(meshData, this.textureSize);
      const texture = createDataTexture(data, this.textureSize);
      texture.name = id;
      return texture;
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

function sampleMesh(meshData: MeshData, size: number): Float32Array {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshData.position), 3));
  if (meshData.normal) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(meshData.normal), 3));
  }
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(meshData.scale.x, meshData.scale.y, meshData.scale.z);

  const sampler = new MeshSurfaceSampler(mesh).build();
  const data = new Float32Array(size * size * 4);
  const position = new THREE.Vector3();

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      sampler.sample(position);
      data[4 * index] = position.x * meshData.scale.x;
      data[4 * index + 1] = position.y * meshData.scale.y;
      data[4 * index + 2] = position.z * meshData.scale.z;
      data[4 * index + 3] = (Math.random() - 0.5) * 0.01;
    }
  }

  return data;
}