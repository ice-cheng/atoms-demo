import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

interface EmptyProjectsProps {
  variant?: 'home' | 'list';
}

const EmptyProjects: React.FC<EmptyProjectsProps> = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* 插图 */}
      <div className="relative mb-6">
        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Sparkles className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="absolute -bottom-1 -left-3 w-6 h-6 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      <h3 className="text-xl font-bold text-slate-800 mb-2">还没有项目</h3>
      <p className="text-slate-500 text-center max-w-sm mb-6">
        创建你的第一个项目，体验 AI 构建的魔力
      </p>

      <button
        onClick={() => navigate('/dashboard/new')}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors shadow-md shadow-violet-600/20"
      >
        <Sparkles className="w-4 h-4" />
        创建项目
      </button>
    </div>
  );
};

export default EmptyProjects;
