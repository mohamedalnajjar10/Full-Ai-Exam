import { fetchWithAuth } from "./apiClient";

/**
 * تحميل كتاب المادة (PDF) عبر الجلسة المحمية وحفظه محلياً على جهاز الطالب.
 *
 * معالجة الأخطاء والتحسينات:
 * 1. التحقق من سلامة استجابة الخادم وحجم الـ blob بحيث لا يكون فارغاً (0 bytes).
 * 2. عدم إبطال رابط الـ blob فوراً (`URL.revokeObjectURL`): إلغاؤه في نفس دورة الحدث
 *    قبل أن ينتهي متصفح Chrome/Chromium من قراءة الـ stream يؤدي لتوليد ملف فارغ بحجم 0 بايت.
 * 3. تأخير تنظيف الرابط لمدة 60 ثانية لضمان اكتمال عملية التنزيل في كافة المتصفحات.
 */
export async function downloadSubjectBook(subjectId: string, subjectName: string): Promise<void> {
  // تمرير disposition=inline و Accept: application/octet-stream لمنع برامج التنزيل الخارجية (مثل IDM)
  // من اعتراض الطلب وإسقاط دفق البيانات بحجم 0 بايت
  const res = await fetchWithAuth(`/subjects/${subjectId}/book/file?disposition=inline`, {
    headers: {
      Accept: "application/octet-stream, application/pdf, */*",
    },
  });
  if (!res.ok) {
    let errorMsg = `تعذّر تحميل كتاب «${subjectName}»`;
    try {
      const json = await res.json();
      if (json?.message) {
        errorMsg = Array.isArray(json.message) ? json.message.join("، ") : json.message;
      }
    } catch {
      // ليس json
    }
    throw new Error(errorMsg);
  }

  const rawBlob = await res.blob();
  if (!rawBlob || rawBlob.size === 0) {
    // خط دفاع ثانٍ: محاولة التنزيل عبر رابط موقّع مباشر في حال تعذّر أو فرغ دفق البيانات المباشر
    try {
      const urlRes = await fetchWithAuth(`/subjects/${subjectId}/book/download?mode=url`);
      if (urlRes.ok) {
        const data = (await urlRes.json().catch(() => null)) as { downloadUrl?: string } | null;
        if (data?.downloadUrl) {
          const directLink = document.createElement("a");
          directLink.href = data.downloadUrl;
          directLink.download = `${subjectName.trim().replace(/[\\/:*?"<>|]/g, "_")}.pdf`;
          directLink.style.display = "none";
          document.body.appendChild(directLink);
          directLink.click();
          setTimeout(() => directLink.remove(), 1000);
          return;
        }
      }
    } catch {
      // ignore fallback error and throw main error below
    }

    throw new Error(`ملف كتاب «${subjectName}» فارغ على الخادم. يرجى مراجعة إدارة المنصة.`);
  }

  // تغليف الـ blob بنوع application/pdf لضمان حفظ الملف كملف PDF سليم
  const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = url;
  const safeFilename = `${subjectName.trim().replace(/[\\/:*?"<>|]/g, "_")}.pdf`;
  link.download = safeFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();

  // تأخير إبطال الـ URL لضمان اكتمال قراءة الـ stream وبدء تنزيل الملف كاملاً
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
      link.remove();
    } catch {
      // ignore cleanup errors
    }
  }, 60_000);
}
