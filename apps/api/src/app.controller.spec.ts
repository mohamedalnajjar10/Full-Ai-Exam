import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let mockAppService: {
    getHello: jest.Mock;
    getHealth: jest.Mock;
  };

  beforeEach(async () => {
    mockAppService = {
      getHello: jest.fn().mockReturnValue('Hello World!'),
      getHealth: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health check & probes', () => {
    it('returns health payload when database is healthy', async () => {
      const healthyPayload = {
        status: 'ok',
        timestamp: '2026-10-21T00:00:00.000Z',
        services: { database: 'ok', redis: 'ok' },
      };
      mockAppService.getHealth.mockResolvedValue(healthyPayload);

      const result = await appController.getHealth();
      expect(result).toEqual(healthyPayload);
    });

    it('throws ServiceUnavailableException (503) when database is down', async () => {
      const degradedPayload = {
        status: 'degraded',
        timestamp: '2026-10-21T00:00:00.000Z',
        services: { database: 'error', redis: 'ok' },
      };
      mockAppService.getHealth.mockResolvedValue(degradedPayload);

      await expect(appController.getHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('readiness probe returns 200 when ready and throws 503 when DB fails', async () => {
      mockAppService.getHealth.mockResolvedValue({
        status: 'ok',
        timestamp: '2026-10-21T00:00:00.000Z',
        services: { database: 'ok', redis: 'ok' },
      });

      const ready = await appController.getReadiness();
      expect(ready.status).toBe('ok');

      mockAppService.getHealth.mockResolvedValue({
        status: 'degraded',
        timestamp: '2026-10-21T00:00:00.000Z',
        services: { database: 'error', redis: 'ok' },
      });

      await expect(appController.getReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('liveness probe returns ok', () => {
      const live = appController.getLiveness();
      expect(live.status).toBe('ok');
      expect(live.timestamp).toBeDefined();
    });
  });
});
