import React, { useState } from 'react';
import {
  RefreshCw,
  Download,
  Edit3,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@client/src/contexts/AuthContext';
import type { Project } from '@shared/api.interface';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Textarea } from '@client/src/components/ui/textarea';
import { projects } from '@client/src/api';
import ShareCard from './ShareCard';
import RollbackDialog from './RollbackDialog';
import VersionHistoryCard from './VersionHistoryCard';
import EditDescriptionDialog from './EditDescriptionDialog';

const REBUILD_COST = 10;
const ITERATION_COST = 5;

const styleLabels: Record<string, { label: string; color: string }> = {
  minimal: { label: '极简风格', color: 'bg-slate-100 text-slate-700' },
  dark: { label: '深色模式', color: 'bg-slate-800 text-slate-100' },
  gradient: {
    label: '渐变风格',
    color: 'bg-gradient-to-r from-violet-500 to-purple-600 text-white',
  },
  professional: { label: '专业风格', color: 'bg-blue-100 text-blue-700' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  building: { label: '构建中', color: 'bg-blue-100 text-blue-700' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  failed: { label: '失败', color: 'bg-red-100 text-red-700' },
};

interface DetailPanelProps {
  project: Project;
  currentVersionId: string | null;
  onVersionClick: (versionId: string) => void;
  onExport: () => void;
  onNavigateBuild: (id: string) => void;
  onProjectUpdated?: (project: Project) => void;
  onCompareClick: (versionId: string) => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  project,
  currentVersionId,
  onVersionClick,
  onExport,
  onNavigateBuild,
  onProjectUpdated,
  onCompareClick,
}) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [iterationPrompt, setIterationPrompt] = useState('');
  const [rollbackVersionId, setRollbackVersionId] = useState<string | null>(null);
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);

  const hasRebuildCredits = (user?.credits ?? 0) >= REBUILD_COST;
  const hasIterationCredits = (user?.credits ?? 0) >= ITERATION_COST;

  const styleInfo =
    styleLabels[project.style] ||
    { label: project.style, color: 'bg-slate-100 text-slate-700' };
  const statusInfo =
    statusLabels[project.status] ||
    { label: project.status, color: 'bg-slate-100 text-slate-700' };

  const handleRebuild = () => {
    if (!hasRebuildCredits) { toast.error('Credits 不足，无法重新构建'); return; }
    navigate(`/dashboard/build/${project.id}`, {
      state: {
        isRebuild: true,
        rebuildData: { description: project.description },
      },
    });
  };

  const handleIterationBuild = () => {
    const prompt = iterationPrompt.trim();
    if (!prompt) { toast.error('请输入修改指令'); return; }
    if (!hasIterationCredits) { toast.error('Credits 不足，无法迭代构建'); return; }
    const newDescription = `${project.description}。修改要求：${prompt}`;
    navigate(`/dashboard/build/${project.id}`, {
      state: {
        isRebuild: true,
        rebuildData: { description: newDescription, iteration: true },
      },
    });
  };

  const openEditDialog = () => {
    setEditDialogOpen(true);
  };

  const handleEditAndRebuild = (newDescription: string) => {
    if (!hasRebuildCredits) {
      toast.error('Credits 不足，无法重新构建');
      return;
    }
    setEditDialogOpen(false);
    navigate(`/dashboard/build/${project.id}`, {
      state: {
        isRebuild: true,
        rebuildData: { description: newDescription },
      },
    });
  };

  const openRollbackDialog = (versionId: string) => {
    setRollbackVersionId(versionId);
    setRollbackDialogOpen(true);
  };

  const handleRollbackSuccess = (updated: Project) => {
    setRollbackVersionId(null);
    if (onProjectUpdated) {
      onProjectUpdated(updated);
    }
  };

  return (
    <div className="w-[340px] shrink-0 space-y-6">
      {/* Project info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">项目信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">项目名称</div>
            <div className="text-base font-semibold text-foreground">
              {project.name}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">描述</div>
            <div className="text-sm text-slate-600 leading-relaxed">
              {project.description}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">风格</div>
              <Badge variant="secondary" className={styleInfo.color}>
                {styleInfo.label}
              </Badge>
            </div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">状态</div>
              <Badge variant="secondary" className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">创建时间</div>
            <div className="text-sm text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              {new Date(project.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Share */}
      <ShareCard
        projectId={project.id}
        shareToken={project.shareToken}
        onProjectUpdated={async () => {
          if (!onProjectUpdated) return;
          const updated = await projects.getProject(project.id);
          onProjectUpdated(updated);
          onProjectUpdated(updated);
        }}
      />

      {/* Iteration build */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" />
            修改指令
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={iterationPrompt}
            onChange={(e) => setIterationPrompt(e.target.value)}
            placeholder="例如：把主题色改成蓝色、加一个登录表单..."
            className="min-h-[80px] text-sm resize-none"
          />
          <Button
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            onClick={handleIterationBuild}
            disabled={!iterationPrompt.trim() || !hasIterationCredits}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            迭代构建（{ITERATION_COST} Credits）
          </Button>
          {!hasIterationCredits && (
            <div className="text-xs text-red-500 text-center">
              Credits 不足
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            onClick={handleRebuild}
            disabled={!hasRebuildCredits}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            重新构建（{REBUILD_COST} Credits）
          </Button>
          {!hasRebuildCredits && (
            <div className="text-xs text-red-500 text-center -mt-1">
              Credits 不足
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={onExport}
          >
            <Download className="w-4 h-4 mr-2" />
            导出 HTML
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={openEditDialog}
          >
            <Edit3 className="w-4 h-4 mr-2" />
            编辑描述并重新生成
          </Button>
        </CardContent>
      </Card>

      {/* Version history */}
      <VersionHistoryCard
        versions={project.versions}
        currentVersionId={currentVersionId}
        onVersionClick={onVersionClick}
        onRollbackClick={openRollbackDialog}
        onCompareClick={onCompareClick}
      />

      {/* Rollback confirmation dialog */}
      <RollbackDialog
        open={rollbackDialogOpen}
        onOpenChange={(open) => {
          setRollbackDialogOpen(open);
          if (!open) setRollbackVersionId(null);
        }}
        projectId={project.id}
        versionId={rollbackVersionId}
        hasCredits={hasIterationCredits}
        onSuccess={handleRollbackSuccess}
        onRefreshUser={refreshUser}
      />

      {/* Edit description dialog */}
      <EditDescriptionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initialDescription={project.description}
        hasCredits={hasRebuildCredits}
        onConfirm={handleEditAndRebuild}
      />
    </div>
  );
};

export default DetailPanel;
