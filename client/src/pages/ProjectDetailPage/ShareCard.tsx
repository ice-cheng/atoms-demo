import React, { useState } from 'react';
import { Share2, Copy, XCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { resolveAppUrl } from '@lark-apaas/client-toolkit/utils/resolveAppUrl';
import { projects } from '@client/src/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';

interface ShareCardProps {
  projectId: string;
  shareToken: string | null;
  onProjectUpdated?: () => Promise<void> | void;
}

const ShareCard: React.FC<ShareCardProps> = ({
  projectId,
  shareToken,
  onProjectUpdated,
}) => {
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localShareUrl, setLocalShareUrl] = useState('');

  const shareUrl = localShareUrl || (shareToken
    ? resolveAppUrl(`/share/${shareToken}`)
    : '');

  const handleShare = async () => {
    try {
      setSharing(true);
      const result = await projects.shareProject(projectId);
      const url = resolveAppUrl(`/share/${result.shareToken}`);
      setLocalShareUrl(url);
      toast.success('分享链接已生成');
      if (onProjectUpdated) {
        await onProjectUpdated();
      }
    } catch (error) {
      logger.error('生成分享链接失败', error);
      toast.error('生成分享链接失败');
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    try {
      setSharing(true);
      await projects.unshareProject(projectId);
      setLocalShareUrl('');
      toast.success('已取消分享');
      if (onProjectUpdated) {
        await onProjectUpdated();
      }
    } catch (error) {
      logger.error('取消分享失败', error);
      toast.error('取消分享失败');
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('链接已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.error('复制链接失败', error);
      toast.error('复制链接失败');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="w-4 h-4 text-violet-500" />
          项目分享
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shareToken || localShareUrl ? (
          <>
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="text-xs h-9"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopyShareUrl}
                className="shrink-0 h-9 w-9"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-500 border-red-200 hover:bg-red-50"
              onClick={handleUnshare}
              disabled={sharing}
            >
              <XCircle className="w-4 h-4 mr-2" />
              {sharing ? '处理中...' : '取消分享'}
            </Button>
          </>
        ) : (
          <Button
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
            onClick={handleShare}
            disabled={sharing}
          >
            <Share2 className="w-4 h-4 mr-2" />
            {sharing ? '生成中...' : '生成分享链接'}
          </Button>
        )}
        <div className="text-xs text-muted-foreground text-center">
          分享后任何人可通过链接预览
        </div>
      </CardContent>
    </Card>
  );
};

export default ShareCard;
