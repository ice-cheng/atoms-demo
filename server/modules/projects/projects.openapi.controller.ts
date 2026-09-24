import { Controller, Get, Param } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import type { SharedProjectResponse } from '@shared/api.interface';

@Controller('openapi/projects')
export class ProjectsOpenController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('share/:token')
  async getSharedProject(
    @Param('token') token: string,
  ): Promise<SharedProjectResponse> {
    return this.projectsService.getSharedProject(token);
  }
}
