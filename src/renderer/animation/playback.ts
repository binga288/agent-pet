import { frameAt, type Animation } from '../../shared/animation.ts';

export interface PlaybackClock {
  now(): number;
  schedule(tick: () => void): () => void;
}

const browserClock: PlaybackClock = {
  now: () => performance.now(),
  schedule(tick) {
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  },
};

// The scheduler and drawing target can be replaced without changing frame timing.
export function startPlayback(
  animation: Animation,
  draw: (frame: number) => void,
  clock: PlaybackClock = browserClock,
): () => void {
  const start = clock.now();
  let previous = -1;
  const tick = () => {
    const frame = frameAt(animation, clock.now() - start);
    if (frame === previous) return;
    draw(frame);
    previous = frame;
  };
  tick();
  return clock.schedule(tick);
}
