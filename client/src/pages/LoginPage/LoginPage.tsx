import React, { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { useAuth } from '@client/src/contexts/AuthContext';
import { auth } from '@client/src/api';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { LoginRequest } from '@shared/api.interface';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const nextErrors: { email?: string; password?: string } = {};

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

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const payload: LoginRequest = { email, password };
      const response = await auth.login(payload);
      login(response.user, response.token);
      toast.success('登录成功，欢迎回来！');
      navigate('/dashboard');
    } catch (error: unknown) {
      logger.error('登录失败', error);
      const message =
        error instanceof Error ? error.message : '登录失败，请检查邮箱和密码';
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
        className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-[hsl(199_89%_48%)]/10 blur-3xl"
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
            <h1 className="text-2xl font-bold text-foreground">欢迎回来</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              登录你的 Atoms Demo 账户
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                autoComplete="current-password"
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] text-white border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            还没有账户？{' '}
            <Link
              to="/register"
              className="font-medium text-[hsl(262_83%_58%)] transition-colors hover:text-[hsl(262_83%_48%)]"
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
