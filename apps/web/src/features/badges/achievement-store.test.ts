import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AchievementsDto } from "@sala/contracts";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: fetchMock }));
// Exercise the shared store through its hook adapter without mounting a browser DOM.
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));

function snapshot(places: number): AchievementsDto {
  return {
    badges: [], unseenIds: [], stats: { studyMinutes: 0, studyDays: 0 },
    collaboration: { places, days: 1, seeds: 3, todayPlaces: places, todaySeeds: 3, nextSeedPlaces: 10, eligibleForAdmin: false, applicationStatus: null },
    rewards: places < 30 ? [] : [{ id: "earned-reward", places, seeds: 30, earnedAt: "2026-10-31T14:00:00Z", proExpiresAt: "2026-11-07T14:00:00Z" }],
  };
}

describe("achievement refresh after a report", () => {
  beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); });

  it("reads the new reward after an older request finishes, coalescing concurrent refreshes", async () => {
    let finish!: (data: AchievementsDto) => void;
    fetchMock.mockReturnValueOnce(new Promise<AchievementsDto>(resolve => { finish = resolve; })).mockResolvedValueOnce(snapshot(30));
    const { useAchievements } = await import("./achievement-store");
    const store = useAchievements("member");
    const updates = [store.refresh(), store.refresh(), store.refresh()];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(snapshot(29));
    await Promise.all(updates);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAchievements("member").data?.rewards?.[0]?.id).toBe("earned-reward");
  });

  it("does not retry or expose the previous account's reward after switching accounts", async () => {
    let finish!: (data: AchievementsDto) => void;
    fetchMock.mockReturnValueOnce(new Promise<AchievementsDto>(resolve => { finish = resolve; })).mockResolvedValueOnce(snapshot(0));
    const { useAchievements } = await import("./achievement-store");
    const previous = useAchievements("previous").refresh();
    useAchievements("current");
    finish(snapshot(30));
    await previous;
    expect(useAchievements("current").data?.rewards).toEqual([]);
    expect(useAchievements("current").data?.collaboration.places).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
