// --- START OF FILE main.ts ---

import { linear } from '@/lib/easing'; // Import easing if needed for transitions
import { ParticlesEngine } from '@/lib/particlesEngine';
import GUI, { Controller } from 'lil-gui';
import Stats from 'stats.js';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

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

// --- GUI Setup ---
const gui = new GUI();
gui.title('Particle Engine Controls');

// --- GUI Parameters Objects ---
const meshParams = {
  overallProgress: 0,
  targetProgress: 1.0,
  transitionDuration: 2000, // ms
};

const appearanceParams = {
  originType: '-- COLOR --', // Special value for color
  originMatcap: '', // Will be populated later
  originColor: '#ffffff',
  destinationType: '-- COLOR --',
  destinationMatcap: '',
  destinationColor: '#808080',
  progress: 0,
  transitionDuration: 1000, // ms
};

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
const matcapOptions: Record<string, string> = { '-- COLOR --': '-- COLOR --' };
let originColorController: Controller | null = null;
let destinationColorController: Controller | null = null;
let overallProgressController: Controller | null = null;
let matcapProgressController: Controller | null = null;

// --- 1. Mesh Sequence Folder ---
const meshFolder = gui.addFolder('Mesh Sequence').close(); // Start closed

overallProgressController = meshFolder
  .add(meshParams, 'overallProgress', 0, 1, 0.001)
  .name('Progress (Manual)')
  .onChange((value: number) => {
    engine.setOverallProgress(value, true);
  });

meshFolder.add(meshParams, 'targetProgress', 0, 1, 0.01).name('Target Progress');
meshFolder.add(meshParams, 'transitionDuration', 500, 10000, 100).name('Duration (ms)');
meshFolder
  .add(
    {
      trigger: () => {
        console.log(`Scheduling sequence transition to ${meshParams.targetProgress} over ${meshParams.transitionDuration}ms`);
        engine.scheduleMeshSequenceTransition(
          meshParams.targetProgress,
          meshParams.transitionDuration,
          linear, // Add easing selection later if needed
          {
            onTransitionProgress: (p) => {
              if (overallProgressController) {
                meshParams.overallProgress = p;
                // --- updateDisplay is called on the Controller ---
                overallProgressController.updateDisplay();
              }
            },
            onTransitionFinished: () => console.log('Sequence transition finished.'),
            onTransitionCancelled: () => console.log('Sequence transition cancelled.'),
          },
        );
      },
    },
    'trigger',
  )
  .name('Start Sequence Transition');

// --- 2. Appearance Folder (Matcap/Color) ---
const appearanceFolder = gui.addFolder('Appearance (Matcap/Color)').close();

// We'll add the dynamic controls after matcaps are loaded

// --- 3. Simulation Parameters Folder ---
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

// --- 4. Instance Settings Folder ---
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
      .setTextureSize(value) // This should now work correctly
      .then(() => {
        console.log(`Texture size successfully set to ${value}.`);
        instanceFolder.title('Instance Settings');
        // --- Update GUI param to reflect actual size after potential failure/correction ---
        instanceParams.textureSize = engine.getTextureSize();
      })
      .catch((error) => {
        console.error(`Failed to set texture size to ${value}:`, error);
        instanceParams.textureSize = engine.getTextureSize(); // Reset GUI to actual
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
        .setMeshSequence(meshNames) // Set the initial sequence
        .then(() => console.log('Initial mesh sequence set.'))
        .catch((error) => console.error('Error setting initial mesh sequence:', error));
    } else {
      console.error('Failed to load any meshes.');
    }
  });
});

// Load Matcaps and Populate Appearance GUI
fetchResourceUrls('matcaps').then((entries) => {
  if (!entries || entries.length === 0) {
    console.warn('No matcap entries found.');
    // Setup appearance GUI even without matcaps (color only)
    setupAppearanceGUI();
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
    matcapIds.forEach((id) => (matcapOptions[id] = id)); // Populate options object

    console.log(`Loaded ${matcapIds.length} matcaps.`);

    // Now that matcaps are loaded, setup the appearance GUI section
    setupAppearanceGUI();

    // Set initial appearance (e.g., first matcap or default color)
    if (matcapIds.length > 0) {
      appearanceParams.originType = matcapIds[0];
      appearanceParams.destinationType = matcapIds[0]; // Start with same
      engine.setOriginTexture(matcapIds[0]);
      engine.setDestinationTexture(matcapIds[0]);
    } else {
      engine.setOriginTexture(appearanceParams.originColor);
      engine.setDestinationTexture(appearanceParams.destinationColor);
    }
  });
});

