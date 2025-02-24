import { linear } from '@/lib/easing';
import { DefaultEventEmitter } from '@/lib/events/defaultEventEmitter';
import { AssetService } from '@/lib/services/assets/assetService';
import { DataTextureService } from '@/lib/services/dataTexture/dataTextureService';
import { InstancedMeshManager } from '@/lib/services/instancedmesh/instancedMeshManager';
import { IntersectionService } from '@/lib/services/intersection/intersectionService';
import { SimulationRendererService } from '@/lib/services/simulation/simulationRendererService';
import { TransitionService } from '@/lib/services/transition/transitionService';
import { EasingFunction, ServiceState, ServiceType, TransitionType } from '@/lib/types';
import { EngineState } from '@/lib/types/state';
import * as THREE from 'three';

/**
 * Parameters for creating a ParticlesEngine instance.
 */
type ParticlesEngineParameters = {
  textureSize: number;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
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
  private assetService: AssetService;
  private dataTextureManager: DataTextureService;
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

    this.assetService = new AssetService(this.eventEmitter);
    this.transitionService = new TransitionService(this.eventEmitter);
    this.dataTextureManager = new DataTextureService(this.eventEmitter, params.textureSize);
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
    this.intersectionService.calculate(this.instancedMeshManager.getMesh());
    this.transitionService.compute(elapsedTime);
    this.simulationRendererService.compute(elapsedTime);
    this.instancedMeshManager.update(elapsedTime);
    this.instancedMeshManager.updateVelocityTexture(this.simulationRendererService.getVelocityTexture());
    this.instancedMeshManager.updatePositionTexture(this.simulationRendererService.getPositionTexture());
  }

  setOriginDataTexture(meshID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'data-texture' });

    const mesh = this.assetService.getMesh(meshID);

    if (!mesh) {
      this.eventEmitter.emit('invalidRequest', { message: `Mesh with id "${meshID}" does not exist` });
      return;
    }

    this.dataTextureManager.getDataTexture(mesh).then((dataTexture) => {
      this.engineState.originMeshID = meshID;
      this.simulationRendererService.setOriginDataTexture({ dataTexture, textureSize: this.engineState.textureSize });
      this.intersectionService.setOriginGeometry(mesh);
    });
  }

  setDestinationDataTexture(meshID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'data-texture' });

    const mesh = this.assetService.getMesh(meshID);

    if (!mesh) {
      this.eventEmitter.emit('invalidRequest', { message: `Mesh with id "${meshID}" does not exist` });
      return;
    }

    this.dataTextureManager.getDataTexture(mesh).then((texture) => {
      this.engineState.destinationMeshID = meshID;
      this.simulationRendererService.setDestinationDataTexture({
        dataTexture: texture,
        textureSize: this.engineState.textureSize,
      });
      this.intersectionService.setDestinationGeometry(mesh);
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
    this.instancedMeshManager.setOriginMatcap(this.assetService.getMatcap(matcapID));
  }

  setDestinationMatcap(matcapID: string, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.engineState.destinationMatcapID = matcapID;
    this.instancedMeshManager.setDestinationMatcap(this.assetService.getMatcap(matcapID));
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

    const originMesh = this.assetService.getMesh(this.engineState.originMeshID);
    if (!originMesh) {
      this.eventEmitter.emit('invalidRequest', { message: `Mesh with id "${this.engineState.originMeshID}" does not exist` });
      return;
    }

    const destinationMesh = this.assetService.getMesh(this.engineState.destinationMeshID);
    if (!destinationMesh) {
      this.eventEmitter.emit('invalidRequest', { message: `Mesh with id "${this.engineState.destinationMeshID}" does not exist` });
      return;
    }

    this.dataTextureManager
      .getDataTexture(originMesh)
      .then((texture) => this.simulationRendererService.setOriginDataTexture({ dataTexture: texture, textureSize: size }));

    this.dataTextureManager.getDataTexture(destinationMesh).then((texture) =>
      this.simulationRendererService.setDestinationDataTexture({
        dataTexture: texture,
        textureSize: size,
      }),
    );

    this.simulationRendererService.setDataTextureTransitionProgress(this.engineState.dataTextureTransitionProgress);
    this.simulationRendererService.setVelocityTractionForce(this.engineState.velocityTractionForce);
    this.simulationRendererService.setPositionalTractionForce(this.engineState.positionalTractionForce);

    this.instancedMeshManager.setOriginMatcap(this.assetService.getMatcap(this.engineState.originMatcapID));
    this.instancedMeshManager.setDestinationMatcap(this.assetService.getMatcap(this.engineState.destinationMatcapID));
    this.instancedMeshManager.setProgress(this.engineState.matcapTransitionProgress);
    this.instancedMeshManager.setGeometrySize(this.engineState.instanceGeometryScale);
  }

  registerMesh(id: string, mesh: THREE.Mesh) {
    this.assetService.register(id, mesh);
  }

  registerMatcap(id: string, matcap: THREE.Texture) {
    this.assetService.register(id, matcap);
  }

  async fetchAndRegisterMesh(id: string, url: string) {
    return await this.assetService.loadMeshAsync(id, url);
  }

  async fetchAndRegisterMatcap(id: string, url: string) {
    return await this.assetService.loadTextureAsync(id, url);
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
    this.serviceStates[type] = state;
  }

  getObject(): THREE.Mesh {
    return this.instancedMeshManager.getMesh();
  }

  getMeshIDs() {
    return this.assetService.getMeshIDs();
  }

  getMatcapIDs() {
    return this.assetService.getTextureIDs();
  }

  /**
   * Disposes the resources used by the engine.
   */
  dispose() {
    this.scene.remove(this.instancedMeshManager.getMesh());
    this.simulationRendererService.dispose();
    this.instancedMeshManager.dispose();
    this.intersectionService.dispose();
    this.assetService.dispose();
    this.dataTextureManager.dispose();
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
      asset: 'created',
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
