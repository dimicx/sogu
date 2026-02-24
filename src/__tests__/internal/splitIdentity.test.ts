import { describe, expect, it } from "vitest";
import {
  reconcileSplitIdentity,
  SplitIdentitySnapshot,
} from "../../internal/splitIdentity";

function createSnapshot(values: string[]): SplitIdentitySnapshot {
  return reconcileSplitIdentity(null, values).snapshot;
}

describe("reconcileSplitIdentity", () => {
  it("creates enter changes on first snapshot", () => {
    const result = reconcileSplitIdentity(null, ["H", "i"]);

    expect(result.snapshot.ids).toEqual(["c0", "c1"]);
    expect(result.changes).toEqual([
      { id: "c0", status: "enter", value: "H", nextIndex: 0 },
      { id: "c1", status: "enter", value: "i", nextIndex: 1 },
    ]);
  });

  it("preserves ids for persisted chars via LCS", () => {
    const previous = createSnapshot(["A", "B", "C"]);
    const result = reconcileSplitIdentity(previous, ["A", "X", "C"]);

    expect(result.snapshot.ids[0]).toBe(previous.ids[0]);
    expect(result.snapshot.ids[2]).toBe(previous.ids[2]);
    expect(result.changes).toContainEqual({
      id: previous.ids[0],
      status: "persist",
      value: "A",
      prevIndex: 0,
      nextIndex: 0,
    });
    expect(result.changes).toContainEqual({
      id: previous.ids[2],
      status: "persist",
      value: "C",
      prevIndex: 2,
      nextIndex: 2,
    });
  });

  it("handles repeated values deterministically", () => {
    const previous = createSnapshot(["A", "A", "B", "A"]);
    const result = reconcileSplitIdentity(previous, ["A", "B", "A", "A"]);

    const persist = result.changes.filter((change) => change.status === "persist");
    expect(persist.length).toBe(3);
    expect(persist.map((change) => change.id)).toEqual([
      previous.ids[0],
      previous.ids[2],
      previous.ids[3],
    ]);
  });

  it("emits exits for removed chars", () => {
    const previous = createSnapshot(["H", "e", "y"]);
    const result = reconcileSplitIdentity(previous, ["H", "y"]);

    expect(result.changes).toContainEqual({
      id: previous.ids[1],
      status: "exit",
      value: "e",
      prevIndex: 1,
    });
  });

  it("handles large arrays with LCS matching", () => {
    const previous = createSnapshot(new Array(210).fill("A"));
    const next = new Array(210).fill("A");
    next[105] = "B";

    const result = reconcileSplitIdentity(previous, next);

    // Most items should keep identity via LCS.
    const persistCount = result.changes.filter(
      (change) => change.status === "persist"
    ).length;
    expect(persistCount).toBeGreaterThan(150);
  });
});
