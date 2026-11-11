import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamBankService } from './exam-bank.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KnowledgeService } from '../../knowledge/services/knowledge.service';

describe('ExamBankService', () => {
  let service: ExamBankService;
  let prisma: any;
  let knowledge: any;
  let eventEmitter: any;

  const pdf = {
    originalname: 'calculus_2025.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
    size: 1024,
  } as Express.Multer.File;

  beforeEach(async () => {
    prisma = {
      subject: { findUnique: jest.fn() },
      knowledgeDocument: { findUnique: jest.fn() },
      examBankQuestion: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn((args) => ({ id: `new-${args.data.questionText}` })),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
    knowledge = { upload: jest.fn().mockResolvedValue({ id: 'doc-1' }) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamBankService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeService, useValue: knowledge },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(ExamBankService);
  });

  describe('uploadAndEnqueue', () => {
    it('routes the exam through the knowledge pipeline', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        branchId: 'branch-1',
      });
      prisma.knowledgeDocument.findUnique.mockResolvedValue({
        examFileId: 'file-1',
      });

      const result = await service.uploadAndEnqueue(
        pdf,
        {
          branchId: 'branch-1',
          subjectId: 'subject-1',
          year: 2025,
          term: 'First',
        },
        'admin-1',
      );

      expect(knowledge.upload).toHaveBeenCalledWith(
        pdf,
        { kind: 'EXAM', subjectId: 'subject-1', year: 2025, term: 'First' },
        'admin-1',
      );
      expect(result).toEqual({
        examFileId: 'file-1',
        documentId: 'doc-1',
        status: 'PENDING',
      });
    });

    it('rejects a subject from another branch', async () => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        branchId: 'other',
      });
      await expect(
        service.uploadAndEnqueue(
          pdf,
          {
            branchId: 'branch-1',
            subjectId: 'subject-1',
            year: 2025,
            term: 'First',
          },
          'a',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(knowledge.upload).not.toHaveBeenCalled();
    });

    it('404s for an unknown subject', async () => {
      prisma.subject.findUnique.mockResolvedValue(null);
      await expect(
        service.uploadAndEnqueue(
          pdf,
          { branchId: 'b', subjectId: 's', year: 2025, term: 'First' },
          'a',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('should soft-delete an exam bank question', async () => {
    prisma.examBankQuestion.findUnique.mockResolvedValue({
      id: 'q-1',
      deletedAt: null,
    });
    prisma.examBankQuestion.update.mockResolvedValue({
      id: 'q-1',
      deletedAt: new Date(),
    });

    const result = await service.softDeleteBankQuestion('q-1');
    expect(result.message).toBe('Question soft-deleted');
    expect(prisma.examBankQuestion.update).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  describe('bulk', () => {
    it('re-embed resets status and emits one update event per question', async () => {
      const res = await service.bulk({ action: 'reembed', ids: ['a', 'b'] });
      expect(res).toEqual({ affected: 2 });
      expect(prisma.examBankQuestion.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] }, deletedAt: null },
        data: { embeddingStatus: 'PENDING' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('difficulty change requires a difficulty', async () => {
      await expect(
        service.bulk({ action: 'difficulty', ids: ['a'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('importCsv', () => {
    beforeEach(() => {
      prisma.subject.findUnique.mockResolvedValue({
        id: 's1',
        branchId: 'b1',
        name: 'Math',
      });
    });

    it('imports valid rows and reports bad ones by line number', async () => {
      const csv = [
        'questionText,A,B,C,D,correctAnswer,explanation,year,term,difficulty,bloomTaxonomy,unit',
        '"What is $2+2$, exactly?",3,4,5,6,B,,2024,First,easy,remember,Arithmetic',
        'No answer,1,2,,,E,,2024,First,EASY,APPLY,',
        'Bad difficulty,1,2,,,A,,2024,First,SUPER,APPLY,',
      ].join('\n');

      const res = await service.importCsv('s1', csv);

      expect(res.imported).toBe(1);
      expect(res.errors).toEqual([
        { row: 3, message: 'correctAnswer is not one of the choices' },
        { row: 4, message: 'unknown difficulty "SUPER"' },
      ]);
      expect(prisma.examBankQuestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          questionText: 'What is $2+2$, exactly?',
          correctAnswer: 'B',
          difficulty: 'EASY',
          bloomTaxonomy: 'REMEMBER',
          topicId: 'Arithmetic',
          subjectId: 's1',
          branchId: 'b1',
        }),
        select: { id: true },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'question.approved',
        expect.anything(),
      );
    });

    it('requires questionText and correctAnswer columns', async () => {
      await expect(service.importCsv('s1', 'foo,bar\n1,2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
