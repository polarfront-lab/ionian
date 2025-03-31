import { linear } from '@/lib/easing';
import { DefaultEventEmitter } from '@/lib/events/defaultEventEmitter';
import { AssetService } from '@/lib/services/assets/assetService';
import { DataTextureService } from '@/lib/services/dataTexture/dataTextureService';
import { InstancedMeshManager } from '@/lib/services/instancedmesh/instancedMeshManager';
import { IntersectionService } from '@/lib/services/intersection/intersectionService';
import { SimulationRendererService } from '@/lib/services/simulation/simulationRendererService';
import { TransitionService } from '@/lib/services/transition/transitionService';
import { Callback, EasingFunction, ServiceState, ServiceType, TransitionCallback, TransitionDetail, TransitionOptions } from '@/lib/types';
import { EngineState } from '@/lib/types/state';
import { clamp } from '@/lib/utils';
import * as THREE from 'three';

/**
 * Parameters for creating a ParticlesEngine instance.
 */
type ParticlesEngineParameters = {
  textureSize: number;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera?: THREE.Camera;
  useIntersection?: boolean;
};

type ServiceStates = Record<ServiceType, ServiceState>;

/**
 * The main class for the particle engine.
 */
export class ParticlesEngine {
  private simulationRendererService: SimulationRendererService;
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

  private meshSequenceAtlasTexture: THREE.DataTexture | null = null; // ADDED: To store the generated atlas

  public eventEmitter: DefaultEventEmitter;

  /**
   * Creates a new ParticlesEngine instance.
   * @param params The parameters for creating the instance.
   */
  constructor(params: ParticlesEngineParameters) {
    const { scene, renderer, camera, textureSize, useIntersection = true } = params;

    this.eventEmitter = new DefaultEventEmitter();
    this.serviceStates = this.getInitialServiceStates();
    this.eventEmitter.on('serviceStateUpdated', this.handleServiceStateUpdated.bind(this));

    this.scene = scene;
    this.renderer = renderer;
    this.engineState = this.initialEngineState(params);

    this.assetService = new AssetService(this.eventEmitter);
    this.transitionService = new TransitionService(this.eventEmitter);
    this.dataTextureManager = new DataTextureService(this.eventEmitter, textureSize);
    this.simulationRendererService = new SimulationRendererService(this.eventEmitter, textureSize, this.renderer);
    this.instancedMeshManager = new InstancedMeshManager(textureSize);
    this.instancedMeshManager.useMatcapMaterial();
    this.scene.add(this.instancedMeshManager.getMesh());

    this.intersectionService = new IntersectionService(this.eventEmitter, camera);
    if (!useIntersection) this.intersectionService.setActive(false);

    this.eventEmitter.on('interactionPositionUpdated', this.handleInteractionPositionUpdated.bind(this));
  }

  /**
   * Renders the scene.
   * @param elapsedTime The elapsed time since the last frame.
   */

  render(elapsedTime: number) {
    const dt = elapsedTime / 1000.0; // Convert to seconds
    this.transitionService.compute(dt);
    this.intersectionService.calculate(this.instancedMeshManager.getMesh());
    this.simulationRendererService.compute(dt); // Use seconds
    this.instancedMeshManager.update(dt); // Use seconds
    this.instancedMeshManager.updateVelocityTexture(this.simulationRendererService.getVelocityTexture());
    this.instancedMeshManager.updatePositionTexture(this.simulationRendererService.getPositionTexture());
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

  setOriginColor(color: THREE.ColorRepresentation, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.instancedMeshManager.setOriginColor(color);
  }

  setDestinationColor(color: THREE.ColorRepresentation, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.instancedMeshManager.setDestinationColor(color);
  }

  setOriginTexture(id: string | THREE.ColorRepresentation, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });

