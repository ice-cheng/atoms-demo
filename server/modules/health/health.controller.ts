import { Controller, Get } from '@nestjs/common';

export const APP_VERSION = '3.39.1';
export const RELEASE_ID = 'release_20261008_v3_39_1';

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
