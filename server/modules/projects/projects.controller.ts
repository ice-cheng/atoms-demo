import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  BadRequestException,
  Res,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProjectsService } from './projects.service';
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
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

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
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`event: project_created
data: ${JSON.stringify(project)}

`);

    const stream = raceMode
      ? this.projectsService.streamRaceGenerateProject(
          project.id,
          userId,
          body.description.trim(),
          body.style,
          activeBrandKit,
        )
      : this.projectsService.streamGenerateProject(
          project.id,
          userId,
          body.description.trim(),
          body.style,
          activeBrandKit,
        );

    try {
      for await (const event of stream) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  @Delete(':id')
  async deleteProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
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
    const userId = await this.extractUserId(req);
    return this.projectsService.rebuildProject(id, userId, {
      description: body.description,
      iteration: body.iteration,
    });
  }

  @Post(':id/rebuild/stream')
  async streamRebuildProject(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: RebuildProjectDto,
  ): Promise<void> {
    const userId = await this.extractUserId(req);

    const project = await this.projectsService.rebuildProject(id, userId, {
      description: body.description,
      iteration: body.iteration,
    });

    const cost = body.iteration ? 5 : 10;
    const modifyInstruction = body.description?.trim();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`event: rebuild_started\ndata: ${JSON.stringify(project)}\n\n`);

    const stream = this.projectsService.streamRebuildProject(
      id,
      userId,
      project.description,
      project.style,
      project.generatedHtml,
      cost,
      modifyInstruction,
    );

    try {
      for await (const event of stream) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  @Get(':id/preview')
  async getProjectPreview(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ html: string }> {
    const userId = await this.extractUserId(req);
    return this.projectsService.getProjectPreview(id, userId);
  }

  @Post(':id/share')
  async shareProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<ShareProjectResponse> {
    const userId = await this.extractUserId(req);
    return this.projectsService.shareProject(id, userId);
  }

  @Post(':id/race/winner')
  async selectRaceWinner(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SelectWinnerDto,
  ): Promise<Project> {
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
    const userId = await this.extractUserId(req);

    const project = await this.projectsService.getProject(id, userId);
    const cost = 5;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const stream = this.projectsService.streamDebugFix(
      id,
      userId,
      body.html,
      body.errors,
      project.style,
      cost,
    );

    try {
      for await (const event of stream) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } finally {
      res.end();
    }
  }

  @Post(':id/apply-brand')
  async applyBrandKit(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<Project> {
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
    const userId = await this.extractUserId(req);
    return this.projectsService.rollbackVersion(id, userId, body.versionId);
  }

  @Delete(':id/share')
  async unshareProject(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const userId = await this.extractUserId(req);
    await this.projectsService.unshareProject(id, userId);
    return { success: true };
  }

  private async extractUserId(req: Request): Promise<string> {
    return this.authService.getUserIdFromHeader(req.headers.authorization);
  }
}
