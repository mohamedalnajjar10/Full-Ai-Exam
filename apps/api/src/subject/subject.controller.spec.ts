import { Test, TestingModule } from '@nestjs/testing';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { ThrottleGuard } from '../common';
import { Role } from '@prisma/client';

const mockSubjectService = {
  getByBranch: jest.fn(),
  getByUserBranch: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getBookFile: jest.fn(),
  getBookDownloadUrl: jest.fn(),
  uploadBookPdf: jest.fn(),
  deleteBookPdf: jest.fn(),
};

const mockSubjects = [
  { id: 'sub-1', name: 'Mathematics', branchId: 'branch-1' },
  { id: 'sub-2', name: 'Physics', branchId: 'branch-1' },
];

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: Role.STUDENT,
  branchId: 'branch-1',
};

describe('SubjectController', () => {
  let controller: SubjectController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubjectController],
      providers: [{ provide: SubjectService, useValue: mockSubjectService }],
    })
      .overrideGuard(ThrottleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SubjectController>(SubjectController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMySubjects', () => {
    it('should return subjects for user branch', async () => {
      mockSubjectService.getByUserBranch.mockResolvedValue(mockSubjects);

      const result = await controller.getMySubjects(mockUser as any);

      expect(result).toEqual(mockSubjects);
      expect(mockSubjectService.getByUserBranch).toHaveBeenCalledWith('user-1');
    });
  });

  describe('findAll', () => {
    it('should return all subjects with query', async () => {
      mockSubjectService.findAll.mockResolvedValue(mockSubjects);

      const query = { branchId: 'branch-1', search: 'Math' };
      const result = await controller.findAll(query);

      expect(result).toEqual(mockSubjects);
      expect(mockSubjectService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('getByBranch', () => {
    it('should return subjects for a branch', async () => {
      mockSubjectService.getByBranch.mockResolvedValue(mockSubjects);

      const result = await controller.getByBranch('branch-1');

      expect(result).toEqual(mockSubjects);
      expect(mockSubjectService.getByBranch).toHaveBeenCalledWith('branch-1');
    });
  });

  describe('findOne', () => {
    it('should return a single subject by id', async () => {
      mockSubjectService.findOne.mockResolvedValue(mockSubjects[0]);

      const result = await controller.findOne('sub-1');

      expect(result).toEqual(mockSubjects[0]);
      expect(mockSubjectService.findOne).toHaveBeenCalledWith('sub-1');
    });
  });

  describe('create', () => {
    it('should create a subject', async () => {
      const dto = { name: 'Mathematics', branchId: 'branch-1' };
      mockSubjectService.create.mockResolvedValue(mockSubjects[0]);

      const result = await controller.create(dto);

      expect(result).toEqual(mockSubjects[0]);
      expect(mockSubjectService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update a subject', async () => {
      const dto = { name: 'Math Updated' };
      const updated = { ...mockSubjects[0], name: 'Math Updated' };
      mockSubjectService.update.mockResolvedValue(updated);

      const result = await controller.update('sub-1', dto);

      expect(result).toEqual(updated);
      expect(mockSubjectService.update).toHaveBeenCalledWith('sub-1', dto);
    });
  });

  describe('remove', () => {
    it('should remove a subject', async () => {
      const response = { message: 'Subject deleted successfully' };
      mockSubjectService.remove.mockResolvedValue(response);

      const result = await controller.remove('sub-1');

      expect(result).toEqual(response);
      expect(mockSubjectService.remove).toHaveBeenCalledWith('sub-1');
    });
  });

  describe('downloadBook & streamBookFile', () => {
    const mockFile = {
      buffer: Buffer.from('%PDF-1.4 test'),
      originalName: 'كتاب التاريخ.pdf',
      fileSize: 14,
    };

    function createMockRes() {
      const headers: Record<string, string> = {};
      return {
        headers,
        setHeader: jest.fn((k: string, v: string) => {
          headers[k] = v;
        }),
        end: jest.fn(),
        json: jest.fn(),
      } as any;
    }

    it('should set application/octet-stream when client accepts octet-stream', async () => {
      mockSubjectService.getBookFile.mockResolvedValue(mockFile);
      const req = {
        headers: { accept: 'application/octet-stream, application/pdf, */*' },
      } as any;
      const res = createMockRes();

      await controller.streamBookFile('sub-1', 'inline', req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/octet-stream',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('inline; filename='),
      );
      expect(res.end).toHaveBeenCalledWith(mockFile.buffer);
    });

    it('should set application/pdf when client does not accept octet-stream', async () => {
      mockSubjectService.getBookFile.mockResolvedValue(mockFile);
      const req = {
        headers: { accept: 'text/html,application/xhtml+xml,application/xml' },
      } as any;
      const res = createMockRes();

      await controller.downloadBook('sub-1', undefined, 'inline', req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(res.end).toHaveBeenCalledWith(mockFile.buffer);
    });

    it('should return presigned URL when mode=url', async () => {
      mockSubjectService.getBookDownloadUrl.mockResolvedValue({
        downloadUrl: 'https://minio/signed-url',
      });
      const req = { headers: {} } as any;
      const res = createMockRes();

      await controller.downloadBook('sub-1', 'url', undefined, req, res);

      expect(res.json).toHaveBeenCalledWith({
        downloadUrl: 'https://minio/signed-url',
      });
    });

    it('should stream book file via pipe without buffering into memory when getBookFileStream is available', async () => {
      const mockStream = {
        pipe: jest.fn().mockImplementation((dest) => dest),
        on: jest.fn(),
      };
      (mockSubjectService as any).getBookFileStream = jest
        .fn()
        .mockResolvedValue({
          stream: mockStream,
          originalName: 'كتاب الرياضيات.pdf',
          fileSize: 4096,
        });

      const req = { headers: {} } as any;
      const res = createMockRes();

      await controller.streamBookFile('sub-1', 'inline', req, res);

      expect(mockStream.pipe).toHaveBeenCalledWith(res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '4096');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );

      delete (mockSubjectService as any).getBookFileStream;
    });
  });
});
