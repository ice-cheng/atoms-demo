import { Injectable } from '@nestjs/common';
import type { AgentLogEntry } from '@shared/api.interface';

type StyleTheme = 'minimal' | 'dark' | 'gradient' | 'professional';

interface StyleVars {
  bg: string;
  bgSecondary: string;
  text: string;
  textSecondary: string;
  primary: string;
  primaryHover: string;
  border: string;
  cardBg: string;
  shadow: string;
  accent: string;
}

@Injectable()
export class HtmlGeneratorService {
  generate(description: string, style: string): string {
    const theme = this.getStyleVars(style as StyleTheme);
    const desc = description.toLowerCase();

    if (/待办|todo|task|任务/.test(desc)) {
      return this.generateTodoApp(theme, description);
    }
    if (/博客|blog|article|文章/.test(desc)) {
      return this.generateBlogApp(theme, description);
    }
    if (/看板|dashboard|数据|统计/.test(desc)) {
      return this.generateDashboardApp(theme, description);
    }
    if (/landing|落地|营销/.test(desc)) {
      return this.generateLandingPage(theme, description);
    }
    return this.generateGenericPage(theme, description);
  }

  generateAgentLogs(description: string): AgentLogEntry[] {
    const logs: AgentLogEntry[] = [];
    const baseTime = Date.now();
    let t = 0;

    const addLog = (
      agent: AgentLogEntry['agent'],
      agentName: string,
      message: string,
    ): void => {
      t += Math.floor(Math.random() * 800) + 400;
      logs.push({
        agent,
        agentName,
        message,
        timestamp: new Date(baseTime + t).toISOString(),
      });
    };

    // PM logs
    addLog('pm', '产品经理', `收到需求：${description.slice(0, 40)}${description.length > 40 ? '...' : ''}`);
    addLog('pm', '产品经理', '正在分析用户需求，拆解核心功能点...');
    addLog('pm', '产品经理', '确定 MVP 范围：核心功能 + 响应式布局');
    addLog('pm', '产品经理', '已整理需求文档，提交给架构师');

    // Architect logs
    addLog('architect', '架构师', '收到需求文档，开始技术方案设计');
    addLog('architect', '架构师', '选择技术栈：HTML + CSS + Vanilla JS（单文件部署）');
    addLog('architect', '架构师', '设计组件结构和数据流向');
    addLog('architect', '架构师', '输出架构蓝图，交付工程师实现');

    // Engineer logs
    addLog('engineer', '工程师', '开始搭建项目骨架');
    addLog('engineer', '工程师', '编写 HTML 结构和 CSS 样式');
    addLog('engineer', '工程师', '实现核心交互逻辑');
    addLog('engineer', '工程师', '添加本地存储和响应式适配');
    addLog('engineer', '工程师', '代码编写完成，提交审查');

    // Reviewer logs
    addLog('reviewer', '审查员', '开始代码审查');
    addLog('reviewer', '审查员', '检查功能完整性和边界情况');
    addLog('reviewer', '审查员', '验证响应式布局在各尺寸下的表现');
    addLog('reviewer', '审查员', '审查通过，应用构建完成！');

    return logs;
  }

  private getStyleVars(style: StyleTheme): StyleVars {
    switch (style) {
      case 'dark':
        return {
          bg: '#0a0e1a',
          bgSecondary: '#111827',
          text: '#f3f4f6',
          textSecondary: '#9ca3af',
          primary: '#8b5cf6',
          primaryHover: '#7c3aed',
          border: '#1f2937',
          cardBg: '#111827',
          shadow: '0 4px 20px rgba(139, 92, 246, 0.15)',
          accent: '#22d3ee',
        };
      case 'gradient':
        return {
          bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
          bgSecondary: 'rgba(255,255,255,0.1)',
          text: '#ffffff',
          textSecondary: 'rgba(255,255,255,0.8)',
          primary: '#ffffff',
          primaryHover: '#f3f4f6',
          border: 'rgba(255,255,255,0.2)',
          cardBg: 'rgba(255,255,255,0.15)',
          shadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          accent: '#fbbf24',
        };
      case 'professional':
        return {
          bg: '#f8fafc',
          bgSecondary: '#ffffff',
          text: '#0f172a',
          textSecondary: '#64748b',
          primary: '#2563eb',
          primaryHover: '#1d4ed8',
          border: '#e2e8f0',
          cardBg: '#ffffff',
          shadow: '0 1px 3px rgba(15, 23, 42, 0.1)',
          accent: '#0891b2',
        };
      case 'minimal':
      default:
        return {
          bg: '#ffffff',
          bgSecondary: '#f9fafb',
          text: '#111827',
          textSecondary: '#6b7280',
          primary: '#4f46e5',
          primaryHover: '#4338ca',
          border: '#e5e7eb',
          cardBg: '#ffffff',
          shadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          accent: '#10b981',
        };
    }
  }

  private isGradientBg(theme: StyleVars): boolean {
    return theme.bg.includes('gradient');
  }

