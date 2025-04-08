import { AssetEvents } from '@/lib/events/topics/asset';
import { TransitionEvents } from '@/lib/events/topics/transition';
import { DataTextureEvents } from './dataTexture';
import { GlobalEvents } from './global';
import { MaterialTextureEvents } from './texture';
import { SimulationEvents } from './simulation';

export type Events = GlobalEvents & SimulationEvents & DataTextureEvents & MaterialTextureEvents & TransitionEvents & AssetEvents;
