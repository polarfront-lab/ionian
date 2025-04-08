// --- START OF FILE main.ts ---

import { linear } from '@/lib/easing';
import { ParticlesEngine } from '@/lib/particlesEngine'; // TextureSequence, TextureSequenceItem 임포트
import GUI, { Controller } from 'lil-gui';
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { TextureSequence } from '@/lib/types';

type CMSEntry = { id: number; name: string; file: string };

// --- Fetching Functions (Keep as is) ---
const fetchOptions = { headers: { Authorization: `Bearer ${import.meta.env.VITE_CMS_TOKEN}` } };
const fetchResourceUrls = async (key: string): Promise<CMSEntry[]> => {
  try {
    const response = await fetch(`/api/items/${key}`, fetchOptions);
    if (!response.ok) throw new Error(`Failed to fetch ${key}: ${response.statusText}`);
    const obj = await response.json();
    return obj.data as CMSEntry[];
  } catch (error) {
    console.error(`Error fetching resource URLs for ${key}:`, error);
    return [];
  }
};

// --- Canvas, Renderer, Camera, Controls, Scene Setup (Keep as is) ---
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(canvas.width, canvas.height);
renderer.setPixelRatio(window.devicePixelRatio);
const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.01, 100);
camera.position.z = 3;
camera.lookAt(0, 0, 0);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const scene = new THREE.Scene();
scene.add(camera);

// --- Particles Engine Initialization ---
const initialTextureSize = 64;
const engine = new ParticlesEngine({
  textureSize: initialTextureSize,
  scene,
  renderer,
  camera,
  useIntersection: false, // Initial state for intersection
});

// --- 초기 텍스처 시퀀스 설정 (예: 기본 회색) ---
const initialTextureSequence: TextureSequence = [
  { type: 'color', value: '#808080' } // 기본 회색으로 시작
];
engine.setTextureSequence(initialTextureSequence);


// --- GUI Setup ---
const gui = new GUI();
gui.title('Particle Engine Controls');

// --- GUI Parameters Objects ---
const meshParams = {
  overallProgress: 0, // 엔진 초기값과 동기화 (엔진 생성자에서 0으로 설정됨)
  targetProgress: 1.0,
  transitionDuration: 2000, // ms
};

// --- appearanceParams 제거 ---
// const appearanceParams = { ... };

const simulationParams = {
  velocityTraction: 0.1,
  positionalTraction: 0.1,
  maxRepelDistance: 0.3,
};

const instanceParams = {
  geometryScale: 1.0,
  textureSize: engine.getTextureSize(),
  useIntersect: engine.getUseIntersect(),
};

// --- Helper Variables for GUI ---
let matcapIds: string[] = [];
// --- matcapOptions 제거 (Appearance GUI 제거됨) ---
// const matcapOptions: Record<string, string> = { '-- COLOR --': '-- COLOR --' };
// --- origin/destination 컨트롤러 제거 ---
// let originColorController: Controller | null = null;
// let destinationColorController: Controller | null = null;
let overallProgressController: Controller | null = null;
// --- matcapProgressController 제거 ---
// let matcapProgressController: Controller | null = null;

// --- 1. Mesh & Texture Sequence Folder ---
// 폴더 이름 변경 고려: Mesh & Texture Sequence
const sequenceFolder = gui.addFolder('Sequence Control (Mesh & Texture)').close(); // 이름 변경

overallProgressController = sequenceFolder
  .add(meshParams, 'overallProgress', 0, 1, 0.001)
  .name('Overall Progress') // 이름 단순화 (폴더 이름에서 설명)
  .onChange((value: number) => {
    // 이제 이 값 변경이 메시와 텍스처 모두에 영향을 줌
    engine.setOverallProgress(value, true); // override=true (수동 조작 시 전환 취소)
  });

