import { useCallback } from 'react';
import { Workflow } from 'lucide-react';
import {
  ReactFlow, Background, Controls, MiniMap,
  Node, Edge, addEdge, Connection, useNodesState, useEdgesState,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/stores/cc-stores';
import type { Workflow as WorkflowType } from '@/lib/command-center/types';

function workflowToReactFlow(workflow: WorkflowType) {
  const nodes: Node[] = workflow.nodes.map((n) => ({
    id: n.id,
    position: n.position,
    data: { label: n.label },
    style: {
      background: 'hsl(222 47% 8%)',
      border: '1px solid hsl(217 33% 17%)',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '11px',
      color: 'hsl(210 40% 98%)',
    },
  }));

  const edges: Edge[] = workflow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(199 89% 48%)' },
    style: { stroke: 'hsl(199 89% 48%)', strokeWidth: 1.5 },
    labelStyle: { fontSize: '9px', fill: 'hsl(215 20% 55%)' },
  }));

  return { nodes, edges };
}

export function CcWorkflowsTab() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const setActiveWorkflow = useWorkflowStore((s) => s.setActiveWorkflow);

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId);

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Workflow className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Workflows & Blueprints</h2>
        <p className="text-sm text-muted-foreground">Load mock data to view and build workflows</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workflows & Blueprints</h1>
      </div>
      <div className="flex gap-4 h-[calc(100vh-200px)]">
        <div className="w-72 flex-shrink-0 space-y-2">
          {workflows.map((wf) => (
            <button key={wf.id} onClick={() => setActiveWorkflow(wf.id)} className={`w-full text-left p-3 rounded-xl transition-all ${activeWorkflowId === wf.id ? 'glass border-primary/30' : 'hover:bg-secondary/30'}`}>
              <h3 className="text-xs font-semibold">{wf.name}</h3>
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{wf.description}</p>
              <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                <span>{wf.nodes.length} nodes</span>
                <span>{wf.edges.length} connections</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex-1 glass rounded-xl overflow-hidden">
          {activeWorkflow ? (
            <WorkflowCanvas workflow={activeWorkflow} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Select a workflow to view</div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkflowCanvas({ workflow }: { workflow: WorkflowType }) {
  const { nodes: initialNodes, edges: initialEdges } = workflowToReactFlow(workflow);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView className="bg-background">
      <Background color="hsl(217 33% 14%)" gap={20} />
      <Controls style={{ background: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px' }} />
      <MiniMap nodeColor="hsl(199 89% 48%)" maskColor="hsl(222 47% 6% / 0.8)" style={{ background: 'hsl(222 47% 8%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px' }} />
    </ReactFlow>
  );
}
