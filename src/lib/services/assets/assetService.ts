import { DefaultEventEmitter } from '@/lib/events';
import { ServiceState } from '@/lib/types';
import { disposeMesh } from '@/lib/utils';
import * as THREE from 'three';
import { DRACOLoader, GLTFLoader } from 'three-stdlib';

export class AssetService {
  private serviceState: ServiceState = 'created';

  private readonly eventEmitter;
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly textures = new Map<string, THREE.Texture>();

  private readonly gltfLoader = new GLTFLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly dracoLoader = new DRACOLoader();

  private solidColorTexture = new THREE.DataTexture(new Uint8Array([127, 127, 127, 255]), 1, 1, THREE.RGBAFormat);

  constructor(eventEmitter: DefaultEventEmitter) {
    this.eventEmitter = eventEmitter;
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.updateServiceState('ready');
  }

  /**
   * Registers an asset.
   * @param id - The ID of the asset.
   * @param item - The asset to set.
   */
  register(id: string, item: THREE.Mesh | THREE.Texture) {
    item.name = id;

    if (item instanceof THREE.Mesh) {
      const prev = this.meshes.get(id);
      if (prev) disposeMesh(prev);
      this.meshes.set(id, item);
    } else {
      const prev = this.textures.get(id);
      if (prev) prev.dispose();
      this.textures.set(id, item);
    }

    this.eventEmitter.emit('assetRegistered', { id });
  }

  setSolidColor(color: THREE.ColorRepresentation) {
    this.changeColor(color);
  }

  getSolidColorTexture() {
    return this.solidColorTexture;
  }

  getMesh(id: string): THREE.Mesh | null {
    return this.meshes.get(id) ?? null;
  }

  getMatcap(id: string): THREE.Texture {
    const texture = this.textures.get(id);
    if (!texture) this.eventEmitter.emit('invalidRequest', { message: `texture with id "${id}" not found. using solid color texture instead...` });
    return texture ?? this.solidColorTexture;
  }

  getMeshIDs(): string[] {
    return Array.from(this.meshes.keys());
  }

  getTextureIDs(): string[] {
    return Array.from(this.textures.keys());
  }

  getMeshes(): THREE.Mesh[] {
    return Array.from(this.meshes.values());
  }

  getTextures(): THREE.Texture[] {
    return Array.from(this.textures.values());
  }

  hasMatcap(id: string) {
    return this.textures.has(id);
  }

  /**
   * Loads a mesh asynchronously.
   * @param id - The ID of the mesh.
   * @param url - The URL of the mesh.
   * @param options - Optional parameters.
   * @returns The loaded mesh or null.
   */
  async loadMeshAsync(id: string, url: string, options: { meshName?: string } = {}): Promise<THREE.Mesh | null> {
    const gltf = await this.gltfLoader.loadAsync(url);
    try {
      if (options.meshName) {
        const mesh = gltf.scene.getObjectByName(options.meshName) as THREE.Mesh;
        this.register(id, mesh);
        return mesh;
      } else {
        const mesh = gltf.scene.children[0] as THREE.Mesh;
        this.register(id, mesh);
        return mesh;
      }
    } catch (error) {
      this.eventEmitter.emit('invalidRequest', { message: `failed to load mesh: ${id}. ${error}` });
      return null;
    }
  }

  /**
   * Loads a texture asynchronously.
   * @param id - The ID of the texture.
   * @param url - The URL of the texture.
   * @returns The loaded texture or null.
   */
  async loadTextureAsync(id: string, url: string): Promise<THREE.Texture | null> {
    try {
      const texture = await this.textureLoader.loadAsync(url);
      this.register(id, texture);
      return texture;
    } catch (error) {
      this.eventEmitter.emit('invalidRequest', { message: `failed to load texture: ${id}. ${error}` });
      return null;
    }
  }

  dispose() {
    this.updateServiceState('disposed');
    this.meshes.forEach((mesh) => disposeMesh(mesh));
    this.meshes.clear();
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
  }

  private changeColor(color: THREE.ColorRepresentation) {
    const actual = new THREE.Color(color);
    this.solidColorTexture = new THREE.DataTexture(new Uint8Array([actual.r, actual.g, actual.b, 255]), 1, 1, THREE.RGBAFormat);
    this.solidColorTexture.needsUpdate = true;
  }

  private updateServiceState(serviceState: ServiceState) {
    this.serviceState = serviceState;
    this.eventEmitter.emit('serviceStateUpdated', { type: 'asset', state: serviceState });
  }
}
