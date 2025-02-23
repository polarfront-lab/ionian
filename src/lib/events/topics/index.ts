import { TransitionEvents } from '@/lib/events/topics/transition';
import { DataTextureEvents } from './dataTexture';
import { GlobalEvents } from './global';
import { MatcapEvents } from './matcap';
import { SimulationEvents } from './simulation';
import { AssetEvents } from '@/lib/events/topics/asset';

export type Events = GlobalEvents & SimulationEvents & DataTextureEvents & MatcapEvents & TransitionEvents & AssetEvents;
