import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContactUsDto } from './dto/contact-us.dto';

export interface ContactResponse {
  success: boolean;
  ticketId: string;
  message: string;
}

export interface SupportTicketRecord {
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  userId?: string | null;
  createdAt: string;
  resolvedAt?: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  generateTicketId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TIC-${timestamp}-${random}`;
  }

  async submitContact(
    dto: ContactUsDto,
    userId?: string,
  ): Promise<ContactResponse> {
    const ticketId = this.generateTicketId();

    this.logger.log(
      `Support contact submitted: ticketId=${ticketId}, from="${dto.name}" <${dto.email}>, userId=${userId ?? 'guest'}`,
    );

    // حفظ التذكرة في AppSetting لضمان أرشفة سجلات الدعم للزوار والطلاب في لوحة الإدارة
    try {
      await this.prisma.appSetting.create({
        data: {
          key: `support_ticket:${ticketId}`,
          value: {
            ticketId,
            name: dto.name,
            email: dto.email,
            phone: dto.phone ?? null,
            message: dto.message,
            status: 'OPEN',
            userId: userId ?? null,
            createdAt: new Date().toISOString(),
          },
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to persist ticket record in AppSetting ${ticketId}: ${err?.message}`,
      );
    }

    // إذا كان المستخدم مسجل دخول، نقوم بتسجيل الحدث في سجل نشاطاته
    if (userId) {
      try {
        await this.prisma.studentActivityEvent.create({
          data: {
            studentId: userId,
            eventType: 'SUPPORT_TICKET_CREATED',
            title: `تذكرة دعم فني #${ticketId}`,
            metadata: {
              ticketId,
              name: dto.name,
              email: dto.email,
              phone: dto.phone,
              messageSnippet: dto.message.slice(0, 100),
            },
          },
        });
      } catch (err: any) {
        this.logger.warn(
          `Failed to persist activity event for support ticket ${ticketId}: ${err?.message}`,
        );
      }
    }

    // إرسال البريد الإلكتروني لفريق الدعم وتأكيد الاستلام للمرسل
    try {
      await this.mailService.sendContactSupportEmail({
        ticketId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to send support email for ticket ${ticketId}: ${err?.message}`,
      );
    }

    return {
      success: true,
      ticketId,
      message: 'تم إرسال رسالتك بنجاح وسيقوم فريق الدعم بالتواصل معك قريباً.',
    };
  }

  async getAdminTickets(status?: string): Promise<SupportTicketRecord[]> {
    const settings = await this.prisma.appSetting.findMany({
      where: {
        key: {
          startsWith: 'support_ticket:',
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const tickets: SupportTicketRecord[] = [];
    for (const item of settings) {
      if (item.value && typeof item.value === 'object') {
        const t = item.value as unknown as SupportTicketRecord;
        if (!status || t.status === status) {
          tickets.push(t);
        }
      }
    }

    return tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateTicketStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
    adminId?: string,
  ): Promise<SupportTicketRecord> {
    const key = `support_ticket:${ticketId}`;
    const setting = await this.prisma.appSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`التذكرة #${ticketId} غير موجودة`);
    }

    const current = setting.value as unknown as SupportTicketRecord;
    const updated: SupportTicketRecord = {
      ...current,
      status,
      resolvedAt:
        status === 'RESOLVED' || status === 'CLOSED'
          ? new Date().toISOString()
          : current.resolvedAt,
    };

    await this.prisma.appSetting.update({
      where: { key },
      data: {
        value: updated as any,
        updatedBy: adminId,
      },
    });

    return updated;
  }
}
