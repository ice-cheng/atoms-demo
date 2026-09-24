import React, { useState } from 'react';
import { RotateCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { projects } from '@client/src/api';
import type { Project } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';

const ITERATION_COST = 5;

interface RollbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  versionId: string | null;
  hasCredits: boolean;
  onSuccess: (project: Project) => void;
  onRefreshUser: () => void;
}

const RollbackDialog: React.FC<RollbackDialogProps> = ({
  open,
  onOpenChange,
  projectId,
  versionId,
  hasCredits,
  onSuccess,
  onRefreshUser,
}) => {
  const [loading, setLoading] = useState(false);

  const handleRollback = async () => {
    if (!versionId) return;
    try {
      setLoading(true);
      const updated = await projects.rollbackVersion(projectId, versionId);
      toast.success('已恢复到该版本');
      onOpenChange(false);
      onSuccess(updated);
      onRefreshUser();
    } catch (error) {
      logger.error('版本恢复失败', error);
      toast.error('版本恢复失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>恢复此版本</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-slate-600">
          <p>确认将项目恢复到选中的历史版本？</p>
          <p>
            恢复操作会生成一个新版本，当前版本将保留在历史记录中。
          </p>
          <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 rounded-md px-3 py-2">
            <Zap className="w-4 h-4" />
            此操作消耗 {ITERATION_COST} Credits
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            onClick={() => void handleRollback()}
            disabled={loading || !hasCredits}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {loading ? '恢复中...' : '确认恢复'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RollbackDialog;
