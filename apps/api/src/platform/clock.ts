// check-port-allow: (?<![.\w])now\(\) Clock.now() is a method, not SQL now()
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Deterministic clock for tests: only moves when told to. */
export class FixedClock implements Clock {
  private t: Date;

  constructor(t: Date) {
    this.t = new Date(t);
  }

  now(): Date {
    return new Date(this.t);
  }

  set(t: Date): void {
    this.t = new Date(t);
  }

  advance(ms: number): void {
    this.t = new Date(this.t.getTime() + ms);
  }
}
