export type SplitIdentityStatus = "persist" | "enter" | "exit";

export interface SplitIdentitySnapshot {
  unit: "chars" | "words";
  ids: string[];
  values: string[];
  nextId: number;
}

export interface SplitIdentityChange {
  id: string;
  status: SplitIdentityStatus;
  value: string;
  prevIndex?: number;
  nextIndex?: number;
}

export interface SplitIdentityDiffResult {
  snapshot: SplitIdentitySnapshot;
  changes: SplitIdentityChange[];
}

export interface ReconcileSplitIdentityOptions {
  unit?: "chars" | "words";
  idPrefix?: string;
}

const DEFAULT_ID_PREFIX = "c";

function nextIdentityId(prefix: string, counter: number): string {
  return `${prefix}${counter}`;
}

function findMatchesByLcs(
  prevValues: string[],
  nextValues: string[]
): Array<[number, number]> {
  const n = prevValues.length;
  const m = nextValues.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (prevValues[i] === nextValues[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const matches: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (prevValues[i] === nextValues[j]) {
      matches.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return matches;
}

export function reconcileSplitIdentity(
  prevSnapshot: SplitIdentitySnapshot | null | undefined,
  nextValuesInput: readonly string[],
  options: ReconcileSplitIdentityOptions = {}
): SplitIdentityDiffResult {
  const unit = options.unit ?? "chars";
  const idPrefix =
    typeof options.idPrefix === "string" && options.idPrefix.length > 0
      ? options.idPrefix
      : unit === "words" ? "w" : DEFAULT_ID_PREFIX;

  const prevIds = prevSnapshot?.ids ?? [];
  const prevValues = prevSnapshot?.values ?? [];
  const nextValues = Array.from(nextValuesInput);
  let nextIdCounter = prevSnapshot?.nextId ?? 0;

  const matches = findMatchesByLcs(prevValues, nextValues);
  const prevIndexByNextIndex = new Array<number>(nextValues.length).fill(-1);
  const nextIndexByPrevIndex = new Array<number>(prevValues.length).fill(-1);

  matches.forEach(([prevIndex, nextIndex]) => {
    prevIndexByNextIndex[nextIndex] = prevIndex;
    nextIndexByPrevIndex[prevIndex] = nextIndex;
  });

  const nextIds: string[] = new Array(nextValues.length);
  for (let nextIndex = 0; nextIndex < nextValues.length; nextIndex++) {
    const prevIndex = prevIndexByNextIndex[nextIndex];
    if (prevIndex >= 0 && prevIds[prevIndex]) {
      nextIds[nextIndex] = prevIds[prevIndex];
    } else {
      nextIds[nextIndex] = nextIdentityId(idPrefix, nextIdCounter);
      nextIdCounter += 1;
    }
  }

  const changes: SplitIdentityChange[] = [];

  for (let nextIndex = 0; nextIndex < nextValues.length; nextIndex++) {
    const prevIndex = prevIndexByNextIndex[nextIndex];
    const id = nextIds[nextIndex];
    if (prevIndex >= 0) {
      changes.push({
        id,
        status: "persist",
        value: nextValues[nextIndex],
        prevIndex,
        nextIndex,
      });
    } else {
      changes.push({
        id,
        status: "enter",
        value: nextValues[nextIndex],
        nextIndex,
      });
    }
  }

  for (let prevIndex = 0; prevIndex < prevValues.length; prevIndex++) {
    if (nextIndexByPrevIndex[prevIndex] >= 0) continue;
    const id = prevIds[prevIndex] ?? nextIdentityId(idPrefix, nextIdCounter);
    if (!prevIds[prevIndex]) {
      nextIdCounter += 1;
    }
    changes.push({
      id,
      status: "exit",
      value: prevValues[prevIndex] ?? "",
      prevIndex,
    });
  }

  return {
    snapshot: {
      unit,
      ids: nextIds,
      values: nextValues,
      nextId: nextIdCounter,
    },
    changes,
  };
}
