/**
 * هل مهام الخلفية مفعّلة؟
 *
 * BullMQ بده Redis حقيقي (الـ MockRedis تبع RedisService بتخدم الكاش
 * وحدود المعدل بس). بدون REDIS_URL كنا نسجّل الطوابير والـ workers على
 * أي حال، فكانوا يحاولوا الاتصال ويطبعوا عشرات أسطر ECONNREFUSED عند كل
 * إقلاع — يعني تشغيل سليم بيبيّن كإنه مكسور.
 *
 * منقرأ process.env مباشرة لأن القرار لازم يتاخد وقت تعريف الموديول،
 * قبل ما ConfigService يكون جاهز.
 */
export const QUEUES_ENABLED = Boolean(process.env.REDIS_URL);

/** رسالة موحّدة لما يطلب أحد مهمة خلفية وما في Redis. */
export const QUEUES_DISABLED_MESSAGE =
  'Background processing is unavailable: set REDIS_URL to enable it.';

/**
 * مين بيشغّل مهام المعالجة الثقيلة (تعرّف ضوئي، تضمين محلي)؟
 *
 * هالمهام بتاكل المعالج لثواني متواصلة، وNode بيخدم كل طلبات HTTP من نفس
 * الخيط — فلو اشتغلت جوّا الـ API، الواجهة بتعلق وبتطلع «socket hang up».
 * لهيك بتشتغل افتراضياً بعملية worker منفصلة (dist/worker.js، و`npm run dev`
 * بيشغّلها لحالها). INGESTION_WORKER=inline بيرجّعها لنفس عملية الـ API
 * (نشر بعملية وحدة، أو تطوير بدون worker).
 */
export const PROCESS_ROLE: 'api' | 'worker' =
  process.env.PROCESS_ROLE === 'worker' ? 'worker' : 'api';

export const RUNS_HEAVY_JOBS =
  QUEUES_ENABLED &&
  (PROCESS_ROLE === 'worker' || process.env.INGESTION_WORKER === 'inline');
