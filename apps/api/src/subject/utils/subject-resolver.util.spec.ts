import {
  normalizeSubjectName,
  getEquivalentSubjectIds,
  clearSubjectResolverCache,
} from './subject-resolver.util';

describe('subject-resolver.util', () => {
  describe('normalizeSubjectName', () => {
    it('strips leading "ال"', () => {
      expect(normalizeSubjectName('الكيمياء')).toBe('كيميا');
      expect(normalizeSubjectName('كيمياء')).toBe('كيميا');
      expect(normalizeSubjectName('الرياضيات')).toBe('رياضيات');
      expect(normalizeSubjectName('رياضيات')).toBe('رياضيات');
    });

    it('normalizes hamzas and taa marbouta', () => {
      expect(normalizeSubjectName('أحياء')).toBe('احيا');
      expect(normalizeSubjectName('الفيزياء')).toBe('فيزيا');
      expect(normalizeSubjectName('فيزياء')).toBe('فيزيا');
    });
  });

  describe('getEquivalentSubjectIds', () => {
    const mockPrisma = {
      subject: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    beforeEach(() => {
      clearSubjectResolverCache();
      jest.clearAllMocks();
    });

    it('returns both IDs when peer subjects match normalized name', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'كيمياء',
        branchId: 'branch-1',
      });
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'كيمياء' },
        { id: 'sub-2', name: 'الكيمياء' },
        { id: 'sub-3', name: 'الفيزياء' },
      ]);

      const ids = await getEquivalentSubjectIds(mockPrisma, 'sub-1');
      expect(ids).toEqual(['sub-1', 'sub-2']);
      expect(mockPrisma.subject.findUnique).toHaveBeenCalledTimes(1);
    });

    it('uses in-memory cache on subsequent calls without querying DB again', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'كيمياء',
        branchId: 'branch-1',
      });
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'كيمياء' },
        { id: 'sub-2', name: 'الكيمياء' },
      ]);

      const firstCall = await getEquivalentSubjectIds(mockPrisma, 'sub-1');
      const secondCall = await getEquivalentSubjectIds(mockPrisma, 'sub-1');
      const peerCall = await getEquivalentSubjectIds(mockPrisma, 'sub-2');

      expect(firstCall).toEqual(['sub-1', 'sub-2']);
      expect(secondCall).toEqual(['sub-1', 'sub-2']);
      expect(peerCall).toEqual(['sub-1', 'sub-2']);
      // findUnique and findMany should have only been called once!
      expect(mockPrisma.subject.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.subject.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns [subjectId] when no peers match', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-3',
        name: 'الفيزياء',
        branchId: 'branch-1',
      });
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'كيمياء' },
        { id: 'sub-3', name: 'الفيزياء' },
      ]);

      const ids = await getEquivalentSubjectIds(mockPrisma, 'sub-3');
      expect(ids).toEqual(['sub-3']);
    });

    it('maps أحياء and العلوم الحياتية in scientific branch', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-bio-1',
        name: 'أحياء',
        branchId: 'branch-sci',
      });
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-bio-1', name: 'أحياء' },
        { id: 'sub-bio-2', name: 'العلوم الحياتية' },
      ]);

      const ids = await getEquivalentSubjectIds(mockPrisma, 'sub-bio-1');
      expect(ids).toEqual(['sub-bio-1', 'sub-bio-2']);
    });
  });
});
