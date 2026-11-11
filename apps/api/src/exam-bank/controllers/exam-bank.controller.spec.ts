import { Test, TestingModule } from '@nestjs/testing';
import { ExamBankController } from './exam-bank.controller';
import { ExamBankService } from '../services/exam-bank.service';
import { HybridSearchService } from '../services/hybrid-search.service';

describe('ExamBankController', () => {
  let controller: ExamBankController;
  let examBankService: any;
  let hybridSearchService: any;

  beforeEach(async () => {
    examBankService = {
      uploadAndEnqueue: jest
        .fn()
        .mockResolvedValue({ examFileId: 'file-1', status: 'PENDING' }),
      listExamFiles: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      getExamFile: jest.fn().mockResolvedValue({ id: 'file-1' }),
      getBankQuestion: jest.fn().mockResolvedValue({ id: 'q-1' }),
      updateBankQuestion: jest.fn().mockResolvedValue({ id: 'q-1' }),
      softDeleteBankQuestion: jest
        .fn()
        .mockResolvedValue({ message: 'Question soft-deleted' }),
    };

    hybridSearchService = {
      search: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamBankController],
      providers: [
        { provide: ExamBankService, useValue: examBankService },
        { provide: HybridSearchService, useValue: hybridSearchService },
      ],
    }).compile();

    controller = module.get<ExamBankController>(ExamBankController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should upload file and return 201 with job status', async () => {
    const mockFile = { originalname: 'exam.pdf' } as Express.Multer.File;
    const mockUser = { id: 'admin-1' } as any;

    const result = await controller.upload(
      mockFile,
      { branchId: 'b-1', subjectId: 's-1', year: 2025, term: 'First' },
      mockUser,
    );

    expect(result.examFileId).toBe('file-1');
    expect(result.status).toBe('PENDING');
  });

  it('should delegate search to HybridSearchService', async () => {
    await controller.search({ query: 'quantum physics', page: 1, limit: 10 });
    expect(hybridSearchService.search).toHaveBeenCalledWith({
      query: 'quantum physics',
      page: 1,
      limit: 10,
    });
  });
});
