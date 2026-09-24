import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, GitCompare, ArrowLeftRight } from 'lucide-react';
import type { Project, ProjectVersion } from '@shared/api.interface';
import { Button } from '@client/src/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';

interface VersionDiffViewProps {
  project: Project;
  leftVersionId: string | null;
  rightVersionId: string | null;
  splitterPos: number;
  onSplitterChange: (pos: number) => void;
  onClose: () => void;
  onSwapLeft: (id: string | null) => void;
  onSwapRight: (id: string | null) => void;
}

const VersionDiffView: React.FC<VersionDiffViewProps> = ({
  project,
  leftVersionId,
  rightVersionId,
  splitterPos,
  onSplitterChange,
  onClose,
  onSwapLeft,
  onSwapRight,
}) => {
  const splitterRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const versions = project.versions || [];
  const currentVersionLabel = `v${versions.length} (当前最新)`;

  const leftVersion = useMemo(() => {
    if (!leftVersionId) return null;
    return versions.find((v: ProjectVersion) => v.id === leftVersionId) || null;
  }, [leftVersionId, versions]);

  const leftLabel = useMemo(() => {
    if (!leftVersionId) return '';
    const idx = versions.findIndex((v: ProjectVersion) => v.id === leftVersionId);
    return idx >= 0 ? `v${idx + 1}` : '';
  }, [leftVersionId, versions]);

  const rightLabel = rightVersionId
    ? (() => {
        const idx = versions.findIndex((v: ProjectVersion) => v.id === rightVersionId);
        return idx >= 0 ? `v${idx + 1}` : '';
      })()
    : currentVersionLabel;

  const leftHtml = leftVersion?.html || '';
  const rightHtml = rightVersionId
    ? versions.find((v: ProjectVersion) => v.id === rightVersionId)?.html || ''
    : project.generatedHtml;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pos = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, pos));
      onSplitterChange(clamped);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onSplitterChange]);

  const handleSwap = () => {
    const newLeft = rightVersionId;
    const newRight = leftVersionId;
    onSwapLeft(newLeft);
    onSwapRight(newRight || null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <GitCompare className="w-4 h-4 text-violet-500" />
          版本对比
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSwap}
            title="左右互换"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5 mr-1" />
            关闭对比
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden shadow-md border border-border bg-white"
        style={{ height: '520px' }}
      >
        <div
          className="absolute top-0 bottom-0 left-0 flex flex-col"
          style={{ width: `${splitterPos}%` }}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">
                {leftLabel || '选择版本'}
              </span>
              <Select
                value={leftVersionId || ''}
                onValueChange={(v) => onSwapLeft(v || null)}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue placeholder="选择版本" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v: ProjectVersion, i: number) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      v{i + 1} - {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leftVersion && (
              <span className="text-xs text-muted-foreground">
                {new Date(leftVersion.createdAt).toLocaleString('zh-CN')}
              </span>
            )}
          </div>
          <div className="flex-1 bg-white overflow-hidden">
            {leftHtml ? (
              <iframe
                srcDoc={leftHtml}
                title="Left version"
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                请选择左侧版本
              </div>
            )}
          </div>
        </div>

        <div
          ref={splitterRef}
          className="absolute top-0 bottom-0 w-1 bg-violet-200 hover:bg-violet-400 cursor-col-resize z-10 transition-colors"
          style={{ left: `calc(${splitterPos}% - 2px)` }}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-8 bg-violet-500 rounded-md flex items-center justify-center shadow-md">
            <div className="flex gap-0.5">
              <div className="w-0.5 h-3 bg-white rounded" />
              <div className="w-0.5 h-3 bg-white rounded" />
            </div>
          </div>
        </div>

        <div
          className="absolute top-0 bottom-0 right-0 flex flex-col"
          style={{ width: `${100 - splitterPos}%` }}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">
                {rightLabel}
              </span>
              <Select
                value={rightVersionId || '__current__'}
                onValueChange={(v) => onSwapRight(v === '__current__' ? null : v)}
              >
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue placeholder="选择版本" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__current__" className="text-xs">
                    {currentVersionLabel}
                  </SelectItem>
                  {versions.map((v: ProjectVersion, i: number) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      v{i + 1} - {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              {rightVersionId && versions.find((v: ProjectVersion) => v.id === rightVersionId)
                ? new Date(versions.find((v: ProjectVersion) => v.id === rightVersionId)!.createdAt).toLocaleString('zh-CN')
                : new Date(project.updatedAt).toLocaleString('zh-CN')}
            </span>
          </div>
          <div className="flex-1 bg-white overflow-hidden">
            <iframe
              srcDoc={rightHtml}
              title="Right version"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionDiffView;
