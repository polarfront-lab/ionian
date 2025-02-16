import { DefaultEventEmitter } from '@/events';
import { AssetEntry, ServiceState } from '@/types';
import * as THREE from 'three';

export class MatcapService {
  private readonly matcaps = new Map<string, THREE.Texture>();
  private readonly eventEmitter;
  private readonly fallbackMatcap = new THREE.DataTexture(new Uint8Array([127, 127, 127, 255]), 1, 1, THREE.RGBAFormat);

  constructor(eventEmitter: DefaultEventEmitter, matcaps?: AssetEntry<THREE.Texture>[]) {
    this.eventEmitter = eventEmitter;
    if (matcaps) {
      matcaps.forEach(({ id, item }) => this.setMatcap(id, item));
    }
    this.updateServiceState('ready');
  }

  getMatcap(id: string): THREE.Texture {
    const texture = this.matcaps.get(id);
    if (!texture) {
      this.eventEmitter.emit('invalidRequest', { message: `invalid matcap request: ${id}` });
      return this.fallbackMatcap;
    } else {
      return texture;
    }
  }

  setMatcap(id: string, texture: THREE.Texture): void {
    const previous = this.matcaps.get(id);
    if (previous === texture) return;

    this.matcaps.set(id, texture);

    if (previous) {
      this.eventEmitter.emit('matcapReplaced', { id });
      previous.dispose();
    } else {
      this.eventEmitter.emit('matcapRegistered', { id });
    }
  }

  dispose() {
    this.updateServiceState('disposed');
    this.matcaps.forEach((texture) => texture.dispose());
    this.matcaps.clear();
  }

  private updateServiceState(serviceState: ServiceState) {
    this.eventEmitter.emit('serviceStateUpdated', { type: 'matcap', state: serviceState });
  }
}
