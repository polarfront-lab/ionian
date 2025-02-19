import * as THREE from 'three';
import { Vector3Like } from 'three';
import instanceFragmentShader from './shaders/instanceFragmentShader';
import instanceVertexShader from './shaders/instanceVertexShader';

/**
 * InstancedMeshManager is responsible for managing instanced meshes.
 */
export class InstancedMeshManager {
  private size: number;
  private mesh: THREE.InstancedMesh;

  private readonly matcapMaterial: THREE.ShaderMaterial;
  private readonly fallbackMaterial: THREE.Material;
  private readonly fallbackGeometry: THREE.BufferGeometry;

  private materials: Map<string, THREE.Material>;
  private geometries: Map<string, THREE.BufferGeometry>;
  private uvRefsCache: Map<number, THREE.InstancedBufferAttribute>;

  private previousScale: Vector3Like;

  /**
   * Creates a new InstancedMeshManager instance.
   * @param initialSize The initial size of the instanced mesh.
   */
  constructor(initialSize: number) {
    this.size = initialSize;
    this.materials = new Map();
    this.geometries = new Map();
    this.uvRefsCache = new Map();

    this.previousScale = { x: 1, y: 1, z: 1 };

    this.matcapMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uTexture: { value: null },
        uVelocity: { value: null },
        uSourceMatcap: { value: null },
        uTargetMatcap: { value: null },
      },
      vertexShader: instanceVertexShader,
      fragmentShader: instanceFragmentShader,
    });

    this.fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.fallbackGeometry = new THREE.BoxGeometry(0.001, 0.001, 0.001);

    this.mesh = this.createInstancedMesh(initialSize, this.fallbackGeometry, this.fallbackMaterial);
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
    console.log('set source matcap', matcap);
    this.matcapMaterial.uniforms.uSourceMatcap.value = matcap;
  }

  setDestinationMatcap(matcap: THREE.Texture) {
    console.log('set target matcap', matcap);
    this.matcapMaterial.uniforms.uTargetMatcap.value = matcap;
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
    console.log('Using matcap material');
    this.mesh.material = this.matcapMaterial;
  }

  /**
   * Use the specified material for the instanced mesh.
   * @param id The ID of the material to use.
   */
  useMaterial(id: string) {
    const material = this.materials.get(id);
    if (material) {
      this.mesh.material = material;
    } else {
      console.warn(`material with id "${id}" not found`);
    }
  }

  /**
   * Use the specified geometry for the instanced mesh.
   * @param id The ID of the geometry to use.
   */
  useGeometry(id: string) {
    const geometry = this.geometries.get(id);
    if (geometry) {
      this.mesh.geometry = geometry;
    } else {
      console.warn(`geometry with id "${id}" not found`);
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
    this.materials.forEach((material) => material.dispose());

    this.uvRefsCache.clear();
    this.geometries.clear();
    this.materials.clear();
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
      console.log(`geometry with id "${id}" already exists. replacing...`);
    }

    // finally, we are attaching uvRefs.
    const uvRefs = this.getUVRefs(this.size);
    geometry.setAttribute('uvRef', uvRefs);

    this.geometries.set(id, geometry);

    if (this.mesh.geometry === previous) {
      this.mesh.geometry = geometry;
    }

    previous?.dispose();
  }

  /**
   * Registers a material.
   * @param id The ID of the material to register.
   * @param material The material to register.
   */
  registerMaterial(id: string, material: THREE.Material) {
    const previous = this.materials.get(id);
    if (previous) {
      if (previous === material) {
        return;
      }
      console.log(`material with id "${id}" already exists. replacing...`);
    }

    if (this.mesh.material === previous) {
      this.mesh.material = material;
    }

    this.materials.set(id, material);
    previous?.dispose();
  }

  /**
   * Gets the UV references for the specified size.
   * @param size The size for which to generate UV references.
   * @returns The UV references.
   */
  getUVRefs(size: number) {
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
    geometry.setAttribute('uvRef', this.getUVRefs(size));
    const count = size * size;
    return new THREE.InstancedMesh(geometry, material, count);
  }
}
