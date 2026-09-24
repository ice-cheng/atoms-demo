import React, { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { useAuth } from '@client/src/contexts/AuthContext';
import { auth } from '@client/src/api';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { RegisterRequest } from '@shared/api.interface';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validate = (): boolean => {
    const nextErrors: typeof errors = {};

    if (!username.trim()) {
      nextErrors.username = '请输入用户名';
    } else if (username.length < 2) {
      nextErrors.username = '用户名至少 2 个字符';
    }

    if (!email.trim()) {
      nextErrors.email = '请输入邮箱';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = '请输入有效的邮箱地址';
    }

    if (!password) {
      nextErrors.password = '请输入密码';
    } else if (password.length < 6) {
      nextErrors.password = '密码至少 6 位';
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = '请确认密码';
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = '两次输入的密码不一致';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload: RegisterRequest = { username, email, password };
      const response = await auth.register(payload);
      login(response.user, response.token);
      toast.success('注册成功，欢迎加入 Atoms Demo！');
      navigate('/dashboard');
    } catch (error: unknown) {
      logger.error('注册失败', error);
      const message =
        error instanceof Error ? error.message : '注册失败，请稍后重试';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[hsl(262_83%_98%)] via-white to-[hsl(220_14%_98%)] px-4 py-12">
      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-[hsl(262_83%_58%)]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-[hsl(142_71%_45%)]/10 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-[hsl(262_83%_58%)]/5 md:p-10">
          {/* Logo & header */}
          <div className="mb-8 text-center">
            <Link
              to="/"
              className="mb-4 inline-flex items-center gap-2 text-xl font-bold text-[hsl(262_83%_58%)]"
            >
              <Sparkles className="size-6" />
              <span>Atoms Demo</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">创建账户</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              开始你的 AI 构建之旅
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="text-sm font-medium text-foreground"
              >
                用户名
              </label>
              <Input
                id="username"
                type="text"
                placeholder="你的昵称"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.username}
                autoComplete="username"
              />
              {errors.username && (
                <p className="text-xs text-destructive">{errors.username}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                邮箱
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.email}
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                密码
              </label>
              <Input
                id="password"
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.password}
                autoComplete="new-password"
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium text-foreground"
              >
                确认密码
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.confirmPassword}
                autoComplete="new-password"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="mt-2 w-full bg-gradient-to-r from-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] text-white border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  注册中...
                </>
              ) : (
                '注册'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            已有账户？{' '}
            <Link
              to="/login"
              className="font-medium text-[hsl(262_83%_58%)] transition-colors hover:text-[hsl(262_83%_48%)]"
            >
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
