import { ParticlesEngine } from '@/particlesEngine';
import { AssetEntry } from '@/types';
import * as THREE from 'three';
import { DRACOLoader, GLTFLoader } from 'three-stdlib';

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
gltfLoader.setDRACOLoader(dracoLoader);

const fetchOptions = { headers: { Authorization: `Bearer ${import.meta.env.VITE_CMS_TOKEN}` } };

const getMatcaps: () => Promise<AssetEntry<THREE.Texture>[]> = async () => {
  return await fetch('/api/items/matcaps', fetchOptions)
    .then((response) => response.json())
    .then((obj) => obj.data)
    .then((data) => data as CMSEntry[])
    .then((data) =>
      Promise.all(
        data.map(async (entry) => {
          const texture = await fetch(`/api/assets/${entry.file}`, fetchOptions)
            .then((response) => response.blob())
            .then((blob) => new THREE.TextureLoader().load(URL.createObjectURL(blob)));
          texture.name = entry.name;
          return { id: entry.name, item: texture };
        }),
      ),
    );
};

const getMeshes: () => Promise<AssetEntry<THREE.Mesh>[]> = async () => {
  return await fetch('/api/items/meshes', fetchOptions)
    .then((response) => response.json())
    .then((obj) => obj.data)
    .then((data) => data as CMSEntry[])
    .then((data) =>
      Promise.all(
        data.map(async (entry) => {
          const gltf = await fetch(`/api/assets/${entry.file}`, fetchOptions)
            .then((response) => response.blob())
            .then((blob) => gltfLoader.loadAsync(URL.createObjectURL(blob)));
          const mesh = gltf.scene.children[0] as THREE.Mesh;
          mesh.name = entry.name;
          return { id: entry.name, item: mesh };
        }),
      ),
    );
};

type CMSEntry = { id: number; name: string; file: string };

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(canvas.width, canvas.height);
renderer.setPixelRatio(window.devicePixelRatio);
const matcaps = await getMatcaps();
const meshes = await getMeshes();

const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.001, 1000);
camera.position.z = 3;
camera.lookAt(0, 0, 0);

const scene = new THREE.Scene();
scene.add(camera);

const engine = new ParticlesEngine({
  textureSize: 256,
  scene,
  renderer,
  camera,
  meshes: meshes,
  matcaps: matcaps,
});

engine.setOriginDataTexture(meshes[0].id);
engine.setOriginMatcap(matcaps[0].id);

const resizeHandler = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.width, canvas.height);
};

function mouseEventHandler(event: MouseEvent) {
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = -((event.clientY / window.innerHeight) * 2 - 1);
  engine.setPointerPosition({ x, y });
}

window.addEventListener('mousemove', mouseEventHandler);

window.addEventListener('resize', resizeHandler);

window.addEventListener('onbeforeunload', () => {
  engine.dispose();
  renderer.dispose();
  meshes.forEach(({ item }) => {
    item.geometry.dispose();
    if (item.material instanceof THREE.Material) {
      item.material.dispose();
    } else {
      item.material.forEach((material) => material.dispose());
    }
  });
  matcaps.forEach(({ item }) => item.dispose());
  window.removeEventListener('resize', resizeHandler);
  window.removeEventListener('mousemove', mouseEventHandler);
});

function animate(timestamp: number) {
  engine.render(timestamp);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
