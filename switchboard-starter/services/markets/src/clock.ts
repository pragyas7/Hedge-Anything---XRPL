export interface Clock {
  now(): Date;
  advance?(ms: number): void;
}

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}

export function manualClock(startMs: number): ManualClock {
  let current = startMs;
  return {
    now: () => new Date(current),
    advance(ms: number) {
      current += ms;
    },
  };
}
