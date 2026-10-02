import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  BadRequestException,
  NotFoundException,
  Res,
  Query,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProjectsService } from './projects.service';
import type { StreamEvent } from './llm-generator.service';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import type {
  Project,
  ProjectListResponse,
  CreateProjectRequest,
  RebuildProjectRequest,
  DashboardStats,
  AppStyle,
  ShareProjectResponse,
} from '@shared/api.interface';
import {
  IsString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

const VALID_STYLES: AppStyle[] = ['minimal', 'dark', 'gradient', 'professional'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CreateProjectDto implements CreateProjectRequest {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsIn(VALID_STYLES)
  @Type(() => String)
  style!: AppStyle;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  raceMode?: boolean;
}

class RebuildProjectDto implements RebuildProjectRequest {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  iteration?: boolean;
}

class RollbackVersionDto {
  @IsString()
  @IsNotEmpty()
  versionId!: string;
}

class SelectWinnerDto {
  @IsString()
  @IsIn(['A', 'B'])
  winner!: 'A' | 'B';
}

class DebugFixDto {
  @IsString()
  @IsNotEmpty()
  html!: string;

  @IsString()
  @IsNotEmpty()
  errors!: string;
}

@Controller('api/projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  private static readonly activeStreams = new Map<
    string,
    {
      lastHeartbeatAt: number;
      hasHeartbeat: boolean;
      userId: string;
      cost: number;
      label: string;
      aborted: boolean;
      abortController: AbortController;
    }
  >();

  static refreshHeartbeat(projectId: string): number | null {
    const stream = ProjectsController.activeStreams.get(projectId);
    if (!stream) return null;
    stream.lastHeartbeatAt = Date.now();
    stream.hasHeartbeat = true;
    return stream.lastHeartbeatAt;
  }

  static getStreamInfo(projectId: string): { userId: string; cost: number; label: string } | null {
    const stream = ProjectsController.activeStreams.get(projectId);
    if (!stream) return null;
    return { userId: stream.userId, cost: stream.cost, label: stream.label };
  }

  static cancelStream(projectId: string): boolean {
    const stream = ProjectsController.activeStreams.get(projectId);
    if (!stream) return false;
    if (stream.aborted) return true;
    stream.aborted = true;
    stream.abortController.abort();
    return true;
  }

  private async pipeSseStream(
    req: Request,
    res: Response,
    stream: AsyncGenerator<StreamEvent>,
    projectId: string,
    userId: string,
    cost: number,
    label: string,
    abortController: AbortController,
  ): Promise<void> {
    let clientDisconnected = false;
    let streamEndedNormally = false;
    let lastEventAt = Date.now();
    const IDLE_TIMEOUT_MS = 120_000;
    const HEARTBEAT_CHECK_INTERVAL_MS = 10_000;
    const HEARTBEAT_TIMEOUT_MS = 60_000;

    ProjectsController.activeStreams.set(projectId, {
      lastHeartbeatAt: Date.now(),
      hasHeartbeat: false,
      userId,
      cost,
      label,
      aborted: false,
      abortController,
    });

    const handleDisconnect = (reason: string): void => {
      if (clientDisconnected) return;
      clientDisconnected = true;
      const streamInfo = ProjectsController.activeStreams.get(projectId);
      if (streamInfo) streamInfo.aborted = true;
      this.logger.warn(
        `[SSE][${label}] ${reason} project=${projectId}，触发 markProjectFailed 退还 ${cost} credits`,
      );
      void this.projectsService.markProjectFailed(projectId, userId, cost);
    };

    const onClose = (): void => handleDisconnect('客户端断开连接');
    req.on('close', onClose);

    const writeSse = (event: string, data: string): boolean => {
      if (res.writableEnded || res.destroyed) return false;
      const ok = res.write(`event: ${event}\ndata: ${data}\n\n`);
      if (typeof (res as any).flush === 'function') (res as any).flush();
      if (!ok && !res.writableEnded && !res.destroyed) {
        res.once('drain', () => {});
      }
      return !res.writableEnded && !res.destroyed;
    };

    const keepaliveInterval = setInterval(() => {
      if (clientDisconnected) return;
      if (res.writableEnded || res.destroyed) {
        handleDisconnect('连接已不可写(keepalive检测)');
        return;
      }
      const now = Date.now();
      if (now - lastEventAt > IDLE_TIMEOUT_MS) {
        this.logger.warn(
          `[SSE][${label}] 空闲超时 ${Math.floor((now - lastEventAt) / 1000)}s 无事件，主动终止 project=${projectId}`,
        );
        handleDisconnect('空闲超时终止');
        return;
      }
      res.write(': keepalive\n\n');
      if (typeof (res as any).flush === 'function') (res as any).flush();
    }, 15000);

    const heartbeatCheckInterval = setInterval(() => {
      if (clientDisconnected || streamEndedNormally) return;
      const streamInfo = ProjectsController.activeStreams.get(projectId);
      if (!streamInfo) {
        handleDisconnect('流不存在(heartbeat)');
        return;
      }
      if (streamInfo.aborted) return;
      if (!streamInfo.hasHeartbeat) return;
      const now = Date.now();
      const idleMs = now - streamInfo.lastHeartbeatAt;
      if (idleMs > HEARTBEAT_TIMEOUT_MS) {
        this.logger.warn(
          `[SSE][${label}] 心跳超时 ${Math.floor(idleMs / 1000)}s 无心跳，判定客户端失联，终止生成 project=${projectId}`,
        );
        streamInfo.aborted = true;
        streamInfo.abortController.abort();
        if (!res.writableEnded && !res.destroyed) {
          const ok = res.write(
            `event: error\ndata: ${JSON.stringify({
              type: 'error',
              error: '连接超时，生成已终止（心跳失联）',
              timestamp: new Date().toISOString(),
            })}\n\n`,
          );
          if (ok && typeof (res as any).flush === 'function') (res as any).flush();
        }
        handleDisconnect('心跳超时判定失联');
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    try {
      for await (const event of stream) {
        if (clientDisconnected) break;
        const streamInfo = ProjectsController.activeStreams.get(projectId);
        if (streamInfo?.aborted) break;
        if (res.writableEnded || res.destroyed) {
          handleDisconnect('连接已不可写(写前检测)');
          break;
        }
        const ok = writeSse(event.type, JSON.stringify(event));
        if (!ok) {
          handleDisconnect('写入失败(连接已关闭)');
          break;
        }
        lastEventAt = Date.now();
      }
      streamEndedNormally = !clientDisconnected;
    } catch (error) {
      if (abortController.signal.aborted) {
        this.logger.warn(
          `[SSE][${label}] 生成流被心跳中止 project=${projectId}`,
        );
      } else {
        this.logger.error(`${label} 流式生成异常`, error);
      }
      if (!clientDisconnected && !res.writableEnded && !abortController.signal.aborted) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : '生成失败',
            timestamp: new Date().toISOString(),
          })}\n\n`,
        );
        if (typeof (res as any).flush === 'function') (res as any).flush();
      }
    } finally {
      clearInterval(keepaliveInterval);
      clearInterval(heartbeatCheckInterval);
      ProjectsController.activeStreams.delete(projectId);
      req.off('close', onClose);
      if (!res.writableEnded) {
        try { res.end(); } catch { /* ignore */ }
      }
    }
  }

  @Get('stats/dashboard')
  async getDashboardStats(@Req() req: Request): Promise<DashboardStats> {
    const userId = await this.extractUserId(req);
    return this.projectsService.getDashboardStats(userId);
  }

  @Get()
  async getProjects(@Req() req: Request): Promise<ProjectListResponse> {
    const userId = await this.extractUserId(req);
    return this.projectsService.getProjects(userId);
  }

  @Get(':id')
  async getProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.getProject(id, userId);
  }

  @Post()
  async createProject(
    @Req() req: Request,
    @Body() body: CreateProjectDto,
  ): Promise<Project> {
    const userId = await this.extractUserId(req);
    if (!body.description || !body.description.trim()) {
      throw new BadRequestException('描述不能为空');
    }
    if (!VALID_STYLES.includes(body.style)) {
      throw new BadRequestException('无效的样式类型');
    }
    return this.projectsService.createProject(
      userId,
      body.description.trim(),
      body.style,
      body.name,
    );
  }

  @Post('stream/generate')
  async streamCreateProject(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: CreateProjectDto,
  ): Promise<void> {
    const userId = await this.extractUserId(req);
    if (!body.description || !body.description.trim()) {
      throw new BadRequestException('描述不能为空');
    }
    if (!VALID_STYLES.includes(body.style)) {
      throw new BadRequestException('无效的样式类型');
    }

    const raceMode = body.raceMode ?? false;
    const brandKit = await this.userService.getBrandKit(userId);
    const activeBrandKit = brandKit.enabled ? brandKit : null;

    const project = await this.projectsService.createProject(
      userId,
      body.description.trim(),
      body.style,
      body.name,
      raceMode,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Accel-Buffering-Disable', 'true');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    res.write(`event: project_created
data: ${JSON.stringify(project)}

`);

    const cost = raceMode ? 20 : 10;
    const abortController = new AbortController();

    const stream = raceMode
      ? this.projectsService.streamRaceGenerateProject(
          project.id,
          userId,
          body.description.trim(),
          body.style,
          activeBrandKit,
          abortController.signal,
        )
      : this.projectsService.streamGenerateProject(
          project.id,
          userId,
          body.description.trim(),
          body.style,
          activeBrandKit,
          abortController.signal,
        );

    res.write(`event: project_created\ndata: ${JSON.stringify(project)}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();

    await this.pipeSseStream(req, res, stream, project.id, userId, cost, 'create', abortController);
  }

  @Delete(':id')
  async deleteProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    await this.projectsService.deleteProject(id, userId);
    return { success: true };
  }

  @Post(':id/rebuild')
  async rebuildProject(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RebuildProjectDto,
  ): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.rebuildProject(id, userId, {
      description: body.description,
      iteration: body.iteration,
    });
  }

  @Post(':id/heartbeat')
  async heartbeat(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ ok: boolean; lastHeartbeat: string | null }> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    const streamInfo = ProjectsController.activeStreams.get(id);
    if (!streamInfo) {
      this.logger.warn(`[SSE][heartbeat] 流不存在，可能在其他实例 project=${id}`);
      return { ok: false, lastHeartbeat: null };
    }
    if (streamInfo.userId !== userId) {
      throw new NotFoundException('项目不存在');
    }
    streamInfo.lastHeartbeatAt = Date.now();
    streamInfo.hasHeartbeat = true;
    this.logger.log(`[SSE][heartbeat] 心跳刷新成功 project=${id}`);
    return { ok: true, lastHeartbeat: new Date(streamInfo.lastHeartbeatAt).toISOString() };
  }

  @Post(':id/cancel')
  async cancelProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ ok: boolean; status: string; refunded: boolean }> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    const project = await this.projectsService.getProject(id, userId);

    if (project.status !== 'building') {
      return { ok: true, status: project.status, refunded: false };
    }

    const cost = project.raceMode ? 20 : 10;
    const cancelled = ProjectsController.cancelStream(id);
    if (cancelled) {
      this.logger.log(`[cancel] 本实例流已中止 project=${id}`);
    } else {
      this.logger.warn(
        `[cancel] 本实例无活跃流（可能在其他实例），直接标记失败退款 project=${id}`,
      );
    }

    const result = await this.projectsService.markProjectFailed(id, userId, cost);
    return { ok: true, status: result.refunded ? 'cancelled' : project.status, refunded: result.refunded };
  }

  @Post(':id/rebuild/stream')
  async streamRebuildProject(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: RebuildProjectDto,
  ): Promise<void> {
    const userId = await this.extractUserId(req);
    this.logger.log(
      `[v3] streamRebuildProject 入参: description=${body.description ? body.description.slice(0, 80) : '空'}, iteration=${String(body.iteration)}, 扣credit=5`,
    );

    const rawDesc = body.description?.trim() || '';

    const project = await this.projectsService.rebuildProject(id, userId, {
      description: rawDesc || undefined,
      iteration: true,
    });

    const cost = 5;
    const modifyInstruction = rawDesc;
    const abortController = new AbortController();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Accel-Buffering-Disable', 'true');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    res.write(`event: rebuild_started\ndata: ${JSON.stringify(project)}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();

    const stream = this.projectsService.streamRebuildProject(
      id,
      userId,
      project.description,
      project.style,
      project.generatedHtml,
      cost,
      modifyInstruction,
      abortController.signal,
    );

    await this.pipeSseStream(req, res, stream, id, userId, cost, 'rebuild', abortController);
  }

  @Get(':id/preview')
  async getProjectPreview(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ html: string }> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.getProjectPreview(id, userId);
  }

  @Post(':id/share')
  async shareProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ShareProjectResponse> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.shareProject(id, userId);
  }

  @Post(':id/race/winner')
  async selectRaceWinner(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SelectWinnerDto,
  ): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.selectRaceWinner(id, userId, body.winner);
  }

  @Post(':id/debug/stream')
  async streamDebugFix(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: DebugFixDto,
  ): Promise<void> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);

    const project = await this.projectsService.getProject(id, userId);
    const cost = 5;
    const abortController = new AbortController();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Accel-Buffering-Disable', 'true');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    const stream = this.projectsService.streamDebugFix(
      id,
      userId,
      body.html,
      body.errors,
      project.style,
      cost,
      abortController.signal,
    );

    await this.pipeSseStream(req, res, stream, id, userId, cost, 'debug', abortController);
  }

  @Post(':id/apply-brand')
  async applyBrandKit(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    const brandKit = await this.userService.getBrandKit(userId);
    if (!brandKit.enabled) {
      throw new BadRequestException('请先在设置中启用品牌定制');
    }
    return this.projectsService.applyBrandKitToProject(id, userId, brandKit);
  }

  @Post(':id/rollback')
  async rollbackVersion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RollbackVersionDto,
  ): Promise<Project> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    return this.projectsService.rollbackVersion(id, userId, body.versionId);
  }

  @Delete(':id/share')
  async unshareProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    if (!UUID_REGEX.test(id)) {
      throw new NotFoundException('项目不存在');
    }
    const userId = await this.extractUserId(req);
    await this.projectsService.unshareProject(id, userId);
    return { success: true };
  }

  private async extractUserId(req: Request): Promise<string> {
    return this.authService.getUserIdFromHeader(req.headers.authorization);
  }
}
