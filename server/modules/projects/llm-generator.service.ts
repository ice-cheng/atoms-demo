import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentLogEntry, AppStyle, BrandKit } from '@shared/api.interface';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_API_KEY = '7c391e92-86ac-4db5-9e53-e96fedc7a1c2';
const ARK_TEMPERATURE = 0.7;
const ARK_MAX_TOKENS = 1500;
const PM_MAX_TOKENS = 500;
const ARCH_MAX_TOKENS = 600;
const ENGINEER_MAX_TOKENS = 3000;
const REVIEW_MAX_TOKENS = 500;

const FIXER_PROMPT = (issues: string, existingCode: string, desc: string): string => `你是一位资深前端修复工程师。请根据以下评审意见修复现有代码中的问题。

用户需求：${desc}

## 评审指出的问题
${issues}

## 现有代码（前 4000 字符）
\`\`\`html
${existingCode.slice(0, 4000)}${existingCode.length > 4000 ? '\n... (代码过长，仅展示前4000字符)' : ''}
\`\`\`

请直接输出修复后的完整 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。只修复指出的问题，保持其他部分不变。`;

const DEBUGGER_PROMPT = (errors: string, existingHtml: string): string => `你是一位资深前端调试工程师（Debugger Agent）。请分析并修复以下网页中的运行时错误。

## 检测到的运行时错误
${errors}

## 当前 HTML 代码
\`\`\`html
${existingHtml.slice(0, 8000)}${existingHtml.length > 8000 ? '\n... (代码过长，仅展示前8000字符)' : ''}
\`\`\`

请分析错误原因，并输出修复后的完整 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。

要求：
1. 只修复检测到的错误，不做无关改动
2. 保持页面整体结构和功能不变
3. 修复后代码必须可正常运行
4. 如果错误来自外部资源（如 CDN 加载失败），提供兜底方案或移除依赖`

const MAX_FIXER_ROUNDS = 2;
const MIN_SCORE_PASS = 7;

const DEFAULT_MODELS = [
  'doubao-seed-2-1-turbo-260628',
  'doubao-seed-2-0-lite-260428',
];

function getModelList(): string[] {
  const modelsEnv = process.env.DOUBAO_MODELS;
  if (modelsEnv && modelsEnv.trim()) {
    const list = modelsEnv
      .split(',')
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0);
    if (list.length > 0) return list;
  }
  const singleModel = process.env.DOUBAO_MODEL;
  if (singleModel && singleModel.trim()) {
    return [singleModel.trim()];
  }
  return DEFAULT_MODELS;
}

const TEMPLATE_LIST = [
  { key: 'landing', name: '产品落地页', desc: 'hero + 特性展示 + 定价方案 + footer，适合产品官网、营销落地页、SaaS介绍页' },
  { key: 'dashboard', name: '数据仪表盘', desc: '侧边栏 + 统计卡片 + 图表 + 数据表格，适合后台管理、数据看板、运营监控' },
  { key: 'todo', name: '待办事项应用', desc: '增删改查 + 筛选 + 优先级 + 本地存储，适合任务管理、清单类应用' },
  { key: 'blog', name: '个人博客', desc: '文章列表 + 分类 + 博主信息 + 分页，适合内容展示、资讯类页面' },
  { key: 'ecommerce', name: '电商产品展示', desc: '产品网格 + 分类筛选 + 购物车 + 促销，适合商品展示、电商类页面' },
  { key: 'chat', name: '聊天界面', desc: '联系人列表 + 消息气泡 + 输入交互，适合即时通讯、客服类应用' },
  { key: 'portfolio', name: '个人作品集', desc: '个人介绍 + 项目展示 + 技能 + 联系表单，适合个人主页、作品集网站' },
  { key: 'form', name: '表单收集页', desc: '多字段表单 + 验证 + 提交反馈，适合报名、问卷、收集信息类页面' },
] as const;

function loadTemplate(key: string): string {
  try {
    return fs.readFileSync(path.join(__dirname, 'templates', `${key}.html`), 'utf-8');
  } catch {
    return '';
  }
}

export interface StreamEvent {
  type: 'agent_start' | 'log' | 'code_chunk' | 'agent_done' | 'done' | 'error' | 'fixer_start' | 'fixer_log' | 'fixer_done' | 'race_done';
  agent?: AgentLogEntry['agent'] | 'fixer';
  agentName?: string;
  message?: string;
  code?: string;
  fullHtml?: string;
  htmlA?: string;
  htmlB?: string;
  error?: string;
  timestamp?: string;
  track?: 'A' | 'B';
  round?: number;
  score?: number;
  fixIssues?: string[];
}

interface ArkChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PhaseExtra {
  templateKey?: string;
  templateHtml?: string;
  archResult?: string;
  brandKit?: BrandKit | null;
}

interface AgentPhase {
  key: AgentLogEntry['agent'] | 'fixer';
  name: string;
  prompt: (desc: string, style: string, ctx: string, extra?: PhaseExtra) => string;
  isCodePhase: boolean;
  maxTokens: number;
}

