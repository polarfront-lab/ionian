import { MeshData } from '@/lib/types';
import * as Comlink from 'comlink';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

export interface MeshSamplerAPI {
  sampleMesh: (meshData: MeshData, size: number) => Promise<Float32Array>;
}

const api = {
  sampleMesh: (meshData: MeshData, size: number): Float32Array => {
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
  },
};

Comlink.expose(api);
