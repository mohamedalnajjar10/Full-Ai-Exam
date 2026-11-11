#!/usr/bin/env node
// Runs docker-compose.yml with whichever container tool the machine has.
// Docker Desktop, Podman and the standalone docker-compose all work; none is required.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

const candidates = [
  ['docker', ['compose']],
  ['podman', ['compose']],
  ['docker-compose', []],
];

for (const [bin, prefix] of candidates) {
  const probe = spawnSync(bin, [...prefix, 'version'], { stdio: 'ignore' });
  if (probe.status === 0) {
    const run = spawnSync(bin, [...prefix, ...args], { stdio: 'inherit' });
    process.exit(run.status ?? 1);
  }
}

console.error(
  'No container tool found (tried docker, podman, docker-compose).\n' +
    'These services are optional — see "Optional services" in README.md.',
);
process.exit(1);
