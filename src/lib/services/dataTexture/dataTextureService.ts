import { DefaultEventEmitter } from '@/lib/events/defaultEventEmitter';
import { MeshData, ServiceState } from '@/lib/types';
import { createDataTexture } from '@/lib/utils';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

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
    const array = sampleMesh(meshData, this.textureSize);
    const dataTexture = createDataTexture(array, this.textureSize);
    dataTexture.name = asset.name;
    return dataTexture;
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