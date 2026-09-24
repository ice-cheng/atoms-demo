import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronLeft,
  Globe,
  History,
  ArrowLeft,
  Zap,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MousePointer2,
  Trophy,
  Palette,
  Check,
  X,
  Smartphone,
  Tablet,
  Monitor,
  AlertTriangle,
  Bug,
  ChevronRight,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { projects } from '@client/src/api';
import type { StreamBuildCallbacks } from '@client/src/api/projects';
import { useAuth } from '@client/src/contexts/AuthContext';
import type { Project, ProjectVersion } from '@shared/api.interface';
import { Textarea } from '@client/src/components/ui/textarea';
import { Button } from '@client/src/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import CodeViewer from './CodeViewer';
import BuildLogViewer from './BuildLogViewer';
import DetailPanel from './DetailPanel';
import VersionDiffView from './VersionDiffView';

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('preview');

  // Click-to-Edit
  const [clickToEditEnabled, setClickToEditEnabled] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<{ tag: string; selector: string } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Device preview
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Runtime error detection
  const [runtimeErrors, setRuntimeErrors] = useState<Array<{ message: string; line?: string; stack?: string; type: string }>>([]);
  const [errorPanelOpen, setErrorPanelOpen] = useState(false);
  const [debuggerRunning, setDebuggerRunning] = useState(false);
  const [debuggerLogs, setDebuggerLogs] = useState<string[]>([]);
  const debuggerStartedRef = useRef(false);

  // Version diff comparison
  const [diffMode, setDiffMode] = useState(false);
  const [diffLeftVersionId, setDiffLeftVersionId] = useState<string | null>(null);
  const [diffRightVersionId, setDiffRightVersionId] = useState<string | null>(null);
  const [diffSplitterPos, setDiffSplitterPos] = useState(50);

  // Race mode
  const [raceCompareMode, setRaceCompareMode] = useState(false);
  const [selectingWinner, setSelectingWinner] = useState(false);

  // Inline modification state
  const [modifyPrompt, setModifyPrompt] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [modifyLogs, setModifyLogs] = useState<string[]>([]);
  const [modifyPanelOpen, setModifyPanelOpen] = useState(true);
  const [livePreviewHtml, setLivePreviewHtml] = useState<string | null>(null);
  const modifyStartedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    const loadProject = async () => {
      try {
        setLoading(true);
        const data = await projects.getProject(id);
        setProject(data);
        setRaceCompareMode(!!(data.raceMode && data.raceHtmlA && data.raceHtmlB && !data.raceWinner));
      } catch (error) {
        logger.error('加载项目失败', error);
        toast.error('加载项目失败');
      } finally {
        setLoading(false);
      }
    };
    void loadProject();
  }, [id]);

  const isViewingLatest = !currentVersionId;

  const handleProjectUpdated = useCallback((updated: Project) => {
    setProject(updated);
  }, []);

  const displayHtml = useMemo(() => {
    if (livePreviewHtml) return livePreviewHtml;
    if (!project) return '';
    if (currentVersionId) {
      const v = project.versions.find(
        (v: ProjectVersion) => v.id === currentVersionId,
      );
      return v?.html || '';
    }
    return project.generatedHtml;
  }, [project, currentVersionId, livePreviewHtml]);

  const modifyCallbacks = useCallback((): StreamBuildCallbacks => ({
    onLog: (_agentKey, _agentName, message) => {
      if (!message) return;
      setModifyLogs((prev) => {
        if (prev.length === 0) return [message];
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), last + message];
      });
    },
    onCodeChunk: (_code, fullHtml) => {
      if (fullHtml) {
        setLivePreviewHtml(fullHtml);
      }
    },
    onDone: async () => {
      setIsModifying(false);
      setLivePreviewHtml(null);
      modifyStartedRef.current = false;
      setModifyLogs((prev) => [...prev, '\n修改完成！']);
      toast.success('修改完成');
      // Refresh project data
      if (id) {
        try {
          const updated = await projects.getProject(id);
          setProject(updated);
        } catch (err) {
          logger.error('刷新项目失败', err);
        }
      }
      void refreshUser();
    },
    onError: (errMsg) => {
      setModifyError(errMsg);
      setIsModifying(false);
      setLivePreviewHtml(null);
      modifyStartedRef.current = false;
      logger.error('修改失败', errMsg);
      toast.error('修改失败: ' + errMsg);
      void refreshUser();
    },
  }), [id, refreshUser]);

  const handleInlineModify = async () => {
    const prompt = modifyPrompt.trim();
    if (!prompt || !project || isModifying) return;
    if (!user || user.credits < 5) {
      toast.error('Credits 不足，无法迭代修改');
      return;
    }

    setIsModifying(true);
    setModifyError(null);
    setModifyLogs([]);
    setModifyPanelOpen(true);
    modifyStartedRef.current = true;

    const newDescription = `${project.description}。修改要求：${prompt}`;

    try {
      await projects.streamRebuildProject(
        project.id,
        { description: newDescription, iteration: true },
        modifyCallbacks(),
      );
    } catch (error) {
      logger.error('流式修改异常', error);
      setModifyError(error instanceof Error ? error.message : '修改失败');
      setIsModifying(false);
      setLivePreviewHtml(null);
      modifyStartedRef.current = false;
      toast.error('修改失败');
    }

    setModifyPrompt('');
  };

  const handleExportHtml = () => {
    if (!project) return;
    try {
      const blob = new Blob([displayHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name || 'project'}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('HTML 已导出');
    } catch (error) {
      logger.error('导出 HTML 失败', error);
      toast.error('导出 HTML 失败');
    }
  };

  const handleVersionClick = (versionId: string) => {
    setCurrentVersionId(versionId);
    setActiveTab('preview');
  };

  const handleBackToLatest = () => {
    setCurrentVersionId(null);
  };

  const handleCompareVersion = (versionId: string) => {
    setDiffLeftVersionId(versionId);
    setDiffRightVersionId(null);
    setDiffMode(true);
    setActiveTab('preview');
  };

  const handleCloseDiff = () => {
    setDiffMode(false);
    setDiffLeftVersionId(null);
    setDiffRightVersionId(null);
  };

  const handleNavigateBuild = (projectId: string) => {
    navigate(`/dashboard/build/${projectId}`);
  };

  const handleSelectWinner = async (winner: 'A' | 'B') => {
    if (!project || selectingWinner) return;
    setSelectingWinner(true);
    try {
      const updated = await projects.selectRaceWinner(project.id, winner);
      setProject(updated);
      setRaceCompareMode(false);
      toast.success(`已选择版本 ${winner} 作为主版本`);
    } catch (error) {
      logger.error('选择获胜版本失败', error);
      toast.error('选择版本失败');
    } finally {
      setSelectingWinner(false);
    }
  };

  const handleApplyBrand = async () => {
    if (!project) return;
    try {
      const updated = await projects.applyBrandKit(project.id);
      setProject(updated);
      toast.success('品牌配置已应用');
      void refreshUser();
    } catch (error) {
      logger.error('应用品牌配置失败', error);
      const msg = error instanceof Error ? error.message : '应用失败';
      toast.error(msg);
    }
  };

  const toggleClickToEdit = () => {
    const next = !clickToEditEnabled;
    setClickToEditEnabled(next);
    if (!next) {
      setHoveredElement(null);
    }
  };

  const handleDebugFix = async () => {
    if (!project || !displayHtml || runtimeErrors.length === 0) return;
    if (!user || user.credits < 5) {
      toast.error('Credits 不足，无法使用智能调试');
      return;
    }
    if (!isViewingLatest) {
      toast.error('请先回到最新版本再进行调试修复');
      return;
    }

    setDebuggerRunning(true);
    setDebuggerLogs([]);
    setErrorPanelOpen(false);
    debuggerStartedRef.current = true;

    const errorSummary = runtimeErrors
      .map((e, i) => `${i + 1}. [${e.type}] ${e.message}${e.line ? ` (${e.line})` : ''}${e.stack ? `\n  Stack: ${e.stack.split('\n').slice(0, 3).join('\n  ')}` : ''}`)
      .join('\n');

    try {
      await projects.streamDebugFix(
        project.id,
        { html: displayHtml, errors: errorSummary },
        {
          onLog: (_agent, _name, message) => {
            if (!message) return;
            setDebuggerLogs((prev) => {
              if (prev.length === 0) return [message];
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), last + message];
            });
          },
          onCodeChunk: (_code, fullHtml) => {
            if (fullHtml) {
              setLivePreviewHtml(fullHtml);
            }
          },
          onDone: async () => {
            setDebuggerRunning(false);
            setLivePreviewHtml(null);
            setRuntimeErrors([]);
            debuggerStartedRef.current = false;
            setDebuggerLogs((prev) => [...prev, '\n调试修复完成！']);
            toast.success('错误已修复');
            if (id) {
              try {
                const updated = await projects.getProject(id);
                setProject(updated);
              } catch (err) {
                logger.error('刷新项目失败', err);
              }
            }
            void refreshUser();
          },
          onError: (errMsg) => {
            setDebuggerRunning(false);
            setLivePreviewHtml(null);
            debuggerStartedRef.current = false;
            logger.error('调试修复失败', errMsg);
            toast.error('修复失败: ' + errMsg);
            void refreshUser();
          },
        },
      );
    } catch (error) {
      logger.error('智能调试异常', error);
      setDebuggerRunning(false);
      setLivePreviewHtml(null);
      debuggerStartedRef.current = false;
      toast.error('修复失败');
    }
  };

  const handleIframeLoad = () => {
    if (!iframeRef.current) return;
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Inject error capture (always)
    const errorCaptureScript = `
      (function() {
        var errors = [];
        window.onerror = function(msg, url, line, col, error) {
          window.parent.postMessage({
            type: 'atom-runtime-error',
            error: {
              message: String(msg),
              line: line + (col ? ':' + col : ''),
              stack: error && error.stack ? error.stack : null,
              type: 'error'
            }
          }, '*');
        };
        window.addEventListener('unhandledrejection', function(e) {
          var reason = e.reason;
          var msg = reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection';
          var stack = reason && reason.stack ? reason.stack : null;
          window.parent.postMessage({
            type: 'atom-runtime-error',
            error: {
              message: msg,
              line: '',
              stack: stack,
              type: 'unhandledrejection'
            }
          }, '*');
        });
        var origError = console.error;
        console.error = function() {
          var args = Array.prototype.slice.call(arguments);
          var msg = args.map(function(a) {
            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return String(a); }
          }).join(' ');
          window.parent.postMessage({
            type: 'atom-runtime-error',
            error: {
              message: msg,
              line: '',
              stack: null,
              type: 'console.error'
            }
          }, '*');
          origError.apply(console, args);
        };
      })();
    `;

    const errorScript = doc.createElement('script');
    errorScript.textContent = errorCaptureScript;
    doc.head.insertBefore(errorScript, doc.head.firstChild);

    setRuntimeErrors([]);

    if (!clickToEditEnabled) return;

    const injectedScript = `
      (function() {
        let lastHighlighted = null;

        function getSelector(el) {
          if (el.id) return '#' + el.id;
          const path = [];
          while (el && el.nodeType === 1 && path.length < 5) {
            let selector = el.nodeName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
              const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
              if (classes) selector += '.' + classes;
            }
            path.unshift(selector);
            el = el.parentElement;
          }
          return path.join(' > ');
        }

        function showLabel(e, el) {
          e.preventDefault();
          e.stopPropagation();
          const tag = el.tagName.toLowerCase();
          const selector = getSelector(el);
          window.parent.postMessage({ type: 'atom-hover', tag, selector }, '*');
        }

        function handleClick(e) {
          e.preventDefault();
          e.stopPropagation();
          const el = e.target;
          const tag = el.tagName.toLowerCase();
          const selector = getSelector(el);
          window.parent.postMessage({ type: 'atom-click', tag, selector }, '*');
        }

        function handleMouseOver(e) {
          const el = e.target;
          if (lastHighlighted && lastHighlighted !== el) {
            lastHighlighted.style.outline = '';
          }
          if (el && el.style) {
            el.style.outline = '2px solid #8b5cf6';
            el.style.outlineOffset = '1px';
            lastHighlighted = el;
            showLabel(e, el);
          }
        }

        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('click', handleClick, true);
      })();
    `;

    const script = doc.createElement('script');
    script.textContent = injectedScript;
    doc.head.appendChild(script);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'atom-hover') {
        setHoveredElement({ tag: event.data.tag, selector: event.data.selector });
      }
      if (event.data?.type === 'atom-click') {
        const tag = event.data.tag as string;
        setModifyPrompt(`修改这个 ${tag} 元素：`);
        setModifyPanelOpen(true);
      }
      if (event.data?.type === 'atom-runtime-error' && event.data.error) {
        setRuntimeErrors((prev) => {
          if (prev.length >= 20) return prev;
          const err = event.data.error;
          const dedup = prev.some(
            (e) => e.message === err.message && e.type === err.type,
          );
          if (dedup) return prev;
          return [...prev, err];
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground">项目不存在</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard/projects')}
          className="shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">
            {project.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            创建于 {new Date(project.createdAt).toLocaleString('zh-CN')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-sm font-medium">
          <Zap className="w-4 h-4" />
          {user?.credits ?? 0} Credits
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="preview">预览</TabsTrigger>
          <TabsTrigger value="code">代码</TabsTrigger>
          <TabsTrigger value="logs">构建日志</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Preview tab */}
      {activeTab === 'preview' && (
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0">
            {!isViewingLatest && (
              <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-amber-800 text-sm">
                  <History className="w-4 h-4" />
                  <span>正在查看历史版本</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBackToLatest}
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  回到最新版本
                </Button>
              </div>
            )}

            {project.raceMode && project.raceHtmlA && project.raceHtmlB && (
              <div className="mb-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant={raceCompareMode ? 'default' : 'outline'}
                  onClick={() => setRaceCompareMode(true)}
                  className={raceCompareMode ? 'bg-amber-500 hover:bg-amber-600' : ''}
                >
                  <Trophy className="w-4 h-4 mr-1.5" />
                  对比竞速版本
                </Button>
                {project.raceWinner && (
                  <span className="text-sm text-slate-500">
                    已选择版本 <span className="font-semibold text-emerald-600">{project.raceWinner}</span>
                  </span>
                )}
              </div>
            )}

            {raceCompareMode && project.raceHtmlA && project.raceHtmlB ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {(['A', 'B'] as const).map((track) => (
                    <div key={track} className="rounded-xl overflow-hidden shadow-md border border-border bg-white">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-border">
                        <span className={`text-sm font-semibold ${track === 'A' ? 'text-sky-600' : 'text-emerald-600'}`}>
                          版本 {track} {track === 'A' ? '（Turbo）' : '（Lite）'}
                        </span>
                        {project.raceWinner === track && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                            已选择
                          </span>
                        )}
                      </div>
                      <iframe
                        srcDoc={track === 'A' ? project.raceHtmlA : project.raceHtmlB}
                        title={`Version ${track}`}
                        className="w-full h-[380px] border-0 bg-white"
                        sandbox="allow-scripts"
                      />
                      {!project.raceWinner && (
                        <div className="p-3 border-t border-border flex justify-center">
                          <Button
                            size="sm"
                            onClick={() => void handleSelectWinner(track)}
                            disabled={selectingWinner}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
                          >
                            <Check className="w-4 h-4 mr-1.5" />
                            选择此版本
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {!project.raceWinner && (
                  <div className="text-center text-sm text-slate-500">
                    对比两个版本，选择你更喜欢的作为主版本（另一版本会保存到历史）
                  </div>
                )}
              </div>
            ) : diffMode ? (
              <VersionDiffView
                project={project}
                leftVersionId={diffLeftVersionId}
                rightVersionId={diffRightVersionId}
                splitterPos={diffSplitterPos}
                onSplitterChange={setDiffSplitterPos}
                onClose={handleCloseDiff}
                onSwapLeft={(id) => setDiffLeftVersionId(id)}
                onSwapRight={(id) => setDiffRightVersionId(id)}
              />
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={clickToEditEnabled ? 'default' : 'outline'}
                      onClick={toggleClickToEdit}
                      className={clickToEditEnabled ? 'bg-violet-600 hover:bg-violet-700' : ''}
                    >
                      <MousePointer2 className="w-4 h-4 mr-1.5" />
                      点选编辑
                    </Button>
                    {clickToEditEnabled && hoveredElement && (
                      <span className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-md font-mono">
                        {hoveredElement.tag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 rounded-md p-0.5 border border-border">
                      <Button
                        size="icon"
                        variant={deviceMode === 'mobile' ? 'default' : 'ghost'}
                        className={`h-7 w-7 ${deviceMode === 'mobile' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setDeviceMode('mobile')}
                        title="手机 (375px)"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant={deviceMode === 'tablet' ? 'default' : 'ghost'}
                        className={`h-7 w-7 ${deviceMode === 'tablet' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setDeviceMode('tablet')}
                        title="平板 (768px)"
                      >
                        <Tablet className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant={deviceMode === 'desktop' ? 'default' : 'ghost'}
                        className={`h-7 w-7 ${deviceMode === 'desktop' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setDeviceMode('desktop')}
                        title="桌面 (100%)"
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleApplyBrand()}
                    >
                      <Palette className="w-4 h-4 mr-1.5" />
                      应用品牌配置
                    </Button>
                  </div>
                </div>

                {runtimeErrors.length > 0 ? (
                  <div className="mb-3 border border-amber-300 bg-amber-50 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-2.5 text-amber-800 hover:bg-amber-100 transition-colors"
                      onClick={() => setErrorPanelOpen(!errorPanelOpen)}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>检测到 {runtimeErrors.length} 个运行时错误</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDebugFix();
                          }}
                          disabled={debuggerRunning || !isViewingLatest}
                          className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                          <Bug className="w-3.5 h-3.5 mr-1.5" />
                          一键修复
                        </Button>
                        {errorPanelOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </button>
                    {errorPanelOpen && (
                      <div className="border-t border-amber-200 bg-white p-3 max-h-48 overflow-y-auto space-y-2">
                        {runtimeErrors.map((err, i) => (
                          <div key={i} className="text-xs font-mono bg-amber-50 border border-amber-200 rounded p-2">
                            <div className="text-amber-700 font-medium mb-1">
                              [{err.type}] {err.message}
                            </div>
                            {err.line && (
                              <div className="text-amber-600">行: {err.line}</div>
                            )}
                            {err.stack && (
                              <div className="text-amber-500 mt-1 whitespace-pre-wrap break-all">
                                {err.stack.split('\n').slice(0, 3).join('\n')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  project.status === 'completed' && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <Check className="w-3.5 h-3.5" />
                      <span>运行时正常，无错误</span>
                    </div>
                  )
                )}

                {debuggerRunning && (
                  <div className="mb-3 bg-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                    {debuggerLogs.length === 0 && (
                      <div className="text-slate-500">AI 调试器正在分析错误...</div>
                    )}
                    {debuggerLogs.map((line: string, i: number) => (
                      <div key={i} className="whitespace-pre-wrap break-words">
                        {line}
                      </div>
                    ))}
                  </div>
                )}

                <div className={`rounded-xl overflow-hidden shadow-md border border-border bg-white relative transition-all duration-300 mx-auto ${
                  deviceMode === 'mobile' ? 'max-w-[375px]' :
                  deviceMode === 'tablet' ? 'max-w-[768px]' : ''
                }`}>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-border">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex items-center gap-1.5 bg-white rounded-md px-3 py-1 text-xs text-muted-foreground w-full max-w-md border border-border">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{project.name}.atoms.demo</span>
                      </div>
                    </div>
                    <div className="w-12" />
                  </div>
                   <div className="bg-white">
                     <iframe
                       ref={iframeRef}
                       srcDoc={displayHtml}
                       title={project.name}
                       className="w-full h-[520px] border-0 bg-white"
                       sandbox="allow-scripts"
                       onLoad={handleIframeLoad}
                     />
                   </div>
                   {clickToEditEnabled && (
                     <div className="absolute top-14 right-3 bg-violet-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-10 pointer-events-none">
                       点击页面元素进行编辑
                     </div>
                   )}
                </div>
              </>
            )}

             {/* Inline conversational modification */}
             <div className="mt-6 rounded-xl border border-border bg-white shadow-sm overflow-hidden">
               <button
                 onClick={() => setModifyPanelOpen(!modifyPanelOpen)}
                 className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-border hover:bg-slate-100 transition-colors"
               >
                 <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                   <Sparkles className="w-4 h-4 text-violet-500" />
                   对话式修改
                   {isModifying && (
                     <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                       <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                       修改中...
                     </span>
                   )}
                 </div>
                 {modifyPanelOpen ? (
                   <ChevronUp className="w-4 h-4 text-muted-foreground" />
                 ) : (
                   <ChevronDown className="w-4 h-4 text-muted-foreground" />
                 )}
               </button>

               {modifyPanelOpen && (
                 <div className="p-4 space-y-4">
                   {(isModifying || modifyLogs.length > 0) && (
                     <div className="bg-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                       {modifyLogs.length === 0 && isModifying && (
                         <div className="text-slate-500">正在准备修改...</div>
                       )}
                       {modifyLogs.map((line: string, i: number) => (
                         <div key={i} className="whitespace-pre-wrap break-words">
                           {line}
                         </div>
                       ))}
                     </div>
                   )}

                   {modifyError && (
                     <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                       {modifyError}
                     </div>
                   )}

                   <div className="flex gap-3 items-end">
                     <div className="flex-1">
                       <Textarea
                         value={modifyPrompt}
                         onChange={(e) => setModifyPrompt(e.target.value)}
                         placeholder="描述你想要的修改，例如：把主题色改成蓝色、添加一个导航栏..."
                         className="min-h-[60px] text-sm resize-none"
                         disabled={isModifying}
                         onKeyDown={(e) => {
                           if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                             e.preventDefault();
                             void handleInlineModify();
                           }
                         }}
                       />
                       <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
                         <Zap className="w-3 h-3 text-violet-500" />
                         每次修改消耗 5 Credits
                         <span className="ml-2 text-slate-400">
                           (⌘/Ctrl + Enter 发送)
                         </span>
                       </div>
                     </div>
                     <Button
                       onClick={() => void handleInlineModify()}
                       disabled={!modifyPrompt.trim() || isModifying || !isViewingLatest}
                       className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 h-10 px-4 shrink-0"
                     >
                       {isModifying ? (
                         <>
                           <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                           修改中
                         </>
                       ) : (
                         <>
                           <Send className="w-4 h-4 mr-2" />
                           发送
                         </>
                       )}
                     </Button>
                   </div>

                   {!isViewingLatest && (
                     <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                       请先回到最新版本再进行修改
                     </div>
                   )}
                 </div>
               )}
             </div>
           </div>

          <DetailPanel
            project={project}
            currentVersionId={currentVersionId}
            onVersionClick={handleVersionClick}
            onExport={handleExportHtml}
            onNavigateBuild={handleNavigateBuild}
            onProjectUpdated={handleProjectUpdated}
            onCompareClick={handleCompareVersion}
          />
        </div>
      )}

      {/* Code tab */}
      {activeTab === 'code' && <CodeViewer code={displayHtml} />}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <BuildLogViewer logs={project.agentLogs || []} />
      )}
    </div>
  );
};

export default ProjectDetailPage;
