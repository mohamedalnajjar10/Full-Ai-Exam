import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SubjectService } from './subject.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const mockPrismaService = {
  branch: {
    findUnique: jest.fn(),
  },
  subject: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  knowledgeDocument: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockStorageService = {
  uploadFile: jest.fn(),
  getPresignedUrl: jest.fn(),
  getFileBuffer: jest.fn(),
  getFileStream: jest.fn(),
  deleteFile: jest.fn(),
};

const mockBranch = {
  id: 'branch-1',
  name: 'Scientific',
};

const mockSubjects = [
  { id: 'sub-1', name: 'Mathematics', branchId: 'branch-1' },
  { id: 'sub-2', name: 'Physics', branchId: 'branch-1' },
];

describe('SubjectService', () => {
  let service: SubjectService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubjectService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<SubjectService>(SubjectService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── create ───────────────────────────────────────────────────

  describe('create', () => {
    const createDto = { name: 'Mathematics', branchId: 'branch-1' };

    it('should create a subject successfully', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.subject.findUnique.mockResolvedValue(null);
      mockPrismaService.subject.create.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        branchId: 'branch-1',
        branch: mockBranch,
      });

      const result = await service.create(createDto);

      expect(mockPrismaService.branch.findUnique).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
      });
      expect(mockPrismaService.subject.findUnique).toHaveBeenCalledWith({
        where: {
          name_branchId: {
            name: 'Mathematics',
            branchId: 'branch-1',
          },
        },
      });
      expect(mockPrismaService.subject.create).toHaveBeenCalledWith({
        data: {
          name: 'Mathematics',
          branchId: 'branch-1',
        },
        include: {
          branch: { select: { id: true, name: true } },
        },
      });
      expect(result.id).toBe('sub-1');
    });

    it('should throw NotFoundException if branch not found', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.subject.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if subject with name already exists in branch', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'existing-sub',
        name: 'Mathematics',
        branchId: 'branch-1',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrismaService.subject.create).not.toHaveBeenCalled();
    });
  });

  // ── findAll & getAll ─────────────────────────────────────────

  describe('findAll', () => {
    it('should return all subjects with relations and count', async () => {
      mockPrismaService.subject.findMany.mockResolvedValue(mockSubjects);

      const result = await service.findAll();

      expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
        include: {
          branch: { select: { id: true, name: true } },
          _count: {
            select: {
              teachers: true,
              examFiles: true,
              examBankQuestions: true,
            },
          },
        },
      });
      expect(result).toEqual(mockSubjects);
    });

    it('should filter by branchId and search query', async () => {
      mockPrismaService.subject.findMany.mockResolvedValue([mockSubjects[0]]);

      const result = await service.findAll({
        branchId: 'branch-1',
        search: 'Math',
      });

      expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith({
        where: {
          branchId: 'branch-1',
          name: { contains: 'Math', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        include: {
          branch: { select: { id: true, name: true } },
          _count: {
            select: {
              teachers: true,
              examFiles: true,
              examBankQuestions: true,
            },
          },
        },
      });
      expect(result).toEqual([mockSubjects[0]]);
    });

    it('should delegate getAll to findAll', async () => {
      mockPrismaService.subject.findMany.mockResolvedValue(mockSubjects);

      const result = await service.getAll('branch-1');

      expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith({
        where: { branchId: 'branch-1' },
        orderBy: { name: 'asc' },
        include: {
          branch: { select: { id: true, name: true } },
          _count: {
            select: {
              teachers: true,
              examFiles: true,
              examBankQuestions: true,
            },
          },
        },
      });
      expect(result).toEqual(mockSubjects);
    });
  });

  // ── findOne & getById ────────────────────────────────────────

  describe('findOne', () => {
    const mockSubjectWithRelations = {
      id: 'sub-1',
      name: 'Mathematics',
      branchId: 'branch-1',
      branch: mockBranch,
      teachers: [],
      _count: { teachers: 0, examFiles: 0, examBankQuestions: 0 },
    };

    it('should return a subject by id', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(
        mockSubjectWithRelations,
      );

      const result = await service.findOne('sub-1');

      expect(mockPrismaService.subject.findUnique).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        include: {
          branch: { select: { id: true, name: true } },
          teachers: {
            select: {
              id: true,
              name: true,
              title: true,
              imageUrl: true,
            },
          },
          _count: {
            select: {
              teachers: true,
              examFiles: true,
              examBankQuestions: true,
            },
          },
        },
      });
      expect(result).toEqual(mockSubjectWithRelations);
    });

    it('should throw NotFoundException if subject not found', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delegate getById to findOne', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(
        mockSubjectWithRelations,
      );

      const result = await service.getById('sub-1');

      expect(result).toEqual(mockSubjectWithRelations);
    });
  });

  // ── update ───────────────────────────────────────────────────

  describe('update', () => {
    const existingSubject = {
      id: 'sub-1',
      name: 'Mathematics',
      branchId: 'branch-1',
    };

    it('should update subject name successfully', async () => {
      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce(existingSubject) // existing check
        .mockResolvedValueOnce(null); // uniqueness check
      mockPrismaService.subject.update.mockResolvedValue({
        id: 'sub-1',
        name: 'Advanced Mathematics',
        branchId: 'branch-1',
      });

      const result = await service.update('sub-1', {
        name: 'Advanced Mathematics',
      });

      expect(mockPrismaService.subject.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          name: 'Advanced Mathematics',
          branchId: undefined,
        },
        include: {
          branch: { select: { id: true, name: true } },
        },
      });
      expect(result.name).toBe('Advanced Mathematics');
    });

    it('should update branch if new branch exists', async () => {
      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce(existingSubject) // existing check
        .mockResolvedValueOnce(null); // uniqueness check
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: 'branch-2',
        name: 'Literary',
      });
      mockPrismaService.subject.update.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        branchId: 'branch-2',
      });

      const result = await service.update('sub-1', { branchId: 'branch-2' });

      expect(mockPrismaService.branch.findUnique).toHaveBeenCalledWith({
        where: { id: 'branch-2' },
      });
      expect(result.branchId).toBe('branch-2');
    });

    it('should throw NotFoundException if subject not found', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('nonexistent', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if new branch not found', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValueOnce(
        existingSubject,
      );
      mockPrismaService.branch.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('sub-1', { branchId: 'invalid-branch' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if updated name already exists in branch', async () => {
      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce(existingSubject) // existing check
        .mockResolvedValueOnce({
          id: 'other-sub',
          name: 'Physics',
          branchId: 'branch-1',
        }); // uniqueness collision

      await expect(
        service.update('sub-1', { name: 'Physics' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── remove & delete ──────────────────────────────────────────

  describe('remove', () => {
    const subjectWithBook = {
      id: 'sub-1',
      name: 'Mathematics',
      branchId: 'branch-1',
      bookPdfKey: 'books/sub-1/book.pdf',
    };

    it('should delete subject and its book PDF', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(subjectWithBook);
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockPrismaService.subject.delete.mockResolvedValue(subjectWithBook);

      const result = await service.remove('sub-1');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'books/sub-1/book.pdf',
      );
      expect(mockPrismaService.subject.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
      expect(result.message).toBe("Subject 'Mathematics' deleted successfully");
    });

    it('should throw NotFoundException if subject does not exist', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException on foreign key constraint error (P2003)', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfKey: null,
      });

      const p2003Error = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: '6.0.0' },
      );
      mockPrismaService.subject.delete.mockRejectedValue(p2003Error);

      await expect(service.remove('sub-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delegate delete to remove', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfKey: null,
      });
      mockPrismaService.subject.delete.mockResolvedValue({});

      const result = await service.delete('sub-1');

      expect(result.message).toBe("Subject 'Mathematics' deleted successfully");
    });
  });

  // ── Existing tests ───────────────────────────────────────────

  describe('getByBranch', () => {
    it('should return subjects for a branch', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.subject.findMany.mockResolvedValue(mockSubjects);

      const result = await service.getByBranch('branch-1');

      expect(result).toEqual(
        mockSubjects.map((s) => ({ ...s, hasBook: false })),
      );
    });

    it('should throw NotFoundException if branch not found', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(null);

      await expect(service.getByBranch('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should call subject.findMany with correct params', async () => {
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.subject.findMany.mockResolvedValue([]);

      await service.getByBranch('branch-1');

      expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith({
        where: { branchId: 'branch-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('getByUserBranch', () => {
    it('should return subjects for user branch', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        branchId: 'branch-1',
      });
      mockPrismaService.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrismaService.subject.findMany.mockResolvedValue(mockSubjects);

      const result = await service.getByUserBranch('user-1');

      expect(result).toEqual(
        mockSubjects.map((s) => ({ ...s, hasBook: false })),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getByUserBranch('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user has no branch', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-1',
        branchId: null,
      });

      await expect(service.getByUserBranch('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('uploadBookPdf', () => {
    const mockFile = {
      originalname: 'math.pdf',
      buffer: Buffer.from('fake pdf content'),
      mimetype: 'application/pdf',
      size: 1024,
    } as Express.Multer.File;

    it('should upload a new book and update subject record', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfKey: null,
      });
      mockStorageService.uploadFile.mockResolvedValue('books/sub-1/book.pdf');
      mockPrismaService.subject.update.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfOriginalName: 'math.pdf',
        bookPdfSize: 1024,
      });

      const result = await service.uploadBookPdf('sub-1', mockFile);

      expect(mockStorageService.uploadFile).toHaveBeenCalledWith(
        'books/sub-1/book.pdf',
        mockFile.buffer,
        'application/pdf',
      );
      expect(result.subject.bookPdfOriginalName).toBe('math.pdf');
    });

    it('should delete existing book before uploading new one', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfKey: 'books/sub-1/old.pdf',
      });
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockStorageService.uploadFile.mockResolvedValue('books/sub-1/book.pdf');
      mockPrismaService.subject.update.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        bookPdfOriginalName: 'math.pdf',
        bookPdfSize: 1024,
      });

      await service.uploadBookPdf('sub-1', mockFile);

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'books/sub-1/old.pdf',
      );
      expect(mockStorageService.uploadFile).toHaveBeenCalled();
    });

    it('should throw NotFoundException if subject does not exist', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadBookPdf('nonexistent', mockFile),
      ).rejects.toThrow(NotFoundException);
    });

    it('delegates to KnowledgeService to remove old book and enqueue ingestion', async () => {
      const mockKnowledgeService = {
        removeSubjectBooks: jest.fn().mockResolvedValue({ deleted: 1 }),
        upload: jest.fn().mockResolvedValue({ id: 'job-123' }),
      };

      const customService = new SubjectService(
        mockPrismaService as any,
        mockStorageService as any,
        mockKnowledgeService as any,
      );

      mockPrismaService.subject.findUnique
        .mockResolvedValueOnce({ id: 'sub-1', name: 'Math' })
        .mockResolvedValueOnce({
          id: 'sub-1',
          name: 'Math',
          bookPdfOriginalName: 'math.pdf',
          bookPdfSize: 1024,
        });

      const res = await customService.uploadBookPdf(
        'sub-1',
        mockFile,
        'user-1',
      );

      expect(mockKnowledgeService.removeSubjectBooks).toHaveBeenCalledWith(
        'sub-1',
      );
      expect(mockKnowledgeService.upload).toHaveBeenCalledWith(
        mockFile,
        { kind: 'BOOK', subjectId: 'sub-1' },
        'user-1',
      );
      expect(res.subject.id).toBe('sub-1');
      expect(res.job).toEqual({ id: 'job-123' });
    });
  });

  describe('getBookDownloadUrl', () => {
    it('should return downloadUrl with original name and size', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: 'books/sub-1/book.pdf',
        bookPdfOriginalName: 'math.pdf',
        bookPdfSize: 1024,
      });
      mockStorageService.getPresignedUrl.mockResolvedValue(
        'https://s3.amazonaws.com/books/sub-1/book.pdf?sig=123',
      );

      const result = await service.getBookDownloadUrl('sub-1');

      expect(result.downloadUrl).toContain('https://s3.amazonaws.com');
      expect(result.originalName).toBe('math.pdf');
      expect(result.fileSize).toBe(1024);
    });

    it('should throw NotFoundException if subject has no book uploaded', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: null,
      });

      await expect(service.getBookDownloadUrl('sub-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBookFile', () => {
    it('should return file buffer from storage', async () => {
      const buffer = Buffer.from('pdf data');
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: 'books/sub-1/book.pdf',
        bookPdfOriginalName: 'math.pdf',
        bookPdfSize: 1024,
      });
      mockStorageService.getFileBuffer.mockResolvedValue(buffer);

      const result = await service.getBookFile('sub-1');

      expect(result.buffer).toBe(buffer);
      expect(result.originalName).toBe('math.pdf');
    });
  });

  describe('getBookFileStream', () => {
    it('should return file stream from storage without loading into memory buffer', async () => {
      const mockStream = { pipe: jest.fn() };
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: 'books/sub-1/book.pdf',
        bookPdfOriginalName: 'math.pdf',
        bookPdfSize: 2048,
      });
      mockStorageService.getFileStream.mockResolvedValue({
        stream: mockStream,
        contentLength: 2048,
        contentType: 'application/pdf',
      });

      const result = await service.getBookFileStream('sub-1');

      expect(result.stream).toBe(mockStream);
      expect(result.originalName).toBe('math.pdf');
      expect(result.fileSize).toBe(2048);
      expect(mockStorageService.getFileStream).toHaveBeenCalledWith(
        'books/sub-1/book.pdf',
      );
    });

    it('should throw NotFoundException if subject has no book', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: null,
      });
      mockPrismaService.knowledgeDocument.findFirst.mockResolvedValue(null);

      await expect(service.getBookFileStream('sub-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteBookPdf', () => {
    it('should delete file from storage and clear fields in DB', async () => {
      mockPrismaService.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        bookPdfKey: 'books/sub-1/book.pdf',
      });
      mockStorageService.deleteFile.mockResolvedValue(undefined);
      mockPrismaService.subject.update.mockResolvedValue({});

      const result = await service.deleteBookPdf('sub-1');

      expect(mockStorageService.deleteFile).toHaveBeenCalledWith(
        'books/sub-1/book.pdf',
      );
      expect(mockPrismaService.subject.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          bookPdfKey: null,
          bookPdfOriginalName: null,
          bookPdfSize: null,
        },
      });
      expect(result.message).toBe('Book PDF deleted successfully');
    });
  });
});
