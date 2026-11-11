import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateTeacherDto, UpdateTeacherDto, TeacherQueryDto } from './dto';

describe('TeachersService', () => {
  let service: TeachersService;
  let prisma: any;
  let storage: any;

  const mockTeacher = {
    id: 'teacher-cuid-1',
    name: 'أ. أمل محمود',
    title: 'معلمة رياضيات',
    bio: 'خبرة أكثر من 12 عاماً في تدريس المناهج وتجهيز الطلاب للامتحانات الوزارية.',
    imageUrl: 'https://storage.example.com/teachers/amal.jpg',
    imageKey: 'teachers/amal.jpg',
    subjectId: 'subject-1',
    yearsOfExperience: 12,
    isActive: true,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    subject: { id: 'subject-1', name: 'رياضيات' },
  };

  const mockPrismaService = {
    teacher: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    subject: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 'sub-1', name: 'Math' }]),
    },

    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  const mockStorageService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    getFileBuffer: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const configMap: Record<string, string> = {
        AWS_S3_ENDPOINT: 'http://localhost:9000',
        AWS_S3_BUCKET_NAME: 'ai-exam-bank-storage',
        AWS_REGION: 'us-east-1',
      };
      return configMap[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
    prisma = module.get<PrismaService>(PrismaService);
    storage = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a teacher with valid data', async () => {
      const dto: CreateTeacherDto = {
        name: 'أ. أمل محمود',
        title: 'معلمة رياضيات',
        bio: 'خبرة أكثر من 12 عاماً...',
        subjectId: 'subject-1',
        yearsOfExperience: 12,
        displayOrder: 1,
      };

      prisma.subject.findUnique.mockResolvedValue({ id: 'subject-1' });
      prisma.teacher.create.mockResolvedValue({ ...mockTeacher, ...dto });

      const result = await service.create(dto);

      expect(prisma.subject.findUnique).toHaveBeenCalledWith({
        where: { id: 'subject-1' },
      });
      expect(prisma.teacher.create).toHaveBeenCalled();
      expect(result.name).toBe(dto.name);
    });

    it('should throw NotFoundException if subjectId does not exist', async () => {
      const dto: CreateTeacherDto = {
        name: 'أ. أمل محمود',
        title: 'معلمة رياضيات',
        bio: 'خبرة أكثر من 12 عاماً...',
        subjectId: 'non-existent',
      };

      prisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should upload a photo when file is provided', async () => {
      const dto: CreateTeacherDto = {
        name: 'أ. أحمد إبراهيم',
        title: 'معلم فيزياء',
        bio: 'متخصص في تبسيط قوانين الحركة...',
      };

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'photo.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        size: 1024,
      } as Express.Multer.File;

      prisma.teacher.aggregate.mockResolvedValue({ _max: { displayOrder: 2 } });
      storage.uploadFile.mockResolvedValue('teachers/key.png');
      prisma.teacher.create.mockResolvedValue({
        ...mockTeacher,
        name: dto.name,
        displayOrder: 3,
      });

      const result = await service.create(dto, mockFile);

      expect(storage.uploadFile).toHaveBeenCalled();
      expect(prisma.teacher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            imageKey: expect.stringContaining('teachers/'),
            imageUrl: expect.stringContaining('http://localhost:9000'),
            displayOrder: 3,
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if storage upload fails', async () => {
      const dto: CreateTeacherDto = {
        name: 'أ. أحمد إبراهيم',
        title: 'معلم فيزياء',
        bio: 'متخصص في تبسيط قوانين الحركة...',
      };

      const mockFile = {
        originalname: 'photo.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      } as Express.Multer.File;

      storage.uploadFile.mockRejectedValue(new Error('S3 error'));

      await expect(service.create(dto, mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject non-image file uploads with BadRequestException', async () => {
      const dto: CreateTeacherDto = {
        name: 'أ. أحمد إبراهيم',
        title: 'معلم فيزياء',
        bio: 'معلم فيزياء متخصص في تبسيط القوانين',
      };

      const dangerousFile = {
        originalname: 'script.php',
        mimetype: 'application/x-php',
        buffer: Buffer.from('<?php echo "evil"; ?>'),
      } as Express.Multer.File;

      await expect(service.create(dto, dangerousFile)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated list of teachers', async () => {
      const query: TeacherQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      };

      prisma.teacher.count.mockResolvedValue(1);
      prisma.teacher.findMany.mockResolvedValue([mockTeacher]);

      const result = await service.findAll(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by search keyword', async () => {
      const query: TeacherQueryDto = {
        search: 'رياضيات',
        page: 1,
        limit: 10,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      };

      prisma.teacher.count.mockResolvedValue(1);
      prisma.teacher.findMany.mockResolvedValue([mockTeacher]);

      await service.findAll(query);

      expect(prisma.teacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'رياضيات', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return teacher if found', async () => {
      prisma.teacher.findUnique.mockResolvedValue(mockTeacher);

      const result = await service.findOne('teacher-cuid-1');
      expect(result.id).toBe('teacher-cuid-1');
    });

    it('should throw NotFoundException if teacher does not exist', async () => {
      prisma.teacher.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update teacher fields', async () => {
      const dto: UpdateTeacherDto = {
        title: 'معلمة رياضيات أولى',
        yearsOfExperience: 14,
      };

      prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
      prisma.teacher.update.mockResolvedValue({ ...mockTeacher, ...dto });

      const result = await service.update('teacher-cuid-1', dto);

      expect(result.title).toBe(dto.title);
      expect(prisma.teacher.update).toHaveBeenCalled();
    });

    it('should replace photo and delete old imageKey when new file is provided', async () => {
      prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
      storage.deleteFile.mockResolvedValue(undefined);
      storage.uploadFile.mockResolvedValue('teachers/new-photo.jpg');
      prisma.teacher.update.mockResolvedValue({
        ...mockTeacher,
        imageKey: 'teachers/new-photo.jpg',
      });

      const newFile = {
        originalname: 'new.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      await service.update('teacher-cuid-1', {}, newFile);

      expect(storage.deleteFile).toHaveBeenCalledWith(mockTeacher.imageKey);
      expect(storage.uploadFile).toHaveBeenCalled();
      expect(prisma.teacher.update).toHaveBeenCalled();
    });
  });

  describe('getPhotoBuffer', () => {
    it('should return file buffer and mime type', async () => {
      prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
      storage.getFileBuffer.mockResolvedValue(Buffer.from('binary photo'));

      const result = await service.getPhotoBuffer('teacher-cuid-1');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should throw NotFoundException if teacher has no photo stored', async () => {
      prisma.teacher.findUnique.mockResolvedValue({
        ...mockTeacher,
        imageKey: null,
      });

      await expect(service.getPhotoBuffer('teacher-cuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reorder', () => {
    it('should reorder teachers within transaction', async () => {
      prisma.teacher.update.mockResolvedValue(mockTeacher);

      const result = await service.reorder({
        orders: [
          { id: 'teacher-1', displayOrder: 2 },
          { id: 'teacher-2', displayOrder: 1 },
        ],
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.message).toContain('reordered');
    });
  });

  describe('remove', () => {
    it('should delete teacher and prune photo from storage', async () => {
      prisma.teacher.findUnique.mockResolvedValue(mockTeacher);
      storage.deleteFile.mockResolvedValue(undefined);
      prisma.teacher.delete.mockResolvedValue(mockTeacher);

      const result = await service.remove('teacher-cuid-1');

      expect(storage.deleteFile).toHaveBeenCalledWith(mockTeacher.imageKey);
      expect(prisma.teacher.delete).toHaveBeenCalledWith({
        where: { id: 'teacher-cuid-1' },
      });
      expect(result.message).toContain('deleted successfully');
    });
  });

  describe('resolveSubjectId', () => {
    const subjects = [
      { id: 'sub-arabic', name: 'اللغة العربية' },
      { id: 'sub-math', name: 'الرياضيات' },
      { id: 'sub-physics', name: 'الفيزياء' },
    ];

    beforeEach(() => {
      prisma.subject.findMany.mockResolvedValue(subjects);
    });

    it('matches a teacher to their subject by keyword', async () => {
      await expect(service.resolveSubjectId('معلم رياضيات')).resolves.toBe(
        'sub-math',
      );
    });

    it('returns null rather than attaching an arbitrary subject', async () => {
      // this used to return subjects[0], silently linking the teacher to
      // whatever happened to be first in the table
      await expect(
        service.resolveSubjectId('مدرب مهارات حياتية'),
      ).resolves.toBeNull();
    });

    it('only selects the columns it needs', async () => {
      await service.resolveSubjectId('معلم فيزياء');

      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        select: { id: true, name: true },
      });
    });

    it('returns null when there are no subjects at all', async () => {
      prisma.subject.findMany.mockResolvedValue([]);
      await expect(
        service.resolveSubjectId('معلم رياضيات'),
      ).resolves.toBeNull();
    });
  });
});
