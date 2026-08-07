import React from 'react';
import { ChevronDown, ChevronRight, Building2, Users, Monitor, Trash2, Zap } from 'lucide-react';
import type { PortalCrmAgency } from '@/lib/contracting/types';

export type AgencyNode = PortalCrmAgency & {
  children: AgencyNode[];
  agentCount: number;
};

export const TreeNode: React.FC<{
  node: AgencyNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (agency: PortalCrmAgency) => void;
  onDelete: (node: AgencyNode) => void;
  ghlEnabledNames?: Set<string>;
}> = ({ node, depth, expandedNodes, onToggle, onSelect, onDelete, ghlEnabledNames }) => {
  const isGhlLive = ghlEnabledNames?.has(node.name.toLowerCase()) ?? false;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isRoot = node.agency_type === 'main';
  const isFym = node.name.toLowerCase() === 'fym';
  const isContractingIncomplete =
    !isFym &&
    !isRoot &&
    (!node.agency_npn?.trim() ||
      !node.agency_ein?.trim() ||
      !node.principal_agent?.trim() ||
      !node.principal_agent_npn?.trim() ||
      !node.contracting_email?.trim());

  const depthColors = [
    'bg-blue-500/10 text-blue-400',
    'bg-emerald-500/10 text-emerald-400',
    'bg-amber-500/10 text-amber-400',
    'bg-sky-500/10 text-sky-400',
    'bg-rose-500/10 text-rose-400',
  ];

  return (
    <div className="relative">
      <div
        className={`group flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
          node.crm_enabled
            ? 'bg-card border-border hover:border-primary/40'
            : 'bg-secondary/20 border-border hover:border-border'
        }`}
        style={{ marginLeft: depth * 24 }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="p-1 rounded-md hover:bg-secondary/40 text-muted-foreground transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
        {!hasChildren && <div className="w-6" />}

        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => onSelect(node)}>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${depthColors[depth % depthColors.length]}`}
          >
            <Building2 className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm truncate">{node.name}</span>
              {node.crm_enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 uppercase tracking-wider">
                  <Monitor className="w-2.5 h-2.5" />
                  CRM
                </span>
              )}
              {node.is_test && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 uppercase tracking-wider">
                  Test
                </span>
              )}
              {isGhlLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 uppercase tracking-wider">
                  <Zap className="w-2.5 h-2.5 fill-green-400" />
                  GHL Live
                </span>
              )}
              {isContractingIncomplete && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 uppercase tracking-wider">
                  Incomplete
                </span>
              )}
              {(node.carriers || []).map((c) => (
                <span
                  key={c}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 uppercase tracking-wider"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" />
                {node.agentCount} agent{node.agentCount !== 1 ? 's' : ''}
              </span>
              {isRoot && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary/30 text-primary">Root</span>
              )}
            </div>
          </div>
        </div>

        {node.principal_agent && (
          <div className="hidden sm:flex flex-col items-end text-right mr-2 flex-shrink-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Principal Agent
            </span>
            <span className="text-xs font-semibold text-foreground/80 mt-0.5">{node.principal_agent}</span>
            {node.principal_agent_npn && (
              <span className="text-[10px] text-muted-foreground font-mono">
                NPN {node.principal_agent_npn}
              </span>
            )}
          </div>
        )}

        {!isRoot && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
            className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Delete agency"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="mt-1 space-y-1 relative">
          <div
            className="absolute top-0 bottom-0 border-l-2 border-border rounded-bl"
            style={{ left: depth * 24 + 20 }}
          />
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              onDelete={onDelete}
              ghlEnabledNames={ghlEnabledNames}
            />
          ))}
        </div>
      )}
    </div>
  );
};
