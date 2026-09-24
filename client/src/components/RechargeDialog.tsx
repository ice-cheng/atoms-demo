import React, { useState } from 'react';
import { toast } from 'sonner';
import { Zap, Check, Loader2 } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { user as userApi } from '@client/src/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import { Button } from '@client/src/components/ui/button';

export interface RechargePackage {
  key: string;
  credits: number;
  amount: number;
  tag?: string;
}

const PACKAGES: RechargePackage[] = [
  { key: 'basic_100', credits: 100, amount: 10 },
  { key: 'standard_500', credits: 500, amount: 45, tag: '推荐' },
  { key: 'pro_1000', credits: 1000, amount: 80, tag: '最划算' },
];

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newCredits: number, added: number) => void;
}

const RechargeDialog: React.FC<RechargeDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [selectedKey, setSelectedKey] = useState<string>('standard_500');
  const [loading, setLoading] = useState(false);

  const handleRecharge = async () => {
    const pkg = PACKAGES.find((p: RechargePackage) => p.key === selectedKey);
    if (!pkg) return;

    try {
      setLoading(true);
      await new Promise<void>((resolve: () => void) => setTimeout(resolve, 1200));
      const result = await userApi.recharge({ packageKey: pkg.key });
      toast.success(`充值成功！获得 ${result.added} Credits`);
      onSuccess?.(result.credits, result.added);
      onOpenChange(false);
    } catch (error) {
      logger.error('充值失败', error);
      toast.error('充值失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-500" />
            充值 Credits
          </DialogTitle>
          <DialogDescription>
            选择套餐，为你的账户充值 Credits
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {PACKAGES.map((pkg: RechargePackage) => (
            <button
              key={pkg.key}
              type="button"
              onClick={() => setSelectedKey(pkg.key)}
              disabled={loading}
              className={`w-full relative flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                selectedKey === pkg.key
                  ? 'border-violet-500 bg-violet-50/50'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              } ${loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {pkg.tag && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium text-white bg-gradient-to-r from-fuchsia-500 to-violet-600 rounded-full">
                  {pkg.tag}
                </span>
              )}
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedKey === pkg.key
                      ? 'bg-violet-500 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {pkg.credits} Credits
                  </div>
                  <div className="text-xs text-slate-500">
                    约{pkg.credits / 10}次构建
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-violet-600">
                  ¥{pkg.amount}
                </span>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedKey === pkg.key
                      ? 'border-violet-500 bg-violet-500'
                      : 'border-slate-300'
                  }`}
                >
                  {selectedKey === pkg.key && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="pt-2">
          <Button
            onClick={handleRecharge}
            disabled={loading}
            className="w-full bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-600 hover:to-violet-700 text-white font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                支付中...
              </>
            ) : (
              `立即支付 ¥${PACKAGES.find((p: RechargePackage) => p.key === selectedKey)?.amount || 0}`
            )}
          </Button>
          <p className="text-xs text-center text-slate-400 mt-3">
            模拟支付流程，实际不会扣款
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RechargeDialog;
