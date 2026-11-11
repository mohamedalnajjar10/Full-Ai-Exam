import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

interface RequestContext {
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * صاحب الطلب الحالي، لطبقات ما بيوصلها request (مثلاً سجل استهلاك الذكاء
 * الاصطناعي بـ GeminiService). مهام الخلفية (BullMQ) ما إلها مستخدم.
 */
export function currentUserId(): string | undefined {
  return storage.getStore()?.userId;
}

/**
 * بيفتح سياق للطلب بعد الحرّاس (فـ request.user جاهز). كل شي async بيبدأ
 * جوّا next.handle() بيرث السياق.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { id?: string } }>();
    return new Observable((subscriber) =>
      storage.run({ userId: user?.id }, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
