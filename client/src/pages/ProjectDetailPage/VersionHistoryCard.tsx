import React from 'react';
import { RotateCcw, GitCompare } from 'lucide-react';
import type { ProjectVersion } from '@shared/api.interface';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';

interface VersionHistoryCardProps {
  versions: ProjectVersion[];
  currentVersionId: string | null;
  onVersionClick: (versionId: string) => void;
  onRollbackClick: (versionId: string) => void;
  onCompareClick: (versionId: string) => void;
}

const VersionHistoryCard: React.FC<VersionHistoryCardProps> = ({
  versions,
  currentVersionId,
  onVersionClick,
  onRollbackClick,
  onCompareClick,
}) => {
  if (!versions || versions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">版本历史</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions.map((version: ProjectVersion, index: number) => {
          const isCurrent =
            (currentVersionId === null &&
              index === versions.length - 1) ||
            currentVersionId === version.id;
          const versionNumber = index + 1;
          return (
            <div
              key={version.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                isCurrent
                  ? 'bg-violet-50 border-violet-200'
                  : 'bg-white border-border hover:bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  版本 v{versionNumber}
                  {isCurrent && (
                    <Badge
                      variant="default"
                      className="text-[10px] px-1.5 py-0 bg-violet-500"
                    >
                      当前
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(version.createdAt).toLocaleString('zh-CN')}
                </div>
              </div>
              {!isCurrent && (
                  <div className="flex gap-1.5 shrink-0 ml-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onVersionClick(version.id)}
                    >
                      查看
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onCompareClick(version.id)}
                      title="对比当前版本"
                    >
                      <GitCompare className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRollbackClick(version.id)}
                      title="恢复此版本"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default VersionHistoryCard;
