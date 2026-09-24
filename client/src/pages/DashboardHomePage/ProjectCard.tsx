import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Trash2, Clock } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { Project, ProjectStatus } from '@shared/api.interface';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ProjectCardProps {
  project: Project;
  onDelete: (id: string) => void;
}

const statusConfig: Record<
  ProjectStatus,
  { label: string; dotClass: string; textClass: string; bgClass: string }
> = {
  building: {
    label: '构建中',
    dotClass: 'bg-amber-500 animate-pulse',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50 border-amber-200',
  },
  completed: {
    label: '已完成',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50 border-emerald-200',
  },
  failed: {
    label: '构建失败',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700',
    bgClass: 'bg-red-50 border-red-200',
  },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDelete }) => {
  const navigate = useNavigate();
  const cfg = statusConfig[project.status];

  const handleCardClick = () => {
    navigate(`/dashboard/projects/${project.id}`);
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/dashboard/projects/${project.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleConfirmDelete = () => {
    logger.info('删除项目', project.id);
    onDelete(project.id);
  };

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'group cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 flex flex-col overflow-hidden',
      )}
    >
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* 顶部：标题 + 状态 */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-base text-slate-900 truncate group-hover:text-violet-600 transition-colors">
            {project.name}
          </h3>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0',
              cfg.bgClass,
              cfg.textClass,
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotClass)} />
            {cfg.label}
          </span>
        </div>

        {/* 描述 */}
        <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed flex-1">
          {project.description}
        </p>

        {/* 底部：时间 + 操作 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatRelativeTime(project.createdAt)}</span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreviewClick}
              className="h-7 px-2 text-slate-500 hover:text-violet-600 hover:bg-violet-50"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">查看</span>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteClick}
                  className="h-7 px-2 text-slate-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">删除</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除项目</AlertDialogTitle>
                  <AlertDialogDescription>
                    确定要删除「{project.name}」吗？此操作无法撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleConfirmDelete}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ProjectCard;
