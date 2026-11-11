import { Test, TestingModule } from '@nestjs/testing';
import { StyleExtractionProcessor } from './style-extraction.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { StorageService } from '../../storage/storage.service';
import { RedisService } from '../../redis/redis.service';
import { Job } from 'bullmq';

const mockPrisma = {
  styleSourceUpload: {
    update: jest.fn(),
  },
};

const mockGemini = {
  extractStyleMatrix: jest.fn(),
};

const mockStorage = {
  getFileBuffer: jest.fn(),
};

const mockRedis = {
  set: jest.fn(),
};

function makeJob(data: Record<string, unknown>): Job {
  return { data } as unknown as Job;
}

describe('StyleExtractionProcessor', () => {
  let processor: StyleExtractionProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleExtractionProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
        { provide: StorageService, useValue: mockStorage },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    processor = module.get<StyleExtractionProcessor>(StyleExtractionProcessor);
    jest.clearAllMocks();
  });

  const jobData = {
    uploadId: 'upload-123',
    s3Key: 'temp-style-sources/test.pdf',
    mimeType: 'application/pdf',
  };

  const styleMatrix = {
    averageQuestionLength: 25,
    latexDensity: 'MEDIUM' as const,
    distractorComplexity: 'MODERATE' as const,
    cognitiveDepth: 'APPLY',
    questionStructureNotes: 'Questions are clear and concise',
    sampleQuestions: ['What is X?', 'Calculate Y'],
  };

  it('should complete successfully: download → extract → cache → persist', async () => {
    const fileBuffer = Buffer.from('fake-pdf-content');
    mockStorage.getFileBuffer.mockResolvedValue(fileBuffer);
    mockGemini.extractStyleMatrix.mockResolvedValue(styleMatrix);
    mockRedis.set.mockResolvedValue(undefined);
    mockPrisma.styleSourceUpload.update.mockResolvedValue({});

    await processor.process(makeJob(jobData));

    // S3 download
    expect(mockStorage.getFileBuffer).toHaveBeenCalledWith(jobData.s3Key);

    // Gemini multimodal call
    expect(mockGemini.extractStyleMatrix).toHaveBeenCalledWith(
      fileBuffer,
      jobData.mimeType,
    );

    // Redis cache with 24h TTL
    expect(mockRedis.set).toHaveBeenCalledWith(
      `style_matrix:${jobData.uploadId}`,
      JSON.stringify(styleMatrix),
      86400,
    );

    // DB update to COMPLETED
    expect(mockPrisma.styleSourceUpload.update).toHaveBeenCalledWith({
      where: { id: jobData.uploadId },
      data: {
        status: 'COMPLETED',
        styleMatrix,
        errorLog: null,
      },
    });
  });

  it('should mark upload as FAILED and re-throw when S3 download fails', async () => {
    const error = new Error('S3 connection refused');
    mockStorage.getFileBuffer.mockRejectedValue(error);
    mockPrisma.styleSourceUpload.update.mockResolvedValue({});

    await expect(processor.process(makeJob(jobData))).rejects.toThrow(
      'S3 connection refused',
    );

    expect(mockPrisma.styleSourceUpload.update).toHaveBeenCalledWith({
      where: { id: jobData.uploadId },
      data: {
        status: 'FAILED',
        errorLog: 'S3 connection refused',
      },
    });
    expect(mockGemini.extractStyleMatrix).not.toHaveBeenCalled();
  });

  it('should mark upload as FAILED when Gemini extraction fails', async () => {
    mockStorage.getFileBuffer.mockResolvedValue(Buffer.from('data'));
    const error = new Error('Gemini returned non-parseable JSON');
    mockGemini.extractStyleMatrix.mockRejectedValue(error);
    mockPrisma.styleSourceUpload.update.mockResolvedValue({});

    await expect(processor.process(makeJob(jobData))).rejects.toThrow(
      'Gemini returned non-parseable JSON',
    );

    expect(mockPrisma.styleSourceUpload.update).toHaveBeenCalledWith({
      where: { id: jobData.uploadId },
      data: {
        status: 'FAILED',
        errorLog: 'Gemini returned non-parseable JSON',
      },
    });
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should cache style matrix in Redis before DB update', async () => {
    let redisSetCalled = false;
    let dbUpdateCalled = false;

    mockStorage.getFileBuffer.mockResolvedValue(Buffer.from('data'));
    mockGemini.extractStyleMatrix.mockResolvedValue(styleMatrix);
    mockRedis.set.mockImplementation(() => {
      redisSetCalled = true;
      return Promise.resolve();
    });
    mockPrisma.styleSourceUpload.update.mockImplementation(() => {
      dbUpdateCalled = true;
      expect(redisSetCalled).toBe(true); // Redis must be set BEFORE DB update
      return Promise.resolve({});
    });

    await processor.process(makeJob(jobData));

    expect(redisSetCalled).toBe(true);
    expect(dbUpdateCalled).toBe(true);
  });
});
