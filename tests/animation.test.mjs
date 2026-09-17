import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAt, selectAnimation } from '../src/shared/animation.ts';
import { startPlayback } from '../src/renderer/animation/playback.ts';
import { selectPetStatus, sortTasks } from '../src/renderer/task-presentation.ts';
import { parsePet } from '../src/shared/pet-manifest.ts';
import { fitPet } from '../src/shared/geometry.ts';
import { readFileSync, readdirSync } from 'node:fs';

test('frame timing clamps negatives and loops exactly at the duration boundary', () => {
  const clip = { row: 1, frames: 6, durationMs: 4290 };
  assert.equal(frameAt(clip, -1), 0);
  assert.equal(frameAt(clip, 715), 1);
  assert.equal(frameAt(clip, 4289), 5);
  assert.equal(frameAt(clip, 4290), 0);
});

test('walking overrides status with the existing directional fallback', () => {
  const idle = { row: 1, frames: 6, durationMs: 4290 };
  const tool = { row: 2, frames: 8, durationMs: 1060 };
  const walkAnimation = { row: 3, frames: 8, durationMs: 1060 };
  const pet = { animations: { idle, tool }, walkAnimation };
  assert.equal(selectAnimation(pet, 'idle', null), idle);
  assert.equal(selectAnimation(pet, 'idle', 'left'), walkAnimation);
  assert.equal(selectAnimation(pet, 'idle', 'right'), tool);
  assert.equal(selectAnimation({ animations: { idle, tool } }, 'idle', 'left'), tool);
});

test('notifications override ongoing tasks; completed tasks do not keep pet active', () => {
  const tasks = [{ status: 'ended', updatedAt: 3 }, { status: 'working', updatedAt: 1 }];
  assert.equal(selectPetStatus(tasks, null), 'working');
  assert.equal(selectPetStatus(tasks, { kind: 'waiting' }), 'waiting');
  assert.equal(selectPetStatus(tasks.slice(0, 1), null), 'idle');
  assert.deepEqual(sortTasks(tasks), [tasks[0], tasks[1]]);
  assert.equal(tasks[0].status, 'ended');
});

test('playback draws changed frames only and releases its scheduler', () => {
  let now = 100;
  let tick;
  let stopped = false;
  const frames = [];
  const stop = startPlayback({ row: 1, frames: 2, durationMs: 100 }, f => frames.push(f), {
    now: () => now,
    schedule: callback => { tick = callback; return () => { stopped = true; }; },
  });
  tick();
  now = 150; tick();
  now = 200; tick();
  assert.deepEqual(frames, [0, 1, 0]);
  stop();
  assert.equal(stopped, true);
});

test('all bundled manifests parse independently of Vite and animation frames stay bounded', () => {
  const assets = new URL('../assets/', import.meta.url);
  for (const dir of readdirSync(assets, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const pet = parsePet(JSON.parse(readFileSync(new URL(`${dir.name}/pet.json`, assets), 'utf8')));
    for (const clip of [...Object.values(pet.animations), pet.walkAnimation].filter(Boolean)) {
      for (let t = 0; t < clip.durationMs * 3; t += 40) {
        const frame = frameAt(clip, t);
        assert.ok(frame >= 0 && frame < clip.frames, pet.id);
      }
    }
  }
});

test('manifest parser rejects invalid explicit animation data', () => {
  const animations = Object.fromEntries(['idle', 'working', 'tool', 'waiting', 'ended', 'interrupted', 'failed', 'unknown']
    .map(status => [status, { row: 1, frames: 6, durationMs: 4290 }]));
  const manifest = { schemaVersion: 1, id: 'test', displayName: 'Test', description: '',
    spritesheetPath: 'spritesheet.webp', frameWidth: 192, frameHeight: 208, animations };
  assert.equal(parsePet(manifest).id, 'test');
  assert.throws(() => parsePet({ ...manifest, animations: { ...animations, idle: { row: 1, frames: 9, durationMs: 100 } } }));
  assert.throws(() => parsePet({ ...manifest, animations: {} }));
});

test('placement preserves cross-monitor movement and clamps the pet vertically', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(fitPet({ x: -500, y: 1000 }, area), {
    x: -564, y: 720, width: 320, height: 360, side: 'right', petX: -500, petY: 872,
  });
});

test('task ranking uses recency for ties without mutating input', () => {
  const tasks = [
    { status: 'working', updatedAt: 1 }, { status: 'tool', updatedAt: 2 },
    { status: 'failed', updatedAt: 3 }, { status: 'waiting', updatedAt: 0 },
  ];
  const before = [...tasks];
  assert.deepEqual(sortTasks(tasks), [tasks[3], tasks[2], tasks[1], tasks[0]]);
  assert.deepEqual(tasks, before);
  assert.equal(selectPetStatus(tasks, null), 'waiting');
});