    if (typeof id === 'string' && this.assetService.hasMatcap(id)) {
      this.setOriginMatcap(id);
    } else {
      this.setOriginColor(id);
    }
  }

  setDestinationTexture(id: string | THREE.ColorRepresentation, override: boolean = false) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    if (typeof id === 'string' && this.assetService.hasMatcap(id)) {
      this.setDestinationMatcap(id);
    } else {
      this.setDestinationColor(id);
    }
  }

  setMatcapProgress(progress: number, override: boolean = false) {
    const clampedProgress = clamp(progress, 0.0, 1.0);
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    this.engineState.matcapTransitionProgress = clampedProgress;
    this.instancedMeshManager.setProgress(clampedProgress);
  }

  // --- Update setTextureSize ---
  async setTextureSize(size: number) {
    if (this.engineState.textureSize === size) {
      console.log(`Texture size already ${size}. Skipping resize.`);
      return;
    }

    console.log(`Setting texture size from ${this.engineState.textureSize} to ${size}`);
    this.engineState.textureSize = size;

    // Resize core services
    this.dataTextureManager.setTextureSize(size); // This will clear its cache
    this.simulationRendererService.setTextureSize(size); // Recreates GPGPU
    this.instancedMeshManager.resize(size);

    if (this.engineState.meshSequence.length > 0) {
      await this.setMeshSequence(this.engineState.meshSequence);
    }

    // Re-apply mesh sequence if it exists. This regenerates the atlas with the new size
    // and updates simulation/intersection services via setMeshSequence internal calls.
    if (this.engineState.meshSequence.length > 0) {
      console.log('Re-applying mesh sequence for new texture size...');
      await this.setMeshSequence(this.engineState.meshSequence);
    }

    // Update other simulation parameters (these might need re-application after GPGPU recreation)
    console.log('Re-applying simulation parameters...');
    this.simulationRendererService.setVelocityTractionForce(this.engineState.velocityTractionForce);
    this.simulationRendererService.setPositionalTractionForce(this.engineState.positionalTractionForce);
    this.simulationRendererService.setMaxRepelDistance(this.engineState.maxRepelDistance);
    // Ensure progress is reapplied (setMeshSequence resets it to 0, restore if needed, though usually 0 is correct after resize)
    this.simulationRendererService.setOverallProgress(this.engineState.overallProgress);
    this.intersectionService.setOverallProgress(this.engineState.overallProgress); // Also update intersection

    // Update InstancedMeshManager appearance parameters
    console.log('Re-applying appearance parameters...');
    this.instancedMeshManager.setOriginMatcap(this.assetService.getMatcap(this.engineState.originMatcapID));
    this.instancedMeshManager.setDestinationMatcap(this.assetService.getMatcap(this.engineState.destinationMatcapID));
    this.instancedMeshManager.setProgress(this.engineState.matcapTransitionProgress);
    this.instancedMeshManager.setGeometrySize(this.engineState.instanceGeometryScale);

    console.log(`Texture size change to ${size} complete.`);
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

  useIntersect(use: boolean) {
    this.intersectionService.setActive(use);
    this.engineState.useIntersect = use;

    // When disabling, ensure the simulation also gets zero interaction
    if (!use) {
      this.engineState.pointerPosition = { x: -99999999, y: -99999999 }; // Keep this for internal state if needed
      // Explicitly send zero interaction to simulation
      this.simulationRendererService.setInteractionPosition({ x: 0, y: 0, z: 0, w: 0 });
    }
  }

  setPointerPosition(position: THREE.Vector2Like) {
    if (!this.engineState.useIntersect) return;
    this.engineState.pointerPosition = position;
    this.intersectionService.setPointerPosition(position);
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

  /**
   * Sets the sequence of meshes for particle transitions.
   * This will generate a texture atlas containing position data for all meshes.
   * @param meshIDs An array of registered mesh IDs in the desired sequence order.
   */
  async setMeshSequence(meshIDs: string[]) {
    if (!meshIDs || meshIDs.length < 1) {
      this.eventEmitter.emit('invalidRequest', { message: 'Mesh sequence must contain at least one mesh ID.' });
      this.engineState.meshSequence = []; // Clear sequence state
      this.intersectionService.setMeshSequence([]); // Clear intersection sequence
      return;
    }

    console.log('Setting mesh sequence:', meshIDs);
    this.engineState.meshSequence = meshIDs;
    this.engineState.overallProgress = 0; // Reset progress when sequence changes

    // Get valid mesh objects
    const meshes = meshIDs.map((id) => this.assetService.getMesh(id)).filter((mesh) => mesh !== null) as THREE.Mesh[];

    // Handle missing meshes
    if (meshes.length !== meshIDs.length) {
      const missing = meshIDs.filter((id) => !this.assetService.getMesh(id));
      console.warn(`Could not find meshes for IDs: ${missing.join(', ')}. Proceeding with ${meshes.length} found meshes.`);
      this.eventEmitter.emit('invalidRequest', { message: `Could not find meshes for IDs: ${missing.join(', ')}` });
      if (meshes.length < 1) {
        this.engineState.meshSequence = []; // Clear sequence state if none found
        this.intersectionService.setMeshSequence([]);
        return; // Stop if no valid meshes
      }
      // Update sequence state to only include valid meshes found
      this.engineState.meshSequence = meshes.map((m) => m.name);
    }

    try {
      // Generate the atlas texture
      console.log('Generating sequence data texture atlas...');
      this.meshSequenceAtlasTexture = await this.dataTextureManager.createSequenceDataTextureAtlas(meshes, this.engineState.textureSize);
      console.log('Atlas texture generated.');

      // Update the simulation renderer
      this.simulationRendererService.setPositionAtlas({
        dataTexture: this.meshSequenceAtlasTexture,
        textureSize: this.engineState.textureSize, // Pass the size of the *output* GPGPU texture
        numMeshes: this.engineState.meshSequence.length, // Use the potentially updated count
        singleTextureSize: this.engineState.textureSize, // Size of one mesh's data within atlas
      });
      // Set initial progress in simulation (should be 0 after sequence change)
      this.simulationRendererService.setOverallProgress(this.engineState.overallProgress);

      // Update IntersectionService with the valid meshes
      console.log('Updating intersection service sequence...');
      this.intersectionService.setMeshSequence(meshes);
      this.intersectionService.setOverallProgress(this.engineState.overallProgress); // Set initial progress

      console.log('Mesh sequence setup complete.');
    } catch (error) {
      console.error('Failed during mesh sequence setup:', error);
      this.meshSequenceAtlasTexture = null;
      // Consider resetting related states or services
    }
  }

  /**
   * Sets the overall progress through the mesh sequence.
   * @param progress A value between 0.0 (first mesh) and 1.0 (last mesh).
   * @param override If true, cancels any ongoing mesh sequence transition before setting the value. Defaults to true.
   */
  setOverallProgress(progress: number, override: boolean = true) {
    if (override) {
      this.eventEmitter.emit('transitionCancelled', { type: 'mesh-sequence' });
    }

    const clampedProgress = clamp(progress, 0.0, 1.0);
    this.engineState.overallProgress = clampedProgress;
    this.simulationRendererService.setOverallProgress(clampedProgress);
    this.intersectionService.setOverallProgress(clampedProgress);
  }

  // --- Transition scheduling methods remain the same ---
  scheduleMatcapTransition(
    originMatcapID: string,
    destinationMatcapID: string,
    easing: EasingFunction = linear,
    duration: number = 1000,
    override: boolean = false,
    options: TransitionOptions = {},
  ) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });
    const handleProgressUpdate = (transitionProgress: number) => {
      this.setMatcapProgress(transitionProgress, false); // Pass override=false here
      options.onTransitionProgress?.(transitionProgress);
    };
    this.transitionService.enqueue(
      'matcap',
      { easing, duration },
      {
        ...options,
        onTransitionProgress: handleProgressUpdate,
        onTransitionBegin: () => {
          this.setOriginMatcap(originMatcapID, false);
          this.setDestinationMatcap(destinationMatcapID, false);
          this.setMatcapProgress(0, false);
          options.onTransitionBegin?.();
        },
        onTransitionFinished: () => {
          this.setMatcapProgress(1, false);
          options.onTransitionFinished?.();
        },
        onTransitionCancelled: options.onTransitionCancelled,
      },
    );
  }

  scheduleTextureTransition(
    origin: string | THREE.ColorRepresentation,
    destination: string | THREE.ColorRepresentation,
    options: {
      easing?: EasingFunction;
      duration?: number;
      override?: boolean;
      onTransitionBegin?: Callback;
      onTransitionProgress?: TransitionCallback;
      onTransitionFinished?: Callback;
      onTransitionCancelled?: Callback;
    } = {}, // Default to empty object
  ) {
    const easing = options?.easing ?? linear;
    const duration = options?.duration ?? 1000;
    const userCallbacks = {
      // Extract user callbacks
      onTransitionBegin: options?.onTransitionBegin,
      onTransitionProgress: options?.onTransitionProgress,
      onTransitionFinished: options?.onTransitionFinished,
      onTransitionCancelled: options?.onTransitionCancelled,
    };

    if (options?.override) this.eventEmitter.emit('transitionCancelled', { type: 'matcap' });

    const handleProgressUpdate = (transitionProgress: number) => {
      this.setMatcapProgress(transitionProgress, false); // Pass override=false
      userCallbacks.onTransitionProgress?.(transitionProgress);
    };

    this.transitionService.enqueue(
      'matcap', // Still uses matcap type internally
      { easing, duration },
      {
        ...userCallbacks, // Pass user callbacks
        onTransitionProgress: handleProgressUpdate,
        onTransitionBegin: () => {
          this.setOriginTexture(origin);
          this.setDestinationTexture(destination);
          this.setMatcapProgress(0);
          userCallbacks.onTransitionBegin?.();
        },
        onTransitionFinished: () => {
          this.setMatcapProgress(1);
          // Optional: Set origin to destination
          // this.setOriginTexture(destination);
          userCallbacks.onTransitionFinished?.();
        },
        onTransitionCancelled: () => {
          userCallbacks.onTransitionCancelled?.();
        },
      },
    );
  }

  /**
   * Schedules a smooth transition for the overall mesh sequence progress.
   * @param targetProgress The final progress value (0.0 to 1.0) to transition to.
   * @param duration Duration of the transition in milliseconds.
   * @param easing Easing function to use.
   * @param options Transition options (onBegin, onProgress, onFinished, onCancelled).
   * @param override If true, cancels any ongoing mesh sequence transitions.
   */
  scheduleMeshSequenceTransition(
    targetProgress: number,
    duration: number = 1000,
    easing: EasingFunction = linear,
    options: TransitionOptions = {},
    override: boolean = true, // Default to override for simplicity
  ) {
    if (override) this.eventEmitter.emit('transitionCancelled', { type: 'mesh-sequence' });
    const startProgress = this.engineState.overallProgress;
    const progressDiff = targetProgress - startProgress;
    const handleProgressUpdate = (transitionProgress: number) => {
      const currentOverallProgress = startProgress + progressDiff * transitionProgress;
      // Call setOverallProgress with override=false as this is part of a transition
      this.setOverallProgress(currentOverallProgress, false);
      options.onTransitionProgress?.(currentOverallProgress);
    };
    const transitionDetail: TransitionDetail = { duration, easing };
    const transitionOptions: TransitionOptions = {
      ...options,
      onTransitionProgress: handleProgressUpdate,
      onTransitionBegin: options.onTransitionBegin,
      onTransitionFinished: () => {
        // Ensure final value is set precisely, again with override=false
        this.setOverallProgress(targetProgress, false);
        options.onTransitionFinished?.();
      },
      onTransitionCancelled: options.onTransitionCancelled,
    };
    this.transitionService.enqueue('mesh-sequence', transitionDetail, transitionOptions);
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

  getMeshes() {
    return this.assetService.getMeshes();
  }

  getTextures() {
    return this.assetService.getTextures();
  }

  public getTextureSize(): number {
    return this.engineState.textureSize;
  }

  public getUseIntersect(): boolean {
    return this.engineState.useIntersect;
  }

  public getEngineStateSnapshot(): Readonly<EngineState> {
    return { ...this.engineState }; // Return a copy or make EngineState properties readonly
  }

  /**
   * Disposes the resources used by the engine.
   */
  dispose() {
    console.log('Disposing ParticlesEngine resources...');
    // Check if scene exists before removing
    if (this.scene && this.instancedMeshManager) {
      this.scene.remove(this.instancedMeshManager.getMesh());
    }
    // Dispose services safely
    this.simulationRendererService?.dispose();
    this.instancedMeshManager?.dispose();
    this.intersectionService?.dispose();
    this.assetService?.dispose();
    this.dataTextureManager?.dispose();
    this.eventEmitter?.dispose(); // Dispose event emitter too
    console.log('ParticlesEngine disposed.');
  }

  private initialEngineState(params: ParticlesEngineParameters): EngineState {
    return {
      textureSize: params.textureSize,
      meshSequence: [], // ADDED
      overallProgress: 0, // ADDED
      originMatcapID: '',
      destinationMatcapID: '',
      matcapTransitionProgress: 0,
      velocityTractionForce: 0.1,
      positionalTractionForce: 0.1,
      maxRepelDistance: 0.3,
      pointerPosition: { x: 0, y: 0 },
      instanceGeometryScale: { x: 1, y: 1, z: 1 },
      useIntersect: params.useIntersection ?? true,
    };
  }

  private getInitialServiceStates(): ServiceStates {
    return {
      'data-texture': 'created',
      'instanced-mesh': 'created',
      matcap: 'created',
      simulation: 'created',
      asset: 'created',
    };
  }

  private handleInteractionPositionUpdated({ position }: { position: THREE.Vector4Like }) {
    this.simulationRendererService.setInteractionPosition(position);
  }
}
