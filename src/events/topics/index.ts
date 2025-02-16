import { TransitionEvents } from '@/events/topics/transition';
import { DataTextureEvents } from './dataTexture';
import { GlobalEvents } from './global';
import { MatcapEvents } from './matcap';
import { SimulationEvents } from './simulation';

export type Events = GlobalEvents & SimulationEvents & DataTextureEvents & MatcapEvents & TransitionEvents;
