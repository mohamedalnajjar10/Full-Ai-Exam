import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_WITH_BRANCH_SELECT } from '../common';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, subjects: string[]) {
    const trimmedName = name.trim();
    const existing = await this.prisma.branch.findUnique({
      where: { name: trimmedName },
    });
    if (existing) {
      throw new ConflictException('A branch with this name already exists');
    }

    const cleanedSubjects = subjects
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return this.prisma.branch.create({
      data: {
        name: trimmedName,
        subjects: {
          create: cleanedSubjects.map((subjectName) => ({ name: subjectName })),
        },
      },
      include: { subjects: { orderBy: { name: 'asc' } } },
    });
  }

  async getAll() {
    return this.prisma.branch.findMany({
      include: { _count: { select: { subjects: true } } },
    });
  }

  async getOne(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { subjects: { orderBy: { name: 'asc' } } },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async selectBranch(userId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId, branchId: null },
        data: { branchId },
        select: PUBLIC_USER_WITH_BRANCH_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { branchId: true },
        });
        if (!user) throw new NotFoundException('User not found');
        // If user exists and reaches here, branchId was already set
        throw new BadRequestException(
          'Branch already selected. Use the change endpoint instead.',
        );
      }
      throw error;
    }
  }

  async changeBranch(userId: string, branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId, branchId: { not: null }, NOT: { branchId } },
        data: { branchId },
        select: PUBLIC_USER_WITH_BRANCH_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { branchId: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (!user.branchId)
          throw new BadRequestException(
            'No branch selected. Use the select endpoint instead.',
          );
        throw new BadRequestException(
          'You are already assigned to this branch.',
        );
      }
      throw error;
    }
  }
}
