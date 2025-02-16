import { linear } from '@/easing';
import { DefaultEventEmitter } from '@/events/defaultEventEmitter';
import { DataTextureService } from '@/services/datatexture/dataTextureService';
import { InstancedMeshManager } from '@/services/instancedmesh/instancedMeshManager';
import { IntersectionService } from '@/services/intersection/intersectionService';
import { MatcapService } from '@/services/matcap/matcapService';
import { SimulationRendererService } from '@/services/simulation/simulationRendererService';
import { TransitionService } from '@/services/transition/transitionService';
import { AssetEntry, EasingFunction, ServiceState, ServiceType, TransitionType } from '@/types';
import { EngineState } from '@/types/state';
import * as THREE from 'three';

/**
 * Parameters for creating a ParticlesEngine instance.
 */
type ParticlesEngineParameters = {
  textureSize: number;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  meshes?: AssetEntry<THREE.Mesh>[];
  matcaps?: AssetEntry<THREE.Texture>[];
  camera?: THREE.Camera;
};

type ServiceStates = Record<ServiceType, ServiceState>;

/**
 * The main class for the particle engine.
 */
export class ParticlesEngine {
  private simulationRendererService: SimulationRendererService;
  private eventEmitter: DefaultEventEmitter;
  private renderer: THREE.WebGLRenderer;

  private scene: THREE.Scene;
  private serviceStates: ServiceStates;

  // assets
  private dataTextureManager: DataTextureService;
  private matcapService: MatcapService;
  private instancedMeshManager: InstancedMeshManager;

  private transitionService: TransitionService;
  private engineState: EngineState;

  private intersectionService: IntersectionService;

  /**
   * Creates a new ParticlesEngine instance.
   * @param params The parameters for creating the instance.
   */
  constructor(params: ParticlesEngineParameters) {
    this.eventEmitter = new DefaultEventEmitter();
    this.serviceStates = this.initialServiceStates();
    this.eventEmitter.on('serviceStateUpdated', this.handleServiceStateUpdated.bind(this));

    this.scene = params.scene;
    this.renderer = params.renderer;
    this.engineState = this.initialEngineState(params.textureSize);
    this.transitionService = new TransitionService(this.eventEmitter);
    this.dataTextureManager = new DataTextureService(this.eventEmitter, params.textureSize, params.meshes);
    this.matcapService = new MatcapService(this.eventEmitter, params.matcaps);
    this.simulationRendererService = new SimulationRendererService(this.eventEmitter, params.textureSize, this.renderer);
    this.instancedMeshManager = new InstancedMeshManager(params.textureSize);
    this.instancedMeshManager.useMatcapMaterial();
    this.scene.add(this.instancedMeshManager.getMesh());

    this.intersectionService = new IntersectionService(this.eventEmitter, params.camera);

    this.eventEmitter.on('transitionProgressed', this.handleTransitionProgress.bind(this));
    this.eventEmitter.on('interactionPositionUpdated', this.handleInteractionPositionUpdated.bind(this));
  }

  /**
   * Renders the scene.
   * @param elapsedTime The elapsed time since the last frame.
   */

  render(elapsedTime: number) {
    this.intersectionService.calculate();
    this.transitionService.compute(elapsedTime);
    this.simulationRendererService.compute(elapsedTime);
    this.instancedMeshManager.update(elapsedTime);
    this.instancedMeshManager.updateVelocityTexture(this.simulationRendererService.getVelocityTexture());
    this.instancedMeshManager.updatePositionTexture(this.simulationRendererService.getPositionTexture());
  }

