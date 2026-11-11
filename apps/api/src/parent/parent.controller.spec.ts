import { ParentController } from './parent.controller';
import { ParentLinkingService } from './services/parent-linking.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Role } from '@prisma/client';

describe('ParentController', () => {
  let controller: ParentController;
  let mockParentLinkingService: any;

  beforeEach(() => {
    mockParentLinkingService = {
      createLink: jest.fn(),
    };

    const mockRealtimeService = {
      createParentStudentStream: jest.fn(),
      emitStudentEvent: jest.fn(),
    };

    controller = new ParentController(
      mockParentLinkingService,
      mockRealtimeService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createLink', () => {
    it('delegates to ParentLinkingService.createLink with student id and dto', async () => {
      const student = {
        id: 'student-123',
        name: 'طالب متميز',
        email: 'student@masar.local',
        role: Role.STUDENT,
      } as AuthenticatedUser;

      const dto = {
        parentName: 'ولي الأمر',
        parentPhone: '+970591234567',
      };

      const expectedResponse = {
        linkId: 'link-1',
        parentId: 'parent-1',
        parentName: 'ولي الأمر',
        parentPhone: '+970591234567',
        pin: '123456',
        magicToken: 'magic-token-hex',
        magicLoginLink:
          'https://masar.local/parent/magic-login?token=magic-token-hex',
        whatsappLink: 'https://wa.me/970591234567?text=...',
        qrData: 'magic-token-hex',
        qrDataUrl:
          'https://masar.local/parent/magic-login?token=magic-token-hex',
        expiresAt: new Date(),
      };

      mockParentLinkingService.createLink.mockResolvedValue(expectedResponse);

      const result = await controller.createLink(student, dto);

      expect(result).toEqual(expectedResponse);
      expect(mockParentLinkingService.createLink).toHaveBeenCalledWith(
        student.id,
        dto,
      );
    });
  });

  describe('getLinkedChildren', () => {
    it('delegates to ParentLinkingService.getLinkedChildren with parent id', async () => {
      const parent = {
        id: 'parent-123',
        name: 'ولي أمر',
        email: 'parent@masar.local',
        role: Role.PARENT,
      } as AuthenticatedUser;

      const mockResponse = {
        children: [
          {
            studentId: 'student-1',
            name: 'أحمد',
            email: 'ahmed@test.com',
            avatar: null,
            branchName: 'علمي',
            stats: {
              completedAssessments: 3,
              averageScore: 90,
              totalActivities: 5,
              lastActiveAt: new Date(),
              lastActivityTitle: 'إكمال اختبار فيزياء',
            },
          },
        ],
      };

      mockParentLinkingService.getLinkedChildren = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await controller.getLinkedChildren(parent);

      expect(result).toEqual(mockResponse);
      expect(mockParentLinkingService.getLinkedChildren).toHaveBeenCalledWith(
        'parent-123',
      );
    });
  });

  describe('getChildTimeline', () => {
    it('delegates to ParentLinkingService.getChildTimeline with parsed pagination', async () => {
      const parent = {
        id: 'parent-123',
        name: 'ولي أمر',
        email: 'parent@masar.local',
        role: Role.PARENT,
      } as AuthenticatedUser;

      const mockResult = {
        student: {
          id: 'student-123',
          name: 'أحمد',
          email: 'ahmed@test.com',
          avatar: null,
        },
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
      };

      mockParentLinkingService.getChildTimeline = jest
        .fn()
        .mockResolvedValue(mockResult);

      const result = await controller.getChildTimeline(
        parent,
        'student-123',
        '2',
        '10',
        'ASSESSMENT_COMPLETED',
      );

      expect(result).toEqual(mockResult);
      expect(mockParentLinkingService.getChildTimeline).toHaveBeenCalledWith(
        'parent-123',
        'student-123',
        { page: 2, limit: 10, eventType: 'ASSESSMENT_COMPLETED' },
      );
    });
  });
});
