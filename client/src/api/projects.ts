import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';

function getCsrfTokenFromCookie(): string {
  const name = 'suda-csrf-token';
  const cookies = document.cookie.split('; ');
  for (const cookie of cookies) {
    const [k, v] = cookie.split('=');
    if (k === name) return decodeURIComponent(v);
  }
  return '';
}
import type {
  Project,
  CreateProjectRequest,
  RebuildProjectRequest,
  DebugFixRequest,
  ProjectListResponse,
  DashboardStats,
  AgentLogEntry,
  ShareProjectResponse,
  SharedProjectResponse,
} from '@shared/api.interface';

export interface StreamBuildEvent {
  type: 'project_created' | 'rebuild_started' | 'agent_start' | 'log' | 'code_chunk' | 'agent_done' | 'done' | 'error' | 'fixer_start' | 'fixer_log' | 'fixer_done' | 'race_done';
  agent?: AgentLogEntry['agent'];
  agentName?: string;
  message?: string;
  code?: string;
  fullHtml?: string;
  htmlA?: string;
  htmlB?: string;
  error?: string;
  timestamp?: string;
  project?: Project;
  track?: 'A' | 'B';
  round?: number;
  score?: number;
  fixIssues?: string[];
}

export interface StreamBuildCallbacks {
  onProjectCreated?: (project: Project) => void;
  onAgentStart?: (agent: string, agentName: string) => void;
  onLog?: (agent: string, agentName: string, message: string) => void;
  onCodeChunk?: (code: string, fullHtml: string) => void;
  onAgentDone?: (agent: string, agentName: string) => void;
  onDone?: (fullHtml: string) => void;
  onRaceDone?: (htmlA: string, htmlB: string) => void;
  onError?: (error: string) => void;
}

export interface RaceStreamBuildCallbacks extends StreamBuildCallbacks {
  onTrackLog?: (track: 'A' | 'B', agent: string, agentName: string, message: string) => void;
  onTrackAgentStart?: (track: 'A' | 'B', agent: string, agentName: string) => void;
  onTrackAgentDone?: (track: 'A' | 'B', agent: string, agentName: string) => void;
  onTrackCodeChunk?: (track: 'A' | 'B', code: string, fullHtml: string) => void;
  onTrackDone?: (track: 'A' | 'B', fullHtml: string) => void;
  onTrackFixerStart?: (track: 'A' | 'B', round: number) => void;
  onTrackFixerLog?: (track: 'A' | 'B', round: number, message: string) => void;
  onTrackFixerDone?: (track: 'A' | 'B', round: number, score: number) => void;
  onFixerStart?: (round: number) => void;
  onFixerLog?: (round: number, message: string) => void;
  onFixerDone?: (round: number, score: number) => void;
}

