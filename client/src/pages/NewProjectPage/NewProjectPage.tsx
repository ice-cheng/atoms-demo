import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, Zap, Palette, ArrowRight, Trophy, Info } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { templates as templatesApi } from '@client/src/api/index';
import type { AppStyle } from '@shared/api.interface';
import { useAuth } from '@client/src/contexts/AuthContext';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import { Card, CardContent } from '@client/src/components/ui/card';

interface StyleOption {
  id: AppStyle;
  name: string;
  description: string;
  previewBg: string;
  previewAccent: string;
}

const styleOptions: StyleOption[] = [
  {
    id: 'minimal',
    name: '简约白',
    description: '白底灰边，干净简洁',
    previewBg: 'bg-white',
    previewAccent: 'bg-slate-200',
  },
  {
    id: 'dark',
    name: '暗色科技',
    description: '深色背景，霓虹点缀',
    previewBg: 'bg-slate-900',
    previewAccent: 'bg-cyan-400',
  },
  {
    id: 'gradient',
    name: '渐变活力',
    description: '渐变背景，鲜艳色彩',
    previewBg: 'bg-gradient-to-br from-violet-500 to-pink-500',
    previewAccent: 'bg-white/30',
  },
  {
    id: 'professional',
    name: '专业商务',
    description: '蓝色系，稳重',
    previewBg: 'bg-blue-50',
    previewAccent: 'bg-blue-600',
  },
];

const quickTemplates = ['todo', 'blog', 'dashboard', 'landing'];

const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { description?: string } | null;
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<AppStyle>('minimal');
  const [raceMode, setRaceMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const BUILD_COST = raceMode ? 20 : 10;
  const hasEnoughCredits = (user?.credits ?? 0) >= BUILD_COST;

  useEffect(() => {
    if (state?.description) {
      setDescription(state.description);
    }
  }, [state]);

  const handleTemplateClick = (templateId: string) => {
    const desc = templatesApi.getTemplateDescription(templateId);
    setDescription(desc);
  };

  const handleSubmit = async () => {
    if (!description.trim() || isCreating) return;
    if (!hasEnoughCredits) {
      toast.error('Credits 不足，无法开始构建');
      return;
    }

    setIsCreating(true);
    try {
      const createData = {
        name: name.trim() || undefined,
        description: description.trim(),
        style,
        raceMode,
      };
      navigate('/dashboard/build/new', {
        state: { createData },
      });
    } catch (error: any) {
      logger.error('创建项目失败', error);
      const msg = error?.message || '创建项目失败';
      toast.error(msg);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 py-10 px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            AI 驱动构建
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-3">
            描述你的想法
          </h1>
          <p className="text-lg text-slate-500">
            用自然语言描述你想要构建的应用，AI Agent 会帮你实现它
          </p>
        </div>

        {/* Main Card */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              项目名称
            </label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              placeholder="我的待办应用"
              className="mb-4 focus-visible:ring-violet-500/30 focus-visible:border-violet-500"
            />
            <label className="block text-sm font-medium text-slate-700 mb-2">
              项目描述
            </label>
            <Textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              placeholder="例如：帮我做一个待办事项应用，可以添加、完成、删除任务，有深色模式切换..."
              className="min-h-[200px] resize-none text-base leading-relaxed focus-visible:ring-violet-500/30 focus-visible:border-violet-500"
            />
            <div className="flex justify-end mt-2">
              <span className="text-xs text-slate-400">
                {description.length} 字符
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Quick Templates */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-800">试试这些模板</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickTemplates.map((templateId) => {
              const template = templatesApi.getTemplateById(templateId);
              if (!template) return null;
              return (
                <button
                  key={templateId}
                  onClick={() => handleTemplateClick(templateId)}
                  className="flex flex-col gap-1 p-4 rounded-xl border border-slate-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 transition-all text-left group"
                >
                  <span className="text-sm font-medium text-slate-800 group-hover:text-violet-700">
                    {template.name}
                  </span>
                  <span className="text-xs text-slate-400 line-clamp-1">
                    {template.category}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Style Selection */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-violet-500" />
            <h2 className="text-lg font-semibold text-slate-800">选择风格</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {styleOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setStyle(option.id)}
                className={`relative flex flex-col gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  style === option.id
                    ? 'border-violet-500 bg-violet-50/50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-full h-16 rounded-lg ${option.previewBg} relative overflow-hidden`}
                >
                  <div
                    className={`absolute bottom-2 left-2 right-2 h-2 rounded-full ${option.previewAccent}`}
                  />
                  <div
                    className={`absolute top-2 left-2 w-8 h-2 rounded-full ${option.previewAccent} opacity-70`}
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {option.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {option.description}
                  </div>
                </div>
                {style === option.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Race Mode Toggle */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-slate-800">竞速模式</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">NEW</span>
          </div>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-slate-800">双 Agent 竞速生成</span>
                  </div>
                  <p className="text-sm text-slate-500 mb-3">
                    同时启动两条 Agent 流水线并行生成，完成后对比选择更优版本。
                  </p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Info className="w-3.5 h-3.5" />
                    <span>消耗 20 Credits（双倍生成）</span>
                  </div>
                </div>
                <button
                  onClick={() => setRaceMode(!raceMode)}
                  className={`relative w-14 h-8 rounded-full transition-colors flex-shrink-0 ${
                    raceMode ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform ${
                      raceMode ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Submit Button */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4 text-violet-500" />
            <span className="text-slate-600">
              本次构建消耗 <span className="font-semibold text-violet-600">{BUILD_COST} Credits</span>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">
              当前余额: <span className="font-semibold">{user?.credits ?? 0}</span>
            </span>
          </div>
          {!hasEnoughCredits && (
            <div className="text-sm text-red-500 flex items-center gap-1">
              Credits 不足，请充值后再试
            </div>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isCreating || !hasEnoughCredits}
            size="lg"
            className="min-w-[240px] h-14 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-500/25 disabled:shadow-none disabled:from-slate-300 disabled:to-slate-300"
          >
            {isCreating ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                创建中...
              </>
            ) : (
              <>
                开始构建
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectPage;