sequenceFolder.add(meshParams, 'targetProgress', 0, 1, 0.01).name('Target Progress');
sequenceFolder.add(meshParams, 'transitionDuration', 500, 10000, 100).name('Duration (ms)');
sequenceFolder
  .add(
    {
      trigger: () => {
        console.log(`Scheduling overall transition to ${meshParams.targetProgress} over ${meshParams.transitionDuration}ms`);
        // scheduleMeshSequenceTransition 사용 (이름 변경 안 함)
        engine.scheduleMeshSequenceTransition(
          meshParams.targetProgress,
          meshParams.transitionDuration,
          linear,
          {
            onTransitionProgress: (p) => {
              if (overallProgressController) {
                meshParams.overallProgress = p;
                overallProgressController.updateDisplay(); // 슬라이더 업데이트
              }
            },
            onTransitionFinished: () => console.log('Overall transition finished.'),
            onTransitionCancelled: () => console.log('Overall transition cancelled.'),
          },
          true // override = true (기존 전환 취소)
        );
      },
    },
    'trigger',
  )
  .name('Start Overall Transition'); // 버튼 이름 변경

// --- 2. Appearance Folder 제거 ---
// const appearanceFolder = gui.addFolder('Appearance (Matcap/Color)').close();
// setupAppearanceGUI() 함수 호출 및 관련 로직 제거

// --- 3. Simulation Parameters Folder (유지) ---
const simFolder = gui.addFolder('Simulation Parameters').close();
simFolder
  .add(simulationParams, 'velocityTraction', 0.01, 1.0, 0.001)
  .name('Velocity Traction')
  .onChange((value: number) => engine.setVelocityTractionForce(value));
simFolder
  .add(simulationParams, 'positionalTraction', 0.01, 1.0, 0.001)
  .name('Position Traction')
  .onChange((value: number) => engine.setPositionalTractionForce(value));
simFolder
  .add(simulationParams, 'maxRepelDistance', 0.0, 1.0, 0.001)
  .name('Max Repel Distance')
  .onChange((value: number) => engine.setMaxRepelDistance(value));

// --- 4. Instance Settings Folder (유지) ---
const instanceFolder = gui.addFolder('Instance Settings').close();
instanceFolder
  .add(instanceParams, 'geometryScale', 0.1, 5.0, 0.001)
  .name('Particle Scale')
  .onChange((value: number) => engine.setGeometrySize({ x: value, y: value, z: value }));

const textureSizes = [64, 128, 256, 512, 1024];
instanceFolder
  .add(instanceParams, 'textureSize', textureSizes)
  .name('Texture Size')
  .onChange((value: number) => {
    console.log(`Requesting texture size change to: ${value}`);
    instanceFolder.title('Instance Settings (Resizing...)');
    engine
      .setTextureSize(value)
      .then(() => {
        console.log(`Texture size successfully set to ${value}.`);
        instanceFolder.title('Instance Settings');
        instanceParams.textureSize = engine.getTextureSize(); // 실제 크기 반영
        // 리사이즈 후 overallProgressController 업데이트 (만약 있다면)
        if (overallProgressController) {
          meshParams.overallProgress = engine.getEngineStateSnapshot().overallProgress; // 엔진 상태에서 가져오기
          overallProgressController.updateDisplay();
        }
      })
      .catch((error) => {
        console.error(`Failed to set texture size to ${value}:`, error);
        instanceParams.textureSize = engine.getTextureSize(); // 실제 크기로 리셋
        instanceFolder.title('Instance Settings (Error)');
      });
  });

instanceFolder
  .add(instanceParams, 'useIntersect')
  .name('Enable Mouse Interaction')
  .onChange((value: boolean) => engine.useIntersect(value));

// --- Asset Loading ---

