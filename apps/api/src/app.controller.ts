import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check with DB and Redis connectivity' })
  @ApiResponse({ status: 200, description: 'Service health status' })
  @ApiResponse({ status: 503, description: 'Essential service unavailable' })
  async getHealth() {
    const health = await this.appService.getHealth();
    if (health.services.database !== 'ok') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe for orchestrators' })
  @ApiResponse({
    status: 200,
    description: 'Service is ready to handle traffic',
  })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async getReadiness() {
    const health = await this.appService.getHealth();
    if (health.services.database !== 'ok') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Public()
  @Get('health/live')
  @ApiOperation({ summary: 'Liveness probe for orchestrators' })
  @ApiResponse({ status: 200, description: 'Process is alive' })
  getLiveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
