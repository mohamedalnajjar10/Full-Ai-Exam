// @nestjs/schedule v12 ships ESM, which this CommonJS jest setup cannot load.
// The cron wiring is framework code; what needs covering is the cleanup body.
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 0 3 * * *' },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { TokenCleanupTask } from './token-cleanup.task';
import { TokenService } from '../services/token.service';

describe('TokenCleanupTask', () => {
  let task: TokenCleanupTask;
  let tokenService: { cleanupExpiredTokens: jest.Mock };

  beforeEach(async () => {
    tokenService = { cleanupExpiredTokens: jest.fn().mockResolvedValue(0) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupTask,
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    task = moduleRef.get(TokenCleanupTask);
  });

  it('purges expired refresh tokens', async () => {
    tokenService.cleanupExpiredTokens.mockResolvedValue(7);
    await task.purgeExpiredRefreshTokens();
    expect(tokenService.cleanupExpiredTokens).toHaveBeenCalledTimes(1);
  });

  it('swallows failures so a bad cleanup cannot take the app down', async () => {
    tokenService.cleanupExpiredTokens.mockRejectedValue(new Error('db gone'));
    await expect(task.purgeExpiredRefreshTokens()).resolves.toBeUndefined();
  });
});
