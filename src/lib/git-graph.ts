import type { GitCommit } from "./native";

export const ROW_HEIGHT = 28;
export const LANE_WIDTH = 18;
interface Lane { hash: string; color: number }
export interface GraphEdge {
  from: number;
  to: number;
  y1: number;
  y2: number;
  color: number;
}
export interface GraphRow {
  lane: number;
  color: number;
  edges: GraphEdge[];
}

// Pending parent hashes are lanes. A parent gets one lane even when many children
// point to it. Empty lanes are reused without moving unrelated branch lines.
export function layoutGraph(commits: GitCommit[]) {
  let lanes: (Lane | null)[] = [];
  let nextColor = 0;
  let width = 1;
  const rows: GraphRow[] = [];
  for (const commit of commits) {
    const before = [...lanes];
    let lane = lanes.findIndex((l) => l?.hash === commit.hash);
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = { hash: commit.hash, color: nextColor++ };
    }
    const color = lanes[lane]!.color;
    lanes[lane] = null;
    const edges: GraphEdge[] = [];
    for (const [i, active] of before.entries()) {
      if (!active) continue;
      edges.push({ from: i, to: i, y1: 0, y2: active.hash === commit.hash ? ROW_HEIGHT / 2 : ROW_HEIGHT, color: active.color });
    }
    for (const [index, parent] of [...new Set(commit.parents)].entries()) {
      let target = lanes.findIndex((l) => l?.hash === parent);
      if (target < 0) {
        target = index === 0 ? lane : lanes.indexOf(null);
        if (target < 0) target = lanes.length;
        lanes[target] = { hash: parent, color: index === 0 ? color : nextColor++ };
      }
      edges.push({ from: lane, to: target, y1: ROW_HEIGHT / 2, y2: ROW_HEIGHT, color: index === 0 ? color : lanes[target]!.color });
    }
    width = Math.max(width, lanes.length, lane + 1);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    rows.push({ lane, color, edges });
  }
  return { rows, width };
}

export function edgePath(edge: GraphEdge) {
  const x1 = 12 + edge.from * LANE_WIDTH;
  const x2 = 12 + edge.to * LANE_WIDTH;
  if (x1 === x2) return `M ${x1} ${edge.y1} L ${x2} ${edge.y2}`;
  const middle = (edge.y1 + edge.y2) / 2;
  return `M ${x1} ${edge.y1} C ${x1} ${middle} ${x2} ${middle} ${x2} ${edge.y2}`;
}