const getHeaders = () => {
  const token = localStorage.getItem('atoms_demo_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function getProjects(): Promise<ProjectListResponse> {
  try {
    const response = await axiosForBackend.get('/api/projects', {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('获取项目列表失败', error);
    throw error;
  }
}

export async function getProject(id: string): Promise<Project> {
  try {
    const response = await axiosForBackend.get(`/api/projects/${id}`, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('获取项目详情失败', error);
    throw error;
  }
}

export async function createProject(data: CreateProjectRequest): Promise<Project> {
  try {
    const response = await axiosForBackend.post('/api/projects', data, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('创建项目失败', error);
    throw error;
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await axiosForBackend.delete(`/api/projects/${id}`, {
      headers: getHeaders(),
    });
  } catch (error) {
    logger.error('删除项目失败', error);
    throw error;
  }
}

export async function rebuildProject(
  id: string,
  data?: RebuildProjectRequest,
): Promise<Project> {
  try {
    const response = await axiosForBackend.post(
      `/api/projects/${id}/rebuild`,
      data ?? {},
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('重新构建失败', error);
    throw error;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const response = await axiosForBackend.get('/api/projects/stats/dashboard', {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('获取统计数据失败', error);
    throw error;
  }
}

export async function getProjectPreview(id: string): Promise<{ html: string }> {
  try {
    const response = await axiosForBackend.get(`/api/projects/${id}/preview`, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('获取预览失败', error);
    throw error;
  }
}

export async function shareProject(id: string): Promise<ShareProjectResponse> {
  try {
    const response = await axiosForBackend.post(
      `/api/projects/${id}/share`,
      {},
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('生成分享链接失败', error);
    throw error;
  }
}

export async function unshareProject(id: string): Promise<{ success: boolean }> {
  try {
    const response = await axiosForBackend.delete(
      `/api/projects/${id}/share`,
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('取消分享失败', error);
    throw error;
  }
}

export async function getSharedProject(
  token: string,
): Promise<SharedProjectResponse> {
  try {
    const response = await axiosForBackend.get(
      `/openapi/projects/share/${token}`,
    );
    return response.data;
  } catch (error) {
    logger.error('获取分享项目失败', error);
    throw error;
  }
}

export async function rollbackVersion(
  id: string,
  versionId: string,
): Promise<Project> {
  try {
    const response = await axiosForBackend.post(
      `/api/projects/${id}/rollback`,
      { versionId },
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('版本回退失败', error);
    throw error;
  }
}

export async function selectRaceWinner(
  id: string,
  winner: 'A' | 'B',
): Promise<Project> {
  try {
    const response = await axiosForBackend.post(
      `/api/projects/${id}/race/winner`,
      { winner },
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('选择获胜版本失败', error);
    throw error;
  }
}

export async function applyBrandKit(id: string): Promise<Project> {
  try {
    const response = await axiosForBackend.post(
      `/api/projects/${id}/apply-brand`,
      {},
      {
        headers: getHeaders(),
      },
    );
    return response.data;
  } catch (error) {
    logger.error('应用品牌配置失败', error);
    throw error;
  }
}

function buildStreamUrl(path: string): string {
  const base = (axiosForBackend.defaults.baseURL || '').replace(/\/$/, '');
  if (base.includes('/api')) {
    return base.replace(/\/api$/, '') + path;
  }
  return base + path;
}

export async function streamCreateProject(
  data: CreateProjectRequest,
  callbacks: StreamBuildCallbacks,
): Promise<void> {
  const token = localStorage.getItem('atoms_demo_token');
  const csrfToken = getCsrfTokenFromCookie() || (window.csrfToken ?? '');
  // eslint-disable-next-line no-restricted-syntax -- SSE 流式读取必须使用 fetch + ReadableStream，axios 不支持
  const response = await fetch(buildStreamUrl('/api/projects/stream/generate'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Suda-Csrf-Token': csrfToken || '',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errText = await response.text();
    callbacks.onError?.(`请求失败: ${response.status} ${errText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError?.('无法读取响应流');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let eventType = '';
      let eventData = '';
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6).trim();
        } else if (line === '' && eventType) {
          try {
            const parsed = JSON.parse(eventData) as StreamBuildEvent;
            handleStreamEvent(parsed, eventType, callbacks);
          } catch {
            logger.warn('解析 SSE 事件失败', eventType, eventData);
          }
          eventType = '';
          eventData = '';
        }
      }
    }
  } catch (error) {
    logger.error('流式创建项目失败', error);
    callbacks.onError?.(error instanceof Error ? error.message : '未知错误');
  }
}

export async function streamRebuildProject(
  id: string,
  data: RebuildProjectRequest,
  callbacks: StreamBuildCallbacks,
): Promise<void> {
  const token = localStorage.getItem('atoms_demo_token');
  const csrfToken = getCsrfTokenFromCookie() || (window.csrfToken ?? '');
  // eslint-disable-next-line no-restricted-syntax -- SSE 流式读取必须使用 fetch + ReadableStream，axios 不支持
  const response = await fetch(buildStreamUrl(`/api/projects/${id}/rebuild/stream`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Suda-Csrf-Token': csrfToken || '',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errText = await response.text();
    callbacks.onError?.(`请求失败: ${response.status} ${errText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError?.('无法读取响应流');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let eventType = '';
      let eventData = '';
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6).trim();
        } else if (line === '' && eventType) {
          try {
            const parsed = JSON.parse(eventData) as StreamBuildEvent;
            handleStreamEvent(parsed, eventType, callbacks);
          } catch {
            logger.warn('解析 SSE 事件失败', eventType, eventData);
          }
          eventType = '';
          eventData = '';
        }
      }
    }
  } catch (error) {
    logger.error('流式重建失败', error);
    callbacks.onError?.(error instanceof Error ? error.message : '未知错误');
  }
}

export async function streamDebugFix(
  id: string,
  data: DebugFixRequest,
  callbacks: StreamBuildCallbacks,
): Promise<void> {
  const token = localStorage.getItem('atoms_demo_token');
  const csrfToken = getCsrfTokenFromCookie() || (window.csrfToken ?? '');
  // eslint-disable-next-line no-restricted-syntax -- SSE 流式读取必须使用 fetch + ReadableStream，axios 不支持
  const response = await fetch(buildStreamUrl(`/api/projects/${id}/debug/stream`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Suda-Csrf-Token': csrfToken || '',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errText = await response.text();
    callbacks.onError?.(`请求失败: ${response.status} ${errText}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError?.('无法读取响应流');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let eventType = '';
      let eventData = '';
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6).trim();
        } else if (line === '' && eventType) {
          try {
            const parsed = JSON.parse(eventData) as StreamBuildEvent;
            handleStreamEvent(parsed, eventType, callbacks);
          } catch {
            logger.warn('解析 SSE 事件失败', eventType, eventData);
          }
          eventType = '';
          eventData = '';
        }
      }
    }
  } catch (error) {
    logger.error('智能调试失败', error);
    callbacks.onError?.(error instanceof Error ? error.message : '未知错误');
  }
}

function handleStreamEvent(
  event: StreamBuildEvent,
  eventType: string,
  callbacks: StreamBuildCallbacks,
): void {
  const trackCallbacks = callbacks as import('./projects').RaceStreamBuildCallbacks;

  switch (eventType) {
    case 'project_created':
    case 'rebuild_started': {
      const proj = event as unknown as Project;
      if (proj && proj.id) {
        callbacks.onProjectCreated?.(proj);
      }
      break;
    }
    case 'agent_start':
      if (event.track && trackCallbacks.onTrackAgentStart) {
        trackCallbacks.onTrackAgentStart(event.track, event.agent || '', event.agentName || '');
      } else {
        callbacks.onAgentStart?.(event.agent || '', event.agentName || '');
      }
      break;
    case 'log':
      if (event.track && trackCallbacks.onTrackLog) {
        trackCallbacks.onTrackLog(event.track, event.agent || '', event.agentName || '', event.message || '');
      } else {
        callbacks.onLog?.(event.agent || '', event.agentName || '', event.message || '');
      }
      break;
    case 'code_chunk':
      if (event.track && trackCallbacks.onTrackCodeChunk) {
        trackCallbacks.onTrackCodeChunk(event.track, event.code || '', event.fullHtml || '');
      } else {
        callbacks.onCodeChunk?.(event.code || '', event.fullHtml || '');
      }
      break;
    case 'agent_done':
      if (event.track && trackCallbacks.onTrackAgentDone) {
        trackCallbacks.onTrackAgentDone(event.track, event.agent || '', event.agentName || '');
      } else {
        callbacks.onAgentDone?.(event.agent || '', event.agentName || '');
      }
      break;
    case 'done':
      if (event.track && trackCallbacks.onTrackDone) {
        trackCallbacks.onTrackDone(event.track, event.fullHtml || '');
      } else {
        callbacks.onDone?.(event.fullHtml || '');
      }
      break;
    case 'race_done':
      callbacks.onRaceDone?.(event.htmlA || '', event.htmlB || '');
      break;
    case 'error':
      callbacks.onError?.(event.error || '生成失败');
      break;
    case 'fixer_start':
      if (event.track && trackCallbacks.onTrackFixerStart) {
        trackCallbacks.onTrackFixerStart(event.track, event.round ?? 1);
      } else {
        trackCallbacks.onFixerStart?.(event.round ?? 1);
      }
      break;
    case 'fixer_log':
      if (event.track && trackCallbacks.onTrackFixerLog) {
        trackCallbacks.onTrackFixerLog(event.track, event.round ?? 1, event.message || '');
      } else {
        trackCallbacks.onFixerLog?.(event.round ?? 1, event.message || '');
      }
      break;
    case 'fixer_done':
      if (event.track && trackCallbacks.onTrackFixerDone) {
        trackCallbacks.onTrackFixerDone(event.track, event.round ?? 1, event.score ?? 0);
      } else {
        trackCallbacks.onFixerDone?.(event.round ?? 1, event.score ?? 0);
      }
      break;
  }
}
