import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  CheckCircle2,
  Loader2,
  Zap,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { Project, DashboardStats } from '@shared/api.interface';
import { projects as projectsApi } from '@client/src/api';
import { useAuth } from '@client/src/contexts/AuthContext';
import { useCountUp } from '@client/src/hooks/useCountUp';
import RechargeDialog from '@client/src/components/RechargeDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ProjectCard from './ProjectCard';
import EmptyProjects from './EmptyProjects';

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradientFrom: string;
  gradientTo: string;
  iconBg: string;
  action?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  label,
  value,
  gradientFrom,
  gradientTo,
  iconBg,
  action,
}) => (
  <div
    className={`relative rounded-xl p-5 bg-gradient-to-br ${gradientFrom} ${gradientTo} text-white overflow-hidden shadow-sm`}
  >
    <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/10" />
    <div className="absolute -right-8 -top-8 w-20 h-20 rounded-full bg-white/5" />
    <div className="relative flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-white/80 mb-1">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

const DashboardHomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const displayCredits = useCountUp(stats?.credits ?? 0, 800);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, projectsRes] = await Promise.all([
        projectsApi.getDashboardStats(),
        projectsApi.getProjects(),
      ]);
      setStats(statsRes);
      setProjects(projectsRes.items.slice(0, 6));
    } catch (err) {
      logger.error('加载仪表盘数据失败', err);
      setError('加载失败，请刷新页面重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleRechargeSuccess = (newCredits: number) => {
    if (stats) {
      setStats({ ...stats, credits: newCredits });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await projectsApi.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (stats) {
        const newTotal = stats.total - 1;
        const deleted = projects.find((p) => p.id === id);
        let newCompleted = stats.completed;
        let newBuilding = stats.building;
        if (deleted?.status === 'completed') newCompleted -= 1;
        if (deleted?.status === 'building') newBuilding -= 1;
        setStats({
          ...stats,
          total: newTotal,
          completed: newCompleted,
          building: newBuilding,
        });
      }
    } catch (err) {
      logger.error('删除项目失败', err);
    }
  };



  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 欢迎语 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            欢迎回来，{user?.username || '用户'} 👋
          </h1>
          <p className="text-slate-500">今天想构建什么？</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))
          ) : error ? (
            <div className="col-span-full text-center text-sm text-red-500 py-6">
              {error}
            </div>
          ) : (
            <>
              <StatCard
                icon={FolderKanban}
                label="项目总数"
                value={stats?.total ?? 0}
                gradientFrom="from-violet-500"
                gradientTo="to-purple-600"
                iconBg="bg-white/20"
              />
              <StatCard
                icon={CheckCircle2}
                label="已构建完成"
                value={stats?.completed ?? 0}
                gradientFrom="from-emerald-500"
                gradientTo="to-teal-600"
                iconBg="bg-white/20"
              />
              <StatCard
                icon={Loader2}
                label="进行中"
                value={stats?.building ?? 0}
                gradientFrom="from-amber-500"
                gradientTo="to-orange-500"
                iconBg="bg-white/20"
              />
              <StatCard
                icon={Zap}
                label="Credits 余额"
                value={displayCredits}
                gradientFrom="from-fuchsia-500"
                gradientTo="to-violet-600"
                iconBg="bg-white/20"
                action={
                  <button
                    onClick={() => setRechargeOpen(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-white/20 hover:bg-white/30 rounded-md transition-colors backdrop-blur-sm"
                  >
                    充值
                  </button>
                }
              />
            </>
          )}
        </div>

        {/* 我的项目 区域标题 */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">我的项目</h2>
          <Link
            to="/dashboard/projects"
            className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-medium transition-colors"
          >
            查看全部
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 项目列表 / 空状态 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : projects.length === 0 ? (
          <EmptyProjects />
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            data-ai-section-type="card-list"
          >
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* 空状态下的快速创建引导（已有项目时不显示） */}
        {!loading && !error && projects.length === 0 && (
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => navigate('/dashboard/new')}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Sparkles className="w-4 h-4" />
              创建你的第一个项目
            </Button>
          </div>
        )}
      </div>

      <RechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        onSuccess={handleRechargeSuccess}
      />
    </div>
  );
};

export default DashboardHomePage;
