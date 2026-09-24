import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { projects as projectsApi } from '@client/src/api/index';
import type { RaceStreamBuildCallbacks } from '@client/src/api/projects';
import type { Project, CreateProjectRequest, RebuildProjectRequest } from '@shared/api.interface';
import AgentCard, { type AgentConfig } from './AgentCard';
import { useAuth } from '@client/src/contexts/AuthContext';
import { Trophy } from 'lucide-react';

const BASE_AGENTS: AgentConfig[] = [
  { key: 'pm', name: 'Product Manager', role: '产品经理 · 需求分析', color: 'text-sky-500', bgColor: 'bg-sky-500', borderColor: 'border-l-sky-500', icon: '📋' },
  { key: 'architect', name: 'Architect', role: '架构师 · 技术设计', color: 'text-violet-500', bgColor: 'bg-violet-500', borderColor: 'border-l-violet-500', icon: '🏗️' },
  { key: 'engineer', name: 'Engineer', role: '工程师 · 代码生成', color: 'text-emerald-500', bgColor: 'bg-emerald-500', borderColor: 'border-l-emerald-500', icon: '⚙️' },
  { key: 'reviewer', name: 'Reviewer', role: '审查员 · 质量把控', color: 'text-amber-500', bgColor: 'bg-amber-500', borderColor: 'border-l-amber-500', icon: '🔍' },
];

const FIXER_AGENT: AgentConfig = {
  key: 'fixer',
  name: 'Fixer',
  role: '修复工程师 · 自动修复',
  color: 'text-rose-500',
  bgColor: 'bg-rose-500',
  borderColor: 'border-l-rose-500',
  icon: '🔧',
};

interface BuildPageLocationState {
  createData?: CreateProjectRequest;
  rebuildData?: RebuildProjectRequest;
  isRebuild?: boolean;
}

interface TrackState {
  activeIndex: number;
  logs: Record<string, string[]>;
  progress: number;
  isTyping: boolean;
  complete: boolean;
  codeLength: number;
  tokenCount: number;
  fixerRounds: number;
  finalScore: number;
}

function createInitialTrack(): TrackState {
  return {
    activeIndex: 0,
    logs: { pm: [], architect: [], engineer: [], reviewer: [], fixer: [] },
    progress: 0,
    isTyping: false,
    complete: false,
    codeLength: 0,
    tokenCount: 0,
    fixerRounds: 0,
    finalScore: 0,
  };
}

const BuildPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as BuildPageLocationState | null;
  const { refreshUser } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRaceMode, setIsRaceMode] = useState(false);
  const [trackA, setTrackA] = useState<TrackState>(createInitialTrack());
  const [trackB, setTrackB] = useState<TrackState>(createInitialTrack());

  const streamStartedRef = useRef(false);
  const projectIdRef = useRef<string | null>(id || null);

  const allAgents = [...BASE_AGENTS, FIXER_AGENT];

  const agentKeyToIndex = useCallback((key: string): number => {
    return allAgents.findIndex((a) => a.key === key);
  }, []);

  const appendLogToTrack = useCallback(
    (track: 'A' | 'B', agentKey: string, message: string) => {
      const setter = track === 'A' ? setTrackA : setTrackB;
      setter((prev) => {
        const existing = prev.logs[agentKey] || [];
        if (existing.length === 0) {
          return { ...prev, logs: { ...prev.logs, [agentKey]: [message] } };
        }
        const last = existing[existing.length - 1];
        return {
          ...prev,
          logs: { ...prev.logs, [agentKey]: [...existing.slice(0, -1), last + message] },
        };
      });
    },
    [],
  );

  const setTrackActive = useCallback((track: 'A' | 'B', agentKey: string) => {
    const setter = track === 'A' ? setTrackA : setTrackB;
    const idx = agentKeyToIndex(agentKey);
    if (idx === -1) return;
    setter((prev) => ({
      ...prev,
      activeIndex: idx,
      isTyping: true,
      progress: (idx / allAgents.length) * 100,
    }));
  }, [agentKeyToIndex]);

  const setTrackAgentDone = useCallback((track: 'A' | 'B', agentKey: string) => {
    const setter = track === 'A' ? setTrackA : setTrackB;
    const idx = agentKeyToIndex(agentKey);
    if (idx === -1) return;
    setter((prev) => ({
      ...prev,
      isTyping: false,
      progress: ((idx + 1) / allAgents.length) * 100,
    }));
  }, [agentKeyToIndex]);

  const setTrackDone = useCallback((track: 'A' | 'B') => {
    const setter = track === 'A' ? setTrackA : setTrackB;
    setter((prev) => ({
      ...prev,
      complete: true,
      isTyping: false,
      progress: 100,
      activeIndex: allAgents.length,
    }));
  }, []);

  const buildRaceCallbacks = useCallback((isRebuild: boolean): RaceStreamBuildCallbacks => ({
    onProjectCreated: (proj) => {
      setProject(proj);
      projectIdRef.current = proj.id;
      setIsRaceMode(proj.raceMode ?? false);
      setLoading(false);
    },
    onTrackAgentStart: (track, agentKey, agentName) => {
      setTrackActive(track, agentKey);
      logger.info(`Track ${track} Agent 开始: ${agentName}`);
    },
    onTrackLog: (track, agentKey, _agentName, message) => {
      if (!message) return;
      appendLogToTrack(track, agentKey, message);
    },
    onCodeChunk: (code, fullHtml) => {
      setTrackA((prev) => ({ ...prev, codeLength: fullHtml.length, tokenCount: prev.tokenCount + code.length }));
    },
    onTrackCodeChunk: (track, code, fullHtml) => {
      const setter = track === 'A' ? setTrackA : setTrackB;
      setter((prev) => ({
        ...prev,
        codeLength: fullHtml.length,
        tokenCount: prev.tokenCount + code.length,
      }));
    },
    onTrackAgentDone: (track, agentKey) => {
      setTrackAgentDone(track, agentKey);
    },
    onTrackDone: (track) => {
      setTrackDone(track);
    },
    onDone: () => {
      if (!isRaceMode) {
        setTrackDone('A');
      }
      void refreshUser();
      toast.success(isRebuild ? '迭代修改完成' : '项目构建完成');
      const targetId = projectIdRef.current;
      if (targetId && !isRebuild) {
        setTimeout(() => {
          navigate(`/dashboard/projects/${targetId}`);
        }, 1500);
      }
      if (targetId && isRebuild) {
        setTimeout(() => {
          navigate(`/dashboard/projects/${targetId}`, { replace: true });
        }, 1000);
      }
    },
    onRaceDone: () => {
      setTrackDone('A');
      setTrackDone('B');
      void refreshUser();
      toast.success('竞速构建完成');
      const targetId = projectIdRef.current;
      if (targetId && !isRebuild) {
        setTimeout(() => {
          navigate(`/dashboard/projects/${targetId}`);
        }, 1500);
      }
      if (targetId && isRebuild) {
        setTimeout(() => {
          navigate(`/dashboard/projects/${targetId}`, { replace: true });
        }, 1000);
      }
    },
    onError: (errMsg) => {
      setError(errMsg);
      setTrackA((p) => ({ ...p, isTyping: false }));
      setTrackB((p) => ({ ...p, isTyping: false }));
      logger.error('构建失败', errMsg);
      toast.error((isRebuild ? '修改失败: ' : '构建失败: ') + errMsg);
      void refreshUser();
    },
    onFixerStart: (round) => {
      setTrackA((prev) => ({
        ...prev,
        activeIndex: allAgents.length - 1,
        isTyping: true,
        fixerRounds: round,
      }));
    },
    onFixerLog: (_round, message) => {
      appendLogToTrack('A', 'fixer', message);
    },
    onFixerDone: (round, score) => {
      setTrackA((prev) => ({
        ...prev,
        fixerRounds: round,
        finalScore: score,
        isTyping: false,
      }));
    },
    onTrackFixerStart: (track, round) => {
      const setter = track === 'A' ? setTrackA : setTrackB;
      setter((prev) => ({
        ...prev,
        activeIndex: allAgents.length - 1,
        isTyping: true,
        fixerRounds: round,
      }));
    },
    onTrackFixerLog: (track, _round, message) => {
      appendLogToTrack(track, 'fixer', message);
    },
    onTrackFixerDone: (track, round, score) => {
      const setter = track === 'A' ? setTrackA : setTrackB;
      setter((prev) => ({
        ...prev,
        fixerRounds: round,
        finalScore: score,
        isTyping: false,
      }));
    },
  }), [appendLogToTrack, setTrackActive, setTrackAgentDone, setTrackDone, isRaceMode, refreshUser, navigate]);

  useEffect(() => {
    if (streamStartedRef.current) return;

    if (state?.createData) {
      streamStartedRef.current = true;
      setIsRaceMode(state.createData.raceMode ?? false);
      const callbacks = buildRaceCallbacks(false);
      projectsApi.streamCreateProject(state.createData, callbacks)
        .catch((err) => {
          logger.error('流式构建异常', err);
          setError(err instanceof Error ? err.message : '构建失败');
          streamStartedRef.current = false;
        });
      return;
    }

    if (state?.isRebuild && state?.rebuildData && id) {
      streamStartedRef.current = true;
      const callbacks = buildRaceCallbacks(true);
      projectsApi.streamRebuildProject(id, state.rebuildData, callbacks)
        .catch((err) => {
          logger.error('流式重建异常', err);
          setError(err instanceof Error ? err.message : '构建失败');
          streamStartedRef.current = false;
        });
      return;
    }

    if (!id) {
      setLoading(false);
      setError('未找到项目信息');
      return;
    }

    let mounted = true;
    const fetchProject = async () => {
      try {
        const data = await projectsApi.getProject(id);
        if (mounted) {
          setProject(data);
          setIsRaceMode(data.raceMode ?? false);
          projectIdRef.current = data.id;
          setLoading(false);
          if (data.status === 'completed') {
            setTrackA((prev) => ({ ...prev, complete: true, progress: 100, activeIndex: allAgents.length }));
            const logsMap: Record<string, string[]> = { pm: [], architect: [], engineer: [], reviewer: [], fixer: [] };
            data.agentLogs.forEach((log) => {
              if (logsMap[log.agent]) {
                logsMap[log.agent].push(log.message);
              }
            });
            setTrackA((prev) => ({ ...prev, logs: logsMap, fixerRounds: data.fixerRounds ?? 0, finalScore: data.finalScore ?? 0 }));
          } else if (data.status === 'failed') {
            setError('项目构建失败，请重试');
          }
        }
      } catch (err) {
        if (mounted) {
          logger.error('获取项目失败', err);
          setError('获取项目信息失败');
          setLoading(false);
        }
      }
    };
    void fetchProject();
    return () => {
      mounted = false;
    };
  }, [id, state, buildRaceCallbacks]);

  const getAgentStatusForTrack = (
    track: TrackState,
    index: number,
  ): 'waiting' | 'working' | 'done' => {
    if (index < track.activeIndex || track.complete) return 'done';
    if (index === track.activeIndex && !track.complete && !error) return 'working';
    return 'waiting';
  };

  if (loading) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  if (error && !trackA.complete && !trackB.complete) {
    return (
      <div className="min-h-full bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-red-500 text-lg font-medium">构建失败</div>
        <div className="text-slate-600 text-sm max-w-md text-center">{error}</div>
        <button
          onClick={() => navigate('/dashboard/projects')}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          返回项目列表
        </button>
      </div>
    );
  }

  const renderTrackColumn = (track: TrackState, trackLabel: 'A' | 'B', trackColor: string) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 rounded-full ${trackColor} flex items-center justify-center text-white font-bold text-sm`}>
          {trackLabel}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700">
              赛道 {trackLabel} {trackLabel === 'A' ? '（Turbo 高创意）' : '（Lite 高精度）'}
            </span>
            <span className="text-sm font-semibold text-violet-600">{Math.round(track.progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${track.progress}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 flex items-center justify-between">
            <span>累计 Token: <span className="font-mono font-semibold text-slate-700">{track.tokenCount.toLocaleString()}</span></span>
            <span>代码: <span className="font-mono font-semibold text-slate-700">{track.codeLength.toLocaleString()}</span> 字符</span>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {BASE_AGENTS.map((agent, index) => (
          <AgentCard
            key={agent.key}
            agent={agent}
            status={getAgentStatusForTrack(track, index)}
            logs={track.logs[agent.key] || []}
            isTyping={index === track.activeIndex && track.isTyping && !track.complete}
            codeProgress={agent.key === 'engineer' && track.activeIndex === 2 && !track.complete ? track.codeLength : 0}
          />
        ))}
        {(track.fixerRounds > 0 || track.logs.fixer?.length > 0) && (
          <AgentCard
            agent={FIXER_AGENT}
            status={getAgentStatusForTrack(track, BASE_AGENTS.length)}
            logs={track.logs.fixer || []}
            isTyping={track.activeIndex === BASE_AGENTS.length && track.isTyping && !track.complete}
          />
        )}
        {track.finalScore > 0 && (
          <div className="text-sm text-slate-500 px-2">
            最终评分: <span className="font-semibold text-emerald-600">{track.finalScore}/10</span>
            {track.fixerRounds > 0 && ` · 自动修复 ${track.fixerRounds} 轮`}
          </div>
        )}
      </div>
    </div>
  );

  const overallProgress = isRaceMode
    ? ((trackA.progress + trackB.progress) / 2)
    : trackA.progress;

  return (
    <div className="min-h-full bg-slate-50 py-8 px-8">
      <div className={isRaceMode ? 'max-w-6xl mx-auto' : 'max-w-3xl mx-auto'}>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {project?.name || '构建中...'}
              </h1>
              {isRaceMode && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                  <Trophy className="w-3.5 h-3.5" />
                  竞速模式
                </span>
              )}
            </div>
            <span className="text-lg font-semibold text-violet-600">{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {trackA.complete && (!isRaceMode || trackB.complete)
              ? '构建完成，正在跳转...'
              : isRaceMode
                ? '双赛道并行生成中...'
                : trackA.activeIndex < allAgents.length && allAgents[trackA.activeIndex]
                  ? `${allAgents[trackA.activeIndex].name} 正在工作...`
                  : '准备中...'}
          </div>
        </div>

        {isRaceMode ? (
          <div className="flex gap-6">
            {renderTrackColumn(trackA, 'A', 'bg-sky-500')}
            <div className="w-px bg-slate-200 flex-shrink-0" />
            {renderTrackColumn(trackB, 'B', 'bg-emerald-500')}
          </div>
        ) : (
          <div className="space-y-5">
            {BASE_AGENTS.map((agent, index) => (
              <AgentCard
                key={agent.key}
                agent={agent}
                status={getAgentStatusForTrack(trackA, index)}
                logs={trackA.logs[agent.key] || []}
                isTyping={index === trackA.activeIndex && trackA.isTyping && !trackA.complete && !error}
                codeProgress={agent.key === 'engineer' && trackA.activeIndex === 2 && !trackA.complete ? trackA.codeLength : 0}
              />
            ))}
            {(trackA.fixerRounds > 0 || trackA.logs.fixer?.length > 0) && (
              <AgentCard
                agent={FIXER_AGENT}
                status={getAgentStatusForTrack(trackA, BASE_AGENTS.length)}
                logs={trackA.logs.fixer || []}
                isTyping={trackA.activeIndex === BASE_AGENTS.length && trackA.isTyping && !trackA.complete}
              />
            )}
            {trackA.finalScore > 0 && (
              <div className="text-sm text-slate-500 px-2">
                最终评分: <span className="font-semibold text-emerald-600">{trackA.finalScore}/10</span>
                {trackA.fixerRounds > 0 && ` · 自动修复 ${trackA.fixerRounds} 轮`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuildPage;
