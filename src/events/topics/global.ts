import { ServiceState, ServiceType } from '@/types';
import * as THREE from 'three';

export type GlobalEvents = {
  serviceStateUpdated: { type: ServiceType; state: ServiceState };
  interactionPositionUpdated: { position: THREE.Vector4Like };
  invalidRequest: { message: string };
};
