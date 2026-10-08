import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentLogEntry, AppStyle, BrandKit } from '@shared/api.interface';
import { async } from 'rxjs';
import { string } from 'zod';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_API_KEY = '7c391e92-86ac-4db5-9e53-e96fedc7a1c2';
const ARK_TEMPERATURE = 0.7;
const ARK_MAX_TOKENS = 1500;
const PM_MAX_TOKENS = 800;
const ARCH_MAX_TOKENS = 1200;
const ENGINEER_MAX_TOKENS = 131072;
const REVIEW_MAX_TOKENS = 1000;

const ARK_FIRST_BYTE_TIMEOUT = 300000;
const ARK_CHUNK_IDLE_TIMEOUT = 120000;
const ARK_TOTAL_STREAM_TIMEOUT = 900000;

const FIXER_PROMPT = (issues: string, existingCode: string, desc: string): string => `你是一位资深前端修复工程师。请根据以下评审意见修复现有代码中的问题。

用户需求：${desc}

## 评审指出的问题
${issues}

## 现有完整代码
\`\`\`html
${existingCode}
\`\`\`

请直接输出修复后的完整 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。只修复指出的问题，保持其他部分不变。`;

const DEBUGGER_PROMPT = (errors: string, existingHtml: string): string => `你是一位资深前端调试工程师（Debugger Agent）。请分析并修复以下网页中的运行时错误。

## 检测到的运行时错误
${errors}

## 当前完整 HTML 代码
\`\`\`html
${existingHtml}
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
  'doubao-seed-2-1-pro-260915',
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
  type: 'agent_start' | 'log' | 'code_chunk' | 'agent_done' | 'done' | 'error' | 'fixer_start' | 'fixer_log' | 'fixer_done' | 'race_done' | 'thinking' | 'incomplete';
  agent?: AgentLogEntry['agent'] | 'fixer' | 'system';
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
  reason?: string;
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
  disableThinking?: boolean;
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

## 移动端适配强制要求（必须严格遵守）
1. **必须包含 viewport meta**：<meta name="viewport" content="width=device-width, initial-scale=1.0">
2. **响应式布局**：
   - 移动端优先，小屏幕下单列布局，桌面端多列布局
   - 容器 max-width 设为 100%，避免横向溢出
   - flex 布局必须设置 flex-wrap: wrap，防止内容挤爆
3. **字号与间距**：
   - 字号优先使用 clamp() 或 rem/em 等相对单位
   - 移动端 padding/margin 适当缩小
4. **两档媒体查询**：
   - @media (max-width: 768px)：平板/大屏手机适配
   - @media (max-width: 480px)：小屏手机适配
5. **禁止使用 body { overflow: hidden }**，这会导致小屏内容被裁剪；如需禁止横向滚动用 overflow-x: hidden
6. **按钮/可点击区域最小 44px**，保证移动端触摸友好
7. **图片 max-width: 100%**，防止超出视口

请直接输出完整的修改后 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。代码前面可以有简短说明，但主体必须是完整可运行的 HTML。

**重要约束：所有 HTML 代码必须完整输出在正文内容中，绝对不能放在思考/推理过程里；思考过程只写分析思路，不得包含任何代码。**`;
    },
    isCodePhase: true,
    maxTokens: ENGINEER_MAX_TOKENS,
    disableThinking: true,
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
    let currentHtml = '';
    let issuesText: string[] = [];
    let doneSent = false;
    let errorMessage = '';

    try {
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

      if (phase.key === 'reviewer') {
        const reviewerCode = context;
        const codeLen = reviewerCode.length;
        const isComplete = this.isHtmlComplete(reviewerCode);
        this.logger.log(
          `[generateStream] Reviewer 输入校验: codeLen=${codeLen}, complete=${isComplete}`,
        );
        if (!isComplete || codeLen < 200) {
          this.logger.error(
            `[generateStream] Reviewer 输入代码为空或不完整，跳过Reviewer阶段 ` +
            `(len=${codeLen}, complete=${isComplete})`,
          );
          yield {
            type: 'agent_start',
            agent: 'reviewer',
            agentName: phase.name,
            message: '审查员开始工作...',
            timestamp: new Date().toISOString(),
          };
          yield {
            type: 'log',
            agent: 'reviewer',
            agentName: phase.name,
            message: '\u274c 收到的代码为空或不完整，无法进行有效评审。工程师可能未输出完整代码。',
            timestamp: new Date().toISOString(),
          };
          phaseResults['reviewer'] = '代码不完整，无法评审。评分：3';
          yield {
            type: 'agent_done',
            agent: 'reviewer',
            agentName: phase.name,
            message: '审查员工作完成',
            timestamp: new Date().toISOString(),
          };
          continue;
        }
      }

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
        let thinkingContent = '';
        let hasAnyContent = false;

        for await (const chunk of this.callArkStream(messages, phase.maxTokens, phase.disableThinking)) {
          if (!chunk || !chunk.text) continue;
          const { type, text } = chunk;

          if (type === 'thinking') {
            if (phase.isCodePhase) {
              thinkingContent += text;
              yield {
                type: 'thinking',
                agent: phase.key,
                agentName: phase.name,
                message: text,
                timestamp: new Date().toISOString(),
              };
            } else {
              yield {
                type: 'log',
                agent: phase.key,
                agentName: phase.name,
                message: text,
                timestamp: new Date().toISOString(),
              };
            }
            continue;
          }

          if (!hasAnyContent && text.trim()) hasAnyContent = true;

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

        if (phase.isCodePhase) {
          const phaseExtract = this.robustExtractHtml(phaseContent);
          const fullExtract = this.robustExtractHtml(fullHtml);
          const phaseHtmlOk = phaseExtract.complete;
          const fullHtmlOk = fullExtract.complete;

          this.logger.log(
            `[generateStream] ${phase.name} 阶段结束校验 ` +
            `phaseContentLen=${phaseContent.length} ` +
            `fullHtmlLen=${fullHtml.length} ` +
            `thinkingLen=${thinkingContent.length} ` +
            `phaseExtractComplete=${phaseExtract.complete} ` +
            `fullExtractComplete=${fullExtract.complete} ` +
            `phaseExtractReason=${phaseExtract.reason}`,
          );

          if (!fullHtmlOk && thinkingContent.trim()) {
            this.logger.warn(
              `[generateStream] ${phase.name} 输出不完整，尝试从thinking兜底提取 ` +
              `(fullHtmlOk=${fullHtmlOk}, phaseHtmlOk=${phaseHtmlOk})`,
            );
            const thinkingExtract = this.robustExtractHtml(thinkingContent);
            if (thinkingExtract.complete) {
              phaseContent = thinkingContent;
              fullHtml = thinkingExtract.html;
              yield {
                type: 'code_chunk',
                agent: phase.key,
                agentName: phase.name,
                code: thinkingExtract.html,
                fullHtml,
                timestamp: new Date().toISOString(),
              };
              this.logger.log(
                `[generateStream] ${phase.name} thinking兜底提取成功，长度=${thinkingExtract.html.length}`,
              );
            } else {
              this.logger.warn(
                `[generateStream] ${phase.name} thinking兜底也不完整 ` +
                `(reason=${thinkingExtract.reason}, len=${thinkingExtract.html.length})`,
              );
            }
          }
        }

        phaseResults[phase.key] = phaseContent;

        if (phase.key === 'engineer') {
          const MAX_ENGINEER_RETRIES = 2;
          let engineerRetries = 0;
          let completionAttempted = false;

          while (engineerRetries < MAX_ENGINEER_RETRIES) {
            const extracted = this.robustExtractHtml(fullHtml || phaseContent);
            if (extracted.complete) break;

            const currentHtml = fullHtml || extracted.html || phaseContent;

            if (!completionAttempted && this.isTailTruncated(currentHtml)) {
              completionAttempted = true;
              this.logger.warn(
                `[generateStream] Engineer 检测到尾部截断，优先补全剩余代码 ` +
                `(len=${currentHtml.length}, reason=${extracted.reason})`,
              );
              yield {
                type: 'log',
                agent: 'engineer',
                agentName: phase.name,
                message: '检测到输出尾部截断，正在补全剩余代码...',
                timestamp: new Date().toISOString(),
              };

              const completer = this.completeTruncatedHtml(
                currentHtml,
                description,
                phase.name,
                'engineer',
              );
              let completionResult: { success: boolean; completedHtml: string } | undefined;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let step: any;
              while (true) {
                step = await completer.next(completionResult);
                if (step.done) {
                  completionResult = step.value as { success: boolean; completedHtml: string };
                  break;
                }
                yield step.value as StreamEvent;
              }

              if (completionResult && completionResult.success) {
                fullHtml = completionResult.completedHtml;
                phaseContent = completionResult.completedHtml;
                phaseResults['engineer'] = phaseContent;
                this.logger.log(
                  `[generateStream] Engineer 补全成功，最终长度=${completionResult.completedHtml.length}`,
                );
                continue;
              }

              this.logger.warn(
                `[generateStream] Engineer 补全未完成，转为全量重新生成 ` +
                `(success=${completionResult?.success})`,
              );
              yield {
                type: 'log',
                agent: 'engineer',
                agentName: phase.name,
                message: '补全未完成，转为全量重新生成...',
                timestamp: new Date().toISOString(),
              };
            }

            engineerRetries += 1;
            this.logger.warn(
              `[generateStream] Engineer 输出不完整，第${engineerRetries}次全量重试 ` +
                `(reason=${extracted.reason}, len=${extracted.html.length}, ` +
                `fullHtmlLen=${fullHtml.length})`,
            );
            yield {
              type: 'log',
              agent: 'engineer',
              agentName: phase.name,
              message: `\u26a0\ufe0f 代码输出不完整（${extracted.reason}），正在重新生成完整代码...（第${engineerRetries}次重试）`,
              timestamp: new Date().toISOString(),
            };

            const retryPrompt = `你是一位前端开发工程师。请根据以下需求生成一个完整的、可直接运行的 HTML 网页应用。

【用户需求】
${description}

【重要要求】
1. 上次输出的代码不完整（${extracted.reason}），本次必须输出从 <!DOCTYPE html> 到 </html> 的完整代码
2. 所有 HTML/CSS/JS 代码必须放在 \`\`\`html 代码块中，代码放在正文内容里，不要放在思考过程中
3. 代码块必须有闭合的 \`\`\`，不要截断
4. 代码必须完整包含：DOCTYPE、html、head、body、所有样式和脚本
5. 确保 </body> 和 </html> 标签存在
6. 输出语言：中文

请直接输出完整的 HTML 代码，前面可以有一句话说明，但主体必须是完整可运行的 HTML 代码。`;

            const retryMessages: ArkChatMessage[] = [
              { role: 'system', content: '你是一个专业的前端开发工程师，擅长生成完整的HTML页面。' },
              { role: 'user', content: retryPrompt },
            ];

            let retryContent = '';
            let retryCodeBuffer = '';
            let retryInCodeBlock = false;
            let retryThinking = '';
            let retryHasContent = false;
            let retryFullHtml = '';

            for await (const chunk of this.callArkStream(retryMessages, phase.maxTokens, phase.disableThinking)) {
              if (!chunk || !chunk.text) continue;
              const { type, text } = chunk;

              if (type === 'thinking') {
                retryThinking += text;
                yield {
                  type: 'thinking',
                  agent: 'engineer',
                  agentName: phase.name,
                  message: text,
                  timestamp: new Date().toISOString(),
                };
                continue;
              }

              if (!retryHasContent && text.trim()) retryHasContent = true;
              retryContent += text;
              retryCodeBuffer += text;

              if (!retryInCodeBlock) {
                const startIdx = retryCodeBuffer.indexOf('```html');
                if (startIdx !== -1) {
                  retryInCodeBlock = true;
                  const beforeCode = retryCodeBuffer.slice(0, startIdx);
                  if (beforeCode.trim()) {
                    yield {
                      type: 'log',
                      agent: 'engineer',
                      agentName: phase.name,
                      message: beforeCode,
                      timestamp: new Date().toISOString(),
                    };
                  }
                  retryCodeBuffer = retryCodeBuffer.slice(startIdx + 7);
                } else {
                  yield {
                    type: 'log',
                    agent: 'engineer',
                    agentName: phase.name,
                    message: text,
                    timestamp: new Date().toISOString(),
                  };
                }
              }

              if (retryInCodeBlock) {
                const endIdx = retryCodeBuffer.indexOf('```');
                if (endIdx !== -1 && endIdx > 0) {
                  const codePart = retryCodeBuffer.slice(0, endIdx);
                  retryFullHtml += codePart;
                  yield {
                    type: 'code_chunk',
                    agent: 'engineer',
                    agentName: phase.name,
                    code: codePart,
                    fullHtml: retryFullHtml,
                    timestamp: new Date().toISOString(),
                  };
                  retryCodeBuffer = retryCodeBuffer.slice(endIdx + 3);
                  retryInCodeBlock = false;
                } else {
                  const flushPoint = Math.floor(retryCodeBuffer.length * 0.8);
                  if (flushPoint > 50) {
                    const toFlush = retryCodeBuffer.slice(0, flushPoint);
                    retryFullHtml += toFlush;
                    yield {
                      type: 'code_chunk',
                      agent: 'engineer',
                      agentName: phase.name,
                      code: toFlush,
                      fullHtml: retryFullHtml,
                      timestamp: new Date().toISOString(),
                    };
                    retryCodeBuffer = retryCodeBuffer.slice(flushPoint);
                  }
                }
              }
            }

            if (retryInCodeBlock && retryCodeBuffer.length > 0) {
              const endIdx = retryCodeBuffer.indexOf('```');
              const remaining = endIdx !== -1
                ? retryCodeBuffer.slice(0, endIdx)
                : retryCodeBuffer;
              retryFullHtml += remaining;
              yield {
                type: 'code_chunk',
                agent: 'engineer',
                agentName: phase.name,
                code: remaining,
                fullHtml: retryFullHtml,
                timestamp: new Date().toISOString(),
              };
            }

            const retryExtract = this.robustExtractHtml(retryFullHtml || retryContent);
            if (!retryExtract.complete && retryThinking.trim()) {
              this.logger.warn(
                `[generateStream] Engineer 第${engineerRetries}次重试正文仍不完整，尝试thinking兜底`,
              );
              const thinkingRetry = this.robustExtractHtml(retryThinking);
              if (thinkingRetry.complete) {
                retryFullHtml = thinkingRetry.html;
                retryContent = retryThinking;
                this.logger.log(
                  `[generateStream] Engineer 第${engineerRetries}次重试thinking兜底成功，长度=${thinkingRetry.html.length}`,
                );
              }
            }

            const finalRetryExtract = this.robustExtractHtml(retryFullHtml || retryContent);
            if (finalRetryExtract.complete) {
              phaseContent = retryContent;
              fullHtml = finalRetryExtract.html;
              phaseResults['engineer'] = phaseContent;
              this.logger.log(
                `[generateStream] Engineer 第${engineerRetries}次重试成功，html长度=${finalRetryExtract.html.length}`,
              );
              break;
            } else {
              this.logger.warn(
                `[generateStream] Engineer 第${engineerRetries}次重试仍不完整（reason=${finalRetryExtract.reason}）`,
              );
              phaseContent = retryContent;
              fullHtml = finalRetryExtract.html;
              phaseResults['engineer'] = phaseContent;
            }
          }
        }

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

    currentHtml = finalHtml;
    issuesText = this.extractIssues(phaseResults['reviewer'] || '');
    let currentIssuesText = issuesText.join('\n');

    const htmlComplete = this.isHtmlComplete(finalHtml);
    if (!htmlComplete) {
      const incompleteIssue = 'HTML 代码不完整：缺少 </html> 或 </body> 闭合标签，代码可能被截断。请补全完整的 HTML 结构。';
      currentIssuesText = currentIssuesText
        ? `${currentIssuesText}\n${incompleteIssue}`
        : incompleteIssue;
      if (finalScore >= MIN_SCORE_PASS) {
        finalScore = MIN_SCORE_PASS - 1;
      }
    }

    if (finalScore < MIN_SCORE_PASS && currentIssuesText) {
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
          let fixerThinking = '';
          let fixerHasContent = false;

          for await (const chunk of this.callArkStream(fixerMessages, ENGINEER_MAX_TOKENS, true)) {
            if (!chunk || !chunk.text) continue;
            const { type, text } = chunk;

            if (type === 'thinking') {
              fixerThinking += text;
              if (fixerHasContent) {
                yield {
                  type: 'fixer_log',
                  agent: 'fixer',
                  agentName: 'Fixer Agent',
                  message: text,
                  round,
                  timestamp: new Date().toISOString(),
                };
              }
              continue;
            }

            if (!fixerHasContent && text.trim()) fixerHasContent = true;

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

          let fixedHtml = this.extractHtml(fixerContent || fixerFullHtml);
          if (!fixedHtml && !fixerContent.trim() && fixerThinking.trim()) {
            const thinkingExtract = this.robustExtractHtml(fixerThinking);
            if (thinkingExtract.html) {
              fixedHtml = thinkingExtract.html;
              fixerFullHtml = thinkingExtract.html;
              this.logger.log(
                `[generateStream] Fixer 第${round}轮thinking兜底提取成功，长度=${fixedHtml.length}`,
              );
            }
          }
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
            for await (const chunk of this.callArkStream(reReviewMessages, REVIEW_MAX_TOKENS)) {
              if (!chunk || !chunk.text) continue;
              const { type, text } = chunk;
              if (type === 'thinking') {
                yield {
                  type: 'log',
                  agent: 'reviewer',
                  agentName: 'Reviewer',
                  message: text,
                  timestamp: new Date().toISOString(),
                };
                continue;
              }
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

    doneSent = true;
    yield {
      type: 'done',
      fullHtml: currentHtml,
      score: finalScore,
      fixIssues: issuesText,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : '未知错误';
    this.logger.error('[generateStream] 生成流程异常', error);
    yield {
      type: 'error',
      agent: 'system',
      agentName: 'System',
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (!doneSent) {
      this.logger.warn(
        `[generateStream] 流程异常终止，补发 done 事件（hasError=${!!errorMessage}）`,
      );
      yield {
        type: 'done',
        fullHtml: currentHtml || fullHtml,
        score: finalScore,
        fixIssues: issuesText,
        timestamp: new Date().toISOString(),
      };
    }
  }
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
    const rebuildPrompt = `你是一位资深前端工程师。你的任务是严格按照用户的修改指令，对现有的完整 HTML 网页进行精准的增量修改。

【用户修改指令】
${modifyInstruction || description}

【设计风格】
${style}

【现有完整 HTML 代码】
\`\`\`html
${existingHtml}
\`\`\`

【重要声明 — 必须严格遵守】
1. **以上代码是完整可用的**，包含从 <!DOCTYPE html> 到 </html> 的全部内容，不存在任何截断、缺失或不完整。请不要声称代码不完整，也不要去"补全"任何未被要求修改的部分。
2. **只改用户明确要求修改的部分**，其余所有代码、功能、结构、样式必须完整保留，不得擅自重构、删减或添加未被要求的内容。
3. **必须确保用户的修改指令在最终代码中完全生效**。例如要求改标题则 <title> 和页面主标题必须同时更新；要求改颜色则按钮/主题色必须出现对应颜色值。
4. 输出完整的、可直接运行的 HTML 文件，所有 CSS 和 JavaScript 都内联在 HTML 中。
5. 保持整体结构和风格的一致性，确保修改后的代码功能完整、可直接运行。
6. 输出的代码必须包含完整的 <!DOCTYPE html> 开头和 </html> 结尾，禁止中途截断。
7. **移动端适配强制要求**：
   - 必须有 viewport meta 标签
   - 必须包含 @media (max-width: 768px) 和 @media (max-width: 480px) 两档响应式样式
   - 禁止 body { overflow: hidden }，如需禁止横向滚动用 overflow-x: hidden
   - flex 布局设置 flex-wrap: wrap
   - 按钮/可点击区域高度 ≥ 44px

请直接输出完整的修改后的 HTML 代码（从 <!DOCTYPE html> 开始到 </html> 结束），用 \`\`\`html 代码块包裹。**不要输出任何额外的解释文字，只输出代码块。**`;

    yield {
      type: 'agent_start',
      agent: 'engineer',
      agentName: 'Engineer',
      message: 'Engineer 正在根据修改指令更新代码...',
      timestamp: new Date().toISOString(),
    };

    try {
      const messages: ArkChatMessage[] = [
        {
          role: 'system',
          content:
            '你是一个严谨的前端工程师。规则：\n'
            + '1. 提供给你的现有 HTML 代码是完整可用的，不存在截断或缺失。\n'
            + '2. 严格按照用户的修改指令修改现有 HTML，用户要求改什么就改什么，不要自作主张。\n'
            + '3. 用户要求改标题时，必须同时更新 <title> 标签和页面内主标题。\n'
            + '4. 用户要求改颜色时，必须使用合法的 CSS 颜色值（如 #ff0000、rgb(255,0,0)、red 等），绝对禁止写中文颜色名称或短语作为属性值。\n'
            + '5. 用户要求改背景色时，必须修改 body 的 background 或 background-color 属性，值必须是合法 CSS 颜色。\n'
            + '6. 没有被要求修改的部分，原样保留，不要重构、不要重写、不要补全。\n'
            + '7. 输出完整 HTML（<!DOCTYPE html> 到 </html>），必须包含 </html> 闭合标签。\n'
            + '8. 只输出 ```html 代码块，不要输出任何解释文字。\n'
            + '9. **移动端适配强制要求**：\n'
            + '   - 必须有 viewport meta 标签\n'
            + '   - 必须包含 @media (max-width: 768px) 和 @media (max-width: 480px) 两档响应式样式\n'
            + '   - 禁止 body { overflow: hidden }，如需禁止横向滚动用 overflow-x: hidden\n'
            + '   - flex 布局设置 flex-wrap: wrap\n'
            + '   - 按钮最小高度 44px，确保移动端触摸友好',
        },
        { role: 'user', content: rebuildPrompt },
      ];

      let fullHtml = '';
      let codeBuffer = '';
      let inCodeBlock = false;
      let phaseContent = '';
      let thinkingContent = '';
      let hasAnyContent = false;

      for await (const chunk of this.callArkStream(messages, ENGINEER_MAX_TOKENS, true)) {
        if (!chunk || !chunk.text) continue;
        const { type, text } = chunk;

        if (type === 'thinking') {
          thinkingContent += text;
          yield {
            type: 'thinking',
            agent: 'engineer',
            agentName: 'Engineer',
            message: text,
            timestamp: new Date().toISOString(),
          };
          continue;
        }

        if (!hasAnyContent && text.trim()) {
          hasAnyContent = true;
        }

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

      const extractResult = this.robustExtractHtml(phaseContent || fullHtml);
      let finalHtml = extractResult.html;
      let isHtmlComplete = extractResult.complete;
      let failureReason = extractResult.reason;

      if (!isHtmlComplete && !phaseContent.trim() && thinkingContent.trim()) {
        const thinkingResult = this.robustExtractHtml(thinkingContent);
        if (thinkingResult.complete) {
          finalHtml = thinkingResult.html;
          isHtmlComplete = true;
          failureReason = 'ok';
          fullHtml = finalHtml;
          this.logger.log(
            `[rebuildStream] reasoning兜底提取成功（模型把代码输出到reasoning中），长度=${finalHtml.length}`,
          );
          yield {
            type: 'code_chunk',
            agent: 'engineer',
            agentName: 'Engineer',
            code: finalHtml,
            fullHtml: finalHtml,
            timestamp: new Date().toISOString(),
          };
        } else if (thinkingResult.html) {
          finalHtml = thinkingResult.html;
          failureReason = thinkingResult.reason;
          fullHtml = finalHtml;
          this.logger.warn(
            `[rebuildStream] reasoning兜底也不完整（reason=${thinkingResult.reason}）`,
          );
        }
      }

      if (!isHtmlComplete && !phaseContent.trim() && fullHtml.trim()) {
        const fallbackResult = this.robustExtractHtml(fullHtml);
        if (fallbackResult.complete) {
          finalHtml = fallbackResult.html;
          isHtmlComplete = true;
          failureReason = 'ok';
          this.logger.log(
            `[rebuildStream] fullHtml兜底提取成功（phaseContent为空但fullHtml完整）`,
          );
        }
      }

      if (!isHtmlComplete) {
        const currentHtml = finalHtml || fullHtml || phaseContent;

        if (this.isTailTruncated(currentHtml)) {
          this.logger.warn(
            `[rebuildStream] 检测到尾部截断，优先补全剩余代码(len=${currentHtml.length})`,
          );
          yield {
            type: 'log',
            agent: 'engineer',
            agentName: 'Engineer',
            message: '检测到输出尾部截断，正在补全剩余代码...',
            timestamp: new Date().toISOString(),
          };

          const completer = this.completeTruncatedHtml(
            currentHtml,
            instruction,
            'Engineer',
            'engineer',
          );
          let completionResult: { success: boolean; completedHtml: string } | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let step: any;
          while (true) {
            step = await completer.next(completionResult);
            if (step.done) {
              completionResult = step.value as { success: boolean; completedHtml: string };
              break;
            }
            yield step.value as StreamEvent;
          }

          if (completionResult && completionResult.success) {
            finalHtml = completionResult.completedHtml;
            fullHtml = finalHtml;
            isHtmlComplete = true;
            phaseContent = finalHtml;
            this.logger.log(
              `[rebuildStream] 补全成功，finalHtml长度=${finalHtml.length}`,
            );
          } else {
            this.logger.warn(
              `[rebuildStream] 补全未完成，转为全量重新生成`,
            );
            yield {
              type: 'log',
              agent: 'engineer',
              agentName: 'Engineer',
              message: '补全未完成，转为全量重新生成...',
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (!isHtmlComplete) {
          this.logger.warn(
            `[rebuildStream] 首次输出不完整（reason=${extractResult.reason}），触发全量重试`,
          );
          yield {
            type: 'log',
            agent: 'engineer',
            agentName: 'Engineer',
            message: '检测到输出不完整，正在重新生成完整代码...',
            timestamp: new Date().toISOString(),
          };

          const partialContent = phaseContent || fullHtml;
          const retryPrompt = `上次输出不完整，缺少 </html> 闭合标签（可能被截断）。请重新输出**完整的** HTML 文档，严格满足以下要求：

1. 必须从 <!DOCTYPE html> 开始，以 </html> 结束，中间不得截断
2. 保留所有已实现的修改效果和完整的页面结构
3. 使用 \`\`\`html 代码块包裹，但代码块内必须是完整闭合的 HTML
4. 不要输出任何额外的解释文字，只输出完整代码块
5. 确保所有标签正确闭合，特别是 </body> 和 </html>

【原始修改指令】
${instruction}

【上次不完整的输出（供参考，请在此基础上补全并重写完整版本）】
${partialContent.slice(-3000)}`;

          const retryMessages: ArkChatMessage[] = [
            {
              role: 'system',
              content: '你是一个严谨的前端工程师。请输出完整闭合的 HTML 文档，从 <!DOCTYPE html> 到 </html>，绝不允许截断。',
            },
            { role: 'user', content: retryPrompt },
          ];

          let retryContent = '';
          try {
            for await (const retryChunk of this.callArkStream(retryMessages, ENGINEER_MAX_TOKENS, true)) {
              if (!retryChunk || !retryChunk.text) continue;
              if (retryChunk.type === 'thinking') continue;
              retryContent += retryChunk.text;
            }
          } catch (retryErr) {
            this.logger.error('[rebuildStream] 全量重试失败', retryErr);
          }

          if (retryContent) {
            const retryResult = this.robustExtractHtml(retryContent);
            if (retryResult.complete) {
              finalHtml = retryResult.html;
              isHtmlComplete = true;
              fullHtml = finalHtml;
              yield {
                type: 'code_chunk',
                agent: 'engineer',
                agentName: 'Engineer',
                code: finalHtml,
                fullHtml: finalHtml,
                timestamp: new Date().toISOString(),
              };
              this.logger.log(
                `[rebuildStream] 全量重试成功，finalHtml长度=${finalHtml.length}`,
              );
            } else {
              this.logger.warn(
                `[rebuildStream] 全量重试仍不完整（reason=${retryResult.reason}）`,
              );
            }
          }
        }
      }

      if (isHtmlComplete) {
        yield {
          type: 'agent_done',
          agent: 'engineer',
          agentName: 'Engineer',
          message: '代码修改完成',
          fullHtml: finalHtml,
          timestamp: new Date().toISOString(),
        };
      } else {
        this.logger.warn(
          `[rebuildStream] Engineer输出不完整，finalHtml长度=${finalHtml.length}，phaseContent长度=${phaseContent.length}`,
        );
        yield {
          type: 'agent_done',
          agent: 'engineer',
          agentName: 'Engineer',
          message: '代码输出未完整闭合，进入修复流程',
          fullHtml: finalHtml,
          timestamp: new Date().toISOString(),
        };

        yield {
          type: 'incomplete',
          fullHtml: finalHtml,
          reason: failureReason || 'unknown',
          timestamp: new Date().toISOString(),
        };
      }
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
      let thinkingContent = '';
      let hasAnyContent = false;

      for await (const chunk of this.callArkStream(messages, ENGINEER_MAX_TOKENS, true)) {
        if (!chunk) continue;
        const { type, text } = chunk as { type: string; text: string };
        if (!text) continue;

        if (type === 'thinking') {
          thinkingContent += text;
          yield {
            type: 'thinking',
            agent: 'engineer',
            agentName: 'Debugger Agent',
            message: text,
            timestamp: new Date().toISOString(),
          };
          continue;
        }

        if (!hasAnyContent && text.trim()) hasAnyContent = true;

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

      let debugExtractResult = this.robustExtractHtml(phaseContent || fullHtml);
      let finalHtml = debugExtractResult.html;

      if (!debugExtractResult.complete && !phaseContent.trim() && thinkingContent.trim()) {
        const thinkingResult = this.robustExtractHtml(thinkingContent);
        if (thinkingResult.complete && thinkingResult.html) {
          debugExtractResult = thinkingResult;
          finalHtml = thinkingResult.html;
          fullHtml = finalHtml;
          yield {
            type: 'code_chunk',
            agent: 'engineer',
            agentName: 'Debugger Agent',
            code: finalHtml,
            fullHtml,
            timestamp: new Date().toISOString(),
          };
          this.logger.log(
            `[debugFixStream] reasoning兜底提取成功，长度=${finalHtml.length}`,
          );
        }
      }

      if (!debugExtractResult.complete) {
        const currentHtml = finalHtml || fullHtml || phaseContent;

        if (this.isTailTruncated(currentHtml)) {
          this.logger.warn(
            `[debugFixStream] 检测到尾部截断，优先补全剩余代码(len=${currentHtml.length})`,
          );
          yield {
            type: 'log',
            agent: 'engineer',
            agentName: 'Debugger Agent',
            message: '检测到输出尾部截断，正在补全剩余代码...',
            timestamp: new Date().toISOString(),
          };

          const completer = this.completeTruncatedHtml(
            currentHtml,
            `修复以下错误：${errors}`,
            'Debugger Agent',
            'engineer',
          );
          let completionResult: { success: boolean; completedHtml: string } | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let step: any;
          while (true) {
            step = await completer.next(completionResult);
            if (step.done) {
              completionResult = step.value as { success: boolean; completedHtml: string };
              break;
            }
            yield step.value as StreamEvent;
          }

          if (completionResult && completionResult.success) {
            finalHtml = completionResult.completedHtml;
            fullHtml = finalHtml;
            debugExtractResult = { html: finalHtml, complete: true, reason: 'completed_by_completion' };
            this.logger.log(
              `[debugFixStream] 补全成功，finalHtml长度=${finalHtml.length}`,
            );
          } else {
            this.logger.warn('[debugFixStream] 补全未完成，转为全量重新生成');
            yield {
              type: 'log',
              agent: 'engineer',
              agentName: 'Debugger Agent',
              message: '补全未完成，转为全量重新生成...',
              timestamp: new Date().toISOString(),
            };
          }
        }

        if (!debugExtractResult.complete) {
          this.logger.warn(
            `[debugFixStream] 首次输出不完整（reason=${debugExtractResult.reason}），触发全量重试`,
          );
          yield {
            type: 'log',
            agent: 'engineer',
            agentName: 'Debugger Agent',
            message: '检测到输出不完整，正在重新生成完整修复代码...',
            timestamp: new Date().toISOString(),
          };

          const retryPrompt = `上次输出的修复代码不完整，缺少 </html> 闭合标签。请重新输出**完整的**修复后 HTML 文档：

1. 必须从 <!DOCTYPE html> 开始，以 </html> 结束，中间不得截断
2. 保留所有错误修复效果和完整页面结构
3. 使用 \`\`\`html 代码块包裹，但代码块内必须是完整闭合的 HTML
4. 不要输出任何额外的解释文字，只输出完整代码块
5. 确保所有标签正确闭合，特别是 </body> 和 </html>

【原始错误信息】
${errors}

【上次不完整的输出（最后3000字，供参考）】
${(phaseContent || fullHtml).slice(-3000)}`;

          const retryMessages: ArkChatMessage[] = [
            {
              role: 'system',
              content: '你是一个专业的前端调试工程师。请输出完整闭合的 HTML 文档，从 <!DOCTYPE html> 到 </html>，绝不允许截断。',
            },
            { role: 'user', content: retryPrompt },
          ];

          let retryContent = '';
          try {
            for await (const retryChunk of this.callArkStream(retryMessages, ENGINEER_MAX_TOKENS, true)) {
              if (!retryChunk || !retryChunk.text) continue;
              if (retryChunk.type === 'thinking') continue;
              retryContent += retryChunk.text;
            }
          } catch (retryErr) {
            this.logger.error('[debugFixStream] 全量重试失败', retryErr);
          }

          if (retryContent) {
            const retryResult = this.robustExtractHtml(retryContent);
            if (retryResult.complete) {
              finalHtml = retryResult.html;
              fullHtml = finalHtml;
              yield {
                type: 'code_chunk',
                agent: 'engineer',
                agentName: 'Debugger Agent',
                code: finalHtml,
                fullHtml: finalHtml,
                timestamp: new Date().toISOString(),
              };
              this.logger.log(
                `[debugFixStream] 全量重试成功，finalHtml长度=${finalHtml.length}`,
              );
            }
          }
        }
      }

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
    disableThinking = false,
  ): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }> {
    if (!ARK_API_KEY) {
      this.logger.warn('ARK_API_KEY 未设置，LLM 调用将失败');
      throw new Error('ARK_API_KEY 未配置，请在环境变量中设置');
    }

    const url = `${ARK_BASE_URL}/chat/completions`;

      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: ARK_TEMPERATURE,
        max_tokens: maxTokens ?? ARK_MAX_TOKENS,
        stream: true,
      };
      if (disableThinking) {
        body.thinking = { type: 'disabled' };
      }

      const response = await axios.post(
        url,
        body,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ARK_API_KEY}`,
        },
        responseType: 'stream',
        timeout: ARK_FIRST_BYTE_TIMEOUT,
        validateStatus: (status: number) => status >= 200 && status < 300,
      },
    );

    const stream = response.data as NodeJS.ReadableStream;
    let buffer = '';
    let hasReceivedAny = false;
    let hasYieldedContent = false;
    let hasYieldedThinking = false;
    let totalChunks = 0;
    const startTime = Date.now();
    this.logger.log(
      `[LLM] 请求ARK model=${model} max_tokens=${maxTokens ?? ARK_MAX_TOKENS} stream=true temperature=${ARK_TEMPERATURE} messages=${messages.length}`,
    );

    try {
      for await (const chunk of stream) {
        if (!hasReceivedAny) {
          hasReceivedAny = true;
          const firstByteMs = Date.now() - startTime;
          this.logger.log(`[LLM] 首字节到达 model=${model} elapsed=${firstByteMs}ms`);
        }
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
                delta?: { content?: string; reasoning_content?: string };
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

            const delta = data.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            const content = delta?.content;

            if (reasoning) {
              if (!hasYieldedThinking) {
                hasYieldedThinking = true;
                const thinkMs = Date.now() - startTime;
                this.logger.log(`[LLM] 首条 reasoning 到达 model=${model} elapsed=${thinkMs}ms`);
              }
              yield { type: 'thinking', text: reasoning };
            }
            if (content) {
              if (!hasYieldedContent) {
                hasYieldedContent = true;
                const contentMs = Date.now() - startTime;
                this.logger.log(`[LLM] 首条 content 到达 model=${model} elapsed=${contentMs}ms`);
              }
              totalChunks += 1;
              yield { type: 'content', text: content };
            }
          } catch (error) {
            if (error instanceof Error && error.message.startsWith('ARK API 错误')) {
              throw error;
            }
            this.logger.debug('SSE 行解析失败', dataStr);
          }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > ARK_TOTAL_STREAM_TIMEOUT) {
          throw new Error(
            `流式生成总时长超时（${Math.round(elapsed / 1000)}s > ${ARK_TOTAL_STREAM_TIMEOUT / 1000}s）`,
          );
        }
      }
    } catch (error) {
      if (!hasYieldedContent) {
        throw error;
      }
      throw error;
    }

    if (!hasReceivedAny) {
      throw new EarlyStreamError('ARK API 未返回任何数据');
    }

    const totalMs = Date.now() - startTime;
    this.logger.log(
      `[LLM] 调用完成 model=${model} totalMs=${totalMs}ms contentChunks=${totalChunks} hasThinking=${hasYieldedThinking}`,
    );

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('data:')) {
        const dataStr = trimmed.slice(5).trim();
        if (dataStr && dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
            };
            const delta = data.choices?.[0]?.delta;
            if (delta?.reasoning_content) {
              yield { type: 'thinking', text: delta.reasoning_content };
            }
            if (delta?.content) {
              yield { type: 'content', text: delta.content };
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
    disableThinking = false,
  ): AsyncGenerator<{ type: 'content' | 'thinking'; text: string }> {
    const models: string[] = (this as any)._modelOverride ?? getModelList();
    const errors: string[] = [];

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      try {
        this.logger.log(`[LLM] 使用模型 ${model} 开始调用`);
        const generator = this.callArkStreamWithModel(model, messages, maxTokens, disableThinking);
        let hasYieldedContent = false;
        let hasReceivedAny = false;
        let lastReceiveTime = Date.now();
        let idleTimer: NodeJS.Timeout | null = null;
        let idleTimedOut = false;

        const resetIdle = (): void => {
          lastReceiveTime = Date.now();
        };

        const startIdleTimer = (): void => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            idleTimedOut = true;
            void generator.return({ type: 'content', text: '' });
          }, ARK_CHUNK_IDLE_TIMEOUT);
        };

        const stopIdleTimer = (): void => {
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
        };

        try {
          startIdleTimer();
          while (true) {
            const result = await generator.next();
            resetIdle();
            if (result.done) {
              this.logger.log(`[LLM] 模型 ${model} 调用完成`);
              return;
            }
            const { type, text } = result.value;
            if (type === 'thinking') {
              hasReceivedAny = true;
              yield { type: 'thinking', text };
              continue;
            }
            if (type === 'content') {
              hasReceivedAny = true;
              if (!hasYieldedContent) {
                hasYieldedContent = true;
                this.logger.log(`[LLM] 模型 ${model} 首字输出，流式开始`);
              }
              yield { type: 'content', text };
            }
          }
        } finally {
          stopIdleTimer();
        }

        if (idleTimedOut) {
          throw new Error(
            `流式数据空闲超时（${ARK_CHUNK_IDLE_TIMEOUT / 1000}s 无数据）`,
          );
        }
        if (!hasReceivedAny) {
          throw new EarlyStreamError('ARK API 未返回任何数据');
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
              error.code === 'ECONNRESET' ||
              error.code === 'ERR_CANCELED')) ||
          errMsg === 'aborted' ||
          errMsg.includes('超时') ||
          errMsg.includes('timeout') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('连接重置');

        if (isConnectionError && hasMore) {
          this.logger.warn(
            `[LLM] 模型 ${model} 连接错误，降级到模型 ${nextModel}。原因: ${errMsg}`,
          );
          continue;
        }

        if (!isConnectionError && hasMore) {
          this.logger.warn(
            `[LLM] 模型 ${model} 流式输出中途业务失败（已输出内容），不降级，直接报错。原因: ${errMsg}`,
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

  private isTailTruncated(html: string): boolean {
    if (!html || html.length <= 8000) return false;
    const lower = html.toLowerCase();
    const hasStart = lower.includes('<!doctype html') || /<html[\s>]/i.test(lower);
    if (!hasStart) return false;
    const hasClose = lower.includes('</html>');
    if (hasClose) return false;
    return true;
  }

  private async *completeTruncatedHtml(
    truncatedHtml: string,
    description: string,
    agentName: string,
    agentKey: string,
  ): AsyncGenerator<StreamEvent, { success: boolean; completedHtml: string }, unknown> {
    const tailContext = truncatedHtml.slice(-2000);
    const completePrompt = `以下是正在生成的 HTML 代码，输出在中途被截断，缺少尾部闭合。请**从截断处继续**输出剩余部分，使其完整闭合到 \`</html>\`。

【重要要求】
1. **不要重复已输出的内容**，从上次的截断位置继续往下写
2. 不要重新分析需求，不要加解释文字，不要输出 \`\`\`html 开头
3. 直接继续输出代码，直到 </body></html> 完整闭合
4. 闭合后输出 \`\`\` 结束代码块
5. 确保所有已打开的标签正确闭合

【用户需求背景】
${description}

【已生成代码的最后 2000 字符（从这里继续）】
${tailContext}

请直接继续输出剩余代码：`;

    const messages: ArkChatMessage[] = [
      { role: 'system', content: '你是一位专业的前端补全工程师。你的任务是从截断处继续输出剩余的HTML代码，只输出后续部分，不要重复已有内容，不要解释。' },
      { role: 'user', content: completePrompt },
    ];

    let completionContent = '';
    let codeBuffer = '';
    let started = false;

    for await (const chunk of this.callArkStream(messages, ENGINEER_MAX_TOKENS, true)) {
      if (!chunk || !chunk.text) continue;
      if (chunk.type === 'thinking') continue;

      const text = chunk.text;
      completionContent += text;
      codeBuffer += text;

      if (!started) {
        const fenceIdx = codeBuffer.indexOf('```html');
        if (fenceIdx !== -1) {
          started = true;
          codeBuffer = codeBuffer.slice(fenceIdx + 7);
        } else {
          const newlineIdx = codeBuffer.indexOf('\n');
          if (newlineIdx !== -1 && newlineIdx < 100) {
            const firstLine = codeBuffer.slice(0, newlineIdx).trim();
            if (!firstLine.startsWith('<') && firstLine.length < 80) {
              const skipIdx = codeBuffer.indexOf('\n') + 1;
              if (codeBuffer.slice(skipIdx).trim().startsWith('<') || codeBuffer.slice(skipIdx).trim().startsWith('```')) {
                started = true;
                codeBuffer = codeBuffer.slice(skipIdx);
                if (codeBuffer.startsWith('```html')) {
                  codeBuffer = codeBuffer.slice(7);
                }
              }
            }
          }
        }
      }

      if (started) {
        const endIdx = codeBuffer.indexOf('```');
        let toEmit = '';
        if (endIdx !== -1) {
          toEmit = codeBuffer.slice(0, endIdx);
          codeBuffer = codeBuffer.slice(endIdx + 3);
        } else {
          const flushPoint = Math.floor(codeBuffer.length * 0.7);
          if (flushPoint > 50) {
            toEmit = codeBuffer.slice(0, flushPoint);
            codeBuffer = codeBuffer.slice(flushPoint);
          }
        }
        if (toEmit) {
          yield {
            type: 'code_chunk',
            agent: agentKey as AgentLogEntry['agent'] | 'fixer',
            agentName,
            code: toEmit,
            fullHtml: truncatedHtml + completionContent,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    if (started && codeBuffer.length > 0) {
      const endIdx = codeBuffer.indexOf('```');
      const remaining = endIdx !== -1 ? codeBuffer.slice(0, endIdx) : codeBuffer;
      if (remaining.trim()) {
        yield {
          type: 'code_chunk',
            agent: agentKey as AgentLogEntry['agent'] | 'fixer',
            agentName,
            code: remaining,
          fullHtml: truncatedHtml + completionContent,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const combined = truncatedHtml + completionContent;
    const result = this.robustExtractHtml(combined);
    const success = result.complete && result.html.length > truncatedHtml.length;

    return { success, completedHtml: success ? result.html : truncatedHtml };
  }

  private isHtmlComplete(html: string): boolean {
    if (!html || html.length < 50) return false;
    const lower = html.toLowerCase();
    const hasClosing = lower.includes('</html>') && lower.includes('</body>');
    if (hasClosing) return true;
    const hasStart = lower.includes('<!doctype html') || lower.includes('<html');
    if (!hasStart) return false;
    return false;
  }

  private extractHtml(content: string): string {
    return this.robustExtractHtml(content).html;
  }

  private robustExtractHtml(content: string): { html: string; complete: boolean; reason: string } {
    if (!content) return { html: '', complete: false, reason: 'empty_input' };

    const trimmed = content.trim();

    const candidates: string[] = [];

    const addCandidate = (html: string): void => {
      const clean = html?.trim();
      if (clean && /<html[\s>]/i.test(clean)) {
        candidates.push(clean);
      }
    };

    if (/^<!DOCTYPE html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      addCandidate(trimmed);
    }

    const fenceRegex = /```[ \t]*[\w]*[ \t]*\n([\s\S]*?)\n?```/gi;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(trimmed)) !== null) {
      addCandidate(fenceMatch[1]);
    }

    const unclosedFenceMatch = trimmed.match(/```[ \t]*[\w]*[ \t]*\n([\s\S]*)$/i);
    if (unclosedFenceMatch) {
      addCandidate(unclosedFenceMatch[1]);
    }

    const doctypeRegex = /<!DOCTYPE\s+html[\s\S]*?(?=<\/html>)/gi;
    let dtMatch: RegExpExecArray | null;
    while ((dtMatch = doctypeRegex.exec(trimmed)) !== null) {
      addCandidate(dtMatch[0] + '</html>');
    }

    const htmlTagRegex = /<html[\s>][\s\S]*?(?=<\/html>)/gi;
    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlTagRegex.exec(trimmed)) !== null) {
      addCandidate(htmlMatch[0] + '</html>');
    }

    const lastHtmlStart = trimmed.search(/<html[\s>]/i);
    if (lastHtmlStart !== -1 && candidates.length === 0) {
      candidates.push(trimmed.slice(lastHtmlStart).trim());
    }

    if (candidates.length === 0) {
      return { html: trimmed, complete: false, reason: 'no_html_found' };
    }

    const completeCandidates = candidates.filter(
      (c: string) => /<\/html>\s*$/i.test(c),
    );

    if (completeCandidates.length > 0) {
      const best = completeCandidates[completeCandidates.length - 1];
      return { html: best, complete: true, reason: 'ok' };
    }

    const longest = candidates.reduce(
      (a: string, b: string) => (a.length >= b.length ? a : b),
      '',
    );
    return { html: '', complete: false, reason: 'truncated_no_close_tag' };
  }
}
