import { ParticlesEngine } from '@/lib/particlesEngine';
import gui from 'lil-gui';
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

type CMSEntry = { id: number; name: string; file: string };

const fetchOptions = { headers: { Authorization: `Bearer ${import.meta.env.VITE_CMS_TOKEN}` } };

const fetchResourceUrls = async (key: string) => {
  return await fetch(`/api/items/${key}`, fetchOptions)
    .then((resp) => resp.json())
    .then((obj) => obj.data)
    .then((data) => data as CMSEntry[]);
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(canvas.width, canvas.height);
renderer.setPixelRatio(window.devicePixelRatio);

const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.001, 1000);
camera.position.z = 3;
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);

const scene = new THREE.Scene();
scene.add(camera);

const engine = new ParticlesEngine({
  textureSize: 256,
  scene,
  renderer,
  camera,
});

const GUI = new gui();
const matcapFolder = GUI.addFolder('matcap');
const matcapParams = {
  originColor: '0xffffff' as THREE.ColorRepresentation,
  destinationColor: '0xffffff' as THREE.ColorRepresentation,
  progress: 0,
};

matcapFolder.addColor(matcapParams, 'originColor').onChange((color: THREE.ColorRepresentation) => engine.setOriginColor(color));
matcapFolder.addColor(matcapParams, 'destinationColor').onChange((color: THREE.ColorRepresentation) => engine.setDestinationColor(color));
matcapFolder.add(matcapParams, 'progress', 0, 1, 0.01).onChange((progress: number) => engine.setMatcapProgress(progress));

fetchResourceUrls('meshes').then((entries) => {
  const promises = entries.map((entry) => engine.fetchAndRegisterMesh(entry.name, `/api/assets/${entry.file}`));
  Promise.all(promises).then((result) => {
    const first = result[0];
    if (first) engine.setOriginDataTexture(first.name);
  });
});

fetchResourceUrls('matcaps').then((entries) => {
  const promises = entries.map((entry) => engine.fetchAndRegisterMatcap(entry.name, `/api/assets/${entry.file}`));
  Promise.all(promises).then((result) => {
    const texture = result[4];
    if (texture) engine.setOriginMatcap(texture.name);
  });
});

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

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

window.addEventListener('mousemove', mouseEventHandler);

window.addEventListener('resize', resizeHandler);

window.addEventListener('onbeforeunload', () => {
  engine.dispose();
  renderer.dispose();
  controls.dispose();
  window.removeEventListener('resize', resizeHandler);
  window.removeEventListener('mousemove', mouseEventHandler);
});

function animate(timestamp: number) {
  stats.begin();
  engine.getObject().rotateY(0.001);
  engine.render(timestamp);
  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
