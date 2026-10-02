import { Controller, Get } from '@nestjs/common';

export const APP_VERSION = '3.22.0';
export const RELEASE_ID = 'release_20260930_v3_3';

@Controller('api/health')
export class HealthController {
  @Get()
  healthCheck(): {
    version: string;
    releaseId: string;
    serverTime: string;
    status: string;
  } {
    return {
      version: APP_VERSION,
      releaseId: RELEASE_ID,
      serverTime: new Date().toISOString(),
      status: 'ok',
    };
  }
}
