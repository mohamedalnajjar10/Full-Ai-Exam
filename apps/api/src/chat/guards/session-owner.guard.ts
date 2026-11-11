import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ensures the authenticated student owns the requested chat session.
 * Extracts `sessionId` from route params (`:sessionId` or `:id`).
 */
@Injectable()
export class SessionOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const sessionId = request.params.sessionId ?? request.params.id;

    if (!sessionId || !user?.id) {
      return false;
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { studentId: true },
    });

    if (!session) {
      throw new NotFoundException('Chat session not found');
    }

    if (session.studentId !== user.id) {
      throw new ForbiddenException(
        'You do not have access to this chat session',
      );
    }

    return true;
  }
}
