import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { User, Lock, AlertTriangle, Mail, Calendar, Zap, Palette } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { user as userApi } from '@client/src/api';
import { useAuth } from '@client/src/contexts/AuthContext';
import { useCountUp } from '@client/src/hooks/useCountUp';
import RechargeDialog from '@client/src/components/RechargeDialog';
import type { BrandKit, FontStyle } from '@shared/api.interface';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Button } from '@client/src/components/ui/button';
import { Label } from '@client/src/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';

const SettingsPage: React.FC = () => {
  const { user, updateUser: updateAuthUser, logout } = useAuth();
  const navigate = useNavigate();

  // User info
  const [username, setUsername] = useState(user?.username || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Delete account
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Recharge
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const displayCredits = useCountUp(user?.credits ?? 0, 800);

  // Brand Kit
  const [brandEnabled, setBrandEnabled] = useState(user?.brandKit?.enabled ?? false);
  const [brandName, setBrandName] = useState(user?.brandKit?.brandName || '');
  const [primaryColor, setPrimaryColor] = useState(user?.brandKit?.primaryColor || '#7c3aed');
  const [secondaryColor, setSecondaryColor] = useState(user?.brandKit?.secondaryColor || '#06b6d4');
  const [fontStyle, setFontStyle] = useState<FontStyle>(user?.brandKit?.fontStyle || 'modern');
  const [savingBrand, setSavingBrand] = useState(false);

  const fontOptions: { id: FontStyle; name: string; sample: string }[] = [
    { id: 'modern', name: '现代无衬线', sample: 'Aa' },
    { id: 'serif', name: '衬线体', sample: 'Aa' },
    { id: 'handwriting', name: '手写体', sample: 'Aa' },
    { id: 'monospace', name: '等宽字体', sample: 'Aa' },
  ];

  const handleSaveBrandKit = async () => {
    try {
      setSavingBrand(true);
      const updated = await userApi.updateBrandKit({
        enabled: brandEnabled,
        brandName: brandName.trim(),
        primaryColor,
        secondaryColor,
        fontStyle,
      });
      if (user) {
        updateAuthUser({ ...user, brandKit: updated });
      }
      toast.success('品牌配置已保存');
    } catch (error) {
      logger.error('保存品牌配置失败', error);
      toast.error('保存失败，请重试');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleRechargeSuccess = (newCredits: number) => {
    if (user) {
      updateAuthUser({ ...user, credits: newCredits });
    }
  };

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      toast.error('用户名不能为空');
      return;
    }
    try {
      setSavingProfile(true);
      const updated = await userApi.updateUser({ username: username.trim() });
      updateAuthUser(updated);
      toast.success('个人信息已更新');
    } catch (error) {
      logger.error('更新用户信息失败', error);
      toast.error('更新失败，请重试');
    } finally {
      setSavingProfile(false);
    }
  };

  const validatePassword = (): boolean => {
    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return false;
    }
    if (newPassword.length < 6) {
      setPasswordError('新密码至少 6 位');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleChangePassword = async () => {
    if (!validatePassword()) return;
    try {
      setChangingPassword(true);
      await userApi.updateUser({
        currentPassword,
        newPassword,
      });
      toast.success('密码已更新');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      logger.error('修改密码失败', error);
      toast.error('修改密码失败，请检查当前密码是否正确');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteEmailConfirm !== user?.email) {
      toast.error('邮箱不匹配');
      return;
    }
    try {
      setDeleting(true);
      await userApi.deleteAccount();
      toast.success('账户已删除');
      logout();
      navigate('/');
    } catch (error) {
      logger.error('删除账户失败', error);
      toast.error('删除账户失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-full">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-foreground mb-8">设置</h1>

        {/* User info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              用户信息
            </CardTitle>
            <CardDescription>管理你的账户基本信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="pl-10 bg-slate-50"
                />
              </div>
              <p className="text-xs text-muted-foreground">邮箱不可修改</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-2">
              <Label>注册时间</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-slate-50 rounded-md px-3 py-2 border border-border">
                <Calendar className="w-4 h-4" />
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('zh-CN')
                  : '-'}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? '保存中...' : '保存修改'}
            </Button>
          </CardFooter>
        </Card>

        {/* Credits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-violet-500" />
              Credits 余额
            </CardTitle>
            <CardDescription>充值 Credits，用于构建你的应用</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-fuchsia-50 to-violet-50 rounded-xl border border-violet-100">
              <div>
                <div className="text-3xl font-bold bg-gradient-to-r from-fuchsia-600 to-violet-600 bg-clip-text text-transparent">
                  {displayCredits}
                </div>
                <div className="text-sm text-slate-500 mt-1">可用 Credits</div>
              </div>
              <Button
                onClick={() => setRechargeOpen(true)}
                className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:from-fuchsia-600 hover:to-violet-700 text-white"
              >
                <Zap className="w-4 h-4 mr-1.5" />
                充值
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Brand Kit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-violet-500" />
              品牌定制
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-normal ml-1">NEW</span>
            </CardTitle>
            <CardDescription>设置品牌风格，新生成的项目将自动应用</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-border">
              <div>
                <div className="text-sm font-medium text-foreground">启用品牌定制</div>
                <p className="text-xs text-muted-foreground mt-0.5">开启后，所有新生成的项目会应用你的品牌配置</p>
              </div>
              <button
                onClick={() => setBrandEnabled(!brandEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${brandEnabled ? 'bg-violet-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${brandEnabled ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>

            <div className="space-y-2">
              <Label>品牌名称</Label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="你的品牌名"
                disabled={!brandEnabled}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>主色</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-lg border border-border flex-shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#7c3aed"
                    disabled={!brandEnabled}
                    className="font-mono text-sm"
                  />
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    disabled={!brandEnabled}
                    className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>辅色</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-lg border border-border flex-shrink-0"
                    style={{ backgroundColor: secondaryColor }}
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#06b6d4"
                    disabled={!brandEnabled}
                    className="font-mono text-sm"
                  />
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    disabled={!brandEnabled}
                    className="w-10 h-10 rounded cursor-pointer border-0 p-0 bg-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>字体风格</Label>
              <div className="grid grid-cols-4 gap-2">
                {fontOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setFontStyle(opt.id)}
                    disabled={!brandEnabled}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${fontStyle === opt.id ? 'border-violet-500 bg-violet-50' : 'border-border bg-white hover:border-slate-300'} ${!brandEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-xl font-semibold text-slate-700 mb-1" style={{ fontFamily: opt.id === 'serif' ? 'Georgia, serif' : opt.id === 'monospace' ? 'monospace' : opt.id === 'handwriting' ? 'cursive' : 'system-ui, sans-serif' }}>
                      {opt.sample}
                    </div>
                    <div className="text-xs text-slate-500">{opt.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-lg border border-border bg-white">
              <div className="text-xs text-muted-foreground mb-3">预览效果</div>
              <div
                className="p-4 rounded-lg text-white text-center"
                style={{ backgroundColor: primaryColor }}
              >
                <div className="text-lg font-bold" style={{ fontFamily: fontStyle === 'serif' ? 'Georgia, serif' : fontStyle === 'monospace' ? 'monospace' : fontStyle === 'handwriting' ? 'cursive' : 'system-ui, sans-serif' }}>
                  {brandName || '你的品牌'}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
                <span className="text-xs text-slate-400">主色</span>
                <span
                  className="inline-block w-3 h-3 rounded-full ml-3"
                  style={{ backgroundColor: secondaryColor }}
                />
                <span className="text-xs text-slate-400">辅色</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSaveBrandKit} disabled={savingBrand}>
              {savingBrand ? '保存中...' : '保存品牌配置'}
            </Button>
          </CardFooter>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              修改密码
            </CardTitle>
            <CardDescription>定期更换密码以确保账户安全</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">当前密码</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 位字符"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? '更新中...' : '更新密码'}
            </Button>
          </CardFooter>
        </Card>

        {/* Danger zone */}
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              危险区域
            </CardTitle>
            <CardDescription>
              以下操作不可逆，请谨慎操作
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-red-800 mb-1">
                  删除账户
                </h4>
                <p className="text-sm text-red-600/80 leading-relaxed">
                  删除账户后，你的所有项目和数据将被永久删除，且无法恢复。
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                删除我的账户
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recharge dialog */}
      <RechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        onSuccess={handleRechargeSuccess}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              确认删除账户
            </DialogTitle>
            <DialogDescription>
              此操作不可逆。删除后，你的所有项目数据将被永久清除。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              请输入你的邮箱 <span className="font-semibold text-foreground">{user?.email}</span> 以确认：
            </p>
            <Input
              value={deleteEmailConfirm}
              onChange={(e) => setDeleteEmailConfirm(e.target.value)}
              placeholder="请输入邮箱确认"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleting || deleteEmailConfirm !== user?.email}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
