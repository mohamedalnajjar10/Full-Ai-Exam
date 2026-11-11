import { Test, TestingModule } from '@nestjs/testing';
import { StagingController } from './staging.controller';
import { StagingService } from '../services/staging.service';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

describe('StagingController', () => {
  let controller: StagingController;
  let stagingService: any;

  beforeEach(async () => {
    stagingService = {
      list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getById: jest.fn().mockResolvedValue({ id: 'staged-1' }),
      update: jest.fn().mockResolvedValue({ id: 'staged-1' }),
      approve: jest.fn().mockResolvedValue({ id: 'bank-q-1' }),
      reject: jest
        .fn()
        .mockResolvedValue({ id: 'staged-1', status: 'REJECTED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StagingController],
      providers: [{ provide: StagingService, useValue: stagingService }],
    }).compile();

    controller = module.get<StagingController>(StagingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list staged questions', async () => {
    await controller.list({ page: 1, limit: 10 });
    expect(stagingService.list).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('should approve staged question with pedagogical metadata', async () => {
    const mockUser = { id: 'admin-1' } as any;
    const dto = {
      difficulty: DifficultyLevel.HARD,
      bloomTaxonomy: BloomTaxonomyLevel.ANALYZE,
      topicId: 'thermodynamics',
    };

    const result = await controller.approve('staged-1', dto, mockUser);
    expect(result.id).toBe('bank-q-1');
    expect(stagingService.approve).toHaveBeenCalledWith(
      'staged-1',
      dto,
      'admin-1',
    );
  });

  it('should reject staged question', async () => {
    const mockUser = { id: 'admin-1' } as any;
    const result = await controller.reject('staged-1', mockUser);
    expect(result.status).toBe('REJECTED');
    expect(stagingService.reject).toHaveBeenCalledWith('staged-1', 'admin-1');
  });
});