const AGENT_PHASES: AgentPhase[] = [
  {
    key: 'pm',
    name: 'Product Manager',
    prompt: (desc: string, style: string, _ctx: string, extra?: PhaseExtra) => {
      const brandNote = extra?.brandKit?.enabled
        ? `\n\n## 品牌定制要求\n品牌名称：${extra.brandKit.brandName}\n主色调：${extra.brandKit.primaryColor}\n辅助色：${extra.brandKit.secondaryColor}\n字体风格：${extra.brandKit.fontStyle}\n请在设计中体现以上品牌风格。`
        : '';
      return `你是一位资深产品经理。请分析以下网页开发需求，输出简短的需求要点。

用户需求：${desc}
设计风格：${style}${brandNote}

请按以下结构输出（每部分 2-3 条，极度简洁，不要展开论述）：

## 核心需求
- 需求1
- 需求2

## 关键要点
- 要点1
- 要点2

输出中文，简洁专业。`;
    },
    isCodePhase: false,
    maxTokens: PM_MAX_TOKENS,
  },
  {
    key: 'architect',
    name: 'Architect',
    prompt: (desc: string, style: string, pmResult: string) => {
      const templateDesc = TEMPLATE_LIST
        .map((t: { key: string; name: string; desc: string }) => `- ${t.key}（${t.name}）：${t.desc}`)
        .join('\n');
      return `你是一位资深前端架构师。基于以下产品需求分析，从给定模板中选择最合适的一个，并列出定制要点。

用户需求：${desc}
设计风格：${style}

产品需求分析结果：
${pmResult}

## 可选模板列表
${templateDesc}

## 任务
1. 从以上 8 个模板中选择最贴合用户需求的一个模板
2. 列出 5 条具体的定制要点（内容替换、配色调整、功能修改等）

## 输出格式
严格按照以下格式输出，不要添加额外内容：

### 模板选择
模板key: <key>
选择理由: <一句话说明为什么选这个模板>

### 定制要点
1. <要点1>
2. <要点2>
3. <要点3>
4. <要点4>
5. <要点5>

输出中文。`;
    },
    isCodePhase: false,
    maxTokens: ARCH_MAX_TOKENS,
  },
  {
    key: 'engineer',
    name: 'Engineer',
    prompt: (desc: string, style: string, _ctx: string, extra?: PhaseExtra) => {
      const brandNote = extra?.brandKit?.enabled
        ? `\n\n## 品牌定制要求\n品牌名称：${extra.brandKit.brandName}\n主色调：${extra.brandKit.primaryColor}\n辅助色：${extra.brandKit.secondaryColor}\n字体风格：${extra.brandKit.fontStyle}（modern=现代无衬线, serif=衬线体, handwriting=手写体, monospace=等宽体）\n请在页面中体现以上品牌风格，使用主色调作为强调色，辅助色作为点缀。`
        : '';
      return `你是一位资深前端工程师。请基于给定的 HTML 模板，按照定制要点进行修改，输出一个完整的、可直接运行的 HTML 文件。

用户需求：${desc}
设计风格：${style}
模板名称：${extra?.templateKey || 'landing'}
定制要点：
${extra?.archResult || ''}${brandNote}

## 模板 HTML
\`\`\`html
${extra?.templateHtml || ''}
\`\`\`

## 修改要求
1. 保持模板的整体结构和代码质量不变，只按定制要点进行修改
2. 替换页面文案和示例内容，使其贴合用户需求
3. 调整配色方案，符合指定的设计风格
4. 确保所有交互功能完整可用
5. 代码结构清晰，有适当注释
6. 确保代码可以直接保存为 .html 文件并在浏览器中打开运行

## 风格要求
- 风格：${style}
- 视觉美观，专业的排版和间距
- 适当的动画和过渡效果
- 响应式设计，适配桌面和移动端

请直接输出完整的修改后 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。代码前面可以有简短说明，但主体必须是完整可运行的 HTML。`;
    },
    isCodePhase: true,
    maxTokens: ENGINEER_MAX_TOKENS,
  },
  {
    key: 'reviewer',
    name: 'Reviewer',
    prompt: (desc: string, _style: string, codeResult: string) =>
      `你是一位资深前端代码评审专家。请对以下生成的完整网页代码进行严格评审并给出数字评分。

用户需求：${desc}

完整生成代码：
\`\`\`html
${codeResult}
\`\`\`

请从以下维度逐项检查：
1. HTML 结构完整性（DOCTYPE、head、body 是否完整）
2. CSS 是否内联且样式合理（是否有独立样式文件依赖）
3. JavaScript 是否有明显语法错误或逻辑问题
4. 是否具备响应式设计（移动端适配）
5. UI 视觉是否美观、排版是否专业
6. 是否完整满足用户描述的功能需求
7. 代码可维护性与规范性

请严格按以下结构输出评审意见：

## 代码评审
- 整体评价：一句话总结
- 优点：列出2-3个具体优点
- 问题清单：逐条列出具体问题，每条说明位置和影响。如果没有问题则写"无明显问题"
- 评分：<1-10之间的整数>

输出中文，专业客观，简洁。评分必须是 1 到 10 之间的整数。`,
    isCodePhase: false,
    maxTokens: REVIEW_MAX_TOKENS,
  },
];

class EarlyStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EarlyStreamError';
  }
}

@Injectable()
export class LlmGeneratorService implements OnModuleInit {
  private readonly logger = new Logger(LlmGeneratorService.name);

  onModuleInit(): void {
    this.logger.log(`ARK_API_KEY loaded: ${Boolean(ARK_API_KEY)}`);
    this.logger.log(`ARK base URL: ${ARK_BASE_URL}`);
    this.logger.log(`Default models: ${getModelList().join(', ')}`);
  }

  async *generateStream(
    description: string,
    style: AppStyle,
    brandKit: BrandKit | null = null,
  ): AsyncGenerator<StreamEvent> {
    const phaseResults: Record<string, string> = {};
    let fullHtml = '';
    let templateKey = 'landing';
    let templateHtml = '';
    let finalScore = 0;
    let fixerRounds = 0;

    for (let i = 0; i < AGENT_PHASES.length; i++) {
      const phase = AGENT_PHASES[i];

      // architect 阶段完成后，解析模板 key 并加载模板
      if (phase.key === 'engineer' && phaseResults['architect']) {
        const match = phaseResults['architect'].match(/模板key:\s*(\w+)/);
        if (match && match[1]) {
          const candidate = match[1];
          const validKeys = TEMPLATE_LIST.map((t: { key: string }) => t.key);
          if (validKeys.includes(candidate as typeof validKeys[number])) {
            templateKey = candidate;
          }
        }
        templateHtml = loadTemplate(templateKey);
        if (!templateHtml) {
          this.logger.warn(`[LLM] 模板 ${templateKey} 加载失败，使用默认 landing 模板`);
          templateKey = 'landing';
          templateHtml = loadTemplate('landing');
        }
      }

      const phaseExtra: PhaseExtra = {
        templateKey,
        templateHtml,
        archResult: phaseResults['architect'],
        brandKit,
      };
      const context = phase.key === 'reviewer'
        ? this.extractHtml(phaseResults['engineer'] || fullHtml)
        : this.buildContext(i, phaseResults, phaseExtra);

      yield {
        type: 'agent_start',
        agent: phase.key,
        agentName: phase.name,
        message: `${phase.name} 开始工作...`,
        timestamp: new Date().toISOString(),
      };

      try {
        const prompt = phase.prompt(description, style, context, phaseExtra);
        const messages: ArkChatMessage[] = [
          { role: 'system', content: '你是一个专业的 AI 助手，擅长网页开发和代码生成。' },
          { role: 'user', content: prompt },
        ];

        let phaseContent = '';
        let codeBuffer = '';
        let inCodeBlock = false;

        for await (const text of this.callArkStream(messages, phase.maxTokens)) {
          if (!text) continue;
          phaseContent += text;

          if (phase.isCodePhase) {
            codeBuffer += text;

            if (!inCodeBlock) {
              const startIdx = codeBuffer.indexOf('```html');
              if (startIdx !== -1) {
                inCodeBlock = true;
                const beforeCode = codeBuffer.slice(0, startIdx);
                if (beforeCode.trim()) {
                  yield {
                    type: 'log',
                    agent: phase.key,
                    agentName: phase.name,
                    message: beforeCode,
                    timestamp: new Date().toISOString(),
                  };
                }
                codeBuffer = codeBuffer.slice(startIdx + 7);
              } else {
                yield {
                  type: 'log',
                  agent: phase.key,
                  agentName: phase.name,
                  message: text,
                  timestamp: new Date().toISOString(),
                };
              }
            }

            if (inCodeBlock) {
              const endIdx = codeBuffer.indexOf('```');
              if (endIdx !== -1 && endIdx > 0) {
                const codePart = codeBuffer.slice(0, endIdx);
                fullHtml += codePart;
                yield {
                  type: 'code_chunk',
                  agent: phase.key,
                  agentName: phase.name,
                  code: codePart,
                  fullHtml,
                  timestamp: new Date().toISOString(),
                };
                codeBuffer = codeBuffer.slice(endIdx + 3);
                inCodeBlock = false;
              } else {
                const flushPoint = Math.floor(codeBuffer.length * 0.8);
                if (flushPoint > 50) {
                  const toFlush = codeBuffer.slice(0, flushPoint);
                  fullHtml += toFlush;
                  yield {
                    type: 'code_chunk',
                    agent: phase.key,
                    agentName: phase.name,
                    code: toFlush,
                    fullHtml,
                    timestamp: new Date().toISOString(),
                  };
                  codeBuffer = codeBuffer.slice(flushPoint);
                }
              }
            }
          } else {
            yield {
              type: 'log',
              agent: phase.key,
              agentName: phase.name,
              message: text,
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (phase.isCodePhase && inCodeBlock && codeBuffer.length > 0) {
          const endIdx = codeBuffer.indexOf('```');
          const remaining = endIdx !== -1
            ? codeBuffer.slice(0, endIdx)
            : codeBuffer;
          fullHtml += remaining;
          yield {
            type: 'code_chunk',
            agent: phase.key,
            agentName: phase.name,
            code: remaining,
            fullHtml,
            timestamp: new Date().toISOString(),
          };
        }

        phaseResults[phase.key] = phaseContent;

        yield {
          type: 'agent_done',
          agent: phase.key,
          agentName: phase.name,
          message: `${phase.name} 工作完成`,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        this.logger.error(`${phase.name} 阶段失败`, error);
        yield {
          type: 'error',
          agent: phase.key,
          agentName: phase.name,
          error: error instanceof Error ? error.message : '未知错误',
          timestamp: new Date().toISOString(),
        };
        return;
      }
    }

    const finalHtml = this.extractHtml(
      phaseResults['engineer'] || fullHtml,
    );

    finalScore = this.parseScore(phaseResults['reviewer'] || '');

    let currentHtml = finalHtml;
    const issuesText = this.extractIssues(phaseResults['reviewer'] || '');
    let currentIssuesText = issuesText.join('\n');

    if (finalScore < MIN_SCORE_PASS && issuesText) {
      for (let round = 1; round <= MAX_FIXER_ROUNDS; round++) {
        fixerRounds = round;

        yield {
          type: 'fixer_start',
          agent: 'fixer',
          agentName: 'Fixer Agent',
          message: `自动修复第 ${round} 轮：根据评审意见进行修复...`,
          round,
          timestamp: new Date().toISOString(),
        };

        try {
          const fixerPrompt = FIXER_PROMPT(currentIssuesText, currentHtml, description);
          const fixerMessages: ArkChatMessage[] = [
            { role: 'system', content: '你是一个专业的前端修复工程师，擅长根据评审意见修复代码问题。' },
            { role: 'user', content: fixerPrompt },
          ];

          let fixerContent = '';
          let fixerCodeBuffer = '';
          let fixerInCodeBlock = false;
          let fixerFullHtml = '';

          for await (const text of this.callArkStream(fixerMessages, ENGINEER_MAX_TOKENS)) {
            if (!text) continue;
            fixerContent += text;

            fixerCodeBuffer += text;
            if (!fixerInCodeBlock) {
              const startIdx = fixerCodeBuffer.indexOf('```html');
              if (startIdx !== -1) {
                fixerInCodeBlock = true;
                const beforeCode = fixerCodeBuffer.slice(0, startIdx);
                if (beforeCode.trim()) {
                  yield {
                    type: 'fixer_log',
                    agent: 'fixer',
                    agentName: 'Fixer Agent',
                    message: beforeCode,
                    round,
                    timestamp: new Date().toISOString(),
                  };
                }
                fixerCodeBuffer = fixerCodeBuffer.slice(startIdx + 7);
              } else {
                yield {
                  type: 'fixer_log',
                  agent: 'fixer',
                  agentName: 'Fixer Agent',
                  message: text,
                  round,
                  timestamp: new Date().toISOString(),
                };
              }
            }

            if (fixerInCodeBlock) {
              const endIdx = fixerCodeBuffer.indexOf('```');
              if (endIdx !== -1 && endIdx > 0) {
                const codePart = fixerCodeBuffer.slice(0, endIdx);
                fixerFullHtml += codePart;
                yield {
                  type: 'code_chunk',
                  agent: 'fixer',
                  agentName: 'Fixer Agent',
                  code: codePart,
                  fullHtml: fixerFullHtml,
                  round,
                  timestamp: new Date().toISOString(),
                };
                fixerCodeBuffer = fixerCodeBuffer.slice(endIdx + 3);
                fixerInCodeBlock = false;
              } else {
                const flushPoint = Math.floor(fixerCodeBuffer.length * 0.8);
                if (flushPoint > 50) {
                  const toFlush = fixerCodeBuffer.slice(0, flushPoint);
                  fixerFullHtml += toFlush;
                  yield {
                    type: 'code_chunk',
                    agent: 'fixer',
                    agentName: 'Fixer Agent',
                    code: toFlush,
                    fullHtml: fixerFullHtml,
                    round,
                    timestamp: new Date().toISOString(),
                  };
                  fixerCodeBuffer = fixerCodeBuffer.slice(flushPoint);
                }
              }
            }
          }

          if (fixerInCodeBlock && fixerCodeBuffer.length > 0) {
            const endIdx = fixerCodeBuffer.indexOf('```');
            const remaining = endIdx !== -1
              ? fixerCodeBuffer.slice(0, endIdx)
              : fixerCodeBuffer;
            fixerFullHtml += remaining;
            yield {
              type: 'code_chunk',
              agent: 'fixer',
              agentName: 'Fixer Agent',
              code: remaining,
              fullHtml: fixerFullHtml,
              round,
              timestamp: new Date().toISOString(),
            };
          }

          const fixedHtml = this.extractHtml(fixerContent || fixerFullHtml);
          currentHtml = fixedHtml || currentHtml;

          yield {
            type: 'fixer_done',
            agent: 'fixer',
            agentName: 'Fixer Agent',
            message: `第 ${round} 轮修复完成，正在复评...`,
            round,
            timestamp: new Date().toISOString(),
          };

          const reReviewPrompt = AGENT_PHASES.find(
            (p: AgentPhase) => p.key === 'reviewer',
          );
          if (reReviewPrompt) {
            const reReviewMessages: ArkChatMessage[] = [
              { role: 'system', content: '你是一个专业的代码评审专家。' },
              { role: 'user', content: reReviewPrompt.prompt(description, style, currentHtml) },
            ];

            let reReviewContent = '';
            for await (const text of this.callArkStream(reReviewMessages, REVIEW_MAX_TOKENS)) {
              if (!text) continue;
              reReviewContent += text;
              yield {
                type: 'log',
                agent: 'reviewer',
                agentName: 'Reviewer',
                message: text,
                timestamp: new Date().toISOString(),
              };
            }

            const newScore = this.parseScore(reReviewContent);
            finalScore = newScore;
            const newIssues = this.extractIssues(reReviewContent);

            if (newScore >= MIN_SCORE_PASS) {
              break;
            }
            if (round < MAX_FIXER_ROUNDS) {
              currentIssuesText = newIssues.join('\n');
            }
          }
        } catch (error) {
          this.logger.error(`Fixer 第 ${round} 轮失败`, error);
          yield {
            type: 'log',
            agent: 'fixer',
            agentName: 'Fixer Agent',
            message: `修复失败：${error instanceof Error ? error.message : '未知错误'}，继续使用原版本`,
            round,
            timestamp: new Date().toISOString(),
          };
          break;
        }
      }
    }

    yield {
      type: 'done',
      fullHtml: currentHtml,
      score: finalScore,
      fixIssues: issuesText,
      timestamp: new Date().toISOString(),
    };
  }

  private parseScore(reviewText: string): number {
    const match = reviewText.match(/评分[：: ]*\s*(\d+)/);
    if (match) {
      const score = parseInt(match[1], 10);
      if (score >= 1 && score <= 10) return score;
    }
    const scoreMatch = reviewText.match(/(\d+)\s*[分\/]/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (score >= 1 && score <= 10) return score;
    }
    return 5;
  }

  private extractIssues(reviewText: string): string[] {
    const issues: string[] = [];
    const issueSection = reviewText.match(/改进点[：: ]*\s*\n([\s\S]*?)(?=\n##|\n评分|$)/);
    if (issueSection) {
      const lines = issueSection[1].split('\n').filter((l: string) => l.trim().startsWith('-') || l.trim().match(/^\d+[.、]/));
      for (const line of lines.slice(0, 3)) {
        issues.push(line.replace(/^[-\d.、\s]+/, '').trim());
      }
    }
    if (issues.length === 0) {
      const bulletMatches = reviewText.match(/改进点[：: ](.+)/g);
      if (bulletMatches) {
        for (const m of bulletMatches) {
          const clean = m.replace(/改进点[：: ]/, '').trim();
          if (clean) issues.push(clean);
        }
      }
    }
    return issues;
  }

  async *rebuildStream(
    description: string,
    style: AppStyle,
    existingHtml: string,
    modifyInstruction?: string,
  ): AsyncGenerator<StreamEvent> {
    const instruction = modifyInstruction?.trim() || description;
    const rebuildPrompt = `你是一位资深前端工程师。请对现有的 HTML 网页进行修改和优化。

${modifyInstruction ? '用户修改指令：' + modifyInstruction : '用户需求描述：' + description}
设计风格：${style}

现有 HTML 代码：
\`\`\`html
${existingHtml.slice(0, 5000)}${existingHtml.length > 5000 ? '\n... (代码过长，仅展示前5000字符)' : ''}
\`\`\`

请根据用户需求，对现有代码进行修改。要求：
1. 保持整体结构和风格的一致性
2. 只修改需要变更的部分，保留不需要改动的功能
3. 输出完整的、可直接运行的 HTML 文件
4. 所有 CSS 和 JavaScript 都内联在 HTML 中
5. 确保修改后的代码功能完整、可直接运行

请直接输出完整的修改后的 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。`;

    yield {
      type: 'agent_start',
      agent: 'engineer',
      agentName: 'Engineer',
      message: 'Engineer 正在根据修改指令更新代码...',
      timestamp: new Date().toISOString(),
    };

    try {
      const messages: ArkChatMessage[] = [
        { role: 'system', content: '你是一个专业的前端工程师，擅长 HTML/CSS/JS 网页开发。' },
        { role: 'user', content: rebuildPrompt },
      ];

      let fullHtml = '';
      let codeBuffer = '';
      let inCodeBlock = false;
      let phaseContent = '';

      for await (const text of this.callArkStream(messages)) {
        if (!text) continue;

        phaseContent += text;
        codeBuffer += text;

        if (!inCodeBlock) {
          const startIdx = codeBuffer.indexOf('```html');
          if (startIdx !== -1) {
            inCodeBlock = true;
            const beforeCode = codeBuffer.slice(0, startIdx);
            if (beforeCode.trim()) {
              yield {
                type: 'log',
                agent: 'engineer',
                agentName: 'Engineer',
                message: beforeCode,
                timestamp: new Date().toISOString(),
              };
            }
            codeBuffer = codeBuffer.slice(startIdx + 7);
          } else {
            yield {
              type: 'log',
              agent: 'engineer',
              agentName: 'Engineer',
              message: text,
              timestamp: new Date().toISOString(),
            };
          }
          continue;
        }

        const endIdx = codeBuffer.indexOf('```');
        if (endIdx !== -1) {
          const codePart = codeBuffer.slice(0, endIdx);
          fullHtml += codePart;
          yield {
            type: 'code_chunk',
            agent: 'engineer',
            agentName: 'Engineer',
            code: codePart,
            fullHtml,
            timestamp: new Date().toISOString(),
          };
          codeBuffer = codeBuffer.slice(endIdx + 3);
          inCodeBlock = false;

          const afterCode = codeBuffer;
          if (afterCode.trim()) {
            yield {
              type: 'log',
              agent: 'reviewer',
              agentName: 'Reviewer',
              message: afterCode,
              timestamp: new Date().toISOString(),
            };
          }
        } else {
          const flushPoint = Math.floor(codeBuffer.length * 0.7);
          if (flushPoint > 50) {
            const toFlush = codeBuffer.slice(0, flushPoint);
            fullHtml += toFlush;
            yield {
              type: 'code_chunk',
              agent: 'engineer',
              agentName: 'Engineer',
              code: toFlush,
              fullHtml,
              timestamp: new Date().toISOString(),
            };
            codeBuffer = codeBuffer.slice(flushPoint);
          }
        }
      }

      if (inCodeBlock && codeBuffer.length > 0) {
        fullHtml += codeBuffer;
        yield {
          type: 'code_chunk',
          agent: 'engineer',
          agentName: 'Engineer',
          code: codeBuffer,
          fullHtml,
          timestamp: new Date().toISOString(),
        };
      }

      yield {
        type: 'agent_done',
        agent: 'engineer',
        agentName: 'Engineer',
        message: '代码修改完成',
        timestamp: new Date().toISOString(),
      };

      const finalHtml = this.extractHtml(phaseContent || fullHtml);

      yield {
        type: 'done',
        fullHtml: finalHtml,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('迭代修改失败', error);
      yield {
        type: 'error',
        agent: 'engineer',
        agentName: 'Engineer',
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async *debugFixStream(
    existingHtml: string,
    errors: string,
    style: AppStyle,
  ): AsyncGenerator<StreamEvent> {
    yield {
      type: 'agent_start',
      agent: 'engineer',
      agentName: 'Debugger Agent',
      message: 'Debugger Agent 正在分析运行时错误...',
      timestamp: new Date().toISOString(),
    };

    try {
      const messages: ArkChatMessage[] = [
        { role: 'system', content: '你是一个专业的前端调试工程师，擅长分析和修复网页运行时错误。' },
        { role: 'user', content: DEBUGGER_PROMPT(errors, existingHtml) },
      ];

      let fullHtml = '';
      let codeBuffer = '';
      let inCodeBlock = false;
      let phaseContent = '';

      for await (const text of this.callArkStream(messages, ENGINEER_MAX_TOKENS)) {
        if (!text) continue;

        phaseContent += text;
        codeBuffer += text;

        if (!inCodeBlock) {
          const startIdx = codeBuffer.indexOf('```html');
          if (startIdx !== -1) {
            inCodeBlock = true;
            codeBuffer = codeBuffer.slice(startIdx + 7);
            yield {
              type: 'log',
              agent: 'engineer',
              agentName: 'Debugger Agent',
              message: '开始输出修复后的代码...',
              timestamp: new Date().toISOString(),
            };
          }
        } else {
          const endIdx = codeBuffer.indexOf('```');
          if (endIdx !== -1) {
            const codePart = codeBuffer.slice(0, endIdx);
            fullHtml += codePart;
            yield {
              type: 'code_chunk',
              agent: 'engineer',
              agentName: 'Debugger Agent',
              code: codePart,
              fullHtml,
              timestamp: new Date().toISOString(),
            };
            codeBuffer = codeBuffer.slice(endIdx + 3);
            inCodeBlock = false;
          } else {
            const flushPoint = Math.floor(codeBuffer.length * 0.7);
            if (flushPoint > 50) {
              const toFlush = codeBuffer.slice(0, flushPoint);
              fullHtml += toFlush;
              yield {
                type: 'code_chunk',
                agent: 'engineer',
                agentName: 'Debugger Agent',
                code: toFlush,
                fullHtml,
                timestamp: new Date().toISOString(),
              };
              codeBuffer = codeBuffer.slice(flushPoint);
            }
          }
        }
      }

      if (inCodeBlock && codeBuffer.length > 0) {
        fullHtml += codeBuffer;
        yield {
          type: 'code_chunk',
          agent: 'engineer',
          agentName: 'Debugger Agent',
          code: codeBuffer,
          fullHtml,
          timestamp: new Date().toISOString(),
        };
      }

      yield {
        type: 'agent_done',
        agent: 'engineer',
        agentName: 'Debugger Agent',
        message: '错误修复完成',
        timestamp: new Date().toISOString(),
      };

      const finalHtml = this.extractHtml(phaseContent || fullHtml);

      yield {
        type: 'done',
        fullHtml: finalHtml,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('调试修复失败', error);
      yield {
        type: 'error',
        agent: 'engineer',
        agentName: 'Debugger Agent',
        error: error instanceof Error ? error.message : '未知错误',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async *generateRaceStream(
    description: string,
    style: AppStyle,
    brandKit: BrandKit | null = null,
  ): AsyncGenerator<StreamEvent> {
    const models = getModelList();
    const trackAModels = models;
    const trackBModels = models.length > 1
      ? [...models].reverse()
      : models;

    const genA = this.generateStreamWithModels(description, style, trackAModels, brandKit);
    const genB = this.generateStreamWithModels(description, style, trackBModels, brandKit);

    let doneA = false;
    let doneB = false;

    const runners: Array<{
      promise: Promise<IteratorResult<StreamEvent>>;
      track: 'A' | 'B';
      gen: AsyncGenerator<StreamEvent>;
    }> = [
      { promise: genA.next(), track: 'A', gen: genA },
      { promise: genB.next(), track: 'B', gen: genB },
    ];

    while (!doneA || !doneB) {
      const available = runners.filter((r) => {
        if (r.track === 'A' && doneA) return false;
        if (r.track === 'B' && doneB) return false;
        return true;
      });
      if (available.length === 0) break;

      const raceResult = await Promise.race(
        available.map((r) =>
          r.promise.then((result) => ({ result, track: r.track, gen: r.gen })),
        ),
      );

      const { result, track } = raceResult;

      if (result.done) {
        if (track === 'A') doneA = true;
        else doneB = true;
      } else if (result.value) {
        yield { ...result.value, track };
        const idx = runners.findIndex((r) => r.track === track);
        if (idx !== -1) {
          runners[idx].promise = runners[idx].gen.next();
        }
      }
    }
  }

  private async *generateStreamWithModels(
    description: string,
    style: AppStyle,
    modelList: string[],
    brandKit: BrandKit | null,
  ): AsyncGenerator<StreamEvent> {
    const original = (this as any)._modelOverride;
    (this as any)._modelOverride = modelList;
    try {
      yield* this.generateStream(description, style, brandKit);
    } finally {
      (this as any)._modelOverride = original;
    }
  }


  private async *callArkStreamWithModel(
    model: string,
    messages: ArkChatMessage[],
    maxTokens?: number,
  ): AsyncGenerator<string> {
    if (!ARK_API_KEY) {
      this.logger.warn('ARK_API_KEY 未设置，LLM 调用将失败');
      throw new Error('ARK_API_KEY 未配置，请在环境变量中设置');
    }

    const url = `${ARK_BASE_URL}/chat/completions`;

    const response = await axios.post(
      url,
      {
        model,
        messages,
        temperature: ARK_TEMPERATURE,
        max_tokens: maxTokens ?? ARK_MAX_TOKENS,
        stream: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ARK_API_KEY}`,
        },
        responseType: 'stream',
        timeout: 120000,
        validateStatus: (status: number) => status >= 200 && status < 300,
      },
    );

    const stream = response.data as NodeJS.ReadableStream;
    let buffer = '';
    let hasYieldedContent = false;

    try {
      for await (const chunk of stream) {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }

          const dataStr = trimmed.slice(5).trim();
          if (!dataStr || dataStr === '[DONE]') {
            continue;
          }

          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string;
              }>;
              error?: { message?: string; code?: string };
            };

            if (data.error) {
              const errMsg = `ARK API 错误: ${data.error.code || 'unknown'} - ${data.error.message || '未知错误'}`;
              if (!hasYieldedContent) {
                throw new EarlyStreamError(errMsg);
              }
              throw new Error(errMsg);
            }

            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              hasYieldedContent = true;
              yield content;
            }
          } catch (error) {
            if (error instanceof Error && error.message.startsWith('ARK API 错误')) {
              throw error;
            }
            this.logger.debug('SSE 行解析失败', dataStr);
          }
        }
      }
    } catch (error) {
      if (!hasYieldedContent) {
        throw error;
      }
      throw error;
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }
  private async *callArkStream(
    messages: ArkChatMessage[],
    maxTokens?: number,
  ): AsyncGenerator<string> {
    const models: string[] = (this as any)._modelOverride ?? getModelList();
    const errors: string[] = [];

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        this.logger.log(`[LLM] 使用模型 ${model} 开始调用`);
        const generator = this.callArkStreamWithModel(model, messages, maxTokens);
        let hasYielded = false;

        while (true) {
          const result = await generator.next();
          if (result.done) {
            this.logger.log(`[LLM] 模型 ${model} 调用完成`);
            return;
          }
          if (!hasYielded) {
            hasYielded = true;
            this.logger.log(`[LLM] 模型 ${model} 首字输出，流式开始`);
          }
          yield result.value;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`[${model}] ${errMsg}`);

        const hasMore = i < models.length - 1;
        const nextModel = hasMore ? models[i + 1] : '';

        const isConnectionError =
          error instanceof EarlyStreamError ||
          (axios.isAxiosError(error) &&
            ((error.response?.status !== undefined && error.response.status >= 400) ||
              error.code === 'ECONNABORTED' ||
              error.code === 'ETIMEDOUT' ||
              error.code === 'ECONNREFUSED' ||
              error.code === 'ENOTFOUND' ||
              error.code === 'ECONNRESET'));

        if (isConnectionError && hasMore) {
          this.logger.warn(
            `[LLM] 模型 ${model} 调用失败（连接/初始化阶段），降级到模型 ${nextModel}。原因: ${errMsg}`,
          );
          continue;
        }

        if (!isConnectionError && hasMore) {
          this.logger.warn(
            `[LLM] 模型 ${model} 流式输出中途失败（已输出内容），不降级，直接报错。原因: ${errMsg}`,
          );
          throw error;
        }

        this.logger.error(
          `[LLM] 全部模型调用失败。降级路径: ${models.join(' → ')}。错误: ${errors.join('; ')}`,
        );
        throw new Error(
          `所有 LLM 模型均调用失败（${models.length} 个）。降级路径: ${models.join(' → ')}。最后错误: ${errMsg}`,
        );
      }
    }
  }

  private buildContext(phaseIndex: number, results: Record<string, string>, extra?: PhaseExtra): string {
    const parts: string[] = [];
    if (phaseIndex >= 1 && results['pm']) {
      parts.push(`【产品需求分析】\n${results['pm'].slice(0, 800)}`);
    }
    if (phaseIndex >= 2 && results['architect']) {
      parts.push(`【模板选择与定制要点】\n${results['architect'].slice(0, 800)}`);
    }
    if (phaseIndex >= 3 && extra?.templateKey) {
      parts.push(`【使用模板】${extra.templateKey}`);
    }
    return parts.join('\n\n');
  }

  private extractHtml(content: string): string {
    if (!content) return '';

    const trimmed = content.trim();

    // 直接就是干净的 HTML（以 doctype 或 html 标签开头）
    if (/^<!DOCTYPE html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return trimmed;
    }

    // 优先匹配 ```html ... ``` 围栏块（最常见格式）
    const htmlBlockMatch = trimmed.match(/```[ 	]*html[ 	]*\n([\s\S]*?)\n?```/i);
    if (htmlBlockMatch && htmlBlockMatch[1].trim()) {
      const block = htmlBlockMatch[1].trim();
      if (/<!DOCTYPE html/i.test(block) || /<html/i.test(block)) {
        return block;
      }
    }

    // 匹配任意 ``` 代码块 + HTML 内容
    const genericBlockMatch = trimmed.match(/```[\w\s]*\n([\s\S]*?)\n?```/i);
    if (genericBlockMatch && genericBlockMatch[1].trim()) {
      const block = genericBlockMatch[1].trim();
      if (/<!DOCTYPE html/i.test(block) || /<html/i.test(block)) {
        return block;
      }
    }

    // 兜底：从 <!DOCTYPE html 或 <html 截取到 </html>
    const doctypeIdx = trimmed.search(/<!DOCTYPE\s+html/i);
    const htmlStartIdx = trimmed.search(/<html[\s>]/i);
    const startIdx = doctypeIdx !== -1 ? doctypeIdx : htmlStartIdx;
    const htmlEndIdx = trimmed.lastIndexOf('</html>');

    if (startIdx !== -1 && htmlEndIdx !== -1 && htmlEndIdx > startIdx) {
      return trimmed.slice(startIdx, htmlEndIdx + 7).trim();
    }

    // 只有开始标签，没有结束标签：从开始截取到末尾
    if (startIdx !== -1) {
      return trimmed.slice(startIdx).trim();
    }

    // 完全找不到 HTML 特征，返回原文（极端情况兜底）
    return trimmed;
  }
}
