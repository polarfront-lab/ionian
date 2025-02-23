import { MeshSamplerAPI } from '@/lib/services/dataTexture/worker/meshSampler.worker';
import * as Comlink from 'comlink';
import genericPool from 'generic-pool';

const workerFactory: genericPool.Factory<Comlink.Remote<MeshSamplerAPI>> = {
  create: async () => {
    const workerPath = new URL('./meshSampler.worker.ts', import.meta.url);
    const worker = new Worker(workerPath, { type: 'module' });
    return Comlink.wrap<MeshSamplerAPI>(worker);
  },
  destroy: async (worker) => {
    return worker[Comlink.releaseProxy]();
  },
};

const pool = genericPool.createPool(workerFactory, {
  max: navigator.hardwareConcurrency || 4,
  min: 2,
});

export default pool;
