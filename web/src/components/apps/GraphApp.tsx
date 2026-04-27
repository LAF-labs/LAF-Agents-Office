/**
 * GraphApp — cross-entity knowledge graph view.
 *
 * Port of the TUI /graph surface (internal/tui/render/graph.go). The broker
 * exposes every brief + every coalesced edge at GET /entity/graph/all; this
 * component reads that payload and lays it out with a tiny hand-rolled
 * force-directed simulation in SVG. No external graph libraries are
 * imported — the whole view adds ~10kb to the bundle instead of ~200kb for
 * react-force-graph / d3.
 *
 * Interactions:
 *  - Hover a node → highlight + show tooltip
 *  - Hover an edge → show the fact id that first produced it
 *  - Click a node → open its wiki page
 *  - Legend (bottom-right) shows kind counts
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  type EntityKind,
  fetchEntityGraphAll,
  type GraphAllResponse,
} from "../../api/entity";
import { useAppStore } from "../../stores/app";

// ── Types ────────────────────────────────────────────────────────

interface SimNode {
  id: string;
  kind: EntityKind;
  slug: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SimEdge {
  from: string;
  to: string;
  label: string;
  occurrenceCount: number;
}

// ── Visual tokens ────────────────────────────────────────────────
//
// Three kinds drive the node palette. The TUI uses more (deals, tasks,
// tickets, …) but the cross-entity graph built in v1.2 only tracks the
// three `ValidEntityKinds` (people | companies | customers). Any future
// kinds the broker emits will fall back to the "other" style instead of
// breaking the render.

const NODE_STYLES: Record<
  string,
  { fill: string; stroke: string; icon: string; label: string }
> = {
  people: {
    fill: "#EDE9FE",
    stroke: "#7C3AED",
    icon: "👤", // 👤
    label: "People",
  },
  companies: {
    fill: "#DBEAFE",
    stroke: "#2563EB",
    icon: "🏢", // 🏢
    label: "Companies",
  },
  customers: {
    fill: "#DCFCE7",
    stroke: "#059669",
    icon: "🤝", // handshake — customer = relationship
    label: "Customers",
  },
};

function styleFor(kind: string) {
  return (
    NODE_STYLES[kind] ?? {
      fill: "#F3F4F6",
      stroke: "#6B7280",
      icon: "◆",
      label: kind,
    }
  );
}

const NODE_RADIUS = 28;
const LABEL_MAX_CHARS = 18;

function truncateLabel(label: string): string {
  if (label.length <= LABEL_MAX_CHARS) return label;
  return `${label.slice(0, LABEL_MAX_CHARS - 1)}…`;
}

// ── Force simulation ─────────────────────────────────────────────
//
// Barebones velocity-Verlet style loop. Good enough for <100 nodes, which
// is the realistic ceiling for a v1 cross-entity brief catalog. If the
// graph ever exceeds that, swap in d3-force (still bundle-cheap at ~30kb).

interface SimOpts {
  width: number;
  height: number;
  iterations: number;
}

interface ForceMaps {
  fx: Map<string, number>;
  fy: Map<string, number>;
}

interface SimulationConfig {
  cx: number;
  cy: number;
  idealLink: number;
  repulse: number;
  centerPull: number;
  width: number;
  height: number;
}

function simulationConfig(nodes: SimNode[], opts: SimOpts): SimulationConfig {
  const nodeCount = nodes.length;
  return {
    cx: opts.width / 2,
    cy: opts.height / 2,
    idealLink: Math.min(280, 140 + nodeCount * 8),
    repulse: 18000 + nodeCount * 600,
    centerPull: 0.008,
    width: opts.width,
    height: opts.height,
  };
}

function initForces(nodes: SimNode[]): ForceMaps {
  const fx = new Map<string, number>();
  const fy = new Map<string, number>();
  for (const node of nodes) {
    fx.set(node.id, 0);
    fy.set(node.id, 0);
  }
  return { fx, fy };
}

function addForce(forces: ForceMaps, nodeId: string, dx: number, dy: number) {
  forces.fx.set(nodeId, (forces.fx.get(nodeId) ?? 0) + dx);
  forces.fy.set(nodeId, (forces.fy.get(nodeId) ?? 0) + dy);
}

function applyRepulsion(nodes: SimNode[], forces: ForceMaps, repulse: number) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      applyRepulsionPair(nodes[i], nodes[j], forces, repulse);
    }
  }
}

function applyRepulsionPair(
  a: SimNode,
  b: SimNode,
  forces: ForceMaps,
  repulse: number,
) {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  let d2 = dx * dx + dy * dy;
  if (d2 < 1) {
    dx = Math.random() - 0.5;
    dy = Math.random() - 0.5;
    d2 = 1;
  }
  const force = repulse / d2;
  const dist = Math.sqrt(d2);
  const nx = dx / dist;
  const ny = dy / dist;
  addForce(forces, a.id, nx * force, ny * force);
  addForce(forces, b.id, -nx * force, -ny * force);
}

function mapNodesById(nodes: SimNode[]): Map<string, SimNode> {
  const byId = new Map<string, SimNode>();
  for (const node of nodes) byId.set(node.id, node);
  return byId;
}

function applyAttraction(
  edges: SimEdge[],
  byId: Map<string, SimNode>,
  forces: ForceMaps,
  idealLink: number,
) {
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!(a && b)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - idealLink) * 0.05;
    const nx = dx / dist;
    const ny = dy / dist;
    addForce(forces, a.id, nx * force, ny * force);
    addForce(forces, b.id, -nx * force, -ny * force);
  }
}

function applyCenterPull(
  nodes: SimNode[],
  forces: ForceMaps,
  config: SimulationConfig,
) {
  for (const node of nodes) {
    addForce(
      forces,
      node.id,
      (config.cx - node.x) * config.centerPull,
      (config.cy - node.y) * config.centerPull,
    );
  }
}

function integrateNodes(
  nodes: SimNode[],
  forces: ForceMaps,
  config: SimulationConfig,
  cooling: number,
) {
  const damping = 0.85;
  const maxVel = 30;
  const pad = NODE_RADIUS + 8;
  for (const node of nodes) {
    node.vx = clampVelocity(
      (node.vx + (forces.fx.get(node.id) ?? 0)) * damping * cooling,
      maxVel,
    );
    node.vy = clampVelocity(
      (node.vy + (forces.fy.get(node.id) ?? 0)) * damping * cooling,
      maxVel,
    );
    node.x = clampPosition(node.x + node.vx, pad, config.width - pad);
    node.y = clampPosition(node.y + node.vy, pad, config.height - pad);
  }
}

function clampVelocity(value: number, maxVel: number): number {
  return Math.max(-maxVel, Math.min(maxVel, value));
}

function clampPosition(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function runSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  opts: SimOpts,
): void {
  if (nodes.length === 0) return;
  // Scale forces with node count so a 6-node graph spreads across the canvas
  // the same way a 30-node graph does. Empirically: repulse grows with n,
  // link length with √n.
  const config = simulationConfig(nodes, opts);
  const byId = mapNodesById(nodes);

  for (let step = 0; step < opts.iterations; step++) {
    const cooling = 1 - step / opts.iterations;
    const forces = initForces(nodes);
    applyRepulsion(nodes, forces, config.repulse);
    applyAttraction(edges, byId, forces, config.idealLink);
    applyCenterPull(nodes, forces, config);
    integrateNodes(nodes, forces, config, cooling);
  }
}

// ── Component ────────────────────────────────────────────────────

export function GraphApp() {
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<GraphAllResponse>({
    queryKey: ["entity-graph-all"],
    queryFn: fetchEntityGraphAll,
    refetchInterval: 15_000,
  });

  // Responsive canvas sizing — recompute on container resize.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({
        width: Math.max(400, rect.width),
        height: Math.max(400, rect.height),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seed layout + run sim whenever the payload or canvas size changes.
  const simResult = useMemo(() => {
    if (!data) return null;
    const nodes: SimNode[] = data.nodes.map((n, i) => {
      // Arrange seeds on a golden-ratio spiral so the sim starts from a
      // reasonable non-collinear layout. Random seeds caused the first few
      // frames to look like an exploding spider.
      const angle = i * 2.399963229728653; // 2π / φ²
      const radius = 30 + Math.sqrt(i) * 35;
      return {
        id: `${n.kind}/${n.slug}`,
        kind: n.kind,
        slug: n.slug,
        title: n.title || n.slug,
        x: size.width / 2 + Math.cos(angle) * radius,
        y: size.height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });
    const edges: SimEdge[] = data.edges.map((e) => ({
      from: `${e.from_kind}/${e.from_slug}`,
      to: `${e.to_kind}/${e.to_slug}`,
      label: e.first_seen_fact_id || "",
      occurrenceCount: e.occurrence_count,
    }));
    runSimulation(nodes, edges, {
      width: size.width,
      height: size.height,
      iterations: 380,
    });
    return { nodes, edges };
  }, [data, size.width, size.height]);

  const nodesById = useMemo(() => {
    const m = new Map<string, SimNode>();
    for (const n of simResult?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [simResult]);

  const legendCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of simResult?.nodes ?? []) {
      counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    }
    return counts;
  }, [simResult]);

  const handleNodeClick = useCallback(
    (node: SimNode) => {
      setCurrentApp("wiki");
      setWikiPath(`team/${node.kind}/${node.slug}.md`);
    },
    [setCurrentApp, setWikiPath],
  );

  const totalNodes = simResult?.nodes.length ?? 0;
  const totalEdges = simResult?.edges.length ?? 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "var(--bg)",
      }}
    >
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Entity Graph
          </h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: "4px 0 0",
            }}
          >
            People, companies, and customers the team has written facts about —
            and how they connect.
          </p>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {totalNodes} node{totalNodes === 1 ? "" : "s"} · {totalEdges} edge
          {totalEdges === 1 ? "" : "s"}
        </div>
      </header>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          flex: 1,
          overflow: "hidden",
          background:
            "radial-gradient(circle at 50% 40%, var(--bg-subtle) 0%, var(--bg) 70%)",
        }}
      >
        {isLoading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            Loading graph...
          </div>
        ) : error ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              fontSize: 14,
            }}
          >
            Could not load graph: {(error as Error).message}
          </div>
        ) : !simResult || simResult.nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <svg
              role="img"
              aria-label="Entity graph"
              width={size.width}
              height={size.height}
              style={{ display: "block", userSelect: "none" }}
            >
              <defs>
                <marker
                  id="graph-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-tertiary)" />
                </marker>
              </defs>

              <GraphEdges
                edges={simResult.edges}
                nodesById={nodesById}
                hoveredNode={hoveredNode}
              />
              <GraphNodes
                nodes={simResult.nodes}
                hoveredNode={hoveredNode}
                setHoveredNode={setHoveredNode}
                onNodeClick={handleNodeClick}
              />
            </svg>

            <Legend counts={legendCounts} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Supporting views ─────────────────────────────────────────────

interface GraphEdgesProps {
  edges: SimEdge[];
  nodesById: Map<string, SimNode>;
  hoveredNode: string | null;
}

function GraphEdges({ edges, nodesById, hoveredNode }: GraphEdgesProps) {
  return (
    <>
      {edges.map((edge) => (
        <GraphEdge
          key={`${edge.from}->${edge.to}:${edge.label}`}
          edge={edge}
          nodesById={nodesById}
          hoveredNode={hoveredNode}
        />
      ))}
    </>
  );
}

function GraphEdge({
  edge,
  nodesById,
  hoveredNode,
}: {
  edge: SimEdge;
  nodesById: Map<string, SimNode>;
  hoveredNode: string | null;
}) {
  const a = nodesById.get(edge.from);
  const b = nodesById.get(edge.to);
  if (!(a && b)) return null;
  const active = hoveredNode === a.id || hoveredNode === b.id;
  const coords = edgeCoords(a, b);
  return (
    <g>
      <title>
        {edge.occurrenceCount}x{" "}
        {edge.label ? edge.label.slice(0, 24) : "mention"}
      </title>
      <line
        x1={coords.x1}
        y1={coords.y1}
        x2={coords.x2}
        y2={coords.y2}
        stroke={
          active ? "var(--accent, #ecb22e)" : "var(--border-dark, #cfd1d2)"
        }
        strokeWidth={active ? 2 : 1.25}
        markerEnd="url(#graph-arrow)"
        opacity={active ? 1 : 0.65}
      />
      {/* Invisible wide stroke for easier hover pickup. */}
      <line
        x1={coords.x1}
        y1={coords.y1}
        x2={coords.x2}
        y2={coords.y2}
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: "default" }}
      />
    </g>
  );
}

