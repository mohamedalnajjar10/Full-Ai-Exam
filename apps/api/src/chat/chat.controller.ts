import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser, Throttle, ThrottleGuard } from '../common';
import type { User } from '@prisma/client';
import { SessionOwnerGuard } from './guards/session-owner.guard';
import { ChatService } from './services/chat.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
// JwtAuthGuard مسجّل عالمياً كـ APP_GUARD بـ common.module.ts —
// تكراره هون كان بيخلّي JwtStrategy.validate تنفّذ مرتين لكل طلب.
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ─────────────────────────────────────────────────────────────────────────
  //  Session Management
  // ─────────────────────────────────────────────────────────────────────────

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a chat session for a subject',
    description:
      'Creates a new conversational chat session scoped to a specific subject. Returns existing active session if one already exists for this student+subject combination.',
  })
  @ApiResponse({
    status: 201,
    description: 'Session created with welcome message',
  })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async createSession(
    @CurrentUser() user: User,
    @Body() dto: CreateSessionDto,
  ) {
    return this.chatService.createSession(user.id, dto.subjectId);
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'List all chat sessions',
    description:
      'Returns all chat sessions for the authenticated student with a preview of the latest message.',
  })
  @ApiResponse({ status: 200, description: 'Sessions listed' })
  async listSessions(@CurrentUser() user: User) {
    return this.chatService.listSessions(user.id);
  }

  @Get('sessions/:id')
  @UseGuards(SessionOwnerGuard)
  @ApiOperation({
    summary: 'Get session with full message history',
    description:
      'Returns the chat session details along with the complete chronological message history.',
  })
  @ApiResponse({ status: 200, description: 'Session with messages returned' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@CurrentUser() user: User, @Param('id') sessionId: string) {
    return this.chatService.getSession(sessionId, user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(SessionOwnerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close/archive a chat session',
    description: 'Marks the chat session as inactive. Messages are preserved.',
  })
  @ApiResponse({ status: 200, description: 'Session closed' })
  async closeSession(@Param('id') sessionId: string) {
    await this.chatService.closeSession(sessionId);
    return { message: 'Session closed successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Message Processing
  // ─────────────────────────────────────────────────────────────────────────

  @Post('sessions/:id/messages')
  @UseGuards(ThrottleGuard, SessionOwnerGuard)
  @Throttle({ limit: 20, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a text message in the chat',
    description: `Sends a natural language message to the AI assistant. The message is classified via NLP into intents:
- **GENERATE_QUESTIONS**: Extracts topic, difficulty, year, count and generates questions
- **FOLLOW_UP**: Modifies the previous generation (harder, easier, more, different topic)
- **GREETING**: Returns a contextual welcome/help message
- **OFF_TOPIC**: Politely refuses and redirects to the subject

Examples:
- "أريد 5 أسئلة صعبة في وحدة التكامل"
- "I want questions similar to the 2020 Calculus exam"
- "أعطني أسئلة أصعب"
- "المزيد من الأسئلة"`,
  })
  @ApiResponse({ status: 201, description: 'AI response generated' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async sendMessage(
    @CurrentUser() user: User,
    @Param('id') sessionId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.processMessage(sessionId, user.id, dto.message);
  }

  @Post('sessions/:id/upload')
  @UseGuards(ThrottleGuard, SessionOwnerGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF or image file (≤ 15 MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a file in the chat',
    description: `Uploads a PDF or image file (exam sheet, question paper) into the chat session. The system:
1. Validates the file type (PDF, PNG, JPG, WebP, GIF)
2. Validates the file content matches the session's subject (Content Guardrail)
3. Extracts the style blueprint (question structure, difficulty, LaTeX density)
4. Generates matching practice questions grounded in the Palestinian curriculum
5. Returns the generated questions as the AI's response

If the file content does not match the session's subject, the AI politely refuses.`,
  })
  @ApiResponse({
    status: 201,
    description: 'File processed and matching questions generated',
  })
  @ApiResponse({ status: 400, description: 'Invalid file type' })
  async uploadFile(
    @CurrentUser() user: User,
    @Param('id') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return {
        role: 'ASSISTANT',
        type: 'ERROR',
        content: 'لم يتم رفع أي ملف. يرجى إرفاق ملف PDF أو صورة.',
      };
    }
    return this.chatService.processFileUpload(sessionId, user.id, file);
  }
}
