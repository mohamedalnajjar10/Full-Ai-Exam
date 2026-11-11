import { Test, TestingModule } from '@nestjs/testing';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { Response } from 'express';

describe('TeachersController', () => {
  let controller: TeachersController;
  let service: TeachersService;

  const mockTeacher = {
    id: 'teacher-1',
    name: 'أ. أمل محمود',
    title: 'معلمة رياضيات',
    bio: 'خبرة 12 عاما',
    imageUrl: 'https://storage.example.com/teachers/amal.jpg',
    imageKey: 'teachers/amal.jpg',
    subjectId: 'sub-1',
    yearsOfExperience: 12,
    isActive: true,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTeachersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    uploadPhoto: jest.fn(),
    getPhotoBuffer: jest.fn(),
    reorder: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachersController],
      providers: [
        {
          provide: TeachersService,
          useValue: mockTeachersService,
        },
      ],
    }).compile();

    controller = module.get<TeachersController>(TeachersController);
    service = module.get<TeachersService>(TeachersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated teachers from service', async () => {
      const mockResult = {
        data: [mockTeacher],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockTeachersService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({
        page: 1,
        limit: 10,
        sortBy: 'displayOrder',
        sortOrder: 'asc',
      });
      expect(result).toBe(mockResult);
      expect(mockTeachersService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a teacher by id', async () => {
      mockTeachersService.findOne.mockResolvedValue(mockTeacher);

      const result = await controller.findOne('teacher-1');
      expect(result).toBe(mockTeacher);
      expect(mockTeachersService.findOne).toHaveBeenCalledWith('teacher-1');
    });
  });

  describe('create', () => {
    it('should call service create with dto and file', async () => {
      const dto = {
        name: 'أ. أمل محمود',
        title: 'معلمة رياضيات',
        bio: 'خبرة 12 عاما',
      };
      mockTeachersService.create.mockResolvedValue(mockTeacher);

      const result = await controller.create(dto);
      expect(result).toBe(mockTeacher);
      expect(mockTeachersService.create).toHaveBeenCalledWith(dto, undefined);
    });
  });

  describe('update', () => {
    it('should call service update with id, dto, and file', async () => {
      const dto = { title: 'معلمة رياضيات قديرة' };
      mockTeachersService.update.mockResolvedValue({ ...mockTeacher, ...dto });

      const result = await controller.update('teacher-1', dto);
      expect(result.title).toBe(dto.title);
      expect(mockTeachersService.update).toHaveBeenCalledWith(
        'teacher-1',
        dto,
        undefined,
      );
    });
  });

  describe('uploadPhoto', () => {
    it('should call service uploadPhoto with file', async () => {
      const file = { originalname: 'avatar.jpg' } as Express.Multer.File;
      mockTeachersService.uploadPhoto.mockResolvedValue(mockTeacher);

      const result = await controller.uploadPhoto('teacher-1', file);
      expect(result).toBe(mockTeacher);
      expect(mockTeachersService.uploadPhoto).toHaveBeenCalledWith(
        'teacher-1',
        file,
      );
    });
  });

  describe('getPhoto', () => {
    it('should stream image buffer with headers', async () => {
      mockTeachersService.getPhotoBuffer.mockResolvedValue({
        buffer: Buffer.from('image'),
        mimeType: 'image/jpeg',
      });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn().mockImplementation((data) => data),
      } as unknown as Response;

      await controller.getPhoto('teacher-1', res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('image'));
    });
  });

  describe('reorder', () => {
    it('should call service reorder', async () => {
      const dto = {
        orders: [{ id: 'teacher-1', displayOrder: 1 }],
      };
      mockTeachersService.reorder.mockResolvedValue({
        message: 'Teachers reordered successfully',
      });

      const result = await controller.reorder(dto);
      expect(result.message).toContain('reordered');
      expect(mockTeachersService.reorder).toHaveBeenCalledWith(dto);
    });
  });

  describe('remove', () => {
    it('should call service remove', async () => {
      mockTeachersService.remove.mockResolvedValue({
        message: 'Teacher deleted successfully',
      });

      const result = await controller.remove('teacher-1');
      expect(result.message).toContain('deleted');
      expect(mockTeachersService.remove).toHaveBeenCalledWith('teacher-1');
    });
  });
});
