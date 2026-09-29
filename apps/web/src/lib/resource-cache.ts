import { useSyncExternalStore } from "react";

export interface ResourceState<T> {
  data: T | undefined;
  /** A request is currently in flight. */
  loading: boolean;
  /** The last request failed (cleared by the next successful request or by `invalidate`). */
  error: unknown;
}

export interface Resource<T> {
  /** Current state; the object identity only changes when the state does (useSyncExternalStore-safe). */
  getState: () => ResourceState<T>;
  subscribe: (listener: () => void) => () => void;
  /** Cached value if any, otherwise fetches. Concurrent callers share one request. */
  load: () => Promise<T>;
  /** Always revalidates (sharing an in-flight request) while keeping the last value visible. */
  refresh: () => Promise<T>;
  /** Drops the cached value and discards any in-flight result; subscribers see `data: undefined`. */
  invalidate: () => void;
}

/**
 * Tiny SWR-like store: in-flight dedupe, last-known value, and subscription for React. Kept
 * dependency-free on purpose; one instance per remote resource (e.g. `/me`).
 */
export function createResource<T>(fetcher: () => Promise<T>): Resource<T> {
  let state: ResourceState<T> = { data: undefined, loading: false, error: undefined };
  let inflight: Promise<T> | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  function set(next: ResourceState<T>) {
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function refresh(): Promise<T> {
    if (inflight) return inflight;
    const gen = generation;
    set({ ...state, loading: true });
    const request: Promise<T> = fetcher().then(
      (data) => {
        if (gen === generation) set({ data, loading: false, error: undefined });
        if (inflight === request) inflight = null;
        return data;
      },
      (error: unknown) => {
        if (gen === generation) set({ data: state.data, loading: false, error });
        if (inflight === request) inflight = null;
        throw error;
      },
    );
    inflight = request;
    return request;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load() {
      if (state.data !== undefined) return Promise.resolve(state.data);
      return refresh();
    },
    refresh,
    invalidate() {
      generation += 1;
      inflight = null;
      set({ data: undefined, loading: false, error: undefined });
    },
  };
}

const SERVER_STATE: ResourceState<never> = { data: undefined, loading: true, error: undefined };

/** Subscribes a component to a resource. Server render always sees the "loading" state. */
export function useResource<T>(resource: Resource<T>): ResourceState<T> {
  return useSyncExternalStore(resource.subscribe, resource.getState, () => SERVER_STATE as ResourceState<T>);
}