// --- Function to Setup Appearance GUI (called after matcaps load) ---
function setupAppearanceGUI() {
  // Origin Selection
  appearanceFolder
    .add(appearanceParams, 'originType', matcapOptions)
    .name('Origin Type')
    .onChange((value: string) => {
      engine.setOriginTexture(value === '-- COLOR --' ? appearanceParams.originColor : value);
    })
    .listen(); // Listen for programmatic changes

  originColorController = appearanceFolder
    .addColor(appearanceParams, 'originColor')
    .name('Origin Color')
    .onChange((value: string) => {
      if (appearanceParams.originType === '-- COLOR --') {
        engine.setOriginTexture(value);
      }
    });

  // Destination Selection
  appearanceFolder
    .add(appearanceParams, 'destinationType', matcapOptions)
    .name('Destination Type')
    .onChange((value: string) => {
      engine.setDestinationTexture(value === '-- COLOR --' ? appearanceParams.destinationColor : value);
    })
    .listen();

  destinationColorController = appearanceFolder
    .addColor(appearanceParams, 'destinationColor')
    .name('Destination Color')
    .onChange((value: string) => {
      if (appearanceParams.destinationType === '-- COLOR --') {
        engine.setDestinationTexture(value);
      }
    });

  // Matcap Progress and Transition
  matcapProgressController = appearanceFolder
    .add(appearanceParams, 'progress', 0, 1, 0.01)
    .name('Progress (Manual)')
    .onChange((value: number) => {
      engine.setMatcapProgress(value, true);
    });

  appearanceFolder.add(appearanceParams, 'transitionDuration', 500, 5000, 100).name('Duration (ms)');
  appearanceFolder
    .add(
      {
        trigger: () => {
          const origin = appearanceParams.originType === '-- COLOR --' ? appearanceParams.originColor : appearanceParams.originType;
          const destination = appearanceParams.destinationType === '-- COLOR --' ? appearanceParams.destinationColor : appearanceParams.destinationType;
          console.log(`Scheduling appearance transition from ${origin} to ${destination} over ${appearanceParams.transitionDuration}ms`);
          engine.scheduleTextureTransition(origin, destination, {
            duration: appearanceParams.transitionDuration,
            easing: linear,
            override: true, // Override previous appearance transition
            onTransitionProgress: (p) => {
              // Update manual slider visually during transition
              if (matcapProgressController) {
                appearanceParams.progress = p;
                matcapProgressController.updateDisplay();
              }
            },
            onTransitionFinished: () => console.log('Appearance transition finished.'),
            onTransitionCancelled: () => console.log('Appearance transition cancelled.'),
          });
        },
      },
      'trigger',
    )
    .name('Start Appearance Transition');
}

// --- Function to Show/Hide Color Pickers ---
// function updateAppearanceControlsVisibility() {
//   originColorController?.domElement.parentElement!.style.setProperty('display', appearanceParams.originType === '-- COLOR --' ? '' : 'none');
//   destinationColorController?.domElement.parentElement!.style.setProperty('display', appearanceParams.destinationType === '-- COLOR --' ? '' : 'none');
// }

// --- Event Handlers (Keep resize, mouse) ---
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

// --- Stats (Keep as is) ---
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// --- Event Listeners (Keep as is) ---
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
  // Consider cancelling animation frame if loop is still running
});

function animate(timestamp: number) {
  // timestamp is already in milliseconds from requestAnimationFrame

  stats.begin();
  controls.update();

  // --- Call engine.render, which now handles transitionService.compute internally ---
  engine.render(timestamp); // Pass timestamp (ms)

  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}

// Start the animation loop
requestAnimationFrame(animate);
