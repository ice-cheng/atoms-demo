# Atoms Demo — AI Native App Builder

模拟 Atoms.dev 的 AI 原生应用构建平台，用户用自然语言描述想法，多 AI Agent 协作将其转化为可运行的网页应用。

## 设计规范

### 色彩系统
- 主色调：紫色/靛蓝系 `hsl(262 83% 58%)` 作为品牌色 primary
- 深色侧边栏：`hsl(224 71% 10%)` 近黑深蓝
- 内容区：浅色背景 `hsl(210 20% 98%)`
- 成功：`hsl(142 71% 45%)`
- 警告：`hsl(38 92% 50%)`
- 错误：`hsl(0 84% 60%)`

### Agent 强调色
- Product Manager: `hsl(199 89% 48%)` 蓝色
- Architect: `hsl(262 83% 58%)` 紫色
- Engineer: `hsl(142 71% 45%)` 绿色
- Reviewer: `hsl(38 92% 50%)` 橙色

### 排版
- 标题：font-bold，大标题 text-4xl/5xl
- 正文：text-base，行高 1.6
- 等宽字体用于 Agent 日志区域

### 布局
- 侧边栏宽度：260px 固定
- 内容区最大宽度：1200px，居中
- 卡片圆角：12px (rounded-xl)
- 间距基准：4px/8px/16px/24px/32px

### 动画
- 过渡：300ms ease
- 构建过程 pulsing 状态点
- 打字机效果逐行显示 Agent 日志
