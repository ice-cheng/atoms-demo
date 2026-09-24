import React from 'react';
import { Check } from 'lucide-react';

export type AgentStatus = 'waiting' | 'working' | 'done';

export interface AgentConfig {
  key: 'pm' | 'architect' | 'engineer' | 'reviewer' | 'fixer';
  name: string;
  role: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

interface AgentCardProps {
  agent: AgentConfig;
  status: AgentStatus;
  logs: string[];
  isTyping?: boolean;
  codeProgress?: number;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  status,
  logs,
  isTyping = false,
  codeProgress = 0,
}) => {
  return (
    <div
      className={`rounded-xl border bg-white transition-all duration-300 ${
        status === 'working'
          ? 'border-slate-200 shadow-lg shadow-slate-200/50'
          : 'border-slate-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-5">
        {/* Avatar */}
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${agent.bgColor}`}
        >
          {agent.icon}
        </div>

        {/* Name & Role */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800">{agent.name}</div>
          <div className="text-sm text-slate-500">{agent.role}</div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {status === 'waiting' && (
            <>
              <div className="w-3 h-3 rounded-full bg-slate-300" />
              <span className="text-sm text-slate-400">等待中</span>
            </>
          )}
          {status === 'working' && (
            <>
              <div
                className={`w-3 h-3 rounded-full ${agent.bgColor} animate-pulse`}
              />
              <span className={`text-sm font-medium ${agent.color}`}>
                工作中
              </span>
            </>
          )}
          {status === 'done' && (
            <>
              <div
                className={`w-5 h-5 rounded-full ${agent.bgColor} flex items-center justify-center`}
              >
                <Check className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm text-emerald-600 font-medium">
                完成
              </span>
            </>
          )}
        </div>
      </div>

      {/* Log Area */}
      {logs.length > 0 || status === 'working' ? (
        <div
          className={`mx-5 mb-5 rounded-lg overflow-hidden border-l-4 ${agent.borderColor}`}
        >
          <div className="bg-slate-900 p-4 font-mono text-sm space-y-2 min-h-[80px]">
             {logs.map((log, index) => (
               <div
                 key={index}
                 className="text-slate-300 flex items-start gap-2 animate-in fade-in slide-in-from-left-1 duration-300"
               >
                 <span className={`${agent.color} flex-shrink-0`}>{'>'}</span>
                 <span className="whitespace-pre-wrap break-all">{log}</span>
               </div>
             ))}
             {codeProgress > 0 && (
               <div className="text-emerald-400 flex items-start gap-2">
                 <span className="flex-shrink-0">{'›'}</span>
                 <span>正在生成代码... 已生成 <span className="font-bold">{codeProgress.toLocaleString()}</span> 字符</span>
               </div>
             )}
             {isTyping && (
              <div className="text-slate-300 flex items-start gap-2">
                <span className={`${agent.color} flex-shrink-0`}>{'>'}</span>
                <span className="inline-block w-2 h-4 bg-slate-400 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AgentCard;
