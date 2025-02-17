import { DefaultEventEmitter } from '@/lib/events';
import { DataTextureEntry, ServiceState } from '@/lib/types';
import * as THREE from 'three';
import { SimulationRenderer } from './simulationRenderer';

export class SimulationRendererService {
  private state!: ServiceState;
  private textureSize: number;
  private dataTextureTransitionProgress: number;
  private velocityTractionForce: number;
  private positionalTractionForce: number;

  private simulationRenderer;
  private webGLRenderer;
  private eventEmitter;

  private lastKnownVelocityDataTexture: THREE.Texture;
  private lastKnownPositionDataTexture: THREE.Texture;

  constructor(eventEmitter: DefaultEventEmitter, size: number, webGLRenderer: THREE.WebGLRenderer) {
    this.eventEmitter = eventEmitter;
    this.webGLRenderer = webGLRenderer;
    this.textureSize = size;
    this.dataTextureTransitionProgress = 0;
    this.velocityTractionForce = 0.1;
    this.positionalTractionForce = 0.1;

    this.updateServiceState('initializing');

    this.simulationRenderer = new SimulationRenderer(this.textureSize, this.webGLRenderer);
    this.lastKnownVelocityDataTexture = this.simulationRenderer.getVelocityTexture();
    this.lastKnownPositionDataTexture = this.simulationRenderer.getPositionTexture();

    this.updateServiceState('ready');
  }

  setTextureSize(size: number) {
    this.updateServiceState('initializing');
    this.simulationRenderer.dispose();
    this.textureSize = size;
    this.simulationRenderer = new SimulationRenderer(size, this.webGLRenderer);
    this.updateServiceState('ready');
  }

  setOriginDataTexture(entry: DataTextureEntry) {
    if (this.textureSize !== entry.textureSize) {
      this.eventEmitter.emit('invalidRequest', { message: `Texture size mismatch: ${entry.textureSize} vs ${this.textureSize}` });
    } else {
      this.simulationRenderer.setMorphSourceDataTexture(entry.dataTexture);
    }
  }

  setDestinationDataTexture(entry: DataTextureEntry) {
    if (this.textureSize !== entry.textureSize) {
      this.eventEmitter.emit('invalidRequest', { message: `Texture size mismatch: ${entry.textureSize} vs ${this.textureSize}` });
    } else {
      this.simulationRenderer.setMorphDestinationDataTexture(entry.dataTexture);
    }
  }

  setDataTextureTransitionProgress(progress: number) {
    this.dataTextureTransitionProgress = progress;
    this.simulationRenderer.setProgress(this.dataTextureTransitionProgress);
  }

  setVelocityTractionForce(force: number) {
    this.velocityTractionForce = force;
    this.simulationRenderer.setVelocityTractionForce(this.velocityTractionForce);
  }

  setPositionalTractionForce(force: number) {
    this.positionalTractionForce = force;
    this.simulationRenderer.setPositionalTractionForce(this.positionalTractionForce);
  }

  compute(elapsedTime: number) {
    this.simulationRenderer.compute(elapsedTime);
  }

  getVelocityTexture(): THREE.Texture {
    if (this.state === 'ready') this.lastKnownVelocityDataTexture = this.simulationRenderer.getVelocityTexture();
    return this.lastKnownVelocityDataTexture;
  }

  getPositionTexture(): THREE.Texture {
    if (this.state === 'ready') this.lastKnownPositionDataTexture = this.simulationRenderer.getPositionTexture();
    return this.lastKnownPositionDataTexture;
  }

  dispose() {
    this.updateServiceState('disposed');
    this.simulationRenderer.dispose();
    this.lastKnownVelocityDataTexture.dispose();
    this.lastKnownPositionDataTexture.dispose();
  }

  private updateServiceState(serviceState: ServiceState) {
    this.state = serviceState;
    this.eventEmitter.emit('serviceStateUpdated', { type: 'simulation', state: serviceState });
  }

  setInteractionPosition(position: THREE.Vector4Like) {
    this.simulationRenderer.setInteractionPosition(position);
  }

  setMaxRepelDistance(distance: number) {
    this.simulationRenderer.setMaxRepelDistance(distance);
  }
}
