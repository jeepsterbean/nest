import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";
import "@xyflow/react/dist/style.css";
import type { Task, TaskDependency } from "../../lib/types";
import type { TaskGraphProjection } from "../lib/taskGraph";
import { isTaskBlocked, unresolvedBlockers } from "../lib/taskGraph";
import { useDashboardData } from "../context/DashboardDataContext";
import { WorkingBadge } from "./TaskWorkingControl";

const elk = import("elkjs/lib/elk.bundled.js").then(
  ({ default: ELK }) => new ELK(),
);
const TASK_WIDTH = 220;
const TASK_HEIGHT = 78;

type TaskNodeData = {
  task: Task;
  blocked: boolean;
  blockerCount: number;
  context: boolean;
};

type GroupNodeData = {
  task: Task;
  childCount: number;
};

type TaskNode = Node<TaskNodeData, "task">;
type GroupNode = Node<GroupNodeData, "taskGroup">;
type GraphNode = TaskNode | GroupNode;

function TaskNodeCard({ data }: NodeProps<TaskNode>) {
  return (
    <article
      className={`task-graph-node task-graph-node--${data.task.status}${
        data.blocked ? " task-graph-node--blocked" : ""
      }${data.context ? " task-graph-node--context" : ""}${
        data.task.workingNow ? " task-graph-node--working is-working-now" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="task-graph-node__eyebrow">
        <span className={`status-dot status-dot--${data.task.status}`} />
        <span>{data.task.status.replace("_", " ")}</span>
        {data.task.workingNow && <WorkingBadge compact />}
        {data.context && <span className="task-graph-node__context">context</span>}
      </div>
      <strong>{data.task.title}</strong>
      <span className="task-graph-node__readiness">
        {data.blocked ? `Waiting on ${data.blockerCount}` : "Ready"}
      </span>
      <Handle type="source" position={Position.Right} />
    </article>
  );
}

function TaskGroup({ data }: NodeProps<GroupNode>) {
  return (
    <section className="task-graph-group">
      <span>Breakdown</span>
      <strong>{data.task.title}</strong>
      <small>{data.childCount} direct {data.childCount === 1 ? "part" : "parts"}</small>
    </section>
  );
}

const nodeTypes: NodeTypes = {
  task: TaskNodeCard,
  taskGroup: TaskGroup,
};

function includedTaskIds(
  visibleTasks: Task[],
  graph: TaskGraphProjection,
): Set<number> {
  const included = new Set(visibleTasks.map((task) => task.id));
  const pending = [...included];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined) continue;
    for (const blocker of graph.blockersByTask.get(id) ?? []) {
      if (included.has(blocker.id)) continue;
      included.add(blocker.id);
      pending.push(blocker.id);
    }
    const task = graph.byId.get(id);
    if (task?.parentTaskId !== null && task?.parentTaskId !== undefined) {
      if (!included.has(task.parentTaskId)) {
        included.add(task.parentTaskId);
        pending.push(task.parentTaskId);
      }
    }
  }
  return included;
}

function taskElkNode(
  task: Task,
  included: Set<number>,
  graph: TaskGraphProjection,
): ElkNode {
  const children = (graph.childrenByParent.get(task.id) ?? []).filter((child) =>
    included.has(child.id),
  );
  if (children.length === 0) {
    return { id: String(task.id), width: TASK_WIDTH, height: TASK_HEIGHT };
  }
  return {
    id: `group:${task.id}`,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.padding": "[top=52,left=18,bottom=18,right=18]",
      "elk.spacing.nodeNode": "18",
    },
    children: [
      { id: String(task.id), width: TASK_WIDTH, height: TASK_HEIGHT },
      ...children.map((child) => taskElkNode(child, included, graph)),
    ],
  };
}

async function layoutGraph(
  visibleTasks: Task[],
  allTasks: Task[],
  dependencies: TaskDependency[],
  graph: TaskGraphProjection,
): Promise<{ nodes: GraphNode[]; edges: Edge[] }> {
  const visible = new Set(visibleTasks.map((task) => task.id));
  const included = includedTaskIds(visibleTasks, graph);
  const roots = allTasks.filter(
    (task) =>
      included.has(task.id) &&
      (task.parentTaskId === null || !included.has(task.parentTaskId)),
  );
  const layoutEngine = await elk;
  const layout = await layoutEngine.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "42",
      "elk.layered.spacing.nodeNodeBetweenLayers": "76",
      "elk.padding": "[top=28,left=28,bottom=28,right=28]",
    },
    children: roots.map((task) => taskElkNode(task, included, graph)),
    edges: dependencies
      .filter(
        (dependency) =>
          included.has(dependency.blockerTaskId) &&
          included.has(dependency.blockedTaskId),
      )
      .map<ElkExtendedEdge>((dependency) => ({
        id: `${dependency.blockerTaskId}:${dependency.blockedTaskId}`,
        sources: [String(dependency.blockerTaskId)],
        targets: [String(dependency.blockedTaskId)],
      })),
  });

  const nodes: GraphNode[] = [];
  const flatten = (elkNodes: ElkNode[] = [], parentId?: string) => {
    for (const elkNode of elkNodes) {
      if (elkNode.id.startsWith("group:")) {
        const taskId = Number(elkNode.id.slice("group:".length));
        const task = graph.byId.get(taskId);
        if (!task) continue;
        nodes.push({
          id: elkNode.id,
          type: "taskGroup",
          parentId,
          position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
          style: { width: elkNode.width ?? TASK_WIDTH + 36, height: elkNode.height ?? 180 },
          data: {
            task,
            childCount: (graph.childrenByParent.get(task.id) ?? []).filter((child) =>
              included.has(child.id),
            ).length,
          },
          selectable: false,
          draggable: false,
        });
        flatten(elkNode.children, elkNode.id);
        continue;
      }

      const task = graph.byId.get(Number(elkNode.id));
      if (!task) continue;
      nodes.push({
        id: elkNode.id,
        type: "task",
        parentId,
        position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
        data: {
          task,
          blocked: isTaskBlocked(graph, task.id),
          blockerCount: unresolvedBlockers(graph, task.id).length,
          context: !visible.has(task.id),
        },
        draggable: false,
      });
    }
  };
  flatten(layout.children);

  const edges: Edge[] = dependencies
    .filter(
      (dependency) =>
        included.has(dependency.blockerTaskId) &&
        included.has(dependency.blockedTaskId),
    )
    .map((dependency) => ({
      id: `${dependency.blockerTaskId}:${dependency.blockedTaskId}`,
      source: String(dependency.blockerTaskId),
      target: String(dependency.blockedTaskId),
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      className: "task-graph-edge",
    }));

  return { nodes, edges };
}

export function TaskGraphView({
  visibleTasks,
  onSelectTask,
}: {
  visibleTasks: Task[];
  onSelectTask?: (id: number) => void;
}) {
  const { tasks, taskDependencies, taskGraph } = useDashboardDataForGraph();
  const [layout, setLayout] = useState<{ nodes: GraphNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const layoutKey = useMemo(
    () =>
      `${visibleTasks.map((task) => `${task.id}:${task.updatedAt}`).join(",")}|${taskDependencies
        .map((dependency) => `${dependency.blockerTaskId}:${dependency.blockedTaskId}`)
        .join(",")}`,
    [visibleTasks, taskDependencies],
  );

  useEffect(() => {
    let current = true;
    setLayoutError(null);
    void layoutGraph(visibleTasks, tasks, taskDependencies, taskGraph)
      .then((next) => {
        if (current) setLayout(next);
      })
      .catch((error) => {
        if (current) setLayoutError(String(error));
      });
    return () => {
      current = false;
    };
  }, [layoutKey, taskGraph, taskDependencies, tasks, visibleTasks]);

  if (visibleTasks.length === 0) {
    return (
      <div className="task-graph-empty">
        <strong>No tasks to map</strong>
        <span>Add a task or choose a broader scope to build the graph.</span>
      </div>
    );
  }

  if (layoutError) {
    return <div className="task-graph-empty">Could not lay out this graph: {layoutError}</div>;
  }

  return (
    <div className="task-graph-canvas">
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (node.id.startsWith("group:")) return;
          onSelectTask?.(Number(node.id));
        }}
      >
        <Background gap={24} size={1} />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

// Kept at the module seam to keep layout code independent from dashboard
// loading while avoiding prop-drilling the full graph snapshot through TasksView.
const useDashboardDataForGraph = useDashboardData;
