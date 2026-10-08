import { Inject, Injectable, NotFoundException, ForbiddenException, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, desc, count, and, gte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { atomsProjects, atomsUsers } from '@server/database/schema';
import type {
  Project,
  ProjectVersion,
  DashboardStats,
  AgentLogEntry,
  AppStyle,
  ShareProjectResponse,
  SharedProjectResponse,
  BrandKit,
  ProjectStatus,
} from '@shared/api.interface';
import { HtmlGeneratorService } from './html-generator.service';
import { LlmGeneratorService, type StreamEvent } from './llm-generator.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly htmlGenerator: HtmlGeneratorService,
    private readonly llmGenerator: LlmGeneratorService,
  ) {}

  async getProjects(userId: string): Promise<{ items: Project[]; total: number }> {
    const rows = await this.db
      .select()
      .from(atomsProjects)
      .where(eq(atomsProjects.userId, userId))
      .orderBy(desc(atomsProjects.createdAt));

    const items: Project[] = rows.map((row) => this.mapRowToProject(row));
    return { items, total: items.length };
  }

  async getProject(id: string, userId: string): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }

    const rows = await this.db
      .select()
      .from(atomsProjects)
      .where(eq(atomsProjects.id, id));

    if (rows.length === 0) {
      throw new NotFoundException('项目不存在');
    }

    const row = rows[0];
    if (row.userId !== userId) {
      throw new ForbiddenException('无权限访问此项目');
    }

    return this.mapRowToProject(row);
  }

  async createProject(
    userId: string,
    description: string,
    style: AppStyle,
    name?: string,
    raceMode = false,
  ): Promise<Project> {
    const cost = raceMode ? 20 : 10;
    await this.deductCredits(userId, cost);

    const projectName = name?.trim() || this.generateProjectName(description);

    const inserted = await this.db
      .insert(atomsProjects)
      .values({
        userId,
        name: projectName,
        description,
        style,
        status: 'building',
        generatedHtml: '',
        agentLogs: JSON.stringify([]),
        versions: JSON.stringify([]),
        raceMode,
      })
      .returning();

    return this.mapRowToProject(inserted[0]);
  }

  async *streamGenerateProject(
    projectId: string,
    userId: string,
    description: string,
    style: AppStyle,
    brandKit: BrandKit | null = null,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const logsByAgent: Record<string, string> = {
      pm: '',
      architect: '',
      engineer: '',
      reviewer: '',
      fixer: '',
    };
    let finalHtml = '';
    let hasError = false;
    let finalScore = 0;
    let fixerRounds = 0;

    try {
      for await (const event of this.llmGenerator.generateStream(description, style, brandKit)) {
        if (event.agent && event.message && event.type === 'log') {
          logsByAgent[event.agent] = (logsByAgent[event.agent] || '') + event.message;
        }
        if (event.type === 'fixer_log' && event.agent && event.message) {
          logsByAgent['fixer'] = (logsByAgent['fixer'] || '') + event.message;
        }
        if (event.type === 'code_chunk' && event.fullHtml) {
          finalHtml = event.fullHtml;
        }
        if (event.type === 'done') {
          if (event.fullHtml) finalHtml = event.fullHtml;
          if (event.score !== undefined) finalScore = event.score;
        }
        if (event.round !== undefined && event.round > fixerRounds) {
          fixerRounds = event.round;
        }
        if (event.type === 'error') {
          hasError = true;
        }
        yield event;
      }
    } catch (error) {
      this.logger.error('流式生成异常', error);
      hasError = true;
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '生成失败',
        timestamp: new Date().toISOString(),
      };
    }

    if (hasError || !finalHtml) {
      if (!hasError) {
        yield {
          type: 'error',
          error: '生成的 HTML 为空，请重试',
          timestamp: new Date().toISOString(),
        };
      }
      await this.markProjectFailed(projectId, userId, 10);
    } else if (abortSignal?.aborted) {
      this.logger.log(
        `[streamGenerateProject] 已被心跳终止，跳过完成写入 project=${projectId}`,
      );
    } else {
      const rawHtml = finalHtml || this.htmlGenerator.generate(description, style);
      const responsiveResult = this.injectResponsiveBaseline(rawHtml);
      const html = responsiveResult.html;
      if (responsiveResult.changes.length > 0) {
        this.logger.log(
          `[streamGenerateProject] 响应式基线兜底: ${responsiveResult.changes.join('; ')}`,
        );
      }
      await this.db
        .update(atomsProjects)
        .set({
          status: 'completed',
          generatedHtml: html,
          agentLogs: JSON.stringify(this.buildAgentLogEntries(logsByAgent)),
          finalScore,
          fixerRounds,
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));
    }
  }

  async *streamRaceGenerateProject(
    projectId: string,
    userId: string,
    description: string,
    style: AppStyle,
    brandKit: BrandKit | null = null,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const htmlByTrack: Record<'A' | 'B', string> = { A: '', B: '' };
    const logsByAgent: Record<string, string> = {
      pm: '', architect: '', engineer: '', reviewer: '', fixer: '',
    };
    let hasError = false;
    let errorTrack: Set<'A' | 'B'> = new Set();

    try {
      for await (const event of this.llmGenerator.generateRaceStream(description, style, brandKit)) {
        const track = event.track as 'A' | 'B' | undefined;

        if (event.type === 'code_chunk' && event.fullHtml && track) {
          htmlByTrack[track] = event.fullHtml;
        }
        if (event.type === 'done' && event.fullHtml && track) {
          htmlByTrack[track] = event.fullHtml;
        }
        if (event.type === 'error') {
          if (track) errorTrack.add(track);
          if (errorTrack.size >= 2) hasError = true;
        }

        yield event;
      }
    } catch (error) {
      this.logger.error('竞速生成异常', error);
      hasError = true;
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '生成失败',
        timestamp: new Date().toISOString(),
      };
    }

    const htmlA = htmlByTrack['A'];
    const htmlB = htmlByTrack['B'];
    const bothFailed = !htmlA && !htmlB;

    if (bothFailed || hasError) {
      await this.markProjectFailed(projectId, userId, 20);
    } else if (abortSignal?.aborted) {
      this.logger.log(
        `[streamRaceGenerateProject] 已被心跳终止，跳过完成写入 project=${projectId}`,
      );
    } else {
      const primaryHtml = htmlA || htmlB;
      const responsiveResult = this.injectResponsiveBaseline(primaryHtml);
      const finalPrimaryHtml = responsiveResult.html;
      const finalHtmlA = htmlA ? this.injectResponsiveBaseline(htmlA).html : '';
      const finalHtmlB = htmlB ? this.injectResponsiveBaseline(htmlB).html : '';
      if (responsiveResult.changes.length > 0) {
        this.logger.log(
          `[streamRaceGenerateProject] 响应式基线兜底: ${responsiveResult.changes.join('; ')}`,
        );
      }
      await this.db
        .update(atomsProjects)
        .set({
          status: 'completed',
          generatedHtml: finalPrimaryHtml,
          raceHtmlA: finalHtmlA,
          raceHtmlB: finalHtmlB,
          agentLogs: JSON.stringify(this.buildAgentLogEntries(logsByAgent)),
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));

      yield {
        type: 'race_done',
        htmlA: finalHtmlA,
        htmlB: finalHtmlB,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async selectRaceWinner(
    projectId: string,
    userId: string,
    winner: 'A' | 'B',
  ): Promise<Project> {
    const project = await this.getProject(projectId, userId);
    if (!project.raceMode) {
      throw new BadRequestException('该项目未开启竞速模式');
    }

    const winnerHtml = winner === 'A' ? project.raceHtmlA : project.raceHtmlB;
    if (!winnerHtml) {
      throw new BadRequestException('所选版本无有效内容');
    }

    const loserHtml = winner === 'A' ? project.raceHtmlB : project.raceHtmlA;

    const nextVersion = project.versions.length > 0
      ? Math.max(...project.versions.map((v: ProjectVersion) => v.version ?? 0)) + 1
      : 1;

    const responsiveResult = this.injectResponsiveBaseline(winnerHtml);
    const finalWinnerHtml = responsiveResult.html;

    const winnerSnapshot: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: finalWinnerHtml,
      description: `竞速模式获胜版本（${winner}）`,
      createdAt: new Date().toISOString(),
      version: nextVersion + 1,
    };

    const versions: ProjectVersion[] = [winnerSnapshot];
    if (loserHtml) {
      const loserResponsive = this.injectResponsiveBaseline(loserHtml);
      const loserSnapshot: ProjectVersion = {
        id: `v_${Date.now()}_race_loser`,
        html: loserResponsive.html,
        description: `竞速模式备选版本（${winner === 'A' ? 'B' : 'A'}）`,
        createdAt: new Date().toISOString(),
        version: nextVersion,
      };
      versions.push(loserSnapshot);
    }

    const newVersions: ProjectVersion[] = [...versions, ...project.versions].slice(0, 10);

    const updated = await this.db
      .update(atomsProjects)
      .set({
        generatedHtml: finalWinnerHtml,
        raceWinner: winner,
        versions: JSON.stringify(newVersions),
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, projectId))
      .returning();

    return this.mapRowToProject(updated[0]);
  }

  async applyBrandKitToProject(
    projectId: string,
    userId: string,
    brandKit: BrandKit,
  ): Promise<Project> {
    const project = await this.getProject(projectId, userId);
    if (!brandKit.enabled) {
      throw new BadRequestException('品牌定制未启用');
    }
    const cost = 5;
    await this.deductCredits(userId, cost);

    const nextVersion = project.versions.length > 0
      ? Math.max(...project.versions.map((v: ProjectVersion) => v.version ?? 0)) + 1
      : 1;
    const version: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: project.generatedHtml,
      description: project.description,
      createdAt: new Date().toISOString(),
      version: nextVersion,
    };
    const newVersions: ProjectVersion[] = [version, ...project.versions].slice(0, 10);

    const currentHtml = project.generatedHtml;
    const brandApplied = this.applyBrandStyles(currentHtml, brandKit);

    const updated = await this.db
      .update(atomsProjects)
      .set({
        generatedHtml: brandApplied,
        versions: JSON.stringify(newVersions),
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, projectId))
      .returning();

    return this.mapRowToProject(updated[0]);
  }

  private applyBrandStyles(html: string, brandKit: BrandKit): string {
    let result = html;
    if (brandKit.primaryColor) {
      result = result.replace(
        /(--primary:\s*)([^;]+)/g,
        `$1${brandKit.primaryColor}`,
      );
      result = result.replace(
        /(background:\s*)(#7c3aed|#8b5cf6|hsl\(262[^)]+\))/g,
        `$1${brandKit.primaryColor}`,
      );
    }
    if (brandKit.brandName) {
      result = result.replace(/Atoms Demo/g, brandKit.brandName);
      result = result.replace(/YourBrand/g, brandKit.brandName);
      result = result.replace(/BrandName/g, brandKit.brandName);
    }
    if (brandKit.fontStyle) {
      const fontMap: Record<string, string> = {
        modern: 'system-ui, -apple-system, sans-serif',
        serif: 'Georgia, "Times New Roman", serif',
        handwriting: '"Comic Sans MS", cursive',
        monospace: '"SF Mono", Monaco, Consolas, monospace',
      };
      const fontStack = fontMap[brandKit.fontStyle] || fontMap.modern;
      result = result.replace(
        /(font-family:\s*)([^;}]+)/g,
        `$1${fontStack}`,
      );
    }
    return result;
  }

  async deleteProject(id: string, userId: string): Promise<void> {
    const project = await this.getProject(id, userId); // validates ownership

    const deleted = await this.db
      .delete(atomsProjects)
      .where(eq(atomsProjects.id, project.id))
      .returning({ id: atomsProjects.id });

    if (deleted.length === 0) {
      throw new NotFoundException('项目不存在');
    }
  }

  async rebuildProject(
    id: string,
    userId: string,
    options: { description?: string; iteration?: boolean } = {},
  ): Promise<Project> {
    const project = await this.getProject(id, userId); // validates ownership

    const cost = 5;
    this.logger.log(
      `rebuildProject: iteration=${options.iteration} cost=${cost} project=${id}`,
    );
    await this.deductCredits(userId, cost);

    const newDescription = options.description?.trim() || project.description;

    await this.db
      .update(atomsProjects)
      .set({
        description: newDescription,
        status: 'building',
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, id))
      .returning();

    return this.getProject(id, userId);
  }

  private applyInstructionForcefully(
    html: string,
    instruction: string,
  ): { html: string; changes: string[] } {
    const changes: string[] = [];
    let result = html;

    const titleMatchers = [
      /把[页面网页网站应用]*(?:的)?标题(?:改|换|变)成[\"'`]?([^\"'`,，。\n；;]+)/,
      /标题(?:改|换|变)为[\"'`]?([^\"'`,，。\n；;]+)/,
      /标题(?:改|换)成[\"'`]?([^\"'`,，。\n；;]+)/,
      /页面标题[是为：:]+[\"'`]?([^\"'`,，。\n；;]+)/,
      /网页标题[是为：:]+[\"'`]?([^\"'`,，。\n；;]+)/,
      /(?:将|把).*?标题.*?(?:改为|改成|换成)[\"'`]?([^\"'`,，。\n；;]+)/,
    ];
    let targetTitle = '';
    for (const re of titleMatchers) {
      const m = instruction.match(re);
      if (m) {
        targetTitle = (m[1] || '').trim();
        break;
      }
    }

    if (targetTitle) {
      this.logger.log(`[暴力兜底] 解析到目标标题: "${targetTitle}"`);
      const titleTagMatch = result.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const oldTitle = titleTagMatch ? titleTagMatch[1].trim() : '';

      if (oldTitle && oldTitle !== targetTitle) {
        result = result.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${targetTitle}</title>`);
        const escapedOld = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(escapedOld, 'g'), targetTitle);
        changes.push(`标题: "${oldTitle}" -> "${targetTitle}"（全文替换）`);
        this.logger.log(`[暴力兜底] 标题已替换: "${oldTitle}" -> "${targetTitle}"`);
      } else if (!oldTitle) {
        const headInsert = `<head><title>${targetTitle}</title>`;
        if (/<head>/i.test(result)) {
          result = result.replace(/<head>/i, headInsert);
        } else if (/<body/i.test(result)) {
          result = `<head><title>${targetTitle}</title></head>${result}`;
        }
        changes.push(`标题: 插入 <title>${targetTitle}</title>`);
        this.logger.log(`[暴力兜底] 原HTML无title，已插入: "${targetTitle}"`);
      } else {
        this.logger.log(`[暴力兜底] 标题无需替换（原值已匹配）: "${oldTitle}"`);
      }
    } else {
      this.logger.log(`[暴力兜底] 未解析到目标标题，指令: "${instruction.slice(0, 80)}"`);
    }

    const colorMap: Record<string, string> = {
      蓝色: '#1e88e5',
      红色: '#e53935',
      绿色: '#43a047',
      紫色: '#8e24aa',
      橙色: '#fb8c00',
      粉色: '#d81b60',
      青色: '#00acc1',
      黄色: '#fdd835',
      黑色: '#212121',
      白色: '#ffffff',
      灰色: '#757575',
    };

    let targetColor = '';
    const hexMatch = instruction.match(/(?:主题色|主色|按钮色|配色|颜色)[^#]{0,10}(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/);
    if (hexMatch) {
      targetColor = hexMatch[1];
    } else {
      for (const [cn, hex] of Object.entries(colorMap)) {
        const pattern = new RegExp(`(?:主题色|主色|按钮色|配色|颜色).*?${cn}|${cn}(?:的)?(?:主题色|主色|按钮色|配色|颜色)`);
        if (pattern.test(instruction)) {
          targetColor = hex;
          break;
        }
      }
    }

    if (targetColor) {
      this.logger.log(`[暴力兜底] 解析到目标颜色: ${targetColor}`);
      const primaryVars = [
        /--primary:\s*[^;]+;/gi,
        /--primary-color:\s*[^;]+;/gi,
        /--brand-color:\s*[^;]+;/gi,
        /--accent:\s*[^;]+;/gi,
      ];
      let colorReplaced = false;
      for (const re of primaryVars) {
        if (re.test(result)) {
          result = result.replace(re, (match) => {
            const colonIdx = match.indexOf(':');
            return match.slice(0, colonIdx + 1) + ' ' + targetColor + ';';
          });
          colorReplaced = true;
        }
      }

      const buttonBgMatch = result.match(/(\.btn[^\{]*\{|\.button[^\{]*\{|button[^\{]*\{)[^}]*(background(?:-color)?:\s*)([^;\n]+)/i);
      if (buttonBgMatch && buttonBgMatch[3] && buttonBgMatch[3].trim() !== targetColor) {
        const oldColor = buttonBgMatch[3].trim();
        result = result.replace(
          new RegExp(oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          targetColor,
        );
        colorReplaced = true;
        changes.push(`颜色: 按钮/主题色 ${oldColor} -> ${targetColor}（全文替换）`);
        this.logger.log(`[暴力兜底] 颜色已替换: ${oldColor} -> ${targetColor}`);
      } else if (colorReplaced) {
        changes.push(`颜色: CSS 变量已更新为 ${targetColor}`);
      }

      if (!colorReplaced) {
        result = result.replace('</style>', `\n  :root { --primary: ${targetColor}; }\n</style>`);
        changes.push(`颜色: 注入 --primary: ${targetColor}`);
        this.logger.log(`[暴力兜底] 颜色兜底注入: --primary: ${targetColor}`);
      }
    } else {
      this.logger.log(`[暴力兜底] 未解析到目标颜色`);
    }

    const bgColorMatchers = [
      /(?:把|将)?(?:页面|网页|整个页面)?(?:的)?背景(?:的)?(?:颜色)?(?:改(?:成|为)?|换(?:成|为)?|变(?:为|成)?|调为|设为)[：: ]*(?:纯|深|浅)?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)|[\u4e00-\u9fa5]{1,3}色)/,
      /背景色(?:改(?:成|为)?|换(?:成|为)?|变(?:为|成)?|调为|设为)?[：: ]*(?:纯|深|浅)?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)|[\u4e00-\u9fa5]{1,3}色)/,
    ];
    let targetBgColor = '';
    for (const re of bgColorMatchers) {
      const m = instruction.match(re);
      if (m) {
        targetBgColor = (m[1] || '').trim().replace(/^["'`]|["'`]$/g, '');
        break;
      }
    }

    const bgColorNameMap: Record<string, string> = {
      红色: '#ff0000', 绿色: '#00ff00', 蓝色: '#0000ff',
      白色: '#ffffff', 黑色: '#000000', 黄色: '#ffff00',
      紫色: '#8b5cf6', 粉色: '#ec4899', 灰色: '#6b7280',
      橙色: '#f97316', 青色: '#06b6d4', 靛蓝: '#4f46e5',
    };

    if (targetBgColor && bgColorNameMap[targetBgColor]) {
      targetBgColor = bgColorNameMap[targetBgColor];
    }

    const isValidCssColor = (val: string): boolean => {
      const v = val.trim().toLowerCase();
      if (!v) return false;
      if (/^#[0-9a-f]{3}$/.test(v) || /^#[0-9a-f]{6}$/.test(v)) return true;
      if (/^rgb\s*\(/.test(v)) return true;
      if (/^hsl\s*\(/.test(v)) return true;
      const namedColors = new Set(['red', 'green', 'blue', 'white', 'black', 'yellow', 'purple', 'pink', 'gray', 'grey', 'orange', 'cyan', 'indigo', 'transparent', 'inherit', 'initial']);
      if (namedColors.has(v)) return true;
      return false;
    };

    if (targetBgColor && isValidCssColor(targetBgColor)) {
      this.logger.log(`[暴力兜底] 解析到目标背景色: ${targetBgColor}`);
      const bodyBgRe = /(body[^{]*\{[^}]*background(?:-color)?\s*:\s*)([^;\n]+)/i;
      const bodyBgMatch = result.match(bodyBgRe);
      if (bodyBgMatch && bodyBgMatch[2]) {
        const oldBg = bodyBgMatch[2].trim();
        const oldValid = isValidCssColor(oldBg);
        if (!oldValid || oldBg.toLowerCase() !== targetBgColor.toLowerCase()) {
          result = result.replace(bodyBgRe, `$1${targetBgColor}`);
          changes.push(`背景色: body ${oldValid ? oldBg : `【非法值:${oldBg}】`} -> ${targetBgColor}`);
          this.logger.log(`[暴力兜底] body背景色已替换: old="${oldBg}"(${oldValid ? '合法' : '非法'}) -> ${targetBgColor}`);
        }
      } else {
        result = result.replace(
          /<head>/i,
          `<head>\n  <style>body { background-color: ${targetBgColor}; }</style>`,
        );
        changes.push(`背景色: 注入 body { background-color: ${targetBgColor} }`);
        this.logger.log(`[暴力兜底] 注入body背景色: ${targetBgColor}`);
      }
    } else if (targetBgColor && !isValidCssColor(targetBgColor)) {
      this.logger.warn(`[暴力兜底] 解析出的背景色"${targetBgColor}"本身不合法，跳过替换。指令="${instruction}"`);
      const bodyBgRe = /(body[^{]*\{[^}]*background(?:-color)?\s*:\s*)([^;\n]+)/i;
      const bodyBgMatch = result.match(bodyBgRe);
      if (bodyBgMatch && bodyBgMatch[2]) {
        const oldBg = bodyBgMatch[2].trim();
        if (!isValidCssColor(oldBg)) {
          changes.push(`背景色: 检测到非法值"${oldBg}"且目标色解析失败`);
        }
      }
    } else {
      const bodyBgRe = /(body[^{]*\{[^}]*background(?:-color)?\s*:\s*)([^;\n]+)/i;
      const bodyBgMatch = result.match(bodyBgRe);
      if (bodyBgMatch && bodyBgMatch[2]) {
        const oldBg = bodyBgMatch[2].trim();
        if (!isValidCssColor(oldBg)) {
          this.logger.warn(`[暴力兜底] 检测到body背景色非法但无法从指令解析目标色: "${oldBg}"，指令="${instruction}"`);
          changes.push(`背景色: 检测到非法值"${oldBg}"但无法解析目标色`);
        }
      }
    }

    return { html: result, changes };
  }

  private injectResponsiveBaseline(html: string): { html: string; changes: string[] } {
    const changes: string[] = [];
    let result = html;

    const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(result);
    if (!hasViewport) {
      result = result.replace(
        /<head>/i,
        `<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`,
      );
      changes.push('viewport: 注入响应式 meta 标签');
      this.logger.log('[响应式兜底] 注入 viewport meta 标签');
    }

    const mediaCount = (result.match(/@media\s*\([^)]*max-width[^)]*\)/gi) || []).length;
    if (mediaCount < 2) {
      const responsiveCss = `
<style>
  /* === 响应式基线兜底 === */
  * { box-sizing: border-box; }
  body { min-width: 0; overflow-x: hidden; margin: 0; }
  img, video, iframe { max-width: 100%; height: auto; }
  .container, .container-fluid, .wrap, .wrapper, main, section, .content {
    max-width: 100%;
    padding-left: 16px;
    padding-right: 16px;
  }
  .row, .flex-row, [class*="flex"], [class*="grid"] {
    flex-wrap: wrap;
  }
  button, .btn, [role="button"] {
    min-height: 44px;
    min-width: 44px;
    padding: 10px 16px;
  }
  h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); }
  h2 { font-size: clamp(1.4rem, 4vw, 2rem); }
  h3 { font-size: clamp(1.2rem, 3vw, 1.5rem); }
  p, li, span, a { font-size: clamp(0.9rem, 2.5vw, 1rem); }
  @media (max-width: 768px) {
    .container, .container-fluid, .wrap, .wrapper, main, section {
      padding-left: 12px;
      padding-right: 12px;
    }
    .row, .grid-cols-2, .grid-cols-3, .grid-cols-4 { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 480px) {
    body { font-size: 14px; }
    .container, .container-fluid, .wrap, .wrapper, main, section {
      padding-left: 8px;
      padding-right: 8px;
    }
    h1 { font-size: 1.5rem !important; }
    h2 { font-size: 1.25rem !important; }
    button, .btn { padding: 8px 12px; font-size: 14px; }
  }
</style>`;
      result = result.replace(/<\/head>/i, `${responsiveCss}\n</head>`);
      changes.push(`媒体查询: 注入通用响应式 CSS（原有 ${mediaCount} 档，补充至 ≥2 档）`);
      this.logger.log(`[响应式兜底] 注入通用响应式 CSS，原有 ${mediaCount} 档 media query`);
    }

    const bodyOverflowHiddenRe = /(body\s*\{[^}]*overflow\s*:\s*)(hidden)([^;}]*)/i;
    const bodyOverflowMatch = result.match(bodyOverflowHiddenRe);
    if (bodyOverflowMatch) {
      result = result.replace(bodyOverflowHiddenRe, '$1hidden$3');
      const overflowXRe = /(body\s*\{[^}]*overflow-x\s*:\s*)([^;\n]+)/i;
      if (!overflowXRe.test(result)) {
        result = result.replace(
          /(body\s*\{[^}]*)(overflow\s*:\s*hidden)/i,
          '$1overflow-x: hidden; overflow-y: auto',
        );
        changes.push('overflow: body overflow:hidden → overflow-x:hidden + overflow-y:auto');
        this.logger.log('[响应式兜底] body overflow:hidden 改为 overflow-x:hidden + overflow-y:auto');
      }
    }

    return { html: result, changes };
  }

  async *streamRebuildProject(
    projectId: string,
    userId: string,
    description: string,
    style: AppStyle,
    existingHtml: string,
    cost: number,
    modifyInstruction?: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const logsByAgent: Record<string, string> = {
      engineer: '',
    };
    let finalHtml = '';
    let hasError = false;
    let isIncomplete = false;
    let incompleteReason = '';

    const versionDesc = (modifyInstruction?.trim() || description).trim().slice(0, 80);

    try {
      for await (const event of this.llmGenerator.rebuildStream(
        description,
        style,
        existingHtml,
        modifyInstruction,
      )) {
        if (event.agent && event.message && event.type === 'log') {
          logsByAgent[event.agent] = (logsByAgent[event.agent] || '') + event.message;
        }
        if (event.type === 'code_chunk' && event.fullHtml) {
          finalHtml = event.fullHtml;
        }
        if (event.type === 'agent_done' && event.fullHtml) {
          finalHtml = event.fullHtml;
        }
        if (event.type === 'incomplete') {
          isIncomplete = true;
          incompleteReason = event.reason || 'unknown';
          if (event.fullHtml) finalHtml = event.fullHtml;
        }
        if (event.type === 'error') {
          hasError = true;
        }
        yield event;
      }
    } catch (error) {
      this.logger.error('流式重建异常', error);
      hasError = true;
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '生成失败',
        timestamp: new Date().toISOString(),
      };
    }

    if (hasError) {
      await this.markProjectFailed(projectId, userId, cost);
    } else if (!finalHtml && !existingHtml) {
      yield {
        type: 'error',
        error: '生成的 HTML 为空，请重试',
        timestamp: new Date().toISOString(),
      };
      await this.markProjectFailed(projectId, userId, cost);
    } else if (abortSignal?.aborted) {
      this.logger.log(
        `[streamRebuildProject] 已被心跳终止，跳过完成写入 project=${projectId}`,
      );
    } else {
      const baselineHtml = finalHtml || existingHtml;
      const needForceFallback = isIncomplete || !finalHtml;

      this.logger.log(
        `[streamRebuildProject] 后处理: incomplete=${isIncomplete}(${incompleteReason}), finalHtml非空=${!!finalHtml}, finalHtml长度=${finalHtml?.length || 0}, 暴力兜底强制=true（保险补刀）`,
      );

      const currentSnapshot: ProjectVersion = {
        id: `v_${Date.now()}`,
        html: existingHtml,
        description: `修改前（${versionDesc}）`,
        createdAt: new Date().toISOString(),
        version: 0,
      };

      let html: string = baselineHtml;

      let effectiveInstruction = '';
      if (modifyInstruction && modifyInstruction.trim()) {
        effectiveInstruction = modifyInstruction.trim();
      } else if (description && description.includes('修改要求')) {
        const match = description.match(/修改要求[：:](.+)$/s);
        if (match && match[1]?.trim()) {
          effectiveInstruction = match[1].trim();
        }
      }

      let fallbackChanges: string[] = [];
      if (effectiveInstruction) {
        const { html: processedHtml, changes } = this.applyInstructionForcefully(
          html,
          effectiveInstruction,
        );
        html = processedHtml;
        fallbackChanges = changes;
        this.logger.log(
          `[streamRebuildProject] 暴力兜底保险补刀: 改动${changes.length}项 [${changes.join('; ')}], 最终html长度=${html.length}`,
        );
      }

      const newLogEntry: AgentLogEntry = {
        agent: 'engineer',
        agentName: 'Engineer',
        message: needForceFallback
          ? `模型输出不完整，已使用暴力兜底修复（原因：${incompleteReason || '输出为空'}）${fallbackChanges.length > 0 ? `；补充修改：${fallbackChanges.join('；')}` : ''}`
          : (fallbackChanges.length > 0
            ? `代码已更新（保险补刀：${fallbackChanges.join('；')}）`
            : (logsByAgent['engineer'] || '代码已更新')),
        timestamp: new Date().toISOString(),
      };

      const isHtmlComplete = /<\/html>\s*$/i.test(html.trim());

      let bgColorValid = true;
      const bodyBgRe = /(?:body[^{]*\{[^}]*background(?:-color)?\s*:\s*)([^;\n]+)/i;
      const validBgRe = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{6})|rgb\s*\(|hsl\s*\(|red|green|blue|white|black|yellow|purple|pink|gray|grey|orange|cyan|indigo|transparent|inherit|initial)$/i;
      const finalBgMatch = html.match(bodyBgRe);
      if (finalBgMatch && finalBgMatch[1]) {
        const bgVal = finalBgMatch[1].trim();
        bgColorValid = validBgRe.test(bgVal);
        if (!bgColorValid) {
          this.logger.warn(`[streamRebuildProject] body背景色非法，尝试二次兜底: "${bgVal}"`);
          const retry = this.applyInstructionForcefully(html, effectiveInstruction || '');
          const reMatch = retry.html.match(bodyBgRe);
          if (reMatch && reMatch[1] && validBgRe.test(reMatch[1].trim())) {
            html = retry.html;
            fallbackChanges = [...fallbackChanges, ...retry.changes];
            bgColorValid = true;
            this.logger.log(`[streamRebuildProject] 二次兜底成功，背景色已修正为: ${reMatch[1].trim()}`);
          } else {
            const fallbackColor = '#4f46e5';
            const replaced = html.replace(bodyBgRe, `$1${fallbackColor}`);
            if (replaced !== html) {
              html = replaced;
              bgColorValid = true;
              fallbackChanges = [...fallbackChanges, `背景色: 自动修正非法值"${bgVal}" → ${fallbackColor}`];
              this.logger.warn(`[streamRebuildProject] 背景色非法，已自动降级替换为 ${fallbackColor}: "${bgVal}"`);
            } else if (effectiveInstruction && /背景|背景色/.test(effectiveInstruction)) {
              hasError = true;
              this.logger.error(`[streamRebuildProject] 背景色非法且无法替换，标记失败: "${reMatch?.[1]?.trim() ?? '无匹配'}"`);
            } else {
              bgColorValid = true;
              this.logger.warn(`[streamRebuildProject] 背景色非法但指令不涉及背景色，放行`);
            }
          }
        }
      }

      const responsiveResult = this.injectResponsiveBaseline(html);
      html = responsiveResult.html;
      if (responsiveResult.changes.length > 0) {
        fallbackChanges = [...fallbackChanges, ...responsiveResult.changes];
        this.logger.log(
          `[streamRebuildProject] 响应式基线兜底: ${responsiveResult.changes.join('; ')}`,
        );
      }

      await this.db.transaction(async (tx) => {
        const current = await tx
          .select({ versions: atomsProjects.versions, agentLogs: atomsProjects.agentLogs })
          .from(atomsProjects)
          .where(eq(atomsProjects.id, projectId));

        if (current.length === 0) return;

        const existingVersions: ProjectVersion[] = Array.isArray(current[0].versions)
          ? (current[0].versions as unknown as ProjectVersion[])
          : [];

        const nextVersion = existingVersions.length > 0
          ? Math.max(...existingVersions.map((v: ProjectVersion) => v.version ?? 0)) + 1
          : 1;
        currentSnapshot.version = nextVersion;

        const newResultSnapshot: ProjectVersion = {
          id: `v_${Date.now()}`,
          html: html,
          description: versionDesc,
          createdAt: new Date().toISOString(),
          version: nextVersion + 1,
        };

        const newVersions: ProjectVersion[] = [
          newResultSnapshot,
          currentSnapshot,
          ...existingVersions,
        ].slice(0, 10);

        const existingLogs: AgentLogEntry[] = Array.isArray(current[0].agentLogs)
          ? (current[0].agentLogs as unknown as AgentLogEntry[])
          : [];

        const targetStatus: ProjectStatus = (isHtmlComplete && (!hasError || bgColorValid)) ? 'completed' : 'failed';

        await tx
          .update(atomsProjects)
          .set({
            status: targetStatus,
            generatedHtml: html,
            versions: JSON.stringify(newVersions),
            agentLogs: JSON.stringify([newLogEntry, ...existingLogs].slice(0, 50)),
            updatedAt: new Date(),
          })
          .where(eq(atomsProjects.id, projectId));
      });

      if (!isHtmlComplete) {
        let errorMsg = '生成的 HTML 不完整，请重试';
        switch (incompleteReason) {
          case 'empty_input':
            errorMsg = '模型未输出有效代码内容，请换一种描述方式或精简指令后重试';
            break;
          case 'no_html_found':
            errorMsg = '模型输出中未找到有效 HTML 代码，请换一种描述方式或重试';
            break;
          case 'truncated_no_close_tag':
            errorMsg = '生成内容过长被截断，请精简修改指令后重试';
            break;
          case 'extract_failed':
            errorMsg = 'HTML 解析失败，请换一种描述方式重试';
            break;
          default:
            break;
        }
        yield {
          type: 'error',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        };
      } else if (hasError) {
        if (!bgColorValid) {
          yield {
            type: 'error',
            error: '背景色修改失败，生成的 CSS 颜色值不合法，请重试',
            timestamp: new Date().toISOString(),
          };
        } else {
          yield {
            type: 'error',
            error: '生成失败，请重试',
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        yield {
          type: 'done',
          fullHtml: html,
          timestamp: new Date().toISOString(),
        };
      }
    }
  }

  async *streamDebugFix(
    projectId: string,
    userId: string,
    existingHtml: string,
    errors: string,
    style: AppStyle,
    cost: number,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    try {
      await this.deductCredits(userId, cost);
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Credits 不足',
        timestamp: new Date().toISOString(),
      };
      return;
    }

    const logsByAgent: Record<string, string> = {
      engineer: '',
    };
    let finalHtml = '';
    let hasError = false;

    try {
      for await (const event of this.llmGenerator.debugFixStream(
        existingHtml,
        errors,
        style,
      )) {
        if (event.agent && event.message && event.type === 'log') {
          logsByAgent[event.agent] = (logsByAgent[event.agent] || '') + event.message;
        }
        if (event.type === 'code_chunk' && event.fullHtml) {
          finalHtml = event.fullHtml;
        }
        if (event.type === 'done' && event.fullHtml) {
          finalHtml = event.fullHtml;
        }
        if (event.type === 'error') {
          hasError = true;
        }
        yield event;
      }
    } catch (error) {
      this.logger.error('智能调试异常', error);
      hasError = true;
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : '调试失败',
        timestamp: new Date().toISOString(),
      };
    }

    if (hasError || !finalHtml) {
      if (!hasError) {
        yield {
          type: 'error',
          error: '生成的 HTML 为空，请重试',
          timestamp: new Date().toISOString(),
        };
      }
      await this.markProjectFailed(projectId, userId, cost);
    } else if (abortSignal?.aborted) {
      this.logger.log(
        `[streamDebugFix] 已被心跳终止，跳过完成写入 project=${projectId}`,
      );
    } else {
      const responsiveResult = this.injectResponsiveBaseline(finalHtml);
      const fixedHtml = responsiveResult.html;
      if (responsiveResult.changes.length > 0) {
        this.logger.log(
          `[streamDebugFix] 响应式基线兜底: ${responsiveResult.changes.join('; ')}`,
        );
      }

      const currentSnapshot: ProjectVersion = {
        id: `v_${Date.now()}`,
        html: existingHtml,
        description: '修复前版本',
        createdAt: new Date().toISOString(),
        version: 0,
      };

      await this.db.transaction(async (tx) => {
        const current = await tx
          .select({ versions: atomsProjects.versions, agentLogs: atomsProjects.agentLogs })
          .from(atomsProjects)
          .where(eq(atomsProjects.id, projectId));

        if (current.length === 0) return;

        const existingVersions: ProjectVersion[] = Array.isArray(current[0].versions)
          ? (current[0].versions as unknown as ProjectVersion[])
          : [];

        const nextVersion = existingVersions.length > 0
          ? Math.max(...existingVersions.map((v: ProjectVersion) => v.version ?? 0)) + 1
          : 1;
        currentSnapshot.version = nextVersion;

        const newResultSnapshot: ProjectVersion = {
          id: `v_${Date.now()}`,
          html: fixedHtml,
          description: 'Debugger 修复后版本',
          createdAt: new Date().toISOString(),
          version: nextVersion + 1,
        };

        const newVersions: ProjectVersion[] = [
          newResultSnapshot,
          currentSnapshot,
          ...existingVersions,
        ].slice(0, 10);

        const newLogEntry: AgentLogEntry = {
          agent: 'engineer',
          agentName: 'Debugger Agent',
          message: `修复了 ${errors.split('\n').length} 个运行时错误`,
          timestamp: new Date().toISOString(),
        };

        const existingLogs: AgentLogEntry[] = Array.isArray(current[0].agentLogs)
          ? (current[0].agentLogs as unknown as AgentLogEntry[])
          : [];

        await tx
          .update(atomsProjects)
          .set({
            generatedHtml: fixedHtml,
            status: 'completed',
            versions: JSON.stringify(newVersions),
            agentLogs: JSON.stringify([newLogEntry, ...existingLogs].slice(0, 50)),
            updatedAt: new Date(),
          })
          .where(eq(atomsProjects.id, projectId));
      });
    }
  }

  private buildAgentLogEntries(logsByAgent: Record<string, string>): AgentLogEntry[] {
    const agentNames: Record<string, string> = {
      pm: 'Product Manager',
      architect: 'Architect',
      engineer: 'Engineer',
      reviewer: 'Reviewer',
    };
    const entries: AgentLogEntry[] = [];
    const order = ['pm', 'architect', 'engineer', 'reviewer', 'fixer'];

    for (const key of order) {
      const content = logsByAgent[key];
      if (content && content.trim()) {
        entries.push({
          agent: key as AgentLogEntry['agent'],
          agentName: agentNames[key] || key,
          message: content.trim(),
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (entries.length === 0) {
      entries.push({
        agent: 'engineer',
        agentName: 'Engineer',
        message: '代码生成完成',
        timestamp: new Date().toISOString(),
      });
    }

    return entries;
  }

  async shareProject(id: string, userId: string): Promise<ShareProjectResponse> {
    const project = await this.getProject(id, userId);

    if (project.shareToken) {
      return {
        shareToken: project.shareToken,
        shareUrl: `/share/${project.shareToken}`,
        isPublic: true,
      };
    }

    const token = randomBytes(16).toString('hex');

    const updated = await this.db
      .update(atomsProjects)
      .set({
        shareToken: token,
        isPublic: true,
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, id))
      .returning({ shareToken: atomsProjects.shareToken });

    if (updated.length === 0) {
      throw new NotFoundException('项目不存在');
    }

    return {
      shareToken: token,
      shareUrl: `/share/${token}`,
      isPublic: true,
    };
  }

  async unshareProject(id: string, userId: string): Promise<void> {
    const project = await this.getProject(id, userId);

    await this.db
      .update(atomsProjects)
      .set({
        isPublic: false,
        shareToken: null,
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, project.id));
  }

  async getSharedProject(token: string): Promise<SharedProjectResponse> {
    if (!token || token.length !== 32) {
      throw new BadRequestException('无效的分享令牌');
    }

    const rows = await this.db
      .select({
        name: atomsProjects.name,
        description: atomsProjects.description,
        generatedHtml: atomsProjects.generatedHtml,
        style: atomsProjects.style,
        createdAt: atomsProjects.createdAt,
        isPublic: atomsProjects.isPublic,
      })
      .from(atomsProjects)
      .where(eq(atomsProjects.shareToken, token));

    if (rows.length === 0) {
      throw new NotFoundException('分享链接不存在或已失效');
    }

    const row = rows[0];
    if (!row.isPublic) {
      throw new NotFoundException('分享链接不存在或已失效');
    }

    return {
      name: row.name,
      description: row.description,
      generatedHtml: row.generatedHtml,
      style: row.style as AppStyle,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getDashboardStats(userId: string): Promise<DashboardStats> {
    const [allRows, userRows] = await Promise.all([
      this.db
        .select()
        .from(atomsProjects)
        .where(eq(atomsProjects.userId, userId)),
      this.db
        .select({ credits: atomsUsers.credits })
        .from(atomsUsers)
        .where(eq(atomsUsers.id, userId)),
    ]);

    const total = allRows.length;
    const completed = allRows.filter((r) => r.status === 'completed').length;
    const building = allRows.filter((r) => r.status === 'building').length;
    const credits = userRows[0]?.credits ?? 0;

    let lastActivity: string | null = null;
    if (allRows.length > 0) {
      const latest = allRows.reduce((prev, curr) =>
        curr.updatedAt > prev.updatedAt ? curr : prev,
      );
      lastActivity = latest.updatedAt.toISOString();
    }

    return {
      total,
      completed,
      building,
      credits,
      lastActivity,
    };
  }

  async rollbackVersion(
    id: string,
    userId: string,
    versionId: string,
  ): Promise<Project> {
    const project = await this.getProject(id, userId);

    const versionIndex = project.versions.findIndex(
      (v) => v.id === versionId,
    );
    if (versionIndex === -1) {
      throw new NotFoundException('版本不存在');
    }

    const targetVersion = project.versions[versionIndex];

    const cost = 5;
    await this.deductCredits(userId, cost);

    const nextVersion = project.versions.length > 0
      ? Math.max(...project.versions.map((v: ProjectVersion) => v.version ?? 0)) + 1
      : 1;
    const nowIso = new Date().toISOString();
    const currentSnapshot: ProjectVersion = {
      id: `v_${Date.now()}_pre_rollback`,
      html: project.generatedHtml,
      description: project.description,
      createdAt: nowIso,
      version: nextVersion,
    };
    const restoredSnapshot: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: targetVersion.html,
      description: targetVersion.description,
      createdAt: nowIso,
      version: nextVersion + 1,
    };

    const newVersions: ProjectVersion[] = [
      restoredSnapshot,
      currentSnapshot,
      ...project.versions.slice(0, versionIndex),
      ...project.versions.slice(versionIndex + 1),
    ].slice(0, 10);

    await this.db
      .update(atomsProjects)
      .set({
        generatedHtml: targetVersion.html,
        description: targetVersion.description,
        versions: JSON.stringify(newVersions),
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, id));

    return this.getProject(id, userId);
  }

  async getProjectPreview(id: string, userId: string): Promise<{ html: string }> {
    const project = await this.getProject(id, userId);
    return { html: project.generatedHtml };
  }

  private async deductCredits(userId: string, amount: number): Promise<void> {
    const updated = await this.db
      .update(atomsUsers)
      .set({ credits: sql`${atomsUsers.credits} - ${amount}` })
      .where(and(eq(atomsUsers.id, userId), gte(atomsUsers.credits, amount)))
      .returning({ id: atomsUsers.id });

    if (updated.length === 0) {
      throw new ConflictException('Credits 不足，请充值后再试');
    }
  }

  async refundCredits(userId: string, amount: number): Promise<void> {
    try {
      const result = await this.db
        .update(atomsUsers)
        .set({ credits: sql`${atomsUsers.credits} + ${amount}` })
        .where(eq(atomsUsers.id, userId))
        .returning({ id: atomsUsers.id, credits: atomsUsers.credits });
      if (result.length === 0) {
        this.logger.warn(`退还 Credits 失败：用户不存在 userId=${userId}`);
        return;
      }
      this.logger.log(
        `已退还 ${amount} Credits 给用户 ${userId}，当前余额 ${result[0].credits}`,
      );
    } catch (error) {
      this.logger.error('退还 Credits 失败', error);
    }
  }

  async markProjectFailed(projectId: string, userId: string, cost: number): Promise<{ refunded: boolean }> {
    this.logger.log(
      `markProjectFailed 开始 project=${projectId} user=${userId} cost=${cost}`,
    );
    try {
      const updated = await this.db
        .update(atomsProjects)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(and(eq(atomsProjects.id, projectId), eq(atomsProjects.status, 'building')))
        .returning({ id: atomsProjects.id });

      if (updated.length === 0) {
        const rows = await this.db
          .select({ status: atomsProjects.status })
          .from(atomsProjects)
          .where(eq(atomsProjects.id, projectId));
        if (rows.length === 0) {
          this.logger.warn(`markProjectFailed: 项目不存在 project=${projectId}`);
        } else {
          this.logger.warn(
            `markProjectFailed: 项目状态不是 building，跳过退款 project=${projectId} status=${rows[0].status}`,
          );
        }
        return { refunded: false };
      }

      this.logger.log(`项目 ${projectId} 状态已原子更新为 failed，开始退还 ${cost} Credits`);
      await this.refundCredits(userId, cost);
      this.logger.log(`项目 ${projectId} 标记为 failed 并退还 ${cost} Credits`);
      return { refunded: true };
    } catch (error) {
      this.logger.error('标记项目失败状态出错', error);
      return { refunded: false };
    }
  }

  private generateProjectName(description: string): string {
    const desc = description.toLowerCase();
    if (/待办|todo|task|任务/.test(desc)) return '待办事项应用';
    if (/博客|blog|article|文章/.test(desc)) return '个人博客网站';
    if (/看板|dashboard|数据|统计/.test(desc)) return '数据看板应用';
    if (/landing|落地|营销/.test(desc)) return '营销落地页';
    if (description.length <= 30) return description;
    return description.slice(0, 28) + '...';
  }

  private mapRowToProject(row: typeof atomsProjects.$inferSelect): Project {
    let agentLogs: AgentLogEntry[] = [];
    if (typeof row.agentLogs === 'string') {
      try {
        agentLogs = JSON.parse(row.agentLogs) as AgentLogEntry[];
      } catch {
        agentLogs = [];
      }
    } else if (Array.isArray(row.agentLogs)) {
      agentLogs = row.agentLogs as AgentLogEntry[];
    }

    let versions: ProjectVersion[] = [];
    if (typeof row.versions === 'string') {
      try {
        versions = JSON.parse(row.versions) as ProjectVersion[];
      } catch {
        versions = [];
      }
    } else if (Array.isArray(row.versions)) {
      versions = row.versions as ProjectVersion[];
    }
    if (versions.length > 0 && typeof versions[0].version !== 'number') {
      const sorted = [...versions].sort(
        (a: ProjectVersion, b: ProjectVersion) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const versionMap = new Map<string, number>();
      sorted.forEach((v: ProjectVersion, i: number) => {
        versionMap.set(v.id, i + 1);
      });
      versions = versions.map((v: ProjectVersion) => ({
        ...v,
        version: versionMap.get(v.id) ?? 1,
      }));
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      style: row.style as AppStyle,
      status: row.status as Project['status'],
      generatedHtml: row.generatedHtml,
      agentLogs,
      versions,
      shareToken: row.shareToken ?? null,
      isPublic: row.isPublic ?? false,
      raceMode: row.raceMode ?? false,
      raceHtmlA: row.raceHtmlA ?? '',
      raceHtmlB: row.raceHtmlB ?? '',
      raceWinner: row.raceWinner ?? '',
      fixerRounds: row.fixerRounds ?? 0,
      finalScore: row.finalScore ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
