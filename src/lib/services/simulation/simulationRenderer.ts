import { clamp, createBlankDataTexture, createSpherePoints } from '@/lib/utils';
import * as THREE from 'three';
import { GPUComputationRenderer, Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
// import mixShader from './shaders/simulationMixShader';
import positionShader from './shaders/simulationPositionShader';
import velocityShader from './shaders/simulationVelocityShader';

export type PositionAtlasEntry = {
  dataTexture: THREE.DataTexture;
  numMeshes: number;
  singleTextureSize: number;
  textureSize: number; // This might be atlas width or single texture size depending on how you pass it
};

/**
 * SimulationRenderer is responsible for running the particle simulation using the GPU.
 */
export class SimulationRenderer {
  gpuComputationRenderer: GPUComputationRenderer;
  webGLRenderer: THREE.WebGLRenderer;

  // calculations
  private readonly positionDataTexture: THREE.DataTexture;
  private readonly velocityDataTexture: THREE.DataTexture;

  // GPUComputationRenderer variables
  // private readonly mixPositionsVar: Variable;
  private readonly velocityVar: Variable;
  private readonly positionVar: Variable;

  readonly interactionPosition: THREE.Vector4;

  private lastKnownPositionDataTexture: THREE.Texture;
  private lastKnownVelocityDataTexture: THREE.Texture;
  // REMOVE: private lastKnownMixProgress: number;
  private positionAtlasTexture: THREE.Texture | null = null; // ADDED: Store the atlas

  private readonly initialDataTexture: THREE.DataTexture;

  /**
   * Creates a new SimulationRenderer instance.
   * @param size The size of the simulation textures.
   * @param webGLRenderer The WebGL renderer.
   * @param initialPosition The initial position data texture. If not provided, a default sphere will be used.
   */
  constructor(size: number, webGLRenderer: THREE.WebGLRenderer, initialPosition?: THREE.DataTexture) {
    this.initialDataTexture = initialPosition ?? createSpherePoints(size);
    this.positionDataTexture = this.initialDataTexture;

    this.webGLRenderer = webGLRenderer;
    this.gpuComputationRenderer = new GPUComputationRenderer(size, size, this.webGLRenderer);

    if (!webGLRenderer.capabilities.isWebGL2) {
      this.gpuComputationRenderer.setDataType(THREE.HalfFloatType);
    }

    this.velocityDataTexture = createBlankDataTexture(size);
    this.interactionPosition = new THREE.Vector4(0, 0, 0, 0);

    // Use initialPosition or sphere points for the *initial* state before any sequence is set
    const initialPosTex = initialPosition ?? createSpherePoints(size);
    this.positionDataTexture = initialPosTex; // Keep this for initial state? Or make atlas mandatory? Let's keep for now.

    // init gpgpu render target textures.
    this.velocityVar = this.gpuComputationRenderer.addVariable('uCurrentVelocity', velocityShader, this.velocityDataTexture);
    this.positionVar = this.gpuComputationRenderer.addVariable('uCurrentPosition', positionShader, this.positionDataTexture);

    // Add/Modify uniforms for velocityVar
    this.velocityVar.material.uniforms.uTime = { value: 0 };
    this.velocityVar.material.uniforms.uInteractionPosition = { value: this.interactionPosition };
    this.velocityVar.material.uniforms.uCurrentPosition = { value: null }; // Will be set by dependency
    this.velocityVar.material.uniforms.uTractionForce = { value: 0.1 };
    this.velocityVar.material.uniforms.uMaxRepelDistance = { value: 0.3 };
    this.velocityVar.material.uniforms.uPositionAtlas = { value: null }; // ADDED
    this.velocityVar.material.uniforms.uOverallProgress = { value: 0.0 }; // ADDED
    this.velocityVar.material.uniforms.uNumMeshes = { value: 1 }; // ADDED (default to 1)
    this.velocityVar.material.uniforms.uSingleTextureSize = { value: size }; // ADDED

    // Add/Modify uniforms for positionVar
    this.positionVar.material.uniforms.uTime = { value: 0 };
    // REMOVE: this.positionVar.material.uniforms.uProgress = { value: 0 }; // Use uOverallProgress now
    this.positionVar.material.uniforms.uTractionForce = { value: 0.1 };
    this.positionVar.material.uniforms.uInteractionPosition = { value: this.interactionPosition };
    this.positionVar.material.uniforms.uCurrentPosition = { value: null }; // Will be set by dependency
    this.positionVar.material.uniforms.uCurrentVelocity = { value: null }; // ADDED: Need velocity for position update
    this.positionVar.material.uniforms.uPositionAtlas = { value: null }; // ADDED
    this.positionVar.material.uniforms.uOverallProgress = { value: 0.0 }; // ADDED
    this.positionVar.material.uniforms.uNumMeshes = { value: 1 }; // ADDED
    this.positionVar.material.uniforms.uSingleTextureSize = { value: size }; // ADDED

    // --- Set Dependencies ---
    // The position depends on the *new* position calculated using the atlas, and the velocity
    // The velocity depends on the *current* position and the target position from the atlas
    this.gpuComputationRenderer.setVariableDependencies(this.positionVar, [this.positionVar, this.velocityVar]); // Position depends on itself and velocity
    this.gpuComputationRenderer.setVariableDependencies(this.velocityVar, [this.velocityVar, this.positionVar]); // Velocity depends on itself and position

    const err = this.gpuComputationRenderer.init();
    if (err) {
      throw new Error('failed to initialize SimulationRenderer: ' + err);
    }

    this.lastKnownVelocityDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.velocityVar).texture;
    this.lastKnownPositionDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.positionVar).texture;
  }

  setPositionAtlas(entry: PositionAtlasEntry) {
    this.positionAtlasTexture = entry.dataTexture;
    const numMeshes = entry.numMeshes > 0 ? entry.numMeshes : 1; // Avoid division by zero

    // Update uniforms in both shaders
    this.positionVar.material.uniforms.uPositionAtlas.value = this.positionAtlasTexture;
    this.positionVar.material.uniforms.uNumMeshes.value = numMeshes;
    this.positionVar.material.uniforms.uSingleTextureSize.value = entry.singleTextureSize;

    this.velocityVar.material.uniforms.uPositionAtlas.value = this.positionAtlasTexture;
    this.velocityVar.material.uniforms.uNumMeshes.value = numMeshes;
    this.velocityVar.material.uniforms.uSingleTextureSize.value = entry.singleTextureSize;

    // IMPORTANT: Update texture dependencies AFTER setting the new atlas
    // This tells the GPGPU renderer to use the output of one variable as input for the next frame
    // We need the calculated position (which uses the atlas) to feed into the velocity calculation for the *next* frame,
    // and the calculated velocity to feed into the position calculation for the *next* frame.
    // The GPGPU library handles the ping-ponging of textures.

    // We also need to pass the *output* texture of the other variable to the uniforms
    // This is slightly confusing but necessary for GPGPU.
    this.positionVar.material.uniforms.uCurrentVelocity.value = this.gpuComputationRenderer.getCurrentRenderTarget(this.velocityVar).texture;
    this.velocityVar.material.uniforms.uCurrentPosition.value = this.gpuComputationRenderer.getCurrentRenderTarget(this.positionVar).texture;
  }

  setOverallProgress(progress: number) {
    const clampedProgress = clamp(progress, 0.0, 1.0);
    this.positionVar.material.uniforms.uOverallProgress.value = clampedProgress;
    this.velocityVar.material.uniforms.uOverallProgress.value = clampedProgress;
  }

  setMaxRepelDistance(distance: number) {
    this.velocityVar.material.uniforms.uMaxRepelDistance.value = distance;
  }

  setVelocityTractionForce(force: number) {
    this.velocityVar.material.uniforms.uTractionForce.value = force;
  }

  setPositionalTractionForce(force: number) {
    this.positionVar.material.uniforms.uTractionForce.value = force;
  }

  setInteractionPosition(position: THREE.Vector4Like) {
    this.interactionPosition.copy(position);
  }

  /**
   * Disposes the resources used by the simulation renderer.
   */
  dispose() {
    this.positionVar.renderTargets.forEach((rtt) => rtt.dispose());
    this.velocityVar.renderTargets.forEach((rtt) => rtt.dispose());

    this.positionDataTexture?.dispose(); // Dispose initial texture if it exists
    this.velocityDataTexture.dispose();
    this.positionAtlasTexture?.dispose(); // Dispose atlas if it exists

    this.gpuComputationRenderer.dispose();
  }

  /**
   * Computes the next step of the simulation.
   * @param elapsedTime The elapsed time since the simulation started.
   */
  compute(elapsedTime: number) {
    // Update time uniforms
    this.velocityVar.material.uniforms.uTime.value = elapsedTime;
    this.positionVar.material.uniforms.uTime.value = elapsedTime;

    // Update texture uniforms for the *next* computation step
    // The GPGPU renderer swaps textures internally (ping-pong)
    this.positionVar.material.uniforms.uCurrentVelocity.value = this.gpuComputationRenderer.getCurrentRenderTarget(this.velocityVar).texture;
    this.velocityVar.material.uniforms.uCurrentPosition.value = this.gpuComputationRenderer.getCurrentRenderTarget(this.positionVar).texture;

    // Run the computation
    this.gpuComputationRenderer.compute();

    // Update last known textures *after* compute
    this.lastKnownVelocityDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.velocityVar).texture;
    this.lastKnownPositionDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.positionVar).texture;
  }

  /**
   * Gets the current velocity texture.
   * @returns The current velocity texture.
   */
  getVelocityTexture(): THREE.Texture {
    // Return the texture updated in compute()
    return this.lastKnownVelocityDataTexture;
  }

  /**
   * Gets the current position texture.
   * @returns The current position texture.
   */
  getPositionTexture(): THREE.Texture {
    // Return the texture updated in compute()
    return this.lastKnownPositionDataTexture;
  }
}
