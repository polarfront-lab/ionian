import * as THREE from 'three';
import { Vector3Like } from 'three';
import instanceFragmentShader from './shaders/instanceFragmentShader';
import instanceVertexShader from './shaders/instanceVertexShader';

type MaterialUniforms = {
  uTime: { value: number };
  uProgress: { value: number };
  uTexture: { value: THREE.DataTexture | null };
  uVelocity: { value: THREE.DataTexture | null };
  uOriginTexture: { value: THREE.Texture | null };
  uDestinationTexture: { value: THREE.Texture | null };
};

/**
 * InstancedMeshManager is responsible for managing instanced meshes.
 */
export class InstancedMeshManager {
  private size: number;
  private mesh: THREE.InstancedMesh;

  private readonly matcapMaterial: THREE.ShaderMaterial;
  private readonly fallbackGeometry: THREE.BufferGeometry;

  private readonly uniforms: MaterialUniforms;

  private originColor: THREE.ColorRepresentation | null;
  private destinationColor: THREE.ColorRepresentation | null;

  private geometries: Map<string, THREE.BufferGeometry>;
  private uvRefsCache: Map<number, THREE.InstancedBufferAttribute>;

  private previousScale: Vector3Like;

  /**
   * Creates a new InstancedMeshManager instance.
   * @param initialSize The initial size of the instanced mesh.
   */
  constructor(initialSize: number) {
    this.size = initialSize;
    this.geometries = new Map();
    this.uvRefsCache = new Map();

    this.previousScale = { x: 1, y: 1, z: 1 };
    this.originColor = 'grey';
    this.destinationColor = 'grey';

    this.uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uTexture: { value: null },
      uVelocity: { value: null },
      uOriginTexture: { value: null },
      uDestinationTexture: { value: null },
    };

