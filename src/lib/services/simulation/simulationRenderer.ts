import { clamp, createBlankDataTexture, createSpherePoints } from '@/lib/utils';
import * as THREE from 'three';
import { GPUComputationRenderer, Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import mixShader from './shaders/simulationMixShader';
import positionShader from './shaders/simulationPositionShader';
import velocityShader from './shaders/simulationVelocityShader';

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
  private readonly mixPositionsVar: Variable;
  private readonly velocityVar: Variable;
  private readonly positionVar: Variable;

  readonly interactionPosition: THREE.Vector4;

  private lastKnownPositionDataTexture: THREE.Texture;
  private lastKnownVelocityDataTexture: THREE.Texture;
  private lastKnownMixProgress: number;

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
    this.lastKnownMixProgress = 0;

    if (!webGLRenderer.capabilities.isWebGL2) {
      this.gpuComputationRenderer.setDataType(THREE.HalfFloatType);
    }

    this.velocityDataTexture = createBlankDataTexture(size);
    this.interactionPosition = new THREE.Vector4(0, 0, 0, 0);

    // init gpgpu render target textures.
    this.mixPositionsVar = this.gpuComputationRenderer.addVariable('uMixedPosition', mixShader, this.positionDataTexture);
    this.velocityVar = this.gpuComputationRenderer.addVariable('uCurrentVelocity', velocityShader, this.velocityDataTexture);
    this.positionVar = this.gpuComputationRenderer.addVariable('uCurrentPosition', positionShader, this.positionDataTexture);

    // attach uniforms
    this.mixPositionsVar.material.uniforms.uProgress = { value: 0 };
    this.mixPositionsVar.material.uniforms.uPositionA = { value: this.initialDataTexture };
    this.mixPositionsVar.material.uniforms.uPositionB = { value: this.initialDataTexture };

    this.velocityVar.material.uniforms.uTime = { value: 0 };
    this.velocityVar.material.uniforms.uInteractionPosition = { value: this.interactionPosition };
    this.velocityVar.material.uniforms.uCurrentPosition = { value: this.positionDataTexture };
    this.velocityVar.material.uniforms.uTractionForce = { value: 0.1 };
    this.velocityVar.material.uniforms.uMaxRepelDistance = { value: 0.3 };

    this.positionVar.material.uniforms.uTime = { value: 0 };
    this.positionVar.material.uniforms.uProgress = { value: 0 };
    this.positionVar.material.uniforms.uTractionForce = { value: 0.1 };
    this.positionVar.material.uniforms.uInteractionPosition = { value: this.interactionPosition };
    this.positionVar.material.uniforms.uCurrentPosition = { value: this.positionDataTexture };

    this.gpuComputationRenderer.setVariableDependencies(this.positionVar, [this.velocityVar, this.positionVar, this.mixPositionsVar]);
    this.gpuComputationRenderer.setVariableDependencies(this.velocityVar, [this.velocityVar, this.positionVar, this.mixPositionsVar]);

    const err = this.gpuComputationRenderer.init();
    if (err) {
      throw new Error('failed to initialize SimulationRenderer: ' + err);
    }

    this.lastKnownVelocityDataTexture = this.getVelocityTexture();
    this.lastKnownPositionDataTexture = this.getPositionTexture();
  }

  /**
   * Sets the source data texture for morphing.
   * @param texture The source data texture.
   */
  setMorphSourceDataTexture(texture: THREE.DataTexture) {
    this.mixPositionsVar.material.uniforms.uPositionA.value = texture;
  }

  /**
   * Sets the destination data texture for morphing.
   * @param texture The destination data texture.
   */
  setMorphDestinationDataTexture(texture: THREE.DataTexture) {
    this.mixPositionsVar.material.uniforms.uPositionB.value = texture;
  }

  setMaxRepelDistance(distance: number) {
    this.velocityVar.material.uniforms.uMaxRepelDistance.value = distance;
  }

  /**
   * Sets the progress of the morphing animation.
   * @param progress The progress value, between 0 and 1.
   */
  setProgress(progress: number) {
    this.lastKnownMixProgress = clamp(progress, 0, 1);
    this.mixPositionsVar.material.uniforms.uProgress.value = this.lastKnownMixProgress;
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
    this.mixPositionsVar.renderTargets.forEach((rtt) => rtt.dispose());
    this.positionVar.renderTargets.forEach((rtt) => rtt.dispose());
    this.velocityVar.renderTargets.forEach((rtt) => rtt.dispose());

    this.positionDataTexture.dispose();
    this.velocityDataTexture.dispose();

    this.gpuComputationRenderer.dispose();
  }

  /**
   * Computes the next step of the simulation.
   * @param elapsedTime The elapsed time since the simulation started.
   */
  compute(elapsedTime: number) {
    this.velocityVar.material.uniforms.uTime.value = elapsedTime;
    this.positionVar.material.uniforms.uTime.value = elapsedTime;
    this.gpuComputationRenderer.compute();
  }

  /**
   * Gets the current velocity texture.
   * @returns The current velocity texture.
   */
  getVelocityTexture(): THREE.Texture {
    this.lastKnownVelocityDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.velocityVar).texture;
    return this.lastKnownVelocityDataTexture;
  }

  /**
   * Gets the current position texture.
   * @returns The current position texture.
   */
  getPositionTexture(): THREE.Texture {
    this.lastKnownPositionDataTexture = this.gpuComputationRenderer.getCurrentRenderTarget(this.positionVar).texture;
    return this.lastKnownPositionDataTexture;
  }
}