// Load Meshes and Set Initial Sequence
fetchResourceUrls('meshes').then((entries) => {
  if (!entries || entries.length === 0) {
    console.warn('No mesh entries found.');
    return;
  }
  console.log(`Found ${entries.length} mesh entries. Loading...`);
  const promises = entries.map((entry) =>
    engine.fetchAndRegisterMesh(entry.name, `/api/assets/${entry.file}`).catch((error) => {
      console.error(`Failed to load mesh ${entry.name}:`, error);
      return null;
    }),
  );

  Promise.all(promises).then((results) => {
    const loadedMeshes = results.filter((mesh) => mesh !== null) as THREE.Mesh[];
    const meshNames = loadedMeshes.map((mesh) => mesh.name);
    if (meshNames.length > 0) {
      console.log(`Loaded ${meshNames.length} meshes. Setting sequence:`, meshNames);
      engine
        .setMeshSequence(meshNames) // Set the initial mesh sequence
        .then(() => console.log('Initial mesh sequence set.'))
        .catch((error) => console.error('Error setting initial mesh sequence:', error));
    } else {
      console.error('Failed to load any meshes.');
    }
  });
});

// Load Matcaps and Update Texture Sequence
fetchResourceUrls('matcaps').then((entries) => {
  if (!entries || entries.length === 0) {
    console.warn('No matcap entries found. Using initial texture sequence.');
    // setupAppearanceGUI() 호출 제거
    return;
  }
  console.log(`Found ${entries.length} matcap entries. Loading...`);
  const promises = entries.map((entry) =>
    engine.fetchAndRegisterMatcap(entry.name, `/api/assets/${entry.file}`).catch((error) => {
      console.error(`Failed to load matcap ${entry.name}:`, error);
      return null;
    }),
  );

  Promise.all(promises).then((results) => {
    const loadedMatcaps = results.filter((tex) => tex !== null) as THREE.Texture[];
    matcapIds = loadedMatcaps.map((tex) => tex.name); // Store loaded IDs

    console.log(`Loaded ${matcapIds.length} matcaps.`);

    // --- Matcap 로드 후 텍스처 시퀀스 업데이트 ---
    if (matcapIds.length > 0) {
      // 예시: 로드된 Matcap과 색상을 섞어 시퀀스 정의
      const dynamicTextureSequence: TextureSequence = [];
      matcapIds.forEach(id => dynamicTextureSequence.push({ type: 'matcap', id }));
      // 중간에 색상 추가 예시
      if (dynamicTextureSequence.length > 1) {
        dynamicTextureSequence.splice(1, 0, { type: 'color', value: 'lime' });
      } else {
        dynamicTextureSequence.push({ type: 'color', value: '#0000ff' }); // 파란색 추가
      }

      console.log('Setting dynamic texture sequence:', dynamicTextureSequence);
      engine.setTextureSequence(dynamicTextureSequence);
    } else {
      console.warn('No matcaps loaded, keeping initial texture sequence.');
    }

    // --- setupAppearanceGUI() 호출 제거 ---
    // setupAppearanceGUI();

    // --- 기존 Origin/Destination 설정 로직 제거 ---
    // if (matcapIds.length > 0) { ... } else { ... }
  });
});

// --- Function to Setup Appearance GUI 제거 ---
// function setupAppearanceGUI() { ... }

// --- Event Handlers (유지) ---
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

// --- Stats (유지) ---
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// --- Event Listeners (유지) ---
window.addEventListener('mousemove', mouseEventHandler);
window.addEventListener('resize', resizeHandler);
window.addEventListener('beforeunload', () => {
  console.log('Disposing resources...');
  gui.destroy();
  stats.dom.remove();
  engine.dispose();
  renderer.dispose();
  controls.dispose();
  window.removeEventListener('resize', resizeHandler);
  window.removeEventListener('mousemove', mouseEventHandler);
});

// --- Animation Loop (유지) ---
function animate(timestamp: number) {
  stats.begin();
  controls.update();

  engine.render(timestamp); // Pass timestamp (ms)

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}

// Start the animation loop
requestAnimationFrame(animate);

// --- END OF FILE main.ts ---