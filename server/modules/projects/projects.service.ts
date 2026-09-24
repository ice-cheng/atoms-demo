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
} from '@shared/api.interface';
import { HtmlGeneratorService } from './html-generator.service';
import { LlmGeneratorService, type StreamEvent } from './llm-generator.service';

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
      await this.refundCredits(userId, 10);
      await this.db
        .update(atomsProjects)
        .set({
          status: 'failed',
          agentLogs: JSON.stringify(this.buildAgentLogEntries(logsByAgent)),
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));
    } else {
      const html = finalHtml || this.htmlGenerator.generate(description, style);
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
      await this.refundCredits(userId, 20);
      await this.db
        .update(atomsProjects)
        .set({
          status: 'failed',
          agentLogs: JSON.stringify(this.buildAgentLogEntries(logsByAgent)),
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));
    } else {
      const primaryHtml = htmlA || htmlB;
      await this.db
        .update(atomsProjects)
        .set({
          status: 'completed',
          generatedHtml: primaryHtml,
          raceHtmlA: htmlA,
          raceHtmlB: htmlB,
          agentLogs: JSON.stringify(this.buildAgentLogEntries(logsByAgent)),
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));

      yield {
        type: 'race_done',
        htmlA,
        htmlB,
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

    const version: ProjectVersion = {
      id: `v_${Date.now()}_race_loser`,
      html: loserHtml,
      description: `竞速模式备选版本（${winner === 'A' ? 'B' : 'A'}）`,
      createdAt: new Date().toISOString(),
    };
    const newVersions: ProjectVersion[] = [version, ...project.versions].slice(0, 10);

    const updated = await this.db
      .update(atomsProjects)
      .set({
        generatedHtml: winnerHtml,
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

    const version: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: project.generatedHtml,
      description: project.description,
      createdAt: new Date().toISOString(),
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

    const cost = options.iteration ? 5 : 10;
    await this.deductCredits(userId, cost);

    const newDescription = options.description?.trim() || project.description;

    const version: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: project.generatedHtml,
      description: project.description,
      createdAt: new Date().toISOString(),
    };

    const newVersions: ProjectVersion[] = [version, ...project.versions].slice(0, 10);

    await this.db
      .update(atomsProjects)
      .set({
        description: newDescription,
        versions: JSON.stringify(newVersions),
        status: 'building',
        updatedAt: new Date(),
      })
      .where(eq(atomsProjects.id, id))
      .returning();

    return this.getProject(id, userId);
  }

  async *streamRebuildProject(
    projectId: string,
    userId: string,
    description: string,
    style: AppStyle,
    existingHtml: string,
    cost: number,
    modifyInstruction?: string,
  ): AsyncGenerator<StreamEvent> {
    const logsByAgent: Record<string, string> = {
      engineer: '',
    };
    let finalHtml = '';
    let hasError = false;

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
        if (event.type === 'done' && event.fullHtml) {
          finalHtml = event.fullHtml;
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

    if (hasError || !finalHtml) {
      if (!hasError) {
        yield {
          type: 'error',
          error: '生成的 HTML 为空，请重试',
          timestamp: new Date().toISOString(),
        };
      }
      await this.refundCredits(userId, cost);
      await this.db
        .update(atomsProjects)
        .set({
          status: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));
    } else {
      const html = finalHtml || this.htmlGenerator.generate(description, style);
      await this.db
        .update(atomsProjects)
        .set({
          status: 'completed',
          generatedHtml: html,
          agentLogs: sql`jsonb_build_array(
            jsonb_build_object(
              'agent', 'engineer',
              'agent_name', 'Engineer',
              'message', ${logsByAgent['engineer'] || '代码已更新'},
              'timestamp', ${new Date().toISOString()}
            )
          ) || ${sql`${atomsProjects.agentLogs}`}`,
          updatedAt: new Date(),
        })
        .where(eq(atomsProjects.id, projectId));
    }
  }

  async *streamDebugFix(
    projectId: string,
    userId: string,
    existingHtml: string,
    errors: string,
    style: AppStyle,
    cost: number,
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
      await this.refundCredits(userId, cost);
    } else {
      const currentSnapshot: ProjectVersion = {
        id: `v_${Date.now()}`,
        html: existingHtml,
        description: '修复前版本',
        createdAt: new Date().toISOString(),
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

        const newVersions: ProjectVersion[] = [
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
            generatedHtml: finalHtml,
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

    const currentSnapshot: ProjectVersion = {
      id: `v_${Date.now()}`,
      html: project.generatedHtml,
      description: project.description,
      createdAt: new Date().toISOString(),
    };

    const newVersions: ProjectVersion[] = [
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

  private async refundCredits(userId: string, amount: number): Promise<void> {
    try {
      await this.db
        .update(atomsUsers)
        .set({ credits: sql`${atomsUsers.credits} + ${amount}` })
        .where(eq(atomsUsers.id, userId));
      this.logger.log(`已退还 ${amount} Credits 给用户 ${userId}`);
    } catch (error) {
      this.logger.error('退还 Credits 失败', error);
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
