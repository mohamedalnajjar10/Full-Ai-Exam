import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { StyleUploadService } from './style-upload.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';

describe('StyleUploadService', () => {
  let service: StyleUploadService;
  let prisma: any;
  let storage: any;
  let queue: any;

  beforeEach(async () => {
    prisma = {
      styleSourceUpload: {
        create: jest.fn().mockResolvedValue({
          id: 'upload-1',
          status: 'PROCESSING',
        }),
        findUnique: jest.fn(),
      },
    };

    storage = {
      uploadFile: jest.fn().mockResolvedValue('temp-style-sources/test.pdf'),
    };

    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleUploadService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(15 * 1024 * 1024),
          },
        },
        { provide: getQueueToken('style-extraction-queue'), useValue: queue },
      ],
    }).compile();

    service = module.get<StyleUploadService>(StyleUploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should accept and process a PDF file', async () => {
    const file = {
      originalname: 'questions.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
      size: 1024,
    } as Express.Multer.File;

    const result = await service.uploadAndEnqueue('student-1', file);
    expect(result.uploadId).toBe('upload-1');
    expect(result.status).toBe('PROCESSING');
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('temp-style-sources/'),
      file.buffer,
      'application/pdf',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'extract-style-matrix',
      expect.objectContaining({
        uploadId: 'upload-1',
        mimeType: 'application/pdf',
      }),
      expect.any(Object),
    );
  });

  it('should accept and process an image file (PNG / JPEG)', async () => {
    const file = {
      originalname: 'question_sheet.png',
      mimetype: 'application/octet-stream', // e.g. client sent octet-stream with .png
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      size: 2048,
    } as Express.Multer.File;

    const result = await service.uploadAndEnqueue('student-1', file);
    expect(result.uploadId).toBe('upload-1');
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('temp-style-sources/'),
      file.buffer,
      'image/png',
    );
  });

  it('should reject unsupported file types', async () => {
    const file = {
      originalname: 'document.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello'),
      size: 1024,
    } as Express.Multer.File;

    await expect(service.uploadAndEnqueue('student-1', file)).rejects.toThrow(
      BadRequestException,
    );
  });
});
