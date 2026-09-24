import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Sparkles } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { Project, ProjectStatus } from '@shared/api.interface';
import { projects as projectsApi } from '@client/src/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ProjectCard from '../DashboardHomePage/ProjectCard';
import EmptyProjects from '../DashboardHomePage/EmptyProjects';

const ProjectsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await projectsApi.getProjects();
      setProjects(res.items);
    } catch (err) {
      logger.error('加载项目列表失败', err);
      setError('加载失败，请刷新页面重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await projectsApi.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      logger.error('删除项目失败', err);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* 顶部标题 + 新建按钮 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">我的项目</h1>
            <p className="text-sm text-slate-500">
              共 {projects.length} 个项目
            </p>
          </div>
          <Button
            onClick={() => navigate('/dashboard/new')}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <Sparkles className="w-4 h-4" />
            新建项目
          </Button>
        </div>

        {/* 搜索 / 筛选栏 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="搜索项目名称或描述..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) =>
              setStatusFilter(val as ProjectStatus | 'all')
            }
          >
            <SelectTrigger className="w-full sm:w-40 bg-white">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="building">构建中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="failed">构建失败</SelectItem>
            </SelectContent>
          </Select>
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
        ) : filteredProjects.length === 0 ? (
          projects.length === 0 ? (
            <EmptyProjects />
          ) : (
            <div className="text-center py-16 text-slate-500">
              <p>没有找到匹配的项目</p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                }}
                className="mt-2 text-sm text-violet-600 hover:text-violet-700"
              >
                清除筛选
              </button>
            </div>
          )
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            data-ai-section-type="card-list"
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* 新建项目浮动按钮（移动端友好） */}
        <button
          onClick={() => navigate('/dashboard/new')}
          className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 flex items-center justify-center hover:bg-violet-700 transition-colors z-10"
          aria-label="新建项目"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default ProjectsListPage;