  setOriginDataTexture(meshID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'data-texture' });
    this.dataTextureManager.getDataTexture(meshID).then((texture) => {
      this.engineState.originMeshID = meshID;
      this.simulationRendererService.setOriginDataTexture({
        dataTexture: texture,
        textureSize: this.engineState.textureSize,
      });
      this.intersectionService.setOriginGeometry(this.dataTextureManager.getMesh(meshID)!);
    });
  }

  setDestinationDataTexture(meshID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'data-texture' });
    this.dataTextureManager.getDataTexture(meshID).then((texture) => {
      this.engineState.destinationMeshID = meshID;
      this.simulationRendererService.setDestinationDataTexture({
        dataTexture: texture,
        textureSize: this.engineState.textureSize,
      });
      this.intersectionService.setDestinationGeometry(this.dataTextureManager.getMesh(meshID)!);
    });
  }

  setDataTextureTransitionProgress(progress: number, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'data-texture' });
    this.engineState.dataTextureTransitionProgress = progress;
    this.simulationRendererService.setDataTextureTransitionProgress(progress);
    this.intersectionService.setProgress(progress);
  }

  setOriginMatcap(matcapID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.engineState.originMatcapID = matcapID;
    this.instancedMeshManager.setOriginMatcap(this.matcapService.getMatcap(matcapID));
  }

  setDestinationMatcap(matcapID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.engineState.destinationMatcapID = matcapID;
    this.instancedMeshManager.setDestinationMatcap(this.matcapService.getMatcap(matcapID));
  }

  setMatcapProgress(progress: number, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.engineState.matcapTransitionProgress = progress;
    this.instancedMeshManager.setProgress(progress);
  }

  async setTextureSize(size: number) {
    this.engineState.textureSize = size;
    this.dataTextureManager.setTextureSize(size);
    this.simulationRendererService.setTextureSize(size);
    this.instancedMeshManager.resize(size);

    this.dataTextureManager
      .getDataTexture(this.engineState.originMeshID)
      .then((texture) => this.simulationRendererService.setOriginDataTexture({ dataTexture: texture, textureSize: size }));

    this.dataTextureManager.getDataTexture(this.engineState.destinationMeshID).then((texture) =>
      this.simulationRendererService.setDestinationDataTexture({
        dataTexture: texture,
        textureSize: size,
      }),
    );

    this.simulationRendererService.setDataTextureTransitionProgress(this.engineState.dataTextureTransitionProgress);
    this.simulationRendererService.setVelocityTractionForce(this.engineState.velocityTractionForce);
    this.simulationRendererService.setPositionalTractionForce(this.engineState.positionalTractionForce);

    this.instancedMeshManager.setOriginMatcap(this.matcapService.getMatcap(this.engineState.originMatcapID));
    this.instancedMeshManager.setDestinationMatcap(this.matcapService.getMatcap(this.engineState.destinationMatcapID));
    this.instancedMeshManager.setProgress(this.engineState.matcapTransitionProgress);
    this.instancedMeshManager.setGeometrySize(this.engineState.instanceGeometryScale);
  }

  setPointerPosition(position: THREE.Vector2Like) {
    this.engineState.pointerPosition = position;
    this.intersectionService.setMousePosition(position);
  }

  setGeometrySize(geometrySize: THREE.Vector3Like) {
    this.engineState.instanceGeometryScale = geometrySize;
    this.instancedMeshManager.setGeometrySize(geometrySize);
  }

  setVelocityTractionForce(force: number) {
    this.engineState.velocityTractionForce = force;
    this.simulationRendererService.setVelocityTractionForce(force);
  }

  setPositionalTractionForce(force: number) {
    this.engineState.positionalTractionForce = force;
    this.simulationRendererService.setPositionalTractionForce(force);
  }

  setMaxRepelDistance(distance: number) {
    this.engineState.maxRepelDistance = distance;
    this.simulationRendererService.setMaxRepelDistance(distance);
  }

  scheduleMeshTransition(originMeshID: string, destinationMeshID: string, easing: EasingFunction = linear, duration: number = 1000, override: boolean = false) {
    this.transitionService.enqueue(
      'data-texture',
      { easing, duration },
      {
        onTransitionBegin: () => {
          this.setOriginDataTexture(originMeshID, override);
          this.setDestinationDataTexture(destinationMeshID, override);
          this.setDataTextureTransitionProgress(0);
        },
      },
    );
  }

  scheduleMatcapTransition(
    originMatcapID: string,
    destinationMatcapID: string,
    easing: EasingFunction = linear,
    duration: number = 1000,
    override: boolean = false,
  ) {
    this.transitionService.enqueue(
      'matcap',
      { easing, duration },
      {
        onTransitionBegin: () => {
          this.setOriginMatcap(originMatcapID, override);
          this.setDestinationMatcap(destinationMatcapID, override);
          this.setMatcapProgress(0);
        },
      },
    );
  }

  handleServiceStateUpdated({ type, state }: { type: ServiceType; state: ServiceState }) {
    console.log('service state updated', type, state);
    this.serviceStates[type] = state;
  }
  /**
   * Disposes the resources used by the engine.
   */
  dispose() {
    this.scene.remove(this.instancedMeshManager.getMesh());
    this.matcapService.dispose();
    this.simulationRendererService.dispose();
    this.instancedMeshManager.dispose();
    this.intersectionService.dispose();
    this.dataTextureManager.dispose().then(() => console.log('engine disposed'));
  }

  private initialEngineState(textureSize: number): EngineState {
    return {
      textureSize,
      originMeshID: '',
      destinationMeshID: '',
      dataTextureTransitionProgress: 0,
      originMatcapID: '',
      destinationMatcapID: '',
      matcapTransitionProgress: 0,
      velocityTractionForce: 0.1,
      positionalTractionForce: 0.1,
      maxRepelDistance: 0.3,
      pointerPosition: { x: 0, y: 0 },
      instanceGeometryScale: { x: 1, y: 1, z: 1 },
    };
  }

  private initialServiceStates(): ServiceStates {
    return {
      'data-texture': 'created',
      'instanced-mesh': 'created',
      matcap: 'created',
      simulation: 'created',
    };
  }

  private handleTransitionProgress({ type, progress }: { type: TransitionType; progress: number }) {
    switch (type) {
      case 'data-texture':
        this.setDataTextureTransitionProgress(progress);
        break;
      case 'matcap':
        this.setMatcapProgress(progress);
        break;
    }
  }

  private handleInteractionPositionUpdated({ position }: { position: THREE.Vector4Like }) {
    this.simulationRendererService.setInteractionPosition(position);
  }
}
