import { describe, expect, it } from "vitest";
import { layoutGraph, ROW_HEIGHT } from "./git-graph";
import type { GitCommit } from "./native";
const commit = (hash: string, parents: string[]): GitCommit => ({ hash, parents, author: "Demo", subject: hash, timestamp: 1 });
describe("commit graph lanes", () => {
  it("connects linear history and ends at the root", () => {
    const graph = layoutGraph([commit("a", ["b"]), commit("b", ["c"]), commit("c", [])]);
    expect(graph.width).toBe(1);
    expect(graph.rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(graph.rows[2].edges).toHaveLength(1);
    expect(graph.rows[2].edges[0].y2).toBe(ROW_HEIGHT / 2);
  });
  it("splits a merge and rejoins its shared ancestor without duplicate lanes", () => {
    const graph = layoutGraph([commit("merge", ["main", "feature"]), commit("feature", ["base"]), commit("main", ["base"]), commit("base", [])]);
    expect(graph.width).toBe(2);
    expect(graph.rows.map((r) => r.lane)).toEqual([0, 1, 0, 1]);
    expect(graph.rows[0].edges.map((e) => e.to)).toEqual([0, 1]);
    expect(graph.rows[2].edges.some((e) => e.from === 0 && e.to === 1)).toBe(true);
    expect(graph.rows[3].edges).toHaveLength(1);
  });
  it("keeps octopus merges, disconnected roots and pagination boundaries intact", () => {
    const commits = [commit("m", ["a", "b", "c"]), commit("a", ["root"]), commit("b", ["root"]), commit("c", ["root"]), commit("root", []), commit("separate", [])];
    const full = layoutGraph(commits);
    expect(full.width).toBe(3);
    expect(layoutGraph(commits.slice(0, 2)).rows).toEqual(full.rows.slice(0, 2));
    expect(full.rows[5].lane).toBe(0);
    expect(full.rows[5].edges).toEqual([]);
  });
});