function edgeCoords(a: SimNode, b: SimNode) {
  // Shrink the line ends so the arrow doesn't plunge into the node.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const shrink = NODE_RADIUS + 2;
  return {
    x1: a.x + (dx / dist) * shrink,
    y1: a.y + (dy / dist) * shrink,
    x2: b.x - (dx / dist) * shrink,
    y2: b.y - (dy / dist) * shrink,
  };
}

interface GraphNodesProps {
  nodes: SimNode[];
  hoveredNode: string | null;
  setHoveredNode: (id: string | null) => void;
  onNodeClick: (node: SimNode) => void;
}

function GraphNodes({
  nodes,
  hoveredNode,
  setHoveredNode,
  onNodeClick,
}: GraphNodesProps) {
  return (
    <>
      {nodes.map((node) => (
        <GraphNode
          key={node.id}
          node={node}
          active={hoveredNode === node.id}
          setHoveredNode={setHoveredNode}
          onNodeClick={onNodeClick}
        />
      ))}
    </>
  );
}

function GraphNode({
  node,
  active,
  setHoveredNode,
  onNodeClick,
}: {
  node: SimNode;
  active: boolean;
  setHoveredNode: (id: string | null) => void;
  onNodeClick: (node: SimNode) => void;
}) {
  const style = styleFor(node.kind);
  return (
    <a
      href={`#/wiki/team/${node.kind}/${encodeURIComponent(node.slug)}.md`}
      aria-label={`Open ${node.title}`}
      onMouseEnter={() => setHoveredNode(node.id)}
      onMouseLeave={() => setHoveredNode(null)}
      onClick={(event) => {
        event.preventDefault();
        onNodeClick(node);
      }}
    >
      <g
        transform={`translate(${node.x},${node.y})`}
        style={{ cursor: "pointer" }}
      >
        <circle
          r={NODE_RADIUS}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={active ? 3 : 2}
          filter={
            active ? "drop-shadow(0 4px 12px rgba(0,0,0,0.12))" : undefined
          }
        />
        <text
          y={-2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={20}
          pointerEvents="none"
        >
          {style.icon}
        </text>
        <text
          y={NODE_RADIUS + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={active ? 600 : 500}
          fill="var(--text)"
          style={{ pointerEvents: "none" }}
        >
          {truncateLabel(node.title)}
        </text>
      </g>
    </a>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-tertiary)",
        gap: 8,
        fontSize: 14,
        padding: "0 40px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.7 }}>{"\u{1F578}"}</div>
      <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
        No entities yet.
      </div>
      <div>
        Record facts about people, companies, or customers (via the MCP surface
        or
        <code style={{ padding: "0 4px" }}>POST /entity/fact</code>) and they'll
        appear here with every wikilink they mention.
      </div>
    </div>
  );
}

function Legend({ counts }: { counts: Map<string, number> }) {
  const entries = Array.from(counts.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 150,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 600,
        }}
      >
        Legend
      </div>
      {entries.map(([kind, count]) => {
        const s = styleFor(kind);
        return (
          <div
            key={kind}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: s.fill,
                border: `2px solid ${s.stroke}`,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
              }}
            >
              {s.icon}
            </span>
            <span style={{ flex: 1, color: "var(--text)" }}>{s.label}</span>
            <span
              style={{
                color: "var(--text-tertiary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default GraphApp;
