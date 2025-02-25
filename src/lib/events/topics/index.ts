import { AssetEvents } from '@/lib/events/topics/asset';
import { TransitionEvents } from '@/lib/events/topics/transition';
import { DataTextureEvents } from './dataTexture';
import { GlobalEvents } from './global';
import { MatcapEvents } from './matcap';
import { SimulationEvents } from './simulation';

export type Events = GlobalEvents & SimulationEvents & DataTextureEvents & MatcapEvents & TransitionEvents & AssetEvents;
