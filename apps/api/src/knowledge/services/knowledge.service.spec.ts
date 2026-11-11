import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { IngestionSettingsService } from './ingestion-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GeminiService } from '../../gemini/gemini.service';
import { DEFAULT_INGESTION_OPTIONS, INGESTION_QUEUE } from '../knowledge.types';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let prisma: any;
  let storage: any;
  let queue: any;
  let settings: any;

  const file = (name: string, mimetype: string, head = '%PDF-1.7') =>
    ({
      originalname: name,
      mimetype,
      buffer: Buffer.from(head),
      size: 2048,
    }) as Express.Multer.File;

  beforeEach(async () => {
    const tx = {
      examFile: {
        create: jest.fn().mockResolvedValue({ id: 'ef-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'ef-1' }),
      },
      subject: {
        update: jest.fn().mockResolvedValue({ id: 's1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 's1', bookPdfKey: null }),
      },
      knowledgeDocument: {
        create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'doc-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      examBankQuestion: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma = {
      subject: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', branchId: 'b1' }),
      },
      knowledgeDocument: { findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn) => fn(tx)),
      tx,
    };
    storage = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn(), isPaused: jest.fn().mockResolvedValue(false) };
    settings = {
      get: jest.fn().mockResolvedValue(DEFAULT_INGESTION_OPTIONS),
      save: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        {
          provide: GeminiService,
          useValue: { embeddingInfo: () => ({ enabled: true }) },
        },
        { provide: IngestionSettingsService, useValue: settings },
        { provide: getQueueToken(INGESTION_QUEUE), useValue: queue },
        { provide: getQueueToken('question-embedding'), useValue: queue },
      ],
    }).compile();
    service = mod.get(KnowledgeService);
    jest.spyOn(service, 'getJob').mockResolvedValue({ id: 'doc-1' } as any);
  });

  it('stores an exam, links an ExamFile and queues processing with the batch options', async () => {
    await service.upload(
      file('math_2025.pdf', 'application/pdf'),
      {
        kind: 'EXAM',
        subjectId: 's1',
        year: 2025,
        term: 'الدورة الأولى',
        options: { chunkSize: 400, autoApprove: true },
      },
      'admin',
    );

    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^exam-files\//),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(prisma.tx.examFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subjectId: 's1',
        branchId: 'b1',
        year: 2025,
      }),
    });
    const docData = prisma.tx.knowledgeDocument.create.mock.calls[0][0].data;
    expect(docData).toMatchObject({
      kind: 'EXAM',
      examFileId: 'ef-1',
      bookPart: null,
    });
    expect(docData.options).toMatchObject({
      chunkSize: 400,
      autoApprove: true,
      overlap: 64,
    });
    // آخر خيارات بتصير الافتراضية
    expect(settings.save).toHaveBeenCalledWith(
      expect.objectContaining({ chunkSize: 400 }),
      'admin',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { documentId: 'doc-1' },
      expect.any(Object),
    );
  });

  it('stores books under knowledge/books without an ExamFile', async () => {
    await service.upload(
      file('bio.pdf', 'application/pdf'),
      { kind: 'BOOK', subjectId: 's1', bookPart: '2' },
      'admin',
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^knowledge\/books\//),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(prisma.tx.examFile.create).not.toHaveBeenCalled();
    expect(
      prisma.tx.knowledgeDocument.create.mock.calls[0][0].data,
    ).toMatchObject({ kind: 'BOOK', bookPart: '2' });
  });

  it('rejects unsupported file types before storing anything', async () => {
    await expect(
      service.upload(
        file('notes.zip', 'application/zip', 'PK\u0003\u0004'),
        { kind: 'BOOK', subjectId: 's1' },
        'a',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('requires year and term for exams', async () => {
    await expect(
      service.upload(
        file('x.pdf', 'application/pdf'),
        { kind: 'EXAM', subjectId: 's1' },
        'a',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to retry a job that is still running', async () => {
    prisma.knowledgeDocument.findUnique.mockResolvedValue({
      id: 'd',
      stage: 'EMBEDDING',
    });
    await expect(service.retry('d')).rejects.toThrow(ConflictException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  describe('remove', () => {
    it('throws NotFoundException if the document does not exist', async () => {
      prisma.knowledgeDocument.findUnique.mockResolvedValue(null);
      await expect(service.remove('unknown')).rejects.toThrow();
    });

    it('resets subject.bookPdfKey to null when deleted document is active book and no other book remains', async () => {
      prisma.knowledgeDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        kind: 'BOOK',
        s3Key: 'knowledge/books/b1.pdf',
        subjectId: 's1',
      });
      prisma.tx.subject.findUnique.mockResolvedValue({
        id: 's1',
        bookPdfKey: 'knowledge/books/b1.pdf',
      });
      prisma.tx.knowledgeDocument.findFirst.mockResolvedValue(null);

      const res = await service.remove('doc-1');

      expect(res).toEqual({ deleted: true });
      expect(prisma.tx.subject.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          bookPdfKey: null,
          bookPdfOriginalName: null,
          bookPdfSize: null,
        },
      });
      expect(prisma.tx.knowledgeDocument.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
      expect(storage.deleteFile).toHaveBeenCalledWith('knowledge/books/b1.pdf');
    });

    it('reassigns subject.bookPdfKey to next remaining BOOK document', async () => {
      prisma.knowledgeDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        kind: 'BOOK',
        s3Key: 'knowledge/books/b1.pdf',
        subjectId: 's1',
      });
      prisma.tx.subject.findUnique.mockResolvedValue({
        id: 's1',
        bookPdfKey: 'knowledge/books/b1.pdf',
      });
      prisma.tx.knowledgeDocument.findFirst.mockResolvedValue({
        id: 'doc-2',
        kind: 'BOOK',
        s3Key: 'knowledge/books/b2.pdf',
        originalName: 'remaining-book.pdf',
        fileSize: 4096,
      });

      const res = await service.remove('doc-1');

      expect(res).toEqual({ deleted: true });
      expect(prisma.tx.subject.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          bookPdfKey: 'knowledge/books/b2.pdf',
          bookPdfOriginalName: 'remaining-book.pdf',
          bookPdfSize: 4096,
        },
      });
    });

    it('does not touch subject if subject.bookPdfKey does not match doc.s3Key', async () => {
      prisma.knowledgeDocument.findUnique.mockResolvedValue({
        id: 'doc-1',
        kind: 'BOOK',
        s3Key: 'knowledge/books/different.pdf',
        subjectId: 's1',
      });
      prisma.tx.subject.findUnique.mockResolvedValue({
        id: 's1',
        bookPdfKey: 'knowledge/books/active.pdf',
      });

      await service.remove('doc-1');

      expect(prisma.tx.subject.update).not.toHaveBeenCalled();
    });
  });
});
