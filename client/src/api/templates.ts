import type { Template } from '@shared/api.interface';

export const templates: Template[] = [
  {
    id: 'todo',
    name: '待办事项应用',
    description: '添加、完成、删除任务，支持本地存储和深色模式',
    category: '效率工具',
    previewDescription: '一个完整的待办事项管理应用',
  },
  {
    id: 'blog',
    name: '个人博客首页',
    description: '文章列表、关于我、导航栏的个人博客',
    category: '内容展示',
    previewDescription: '简洁优雅的个人博客首页',
  },
  {
    id: 'dashboard',
    name: '数据看板',
    description: '统计卡片、图表、数据表格的仪表盘',
    category: '数据可视化',
    previewDescription: '专业的数据可视化看板',
  },
  {
    id: 'landing',
    name: '营销落地页',
    description: 'Hero 区域、特性展示、CTA、Footer',
    category: '营销推广',
    previewDescription: '高转化率的营销落地页',
  },
  {
    id: 'calculator',
    name: '计算器',
    description: '功能完整的计算器应用',
    category: '工具',
    previewDescription: '简洁实用的计算器',
  },
  {
    id: 'weather',
    name: '天气面板',
    description: '展示天气信息的精美面板',
    category: '工具',
    previewDescription: '精美的天气信息面板',
  },
  {
    id: 'team',
    name: '团队介绍',
    description: '展示团队成员和公司文化',
    category: '企业展示',
    previewDescription: '专业的团队介绍页面',
  },
  {
    id: 'pricing',
    name: '价格方案',
    description: '多档位定价方案展示页面',
    category: '营销推广',
    previewDescription: '清晰的价格方案对比页面',
  },
];

export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

export function getTemplateDescription(id: string): string {
  const descMap: Record<string, string> = {
    todo: '帮我做一个待办事项应用，可以添加、完成、删除任务，有深色模式切换，支持本地存储保存数据',
    blog: '帮我做一个个人博客首页，有文章列表、关于我板块、顶部导航栏，简洁优雅的设计风格',
    dashboard: '帮我做一个数据看板应用，包含统计卡片、图表展示、数据表格，专业的数据可视化',
    landing: '帮我做一个产品营销落地页，有 Hero 大标题区域、特性展示、CTA 按钮和底部 footer',
    calculator: '帮我做一个计算器应用，支持加减乘除、百分比、清零等功能',
    weather: '帮我做一个天气面板应用，展示当前天气、未来几天预报、温度和天气状态',
    team: '帮我做一个团队介绍页面，展示团队成员头像、姓名、职位，以及公司文化介绍',
    pricing: '帮我做一个价格方案页面，展示多个定价档位、功能对比、突出推荐方案',
  };
  return descMap[id] || '';
}
