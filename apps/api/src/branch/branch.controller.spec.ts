import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { BranchController } from './branch.controller';
import { BranchService } from './branch.service';
import { Role } from '@prisma/client';
import { PERMISSIONS_KEY, ROLES_KEY } from '../common';

const mockBranchService = {
  getAll: jest.fn(),
  getOne: jest.fn(),
  create: jest.fn(),
  selectBranch: jest.fn(),
  changeBranch: jest.fn(),
};

const mockBranch = {
  id: 'branch-1',
  name: 'علمي',
  subjects: [],
  createdAt: new Date(),
};

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  role: Role.STUDENT,
  branchId: null,
};

describe('BranchController', () => {
  let controller: BranchController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BranchController],
      providers: [{ provide: BranchService, useValue: mockBranchService }],
    }).compile();

    controller = module.get<BranchController>(BranchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAll', () => {
    it('should return all branches', async () => {
      mockBranchService.getAll.mockResolvedValue([mockBranch]);

      const result = await controller.getAll();

      expect(result).toEqual([mockBranch]);
      expect(mockBranchService.getAll).toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('should return a branch by id', async () => {
      mockBranchService.getOne.mockResolvedValue(mockBranch);

      const result = await controller.getOne('branch-1');

      expect(result).toEqual(mockBranch);
      expect(mockBranchService.getOne).toHaveBeenCalledWith('branch-1');
    });
  });

  describe('create', () => {
    it('should create a branch', async () => {
      mockBranchService.create.mockResolvedValue(mockBranch);

      const result = await controller.create({
        name: 'علمي',
        subjects: ['رياضيات'],
      });

      expect(result).toEqual(mockBranch);
      expect(mockBranchService.create).toHaveBeenCalledWith('علمي', [
        'رياضيات',
      ]);
    });
  });

  describe('selectBranch', () => {
    it('should select a branch', async () => {
      mockBranchService.selectBranch.mockResolvedValue({
        id: 'user-1',
        branchId: 'branch-1',
      });

      const result = await controller.selectBranch(mockUser as any, {
        branchId: 'branch-1',
      });

      expect(result).toHaveProperty('branchId', 'branch-1');
      expect(mockBranchService.selectBranch).toHaveBeenCalledWith(
        'user-1',
        'branch-1',
      );
    });
  });

  describe('changeBranch', () => {
    it('should change branch', async () => {
      mockBranchService.changeBranch.mockResolvedValue({
        id: 'user-1',
        branchId: 'branch-2',
      });

      const result = await controller.changeBranch(mockUser as any, {
        branchId: 'branch-2',
      });

      expect(result).toHaveProperty('branchId', 'branch-2');
      expect(mockBranchService.changeBranch).toHaveBeenCalledWith(
        'user-1',
        'branch-2',
      );
    });
  });

  describe('who may set their own branch', () => {
    // A branch is a content filter, not a privilege: it only scopes which
    // subjects the user sees, and the same data is already public via
    // GET /subjects/branch/:branchId. Restricting these two routes to
    // STUDENT dead-ended every admin account, because the frontend has no
    // role awareness and routes everyone through /select-branch.
    const reflector = new Reflector();

    it('does not restrict POST /branches/select by role', () => {
      const roles = reflector.get(
        ROLES_KEY,
        BranchController.prototype.selectBranch,
      );
      expect(roles).toBeUndefined();
    });

    it('does not restrict POST /branches/change by role', () => {
      const roles = reflector.get(
        ROLES_KEY,
        BranchController.prototype.changeBranch,
      );
      expect(roles).toBeUndefined();
    });

    it('still restricts branch creation to staff who manage academics', () => {
      const required = reflector.get(
        PERMISSIONS_KEY,
        BranchController.prototype.create,
      );
      expect(required).toEqual({
        mode: 'all',
        permissions: ['academics.manage'],
      });
    });
  });
});
