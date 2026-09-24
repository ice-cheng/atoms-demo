import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Globe, AlertCircle, Sparkles } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { projects } from '@client/src/api';
import type { SharedProjectResponse } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';

const SharePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [project, setProject] = useState<SharedProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('分享链接无效');
      return;
    }
    const loadSharedProject = async () => {
      try {
        setLoading(true);
        const data = await projects.getSharedProject(token);
        setProject(data);
      } catch (err) {
        logger.error('加载分享项目失败', err);
        setError('分享链接无效或已过期');
        toast.error('分享链接无效或已过期');
      } finally {
        setLoading(false);
      }
    };
    void loadSharedProject();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="text-slate-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl border border-border p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            分享链接无效
          </h1>
          <p className="text-slate-500 mb-6">
            {error || '该分享链接不存在或已被取消分享'}
          </p>
          <Button asChild className="w-full">
            <Link to="/">返回首页</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">Atoms</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">开始创建自己的应用</Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Project info */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {project.name}
            </h1>
            <p className="text-slate-500 max-w-2xl mx-auto">
              {project.description}
            </p>
          </div>

          {/* Browser-style iframe preview */}
          <div className="rounded-xl overflow-hidden shadow-2xl border border-border bg-white">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-border">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-1.5 bg-white rounded-md px-3 py-1 text-xs text-muted-foreground w-full max-w-md border border-border">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {project.name.toLowerCase().replace(/\s+/g, '-')}.atoms.demo
                  </span>
                </div>
              </div>
              <div className="w-12" />
            </div>
            <div className="bg-white">
              <iframe
                srcDoc={project.generatedHtml}
                title={project.name}
                className="w-full h-[600px] border-0 bg-white"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span>
            Built with{' '}
            <Link
              to="/"
              className="text-violet-500 hover:text-violet-600 font-medium"
            >
              Atoms
            </Link>{' '}
            — AI Native App Builder
          </span>
        </div>
      </footer>
    </div>
  );
};

export default SharePage;
