import { describe, expect, it } from "vitest";

import { groupActivityHistory } from "./sync-service.js";

describe("groupActivityHistory", () => {
  it("keeps bosses separate when the hiscores activity ids shift", () => {
    const activities = groupActivityHistory([
      {
        metricId: 62,
        name: "Scurrius",
        fetchedAt: new Date("2026-06-25T20:13:15.472Z"),
        rank: 541078,
        score: 10,
      },
      {
        metricId: 62,
        name: "Sarachnis",
        fetchedAt: new Date("2026-07-29T22:18:08.038Z"),
        rank: -1,
        score: 0,
      },
      {
        metricId: 64,
        name: "Scurrius",
        fetchedAt: new Date("2026-07-29T22:18:08.038Z"),
        rank: 550215,
        score: 10,
      },
    ]);

    expect(activities).toEqual([
      {
        id: 64,
        name: "Scurrius",
        latestRank: 550215,
        latestScore: 10,
        points: [
          {
            fetchedAt: new Date("2026-06-25T20:13:15.472Z"),
            rank: 541078,
            score: 10,
          },
          {
            fetchedAt: new Date("2026-07-29T22:18:08.038Z"),
            rank: 550215,
            score: 10,
          },
        ],
      },
      {
        id: 62,
        name: "Sarachnis",
        latestRank: -1,
        latestScore: 0,
        points: [
          {
            fetchedAt: new Date("2026-07-29T22:18:08.038Z"),
            rank: -1,
            score: 0,
          },
        ],
      },
    ]);
  });
});
