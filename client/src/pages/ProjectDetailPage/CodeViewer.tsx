import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';

interface CodeViewerProps {
  code: string;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('代码已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-[hsl(224_71%_10%)] shadow-md">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="ml-3 text-xs text-slate-400 font-mono">
            index.html
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="h-7 px-3 text-xs bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1" />
              复制代码
            </>
          )}
        </Button>
      </div>
      <div className="max-h-[600px] overflow-auto p-4">
        <pre className="font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
          <code>{code || '<!-- 暂无代码 -->'}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeViewer;
