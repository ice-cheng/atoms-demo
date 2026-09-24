import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Bot, Eye, Cloud } from 'lucide-react';
import { Button } from '@client/src/components/ui/button';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Bot,
      title: '多 Agent 协作',
      description:
        'PM / 架构师 / 工程师协同，专业分工高效产出，从需求到上线一气呵成。',
      color: 'text-[hsl(199_89%_48%)]',
      bg: 'bg-[hsl(199_89%_48%)]/10',
    },
    {
      icon: Eye,
      title: '实时预览',
      description:
        '生成即可在浏览器中运行，所见即所得，边看边改，迭代速度提升 10 倍。',
      color: 'text-[hsl(262_83%_58%)]',
      bg: 'bg-[hsl(262_83%_58%)]/10',
    },
    {
      icon: Cloud,
      title: '数据持久化',
      description:
        '项目自动保存到云端，随时回来继续，所有版本历史都可追溯、可回滚。',
      color: 'text-[hsl(142_71%_45%)]',
      bg: 'bg-[hsl(142_71%_45%)]/10',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[hsl(262_83%_98%)]">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-[hsl(220_14%_89%)]/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg font-bold text-[hsl(262_83%_58%)]"
          >
            <Sparkles className="size-5" />
            <span>Atoms Demo</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/login')}
              className="text-muted-foreground hover:text-foreground"
            >
              登录
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] text-white border-0 hover-elevate active-elevate-2"
            >
              开始构建
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-20 pb-24">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[800px] rounded-full bg-[hsl(262_83%_58%)]/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-20 -right-20 size-[400px] rounded-full bg-[hsl(199_89%_48%)]/10 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[hsl(262_83%_58%)]/20 bg-[hsl(262_83%_58%)]/5 px-4 py-1.5 text-sm text-[hsl(262_83%_58%)]">
            <Sparkles className="size-4" />
            <span>AI Native App Builder</span>
          </div>

          <h1 className="bg-gradient-to-r from-foreground via-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] bg-clip-text text-5xl font-bold leading-tight text-transparent md:text-6xl">
            用自然语言，
            <br />
            构建你的下一个产品
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            多 AI Agent 协作，将你的想法转化为可运行的网页应用。
            产品经理、架构师、工程师、审查员，各司其职，实时协作。
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              className="group relative min-w-[220px] bg-gradient-to-r from-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] text-base font-medium text-white shadow-lg shadow-[hsl(262_83%_58%)]/25 border-0 transition-all duration-300 hover:shadow-xl hover:shadow-[hsl(262_83%_58%)]/30"
            >
              免费开始构建
              <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Button>
            <p className="text-sm text-muted-foreground">
              无需信用卡 · 立即开始
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              为什么选择 Atoms Demo
            </h2>
            <p className="mt-3 text-muted-foreground">
              下一代应用构建方式，让想法快速落地
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3" data-ai-section-type="card-list">
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="group rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-[hsl(262_83%_58%)]/5"
                >
                  <div
                    className={`mb-5 inline-flex size-12 items-center justify-center rounded-lg ${feature.bg}`}
                  >
                    <Icon className={`size-6 ${feature.color}`} />
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-[hsl(262_83%_58%)] to-[hsl(280_83%_60%)] p-12 text-center text-white shadow-xl shadow-[hsl(262_83%_58%)]/20">
          <h2 className="text-3xl font-bold md:text-4xl">
            准备好构建你的下一个产品了吗？
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            只需描述你的想法，AI 团队会在几分钟内为你生成可运行的网页应用。
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/register')}
            className="mt-8 min-w-[180px] bg-white text-[hsl(262_83%_58%)] hover:bg-white/90 border-0"
          >
            立即开始
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[hsl(262_83%_58%)]" />
            <span className="font-medium text-foreground">Atoms Demo</span>
          </div>
          <p>© 2024 Atoms Demo. 一个 AI 原生应用构建平台演示。</p>
          <div className="flex items-center gap-6">
            <Link to="/login" className="transition-colors hover:text-foreground">
              登录
            </Link>
            <Link to="/register" className="transition-colors hover:text-foreground">
              注册
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
