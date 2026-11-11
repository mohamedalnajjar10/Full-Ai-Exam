import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SentMessage {
  to: string;
  subject: string;
  html: string;
}

// Mock mailer for tests: captures messages instead of sending
class MockMailer {
  private sent: SentMessage[] = [];

  async sendMail(message: SentMessage): Promise<void> {
    // Kept bounded: in development this mailer lives for the whole process
    this.sent = [...this.sent.slice(-49), message];
    // Codes are in the subject and links are pulled out, so local testing
    // needs only this one line
    const link = /href="([^"]+)"/
      .exec(message.html)?.[1]
      ?.replace(/&amp;/g, '&');
    console.log(
      `[mock-mail] to=${message.to} subject="${message.subject}"${link ? ` link=${link}` : ''}`,
    );
  }

  getSentMessages(): SentMessage[] {
    return this.sent;
  }
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private useMock = false;
  private mockMailer = new MockMailer();
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const smtpHost = this.configService.get<string>('EMAIL_HOST');
    const smtpUser = this.configService.get<string>('EMAIL_USER') ?? '';
    const smtpPass = this.configService.get<string>('EMAIL_PASSWORD') ?? '';
    const smtpPort = Number(
      this.configService.get<string>('EMAIL_PORT') ?? 587,
    );

    if (nodeEnv === 'test') {
      this.useMock = true;
      this.logger.log('Using mock mailer (test environment)');
      return;
    }

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.useMock = true;
      if (nodeEnv === 'production') {
        this.logger.error(
          'EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD are not configured. ' +
            'Emails will NOT be delivered in production!',
        );
      } else {
        this.logger.warn(
          'SMTP not fully configured - emails will be logged to console only',
        );
      }
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    this.logger.log(
      `SMTP transport ready (${smtpHost}:${smtpPort}) - emails will be delivered`,
    );
  }

  async sendVerificationEmail(to: string, code: string): Promise<void> {
    await this.send({
      to,
      subject: `رمز تفعيل حسابك: ${code} — مسار التميز`,
      html: layout({
        title: 'فعّل حسابك',
        intro:
          'أهلاً بك في مسار التميز! أدخل هذا الرمز في صفحة التفعيل لإكمال إنشاء حسابك.',
        code,
        note: 'الرمز صالح لمدة 15 دقيقة. إذا لم تنشئ حساباً لدينا، تجاهل هذه الرسالة.',
      }),
    });
  }

  async sendLoginCodeEmail(to: string, code: string): Promise<void> {
    await this.send({
      to,
      subject: `رمز الدخول: ${code} — مسار التميز`,
      html: layout({
        title: 'رمز تسجيل الدخول',
        intro:
          'طلبت الدخول إلى حسابك برمز لمرة واحدة. أدخل هذا الرمز في صفحة الدخول:',
        code,
        note: 'الرمز صالح لمدة 10 دقائق ويُستخدم مرة واحدة. إذا لم تطلبه، تجاهل هذه الرسالة — لا يمكن لأحد الدخول بدون الرمز.',
      }),
    });
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    await this.send({
      to,
      subject: 'إعادة تعيين كلمة المرور — مسار التميز',
      html: layout({
        title: 'إعادة تعيين كلمة المرور',
        intro:
          'وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط الزر لاختيار كلمة مرور جديدة:',
        action: { label: 'تعيين كلمة مرور جديدة', href: resetLink },
        note: 'الرابط صالح لمدة 15 دقيقة. إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.',
      }),
    });
  }

  /**
   * Tells the account owner a security setting changed. If it wasn't them,
   * this email is how they find out.
   */
  async sendSecurityNotice(
    to: string,
    title: string,
    message: string,
  ): Promise<void> {
    await this.send({
      to,
      subject: `${title} — مسار التميز`,
      html: layout({
        title,
        intro: message,
        note: 'إذا لم تقم بهذا التغيير، أعد تعيين كلمة المرور فوراً وتواصل مع الدعم.',
      }),
    });
  }

  async sendContactSupportEmail(opts: {
    ticketId: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
  }): Promise<void> {
    const supportEmail =
      this.configService.get<string>('SUPPORT_EMAIL') ??
      'support@masar-altamayoz.edu';

    // إرسال إشعار لفريق الدعم
    await this.send({
      to: supportEmail,
      subject: `[تذكرة دعم #${opts.ticketId}] رسالة جديدة من ${opts.name}`,
      html: layout({
        title: `تذكرة دعم فني جديدة #${opts.ticketId}`,
        intro: `وردت رسالة تواصل جديدة عبر الموقع من: ${opts.name} (${opts.email})${opts.phone ? ` — هاتف: ${opts.phone}` : ''}`,
        note: opts.message,
      }),
    });

    // إرسال تأكيد استلام للمستخدم
    await this.send({
      to: opts.email,
      subject: `تم استلام تذكرتك #${opts.ticketId} — منصة مسار التميز`,
      html: layout({
        title: 'شكراً لتواصلك معنا',
        intro: `مرحباً ${opts.name}، استلمنا رسالتك بنجاح وسيقوم فريق الدعم بالتواصل معك قريباً. رقم تذكرتك للمتابعة:`,
        code: opts.ticketId,
        note: 'يمكنك الرد على هذه الرسالة في حال رغبتك في إرفاق أي معلومات إضافية.',
      }),
    });
  }

  getSentMessages(): SentMessage[] {
    return this.mockMailer.getSentMessages();
  }

  /**
   * Sends an email. Delivery failures are logged but never thrown so that
   * authentication flows (e.g. forgot-password) keep working even when the
   * SMTP provider is temporarily unavailable.
   */
  private async send(message: SentMessage): Promise<void> {
    if (this.useMock || !this.transporter) {
      await this.mockMailer.sendMail(message);
      return;
    }
    const from =
      this.configService.get<string>('MAIL_FROM') ??
      this.configService.get<string>('EMAIL_USER') ??
      'noreply@aiexam.app';
    try {
      await this.transporter.sendMail({ ...message, from });
      this.logger.log(`Email sent to ${message.to} (${message.subject})`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${message.to} (${message.subject}): ${
          error?.message ?? error
        }`,
      );
    }
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/**
 * One RTL, brand-coloured layout for every email. Inline styles only —
 * most mail clients strip <style> blocks.
 */
function layout(opts: {
  title: string;
  intro: string;
  code?: string;
  action?: { label: string; href: string };
  note: string;
}): string {
  const code = opts.code
    ? `<p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:10px;color:#002c5a;text-align:center;direction:ltr;font-family:Consolas,Menlo,monospace">${escapeHtml(opts.code)}</p>`
    : '';
  const action = opts.action
    ? `<p style="margin:28px 0;text-align:center"><a href="${escapeHtml(opts.action.href)}" style="display:inline-block;background:#002c5a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600">${escapeHtml(opts.action.label)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="ar" dir="rtl"><body style="margin:0;background:#f6f8fb;font-family:Tahoma,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e9f0;border-radius:16px;overflow:hidden">
        <tr><td style="background:#002c5a;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;text-align:right">مسار التميز</td></tr>
        <tr><td style="padding:28px;text-align:right;color:#0e1b2c;font-size:15px;line-height:1.9">
          <h1 style="margin:0 0 12px;font-size:20px;color:#002c5a">${escapeHtml(opts.title)}</h1>
          <p style="margin:0">${escapeHtml(opts.intro)}</p>
          ${code}${action}
          <p style="margin:0;color:#5b6b80;font-size:13px">${escapeHtml(opts.note)}</p>
        </td></tr>
      </table>
      <p style="color:#8593a6;font-size:12px;margin-top:16px">منصة مسار التميز للتحضير لامتحان التوجيهي</p>
    </td></tr>
  </table>
</body></html>`;
}
