import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsOpenController } from './projects.openapi.controller';
import { ProjectsService } from './projects.service';
import { HtmlGeneratorService } from './html-generator.service';
import { LlmGeneratorService } from './llm-generator.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [ProjectsController, ProjectsOpenController],
  providers: [ProjectsService, HtmlGeneratorService, LlmGeneratorService],
})
export class ProjectsModule {}