    this.matcapMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: instanceVertexShader,
      fragmentShader: instanceFragmentShader,
    });

    this.setOriginColor(this.originColor);
    this.setDestinationColor(this.destinationColor);

    this.fallbackGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    this.mesh = this.createInstancedMesh(initialSize, this.fallbackGeometry, this.matcapMaterial);
  }

  /**
   * Gets the instanced mesh.
   * @returns The instanced mesh.
   */
  getMesh() {
    return this.mesh;
  }

  /**
   * Updates the instanced mesh.
   * @param elapsedTime The elapsed time.
   */
  update(elapsedTime: number) {
    const material = this.mesh.material;
    if (material instanceof THREE.ShaderMaterial || material instanceof THREE.RawShaderMaterial) {
      material.uniforms.uTime.value = elapsedTime;
    }
  }

  /**
   * Sets the matcap texture.
   * @param matcap The matcap texture to set.
   */
  setOriginMatcap(matcap: THREE.Texture) {
    this.disposeSolidColorOriginTexture();
    this.matcapMaterial.uniforms.uOriginTexture.value = matcap;
  }

  setDestinationMatcap(matcap: THREE.Texture) {
    this.disposeSolidColorDestinationTexture();
    this.matcapMaterial.uniforms.uDestinationTexture.value = matcap;
  }

  setProgress(float: number) {
    float = Math.max(0, float);
    float = Math.min(1, float);
    this.matcapMaterial.uniforms.uProgress.value = float;
  }

  setGeometrySize(size: THREE.Vector3Like) {
    this.mesh.geometry.scale(1 / this.previousScale.x, 1 / this.previousScale.y, 1 / this.previousScale.z);
    this.mesh.geometry.scale(size.x, size.y, size.z);
    this.previousScale = size;
  }

  /**
   * Use the matcap material for the instanced mesh.
   */
  useMatcapMaterial() {
    this.mesh.material = this.matcapMaterial;
  }

  /**
   * Use the specified geometry for the instanced mesh.
   * @param id The ID of the geometry to use.
   */
  useGeometry(id: string) {
    const geometry = this.geometries.get(id);
    if (geometry) {
      this.mesh.geometry = geometry;
    }
  }

  /**
   * Updates the velocity texture.
   * @param texture The velocity texture to update with.
   */
  updateVelocityTexture(texture: THREE.Texture) {
    this.matcapMaterial.uniforms.uVelocity.value = texture;
  }

  /**
   * Updates the position texture.
   * @param texture The position texture to update with.
   */
  updatePositionTexture(texture: THREE.Texture) {
    this.matcapMaterial.uniforms.uTexture.value = texture;
  }

  /**
   * Resizes or replaces the instanced mesh.
   * @param size The new size of the instanced mesh.
   * @returns An object containing the updated mesh, the previous mesh, and a boolean indicating whether the mesh was updated.
   */
  resize(size: number): { current: THREE.InstancedMesh; previous: THREE.InstancedMesh } {
    if (this.size === size) return { current: this.mesh, previous: this.mesh };

    this.size = size;

    // create new instances since it is greater than the last known value
    const prev = this.mesh;

    this.mesh = this.createInstancedMesh(size, prev.geometry, prev.material);

    return { current: this.mesh, previous: prev };
  }

  /**
   * Disposes the resources used by the InstancedMeshManager.
   */
  dispose() {
    this.mesh.dispose();

    this.geometries.forEach((geometry) => geometry.dispose());
    this.disposeSolidColorOriginTexture();
    this.disposeSolidColorDestinationTexture();
    this.matcapMaterial.dispose();

    this.uvRefsCache.clear();
    this.geometries.clear();
  }

  /**
   * Registers a geometry.
   * @param id The ID of the geometry to register.
   * @param geometry The geometry to register.
   */
  registerGeometry(id: string, geometry: THREE.BufferGeometry) {
    const previous = this.geometries.get(id);

    if (previous) {
      if (previous === geometry) {
        return;
      }
    }

    // finally, we are attaching uvRefs.
    const uvRefs = this.createUVRefs(this.size);
    geometry.setAttribute('uvRef', uvRefs);

    this.geometries.set(id, geometry);

    if (this.mesh.geometry === previous) {
      this.mesh.geometry = geometry;
    }

    previous?.dispose();
  }

  setOriginColor(color: THREE.ColorRepresentation) {
    this.disposeSolidColorOriginTexture();
    this.originColor = color;
    this.uniforms.uOriginTexture.value = this.createSolidColorDataTexture(color);
  }

  setDestinationColor(color: THREE.ColorRepresentation) {
    this.disposeSolidColorDestinationTexture();
    this.destinationColor = color;
    this.uniforms.uDestinationTexture.value = this.createSolidColorDataTexture(color);
  }

  /**
   * Gets the UV references for the specified size.
   * @param size The size for which to generate UV references.
   * @returns The UV references.
   */
  private createUVRefs(size: number) {
    const cached = this.uvRefsCache.get(size);

    if (cached) {
      return cached;
    }

    const uvRefs = new Float32Array(size * size * 2);

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const index = i * size + j;
        uvRefs[2 * index] = j / (size - 1);
        uvRefs[2 * index + 1] = i / (size - 1);
      }
    }

    const attr = new THREE.InstancedBufferAttribute(uvRefs, 2);

    this.uvRefsCache.set(size, attr);
    return attr;
  }

  /**
   * Creates a new instanced mesh.
   * @param size The size of the instanced mesh.
   * @param geometry The geometry to use for the instanced mesh.
   * @param material The material to use for the instanced mesh.
   * @returns The created instanced mesh.
   */
  private createInstancedMesh(size: number, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
    geometry = geometry || this.fallbackGeometry;
    geometry.setAttribute('uvRef', this.createUVRefs(size));
    const count = size * size;
    return new THREE.InstancedMesh(geometry, material, count);
  }

  private createSolidColorDataTexture(color: THREE.ColorRepresentation, size: number = 16): THREE.DataTexture {
    const col = new THREE.Color(color);
    const width = size;
    const height = size;
    const data = new Uint8Array(width * height * 4); // RGBA

    const r = Math.floor(col.r * 255);
    const g = Math.floor(col.g * 255);
    const b = Math.floor(col.b * 255);

    for (let i = 0; i < width * height; i++) {
      const index = i * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255; // Alpha
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.type = THREE.UnsignedByteType;
    texture.wrapS = THREE.RepeatWrapping; // Or ClampToEdgeWrapping
    texture.wrapT = THREE.RepeatWrapping; // Or ClampToEdgeWrapping
    texture.minFilter = THREE.NearestFilter; // Ensure sharp color
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }

  private disposeSolidColorOriginTexture() {
    if (this.originColor) {
      this.originColor = null;
      if (this.uniforms.uOriginTexture.value) {
        this.uniforms.uOriginTexture.value.dispose();
      }
    }
  }

  private disposeSolidColorDestinationTexture() {
    if (this.destinationColor) {
      this.destinationColor = null;
      if (this.uniforms.uDestinationTexture.value) {
        this.uniforms.uDestinationTexture.value.dispose();
      }
    }
  }
}
