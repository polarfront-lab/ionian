import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ionian-pack-smoke-'));
const consumerDir = path.join(tmpDir, 'consumer');

try {
  execFileSync('pnpm', ['pack', '--pack-destination', tmpDir], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const tarball = fs.readdirSync(tmpDir).find((entry) => entry.endsWith('.tgz'));
  if (!tarball) {
    throw new Error('pnpm pack did not create a tarball');
  }

  fs.mkdirSync(consumerDir);
  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'ionian-package-smoke',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  );

  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--silent',
      path.join(tmpDir, tarball),
      'three@0.184.0',
      'three-stdlib@2.36.1',
      'mitt@3.0.1',
      'typescript@5.8.3',
    ],
    {
      cwd: consumerDir,
      stdio: 'inherit',
    },
  );

  fs.writeFileSync(
    path.join(consumerDir, 'index.mjs'),
    `
import { ParticlesEngine, resolveSequenceInterpolation } from '@polarfront-lab/ionian';

if (typeof ParticlesEngine !== 'function') {
  throw new Error('ParticlesEngine export is not a constructor');
}

const interpolation = resolveSequenceInterpolation(0.5, 3);
if (interpolation.indexA !== 1 || interpolation.indexB !== 2 || interpolation.localProgress !== 0) {
  throw new Error('resolveSequenceInterpolation returned an unexpected value');
}
`,
  );
  execFileSync('node', ['index.mjs'], { cwd: consumerDir, stdio: 'inherit' });

  fs.writeFileSync(
    path.join(consumerDir, 'index.ts'),
    `
import { resolveSequenceInterpolation, type ParticlesEngineParameters, type TextureSequence } from '@polarfront-lab/ionian';

const sequence: TextureSequence = [
  { type: 'color', value: '#ffffff' },
  { type: 'matcap', id: 'warm' },
];

const params = {
  textureSize: 128,
  scene: undefined as never,
  renderer: undefined as never,
  dracoDecoderPath: '/draco/',
} satisfies ParticlesEngineParameters;

resolveSequenceInterpolation(0.5, sequence.length);
params.textureSize.toFixed();
`,
  );
  fs.writeFileSync(
    path.join(consumerDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['index.ts'],
      },
      null,
      2,
    ),
  );
  execFileSync(path.join(consumerDir, 'node_modules/.bin/tsc'), ['--noEmit'], {
    cwd: consumerDir,
    stdio: 'inherit',
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