  private wrapHtml(title: string, body: string, extraCss: string, extraJs: string, theme: StyleVars): string {
    const bgStyle = this.isGradientBg(theme)
      ? `background: ${theme.bg}; background-attachment: fixed; min-height: 100vh;`
      : `background-color: ${theme.bg}; min-height: 100vh;`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: ${theme.text};
      ${bgStyle}
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .card {
      background: ${theme.cardBg};
      border: 1px solid ${theme.border};
      border-radius: 12px;
      box-shadow: ${theme.shadow};
      ${this.isGradientBg(theme) ? 'backdrop-filter: blur(10px);' : ''}
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 10px 20px; border-radius: 8px; border: none;
      background: ${theme.primary}; color: ${this.isGradientBg(theme) ? theme.primary : '#fff'};
      font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s;
    }
    .btn:hover { background: ${theme.primaryHover}; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn-secondary {
      background: transparent; border: 1px solid ${theme.border};
      color: ${theme.text};
    }
    .btn-secondary:hover { border-color: ${theme.primary}; color: ${theme.primary}; }
    input, textarea {
      width: 100%; padding: 10px 14px; border: 1px solid ${theme.border};
      border-radius: 8px; font-size: 14px; background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.1)' : theme.bgSecondary};
      color: ${theme.text}; outline: none; transition: border-color 0.2s;
    }
    input:focus, textarea:focus { border-color: ${theme.primary}; }
    input::placeholder, textarea::placeholder { color: ${theme.textSecondary}; }
    .text-secondary { color: ${theme.textSecondary}; }
    ${extraCss}
  </style>
</head>
<body>
${body}
  <script>
${extraJs}
  </script>
</body>
</html>`;
  }

  private generateTodoApp(theme: StyleVars, description: string): string {
    const title = '待办事项应用';
    const body = `
  <div class="container" style="max-width: 600px; padding-top: 48px;">
    <div class="todo-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">📝 待办事项</h1>
        <p class="text-secondary" style="font-size: 14px;">${this.escapeHtml(description)}</p>
      </div>
      <button id="themeToggle" class="btn btn-secondary" style="padding: 8px 12px;" title="切换深色模式">🌙</button>
    </div>
    <div class="card" style="padding: 24px;">
      <div style="display: flex; gap: 8px; margin-bottom: 20px;">
        <input id="todoInput" type="text" placeholder="输入新的待办事项..." />
        <button id="addBtn" class="btn">添加</button>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
        <button class="filter-btn active" data-filter="all">全部</button>
        <button class="filter-btn" data-filter="active">进行中</button>
        <button class="filter-btn" data-filter="completed">已完成</button>
        <span id="todoCount" class="text-secondary" style="margin-left: auto; font-size: 13px; align-self: center;">0 项</span>
      </div>
      <ul id="todoList" style="list-style: none;"></ul>
      <div id="emptyState" style="text-align: center; padding: 40px 0;">
        <p style="font-size: 48px; margin-bottom: 12px;">✨</p>
        <p class="text-secondary">还没有待办事项，添加一个开始吧！</p>
      </div>
    </div>
  </div>`;

    const extraCss = `
    .todo-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px; border-radius: 8px; margin-bottom: 8px;
      background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.08)' : theme.bgSecondary};
      transition: all 0.2s;
    }
    .todo-item:hover { transform: translateX(2px); }
    .todo-item.completed .todo-text { text-decoration: line-through; opacity: 0.5; }
    .todo-checkbox {
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid ${theme.border}; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all 0.2s;
    }
    .todo-checkbox.checked {
      background: ${theme.primary}; border-color: ${theme.primary};
    }
    .todo-checkbox.checked::after {
      content: '✓'; color: white; font-size: 12px; font-weight: bold;
    }
    .todo-text { flex: 1; font-size: 14px; word-break: break-word; }
    .todo-delete {
      background: none; border: none; color: ${theme.textSecondary};
      cursor: pointer; font-size: 18px; padding: 4px 8px;
      border-radius: 4px; transition: all 0.2s;
    }
    .todo-delete:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
    .filter-btn {
      padding: 6px 12px; border-radius: 6px; border: 1px solid ${theme.border};
      background: transparent; color: ${theme.textSecondary};
      font-size: 13px; cursor: pointer; transition: all 0.2s;
    }
    .filter-btn:hover { color: ${theme.primary}; border-color: ${theme.primary}; }
    .filter-btn.active {
      background: ${theme.primary}; border-color: ${theme.primary};
      color: ${this.isGradientBg(theme) ? theme.primary : '#fff'};
    }
    body.dark-mode {
      background: #0a0e1a !important;
      color: #f3f4f6;
    }
    body.dark-mode .card {
      background: #111827;
      border-color: #1f2937;
    }
    body.dark-mode input {
      background: #1f2937;
      border-color: #374151;
      color: #f3f4f6;
    }
    body.dark-mode .todo-item {
      background: #1f2937;
    }
    body.dark-mode .filter-btn {
      border-color: #374151;
      color: #9ca3af;
    }`;

    const extraJs = `
    const STORAGE_KEY = 'atoms_todo_app';
    let todos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let currentFilter = 'all';
    let darkMode = localStorage.getItem('atoms_dark_mode') === 'true';

    const todoInput = document.getElementById('todoInput');
    const addBtn = document.getElementById('addBtn');
    const todoList = document.getElementById('todoList');
    const todoCount = document.getElementById('todoCount');
    const emptyState = document.getElementById('emptyState');
    const themeToggle = document.getElementById('themeToggle');

    function saveTodos() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    }

    function render() {
      const filtered = todos.filter(t => {
        if (currentFilter === 'active') return !t.completed;
        if (currentFilter === 'completed') return t.completed;
        return true;
      });

      todoList.innerHTML = '';
      filtered.forEach(todo => {
        const li = document.createElement('li');
        li.className = 'todo-item' + (todo.completed ? ' completed' : '');
        li.innerHTML = \`
          <div class="todo-checkbox \${todo.completed ? 'checked' : ''}" data-id="\${todo.id}"></div>
          <span class="todo-text">\${escapeHtml(todo.text)}</span>
          <button class="todo-delete" data-id="\${todo.id}" title="删除">×</button>
        \`;
        todoList.appendChild(li);
      });

      const activeCount = todos.filter(t => !t.completed).length;
      todoCount.textContent = \`\${activeCount} 项未完成\`;
      emptyState.style.display = filtered.length === 0 ? 'block' : 'none';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function addTodo() {
      const text = todoInput.value.trim();
      if (!text) return;
      todos.unshift({
        id: Date.now().toString(),
        text,
        completed: false,
        createdAt: new Date().toISOString()
      });
      todoInput.value = '';
      saveTodos();
      render();
    }

    function toggleTodo(id) {
      const todo = todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
        saveTodos();
        render();
      }
    }

    function deleteTodo(id) {
      todos = todos.filter(t => t.id !== id);
      saveTodos();
      render();
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
      });
      render();
    }

    function toggleDarkMode() {
      darkMode = !darkMode;
      document.body.classList.toggle('dark-mode', darkMode);
      themeToggle.textContent = darkMode ? '☀️' : '🌙';
      localStorage.setItem('atoms_dark_mode', darkMode);
    }

    addBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTodo(); });

    todoList.addEventListener('click', (e) => {
      const target = e.target;
      const id = target.dataset.id;
      if (!id) return;
      if (target.classList.contains('todo-checkbox')) {
        toggleTodo(id);
      } else if (target.classList.contains('todo-delete')) {
        deleteTodo(id);
      }
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    themeToggle.addEventListener('click', toggleDarkMode);
    if (darkMode) {
      document.body.classList.add('dark-mode');
      themeToggle.textContent = '☀️';
    }

    render();
    `;

    return this.wrapHtml(title, body, extraCss, extraJs, theme);
  }

  private generateBlogApp(theme: StyleVars, description: string): string {
    const title = '个人博客';
    const body = `
  <nav class="navbar" style="position: sticky; top: 0; z-index: 100; background: ${this.isGradientBg(theme) ? 'rgba(0,0,0,0.2)' : theme.cardBg}; backdrop-filter: blur(10px); border-bottom: 1px solid ${theme.border};">
    <div class="container" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 24px;">
      <div style="font-weight: 700; font-size: 20px;">📖 My Blog</div>
      <div style="display: flex; gap: 24px;">
        <a href="#" class="nav-link active">首页</a>
        <a href="#articles" class="nav-link">文章</a>
        <a href="#about" class="nav-link">关于</a>
      </div>
    </div>
  </nav>

  <section class="hero" style="padding: 64px 0; text-align: center;">
    <div class="container">
      <h1 style="font-size: 48px; font-weight: 800; margin-bottom: 16px;">欢迎来到我的博客</h1>
      <p class="text-secondary" style="font-size: 18px; max-width: 600px; margin: 0 auto;">${this.escapeHtml(description)}</p>
    </div>
  </section>

  <section id="articles" class="container" style="padding-bottom: 64px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 style="font-size: 24px; font-weight: 700;">最新文章</h2>
      <div style="position: relative; width: 240px;">
        <input id="searchInput" type="text" placeholder="搜索文章..." />
      </div>
    </div>
    <div id="articleGrid" class="article-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;"></div>
  </section>

  <section id="about" class="container" style="padding-bottom: 64px;">
    <div class="card" style="padding: 40px; text-align: center;">
      <div style="width: 80px; height: 80px; border-radius: 50%; background: ${theme.primary}; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 36px;">👨‍💻</div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 12px;">关于我</h2>
      <p class="text-secondary" style="max-width: 600px; margin: 0 auto;">热爱技术与写作，在这里分享我的思考与实践。专注于 Web 开发、产品设计和独立开发。</p>
    </div>
  </section>

  <footer style="border-top: 1px solid ${theme.border}; padding: 32px 0; text-align: center;">
    <p class="text-secondary" style="font-size: 14px;">© 2024 My Blog. Built with Atoms ❤️</p>
  </footer>`;

    const extraCss = `
    .nav-link {
      color: ${theme.textSecondary};
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.2s;
    }
    .nav-link:hover, .nav-link.active {
      color: ${theme.primary};
    }
    .article-card {
      cursor: pointer;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .article-card:hover {
      transform: translateY(-4px);
    }
    .article-cover {
      height: 180px;
      background: linear-gradient(135deg, ${theme.primary}, ${theme.accent});
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }
    .article-content {
      padding: 20px;
    }
    .article-tag {
      display: inline-block;
      padding: 2px 10px;
      background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.2)' : theme.primary + '15'};
      color: ${theme.primary};
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .article-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .article-excerpt {
      font-size: 14px;
      color: ${theme.textSecondary};
      margin-bottom: 12px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .article-meta {
      font-size: 12px;
      color: ${theme.textSecondary};
      display: flex;
      gap: 16px;
    }
    @media (max-width: 640px) {
      .article-grid { grid-template-columns: 1fr; }
    }`;

    const extraJs = `
    const articles = [
      { id: 1, title: '深入理解 JavaScript 异步编程', excerpt: '从回调地狱到 async/await，一篇文章带你彻底掌握 JavaScript 异步编程的演进历程。', tag: 'JavaScript', date: '2024-01-15', readTime: '8分钟', emoji: '⚡' },
      { id: 2, title: '如何打造高效的个人工作流', excerpt: '分享我在独立开发过程中总结的效率工具和工作方法论，帮助你提升开发效率。', tag: '效率', date: '2024-01-10', readTime: '6分钟', emoji: '🚀' },
      { id: 3, title: 'CSS Grid 布局完全指南', excerpt: '全面介绍 CSS Grid 的各种属性和使用场景，从基础到高级技巧一网打尽。', tag: 'CSS', date: '2024-01-05', readTime: '10分钟', emoji: '🎨' },
      { id: 4, title: '独立开发者的第一年总结', excerpt: '从辞职到全职独立开发，这一年我经历了什么？有哪些收获和遗憾？', tag: '思考', date: '2024-01-01', readTime: '12分钟', emoji: '💭' },
      { id: 5, title: 'React 19 新特性详解', excerpt: '带你深入了解 React 19 带来的革命性变化和新的开发模式。', tag: 'React', date: '2023-12-28', readTime: '15分钟', emoji: '⚛️' },
      { id: 6, title: '设计系统从0到1的实践', excerpt: '从零开始搭建一套完整的设计系统，这是我的实践经验和踩坑记录。', tag: '设计', date: '2023-12-20', readTime: '9分钟', emoji: '🎯' },
    ];

    const articleGrid = document.getElementById('articleGrid');
    const searchInput = document.getElementById('searchInput');

    function renderArticles(list) {
      if (list.length === 0) {
        articleGrid.innerHTML = '<p class="text-secondary" style="grid-column: 1/-1; text-align: center; padding: 40px;">没有找到相关文章</p>';
        return;
      }
      articleGrid.innerHTML = list.map(a => \`
        <div class="card article-card" data-id="\${a.id}">
          <div class="article-cover">\${a.emoji}</div>
          <div class="article-content">
            <span class="article-tag">\${a.tag}</span>
            <h3 class="article-title">\${a.title}</h3>
            <p class="article-excerpt">\${a.excerpt}</p>
            <div class="article-meta">
              <span>📅 \${a.date}</span>
              <span>⏱️ \${a.readTime}</span>
            </div>
          </div>
        </div>
      \`).join('');
    }

    function searchArticles(query) {
      const q = query.toLowerCase().trim();
      if (!q) {
        renderArticles(articles);
        return;
      }
      const filtered = articles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.tag.toLowerCase().includes(q)
      );
      renderArticles(filtered);
    }

    searchInput.addEventListener('input', (e) => searchArticles(e.target.value));

    articleGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.article-card');
      if (card) {
        alert('文章详情页（演示）');
      }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });

    renderArticles(articles);
    `;

    return this.wrapHtml(title, body, extraCss, extraJs, theme);
  }

  private generateDashboardApp(theme: StyleVars, description: string): string {
    const title = '数据看板';
    const body = `
  <div class="container" style="padding-top: 32px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 16px;">
      <div>
        <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 4px;">📊 数据看板</h1>
        <p class="text-secondary" style="font-size: 14px;">${this.escapeHtml(description)}</p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="filter-btn active" data-range="week">本周</button>
        <button class="filter-btn" data-range="month">本月</button>
        <button class="filter-btn" data-range="year">全年</button>
      </div>
    </div>

    <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div class="card stat-card" style="padding: 20px;">
        <div class="stat-label text-secondary" style="font-size: 13px; margin-bottom: 8px;">总用户数</div>
        <div class="stat-value" style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">12,847</div>
        <div class="stat-trend up" style="font-size: 13px; color: #10b981;">↑ 12.5% 较上周</div>
      </div>
      <div class="card stat-card" style="padding: 20px;">
        <div class="stat-label text-secondary" style="font-size: 13px; margin-bottom: 8px;">活跃用户</div>
        <div class="stat-value" style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">3,421</div>
        <div class="stat-trend up" style="font-size: 13px; color: #10b981;">↑ 8.2% 较上周</div>
      </div>
      <div class="card stat-card" style="padding: 20px;">
        <div class="stat-label text-secondary" style="font-size: 13px; margin-bottom: 8px;">总收入</div>
        <div class="stat-value" style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">¥89,432</div>
        <div class="stat-trend up" style="font-size: 13px; color: #10b981;">↑ 23.1% 较上周</div>
      </div>
      <div class="card stat-card" style="padding: 20px;">
        <div class="stat-label text-secondary" style="font-size: 13px; margin-bottom: 8px;">转化率</div>
        <div class="stat-value" style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">4.7%</div>
        <div class="stat-trend down" style="font-size: 13px; color: #ef4444;">↓ 1.3% 较上周</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px;" class="chart-row">
      <div class="card" style="padding: 24px;">
        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 20px;">访问趋势</h3>
        <canvas id="lineChart" width="600" height="200"></canvas>
      </div>
      <div class="card" style="padding: 24px;">
        <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 20px;">流量来源</h3>
        <canvas id="pieChart" width="250" height="200"></canvas>
      </div>
    </div>

    <div class="card" style="padding: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="font-size: 18px; font-weight: 600;">最近活动</h3>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px;">查看全部</button>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid ${theme.border};">
            <th style="text-align: left; padding: 12px 8px; font-size: 13px; font-weight: 500; color: ${theme.textSecondary};">用户</th>
            <th style="text-align: left; padding: 12px 8px; font-size: 13px; font-weight: 500; color: ${theme.textSecondary};">操作</th>
            <th style="text-align: left; padding: 12px 8px; font-size: 13px; font-weight: 500; color: ${theme.textSecondary};">状态</th>
            <th style="text-align: right; padding: 12px 8px; font-size: 13px; font-weight: 500; color: ${theme.textSecondary};">时间</th>
          </tr>
        </thead>
        <tbody id="activityTable"></tbody>
      </table>
    </div>
  </div>`;

    const extraCss = `
    .filter-btn {
      padding: 8px 16px; border-radius: 8px; border: 1px solid ${theme.border};
      background: transparent; color: ${theme.textSecondary};
      font-size: 13px; cursor: pointer; transition: all 0.2s;
    }
    .filter-btn:hover { color: ${theme.primary}; border-color: ${theme.primary}; }
    .filter-btn.active {
      background: ${theme.primary}; border-color: ${theme.primary};
      color: ${this.isGradientBg(theme) ? theme.primary : '#fff'};
    }
    .stat-card:hover {
      transform: translateY(-2px);
      transition: transform 0.2s;
    }
    table { font-size: 14px; }
    tbody tr { border-bottom: 1px solid ${theme.border}; transition: background 0.2s; }
    tbody tr:hover { background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.05)' : theme.bgSecondary}; }
    tbody td { padding: 12px 8px; }
    .badge {
      display: inline-block; padding: 2px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 500;
    }
    .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
    .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
    .badge-info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    @media (max-width: 900px) {
      .chart-row { grid-template-columns: 1fr !important; }
    }`;

    const extraJs = `
    // Line chart
    const lineCanvas = document.getElementById('lineChart');
    const lineCtx = lineCanvas.getContext('2d');
    const lineData = [120, 150, 180, 220, 200, 280, 320];
    const lineLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    function drawLineChart() {
      const canvas = lineCanvas;
      const ctx = lineCtx;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const padding = { top: 20, right: 20, bottom: 30, left: 40 };
      const chartW = w - padding.left - padding.right;
      const chartH = h - padding.top - padding.bottom;

      ctx.clearRect(0, 0, w, h);

      const maxVal = Math.max(...lineData) * 1.2;
      const minVal = 0;

      // Grid lines
      ctx.strokeStyle = '${this.isGradientBg(theme) ? 'rgba(255,255,255,0.1)' : theme.border}';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
      }

      // Line
      const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
      gradient.addColorStop(0, '${theme.primary}40');
      gradient.addColorStop(1, '${theme.primary}05');

      ctx.beginPath();
      lineData.forEach((val, i) => {
        const x = padding.left + (chartW / (lineData.length - 1)) * i;
        const y = padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '${theme.primary}';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Fill
      ctx.lineTo(w - padding.right, h - padding.bottom);
      ctx.lineTo(padding.left, h - padding.bottom);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Points
      lineData.forEach((val, i) => {
        const x = padding.left + (chartW / (lineData.length - 1)) * i;
        const y = padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '${theme.primary}';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '${theme.primary}40';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Labels
      ctx.fillStyle = '${theme.textSecondary}';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      lineLabels.forEach((label, i) => {
        const x = padding.left + (chartW / (lineData.length - 1)) * i;
        ctx.fillText(label, x, h - 8);
      });
    }

    // Pie chart
    const pieCanvas = document.getElementById('pieChart');
    const pieCtx = pieCanvas.getContext('2d');
    const pieData = [
      { label: '直接访问', value: 45, color: '${theme.primary}' },
      { label: '搜索引擎', value: 30, color: '${theme.accent}' },
      { label: '社交媒体', value: 15, color: '#f59e0b' },
      { label: '其他', value: 10, color: '#6b7280' },
    ];

    function drawPieChart() {
      const canvas = pieCanvas;
      const ctx = pieCtx;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(cx, cy) - 10;

      ctx.clearRect(0, 0, w, h);

      const total = pieData.reduce((s, d) => s + d.value, 0);
      let startAngle = -Math.PI / 2;

      pieData.forEach(d => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();
        startAngle += sliceAngle;
      });

      // Donut hole
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = '${this.isGradientBg(theme) ? theme.cardBg : theme.cardBg}'.includes('gradient') ? '#fff' : '${this.isGradientBg(theme) ? 'rgba(255,255,255,0.15)' : theme.cardBg}';
      // Use computed style
      ctx.fillStyle = getComputedStyle(document.querySelector('.card')).backgroundColor;
      ctx.fill();

      // Center text
      ctx.fillStyle = '${theme.text}';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(total + '%', cx, cy - 8);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '${theme.textSecondary}';
      ctx.fillText('总流量', cx, cy + 12);
    }

    // Activity table
    const activities = [
      { user: '张三', action: '完成购买', status: 'success', statusText: '成功', time: '2分钟前' },
      { user: '李四', action: '注册账号', status: 'success', statusText: '成功', time: '15分钟前' },
      { user: '王五', action: '支付失败', status: 'warning', statusText: '待处理', time: '32分钟前' },
      { user: '赵六', action: '提交反馈', status: 'info', statusText: '已收到', time: '1小时前' },
      { user: '钱七', action: '升级套餐', status: 'success', statusText: '成功', time: '2小时前' },
    ];

    function renderActivity() {
      const tbody = document.getElementById('activityTable');
      tbody.innerHTML = activities.map(a => \`
        <tr>
          <td><strong>\${a.user}</strong></td>
          <td class="text-secondary">\${a.action}</td>
          <td><span class="badge badge-\${a.status}">\${a.statusText}</span></td>
          <td style="text-align: right;" class="text-secondary">\${a.time}</td>
        </tr>
      \`).join('');
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Animate stat values
        animateStats();
      });
    });

    function animateStats() {
      document.querySelectorAll('.stat-value').forEach(el => {
        const target = Math.floor(Math.random() * 5000) + 8000;
        const start = parseInt(el.textContent.replace(/[^0-9]/g, ''));
        const prefix = el.textContent.includes('¥') ? '¥' : '';
        const suffix = el.textContent.includes('%') ? '%' : '';
        const duration = 600;
        const startTime = performance.now();

        function step(now) {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const val = Math.floor(start + (target - start) * eased);
          el.textContent = prefix + val.toLocaleString() + suffix;
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }

    window.addEventListener('resize', () => {
      drawLineChart();
      drawPieChart();
    });

    drawLineChart();
    drawPieChart();
    renderActivity();
    `;

    return this.wrapHtml(title, body, extraCss, extraJs, theme);
  }

  private generateLandingPage(theme: StyleVars, description: string): string {
    const title = '产品落地页';
    const body = `
  <nav class="navbar" style="position: fixed; top: 0; left: 0; right: 0; z-index: 100; transition: all 0.3s;" id="navbar">
    <div class="container" style="display: flex; justify-content: space-between; align-items: center; padding: 20px 24px;">
      <div style="font-weight: 800; font-size: 22px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 28px;">🚀</span> Atoms
      </div>
      <div style="display: flex; gap: 28px;" class="nav-links">
        <a href="#features" class="nav-link">功能</a>
        <a href="#pricing" class="nav-link">定价</a>
        <a href="#faq" class="nav-link">FAQ</a>
      </div>
      <div style="display: flex; gap: 12px;">
        <button class="btn btn-secondary" style="padding: 8px 16px;">登录</button>
        <button class="btn cta-btn" style="padding: 8px 20px;">免费开始</button>
      </div>
    </div>
  </nav>

  <section class="hero" style="padding: 160px 0 100px; text-align: center;">
    <div class="container">
      <div style="display: inline-block; padding: 6px 16px; background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.2)' : theme.primary + '15'}; color: ${theme.primary}; border-radius: 999px; font-size: 13px; font-weight: 500; margin-bottom: 24px;">
        ✨ 全新版本 2.0 已发布
      </div>
      <h1 style="font-size: 56px; font-weight: 800; line-height: 1.2; margin-bottom: 20px; max-width: 800px; margin-left: auto; margin-right: auto;">
        ${this.escapeHtml(description)}
      </h1>
      <p class="text-secondary" style="font-size: 18px; max-width: 600px; margin: 0 auto 32px; line-height: 1.7;">
        用一句话描述你的想法，AI 将自动生成完整可用的网页应用。
        无需代码，无需部署，几分钟内从想法到产品。
      </p>
      <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
        <button class="btn cta-btn" style="padding: 14px 32px; font-size: 16px;">🚀 立即开始</button>
        <button class="btn btn-secondary" style="padding: 14px 32px; font-size: 16px;">▶️ 观看演示</button>
      </div>
      <div style="margin-top: 48px;">
        <p class="text-secondary" style="font-size: 13px; margin-bottom: 16px;">已有 10,000+ 创作者加入</p>
        <div style="display: flex; justify-content: center; gap: 32px; opacity: 0.6; flex-wrap: wrap;">
          <span style="font-weight: 600;">⭐ 4.9/5 评分</span>
          <span style="font-weight: 600;">🏆 最佳产品奖</span>
          <span style="font-weight: 600;">🛡️ 企业级安全</span>
        </div>
      </div>
    </div>
  </section>

  <section id="features" class="container" style="padding: 80px 24px;">
    <div style="text-align: center; margin-bottom: 56px;">
      <h2 style="font-size: 36px; font-weight: 700; margin-bottom: 12px;">强大功能，简单易用</h2>
      <p class="text-secondary" style="font-size: 16px;">所有你需要的功能，开箱即用</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
      ${[
        { icon: '⚡', title: '闪电般快速', desc: 'AI 在几分钟内生成完整应用，比传统开发快 100 倍。' },
        { icon: '🎨', title: '精美设计', desc: '内置多种设计风格，专业级视觉效果，一键切换。' },
        { icon: '🔧', title: '完全可定制', desc: '生成后可自由编辑代码，满足任何个性化需求。' },
        { icon: '📱', title: '响应式布局', desc: '自动适配桌面、平板、手机，完美呈现。' },
        { icon: '🚀', title: '一键部署', desc: '内置托管服务，生成即可分享，无需额外配置。' },
        { icon: '🔒', title: '安全可靠', desc: '企业级安全标准，数据加密存储，保护你的隐私。' },
      ].map(f => `
        <div class="card feature-card" style="padding: 32px;">
          <div style="font-size: 40px; margin-bottom: 16px;">${f.icon}</div>
          <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 8px;">${f.title}</h3>
          <p class="text-secondary" style="font-size: 14px; line-height: 1.6;">${f.desc}</p>
        </div>
      `).join('')}
    </div>
  </section>

  <section class="cta-section" style="padding: 80px 24px; text-align: center;">
    <div class="container">
      <div class="card" style="padding: 64px 32px; background: linear-gradient(135deg, ${theme.primary}, ${theme.accent}); color: white; border: none;">
        <h2 style="font-size: 32px; font-weight: 700; margin-bottom: 12px; color: white;">准备好开始了吗？</h2>
        <p style="opacity: 0.9; font-size: 16px; margin-bottom: 28px;">免费开始，无需信用卡，几分钟内创建你的第一个应用</p>
        <button class="btn" style="background: white; color: ${theme.primary}; padding: 14px 36px; font-size: 16px;">立即免费开始 →</button>
      </div>
    </div>
  </section>

  <footer style="border-top: 1px solid ${theme.border}; padding: 48px 0 24px;">
    <div class="container">
      <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; margin-bottom: 32px;" class="footer-grid">
        <div>
          <div style="font-weight: 800; font-size: 22px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 28px;">🚀</span> Atoms
          </div>
          <p class="text-secondary" style="font-size: 14px; max-width: 280px;">
            用 AI 的力量，让每个人都能构建自己的应用。
          </p>
        </div>
        <div>
          <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">产品</h4>
          <ul style="list-style: none; font-size: 14px;">
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">功能</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">定价</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">模板</li>
          </ul>
        </div>
        <div>
          <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">资源</h4>
          <ul style="list-style: none; font-size: 14px;">
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">文档</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">博客</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">社区</li>
          </ul>
        </div>
        <div>
          <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">公司</h4>
          <ul style="list-style: none; font-size: 14px;">
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">关于我们</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">联系我们</li>
            <li class="text-secondary" style="margin-bottom: 8px; cursor: pointer;">隐私政策</li>
          </ul>
        </div>
      </div>
      <div style="border-top: 1px solid ${theme.border}; padding-top: 24px; text-align: center;">
        <p class="text-secondary" style="font-size: 13px;">© 2024 Atoms. All rights reserved. Built with ❤️</p>
      </div>
    </div>
  </footer>`;

    const extraCss = `
    .nav-link {
      color: ${theme.textSecondary};
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.2s;
    }
    .nav-link:hover {
      color: ${theme.primary};
    }
    .navbar.scrolled {
      background: ${this.isGradientBg(theme) ? 'rgba(0,0,0,0.3)' : theme.cardBg};
      backdrop-filter: blur(10px);
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .feature-card {
      transition: transform 0.3s, box-shadow 0.3s;
      cursor: default;
    }
    .feature-card:hover {
      transform: translateY(-6px);
    }
    .cta-btn {
      box-shadow: 0 4px 14px ${theme.primary}40;
    }
    .cta-btn:hover {
      box-shadow: 0 6px 20px ${theme.primary}60;
    }
    .footer-grid li:hover {
      color: ${theme.primary};
    }
    @media (max-width: 768px) {
      .footer-grid { grid-template-columns: 1fr 1fr !important; }
      .nav-links { display: none !important; }
      h1 { font-size: 36px !important; }
    }`;

    const extraJs = `
    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });

    // Smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // CTA button
    document.querySelectorAll('.cta-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        alert('🎉 欢迎体验 Atoms！这是一个演示页面。');
      });
    });

    // Feature card hover ripple
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('mouseenter', function() {
        this.style.transform = 'translateY(-6px)';
      });
      card.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0)';
      });
    });

    // Scroll reveal (simple)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.feature-card').forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      observer.observe(card);
    });
    `;

    return this.wrapHtml(title, body, extraCss, extraJs, theme);
  }

  private generateGenericPage(theme: StyleVars, description: string): string {
    const title = description.slice(0, 30) + (description.length > 30 ? '...' : '');
    const body = `
  <div class="container" style="max-width: 800px; padding-top: 64px; padding-bottom: 64px;">
    <header style="text-align: center; margin-bottom: 48px;">
      <div style="font-size: 64px; margin-bottom: 20px;">✨</div>
      <h1 style="font-size: 40px; font-weight: 800; margin-bottom: 16px;">${this.escapeHtml(title)}</h1>
      <p class="text-secondary" style="font-size: 18px; max-width: 600px; margin: 0 auto;">
        ${this.escapeHtml(description)}
      </p>
    </header>

    <div class="card" style="padding: 40px; margin-bottom: 32px;">
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 20px;">关于这个应用</h2>
      <p style="margin-bottom: 16px; line-height: 1.8;">
        这是一个由 Atoms AI 自动生成的网页应用。基于你输入的描述，AI 分析了需求并创建了这个页面。
      </p>
      <p style="line-height: 1.8;">
        你可以点击下方的按钮来体验交互功能，或者重新生成一个新的应用。
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
      <div class="card interactive-card" style="padding: 24px; text-align: center; cursor: pointer;" data-card="1">
        <div style="font-size: 36px; margin-bottom: 8px;">🎯</div>
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">目标明确</h3>
        <p class="text-secondary" style="font-size: 13px;">点击查看</p>
      </div>
      <div class="card interactive-card" style="padding: 24px; text-align: center; cursor: pointer;" data-card="2">
        <div style="font-size: 36px; margin-bottom: 8px;">⚡</div>
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">快速生成</h3>
        <p class="text-secondary" style="font-size: 13px;">点击查看</p>
      </div>
      <div class="card interactive-card" style="padding: 24px; text-align: center; cursor: pointer;" data-card="3">
        <div style="font-size: 36px; margin-bottom: 8px;">🎨</div>
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">精美设计</h3>
        <p class="text-secondary" style="font-size: 13px;">点击查看</p>
      </div>
    </div>

    <div class="card" style="padding: 32px; text-align: center;">
      <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">计数器演示</h3>
      <p class="text-secondary" style="font-size: 14px; margin-bottom: 20px;">这是一个简单的交互演示</p>
      <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
        <button class="btn btn-secondary" id="decBtn" style="width: 48px; height: 48px; padding: 0; font-size: 20px;">−</button>
        <div id="counter" style="font-size: 48px; font-weight: 700; min-width: 100px; text-align: center;">0</div>
        <button class="btn" id="incBtn" style="width: 48px; height: 48px; padding: 0; font-size: 20px;">+</button>
      </div>
      <button class="btn btn-secondary" id="resetBtn" style="margin-top: 16px; padding: 8px 20px; font-size: 13px;">重置</button>
    </div>
  </div>

  <footer style="border-top: 1px solid ${theme.border}; padding: 32px 0; text-align: center;">
    <p class="text-secondary" style="font-size: 13px;">Generated by Atoms AI ✨</p>
  </footer>`;

    const extraCss = `
    .interactive-card {
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .interactive-card:hover {
      transform: translateY(-4px);
    }
    .interactive-card.active {
      border-color: ${theme.primary};
      background: ${this.isGradientBg(theme) ? 'rgba(255,255,255,0.2)' : theme.primary + '08'};
    }`;

    const extraJs = `
    // Counter
    let count = parseInt(localStorage.getItem('atoms_counter') || '0');
    const counterEl = document.getElementById('counter');
    const incBtn = document.getElementById('incBtn');
    const decBtn = document.getElementById('decBtn');
    const resetBtn = document.getElementById('resetBtn');

    function updateCounter() {
      counterEl.textContent = count;
      counterEl.style.transform = 'scale(1.15)';
      setTimeout(() => { counterEl.style.transform = 'scale(1)'; }, 150);
      localStorage.setItem('atoms_counter', count);
    }

    incBtn.addEventListener('click', () => { count++; updateCounter(); });
    decBtn.addEventListener('click', () => { count--; updateCounter(); });
    resetBtn.addEventListener('click', () => { count = 0; updateCounter(); });
    counterEl.style.transition = 'transform 0.15s ease';

    // Interactive cards
    document.querySelectorAll('.interactive-card').forEach(card => {
      card.addEventListener('click', function() {
        this.classList.toggle('active');
        const title = this.querySelector('h3').textContent;
        if (this.classList.contains('active')) {
          this.querySelector('p').textContent = '已激活 ✓';
        } else {
          this.querySelector('p').textContent = '点击查看';
        }
      });
    });

    updateCounter();
    `;

    return this.wrapHtml(title, body, extraCss, extraJs, theme);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
