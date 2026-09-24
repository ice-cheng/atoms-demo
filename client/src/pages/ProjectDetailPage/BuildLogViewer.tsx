import React from 'react';
import { Circle } from 'lucide-react';
import type { AgentLogEntry } from '@shared/api.interface';

const AGENT_COLORS: Record<string, string> = {
  pm: 'hsl(199 89% 48%)',
  architect: 'hsl(262 83% 58%)',
  engineer: 'hsl(142 71% 45%)',
  reviewer: 'hsl(38 92% 50%)',
};

const AGENT_NAMES: Record<string, string> = {
  pm: 'Product Manager',
  architect: 'Architect',
  engineer: 'Engineer',
  reviewer: 'Reviewer',
};

interface BuildLogViewerProps {
  logs: AgentLogEntry[];
}

const BuildLogViewer: React.FC<BuildLogViewerProps> = ({ logs }) => {
  const agentOrder = ['pm', 'architect', 'engineer', 'reviewer'];

  const logsByAgent = logs.reduce<Record<string, AgentLogEntry[]>>(
    (acc, log) => {
      if (!acc[log.agent]) acc[log.agent] = [];
      acc[log.agent].push(log);
      return acc;
    },
    {},
  );

  const hasLogs = Object.keys(logsByAgent).length > 0;

  return (
    <div className="rounded-xl border border-border bg-white shadow-sm p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4">构建日志</h3>
      {!hasLogs ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          暂无构建日志
        </div>
      ) : (
        <div className="space-y-5">
          {agentOrder.map((agentKey) => {
            const agentLogs = logsByAgent[agentKey] || [];
            if (agentLogs.length === 0) return null;
            const color = AGENT_COLORS[agentKey] || '#888';
            return (
              <div
                key={agentKey}
                className="border-l-2 pl-4"
                style={{ borderColor: color }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Circle
                    className="w-3 h-3 fill-current shrink-0"
                    style={{ color }}
                  />
                  <span className="text-sm font-semibold text-foreground">
                    {AGENT_NAMES[agentKey]}
                  </span>
                  <span className="text-xs text-slate-400">
                    {agentLogs.length} 条记录
                  </span>
                </div>
                <div className="space-y-2 font-mono text-xs text-slate-600 bg-slate-50 rounded-lg p-3 max-h-[400px] overflow-auto">
                  {agentLogs.map((log: AgentLogEntry, idx: number) => (
                    <div key={idx} className="leading-relaxed">
                      <span className="text-slate-400">[{log.timestamp}]</span>{' '}
                      {log.message}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BuildLogViewer;
