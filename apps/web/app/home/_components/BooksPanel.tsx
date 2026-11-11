"use client";
import { useEffect, useState } from "react";
import { BookOpen, Download, Library, Loader2, ShieldCheck, X } from "lucide-react";
import type { Subject as ApiSubject } from "@ai-exam/types";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import { useToast } from "@/components/ui/ToastProvider";
import { useBranchSubjects, type BranchSubject } from "@/lib/subjects";
import { downloadSubjectBook } from "@/lib/books";
import { BOOKS, countAr } from "@/lib/plural";

/**
 * لوحة الكتب والمراجع الرسمية في صفحة الطالب الرئيسية (/home).
 *
 * تتضمن التحسينات التالية:
 * 1. الحصول على موافقة الطالب الصريحة (Consent) قبل بدء التحميل عبر نافذة تأكيد تفاعلية.
 * 2. منع التحميل العشوائي أو المباشر دون معرفة حجم الملف أو المادة.
 * 3. منع استلام ملفات فارغة بفضل فحص سلامة البيانات وتأخير إبطال الـ URL.
 */
export default function BooksPanel({ initialSubjects }: { initialSubjects: ApiSubject[] | null }) {
  const { subjects, isLoading, branchTitle } = useBranchSubjects(initialSubjects);
  const { showToast } = useToast();
  const [confirmSubject, setConfirmSubject] = useState<BranchSubject | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleConfirmDownload(subject: BranchSubject) {
    setBusy(subject.id);
    try {
      await downloadSubjectBook(subject.id, subject.name);
      showToast({
        type: "success",
        message: `بدأ تحميل كتاب «${subject.name}» بصيغة PDF بنجاح.`,
      });
      setConfirmSubject(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذّر تحميل الكتاب، يرجى المحاولة مرة أخرى.";
      showToast({ type: "error", message });
    } finally {
      setBusy(null);
    }
  }

  const available = subjects.filter((s) => s.hasBook).length;

  return (
    <>
      <Card id="books" className="scroll-mt-24">
        <CardHeader
          icon={<Library size={19} strokeWidth={1.75} />}
          title="الكتب والمراجع"
          description={
            isLoading
              ? undefined
              : available
                ? `${countAr(available, BOOKS)} للتحميل بصيغة PDF`
                : "ستظهر كتب مواد فرعك هنا فور رفعها"
          }
        />
        {isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-canvas" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.map((s) => (
              <li
                key={s.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all ${
                  s.hasBook
                    ? "border-line bg-white shadow-xs hover:border-teal-300 hover:shadow-card"
                    : "border-dashed border-navy-100 bg-canvas/60 opacity-80"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <SubjectGlyph name={s.name} size="sm" tone={s.hasBook ? "teal" : "navy"} />
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-ink">كتاب {s.name}</h4>
                    <p className="text-[11px] font-medium text-muted">
                      {s.hasBook ? (
                        <span className="text-teal-700">متاح بصيغة PDF</span>
                      ) : (
                        <span className="text-subtle">قيد الإعداد والرفع</span>
                      )}
                    </p>
                  </div>
                </div>

                {s.hasBook ? (
                  <button
                    type="button"
                    onClick={() => setConfirmSubject(s)}
                    disabled={busy === s.id}
                    aria-label={`طلب تحميل كتاب ${s.name}`}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-teal-50 px-3.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60"
                  >
                    {busy === s.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    <span>تحميل الكتاب</span>
                  </button>
                ) : (
                  <span className="shrink-0 rounded-lg bg-navy-50/70 px-2.5 py-1 text-[11px] font-medium text-muted">
                    قريباً
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* نافذة موافقة وتأكيد التحميل الصريحة للطالب */}
      {confirmSubject && (
        <DownloadConsentModal
          subject={confirmSubject}
          branchTitle={branchTitle}
          isDownloading={busy === confirmSubject.id}
          onClose={() => !busy && setConfirmSubject(null)}
          onConfirm={() => void handleConfirmDownload(confirmSubject)}
        />
      )}
    </>
  );
}

function DownloadConsentModal({
  subject,
  branchTitle,
  isDownloading,
  onClose,
  onConfirm,
}: {
  subject: BranchSubject;
  branchTitle?: string;
  isDownloading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  // إغلاق بمفتاح Escape إذا لم تكن عملية التحميل جارية
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDownloading, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px] animate-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-consent-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md animate-toast-in rounded-3xl border border-line bg-white p-6 shadow-float sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isDownloading}
          aria-label="إغلاق النافذة"
          className="absolute top-5 start-5 flex h-8 w-8 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-canvas hover:text-navy-900 disabled:opacity-40"
        >
          <X size={18} />
        </button>

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-800 shadow-xs ring-8 ring-teal-50/50">
          <BookOpen size={26} strokeWidth={2} />
        </div>

        <h3 id="download-consent-title" className="text-lg font-bold text-navy-900">
          تأكيد تحميل الكتاب المدرسي
        </h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          يرجى تأكيد موافقتك على بدء تحميل المستند الإلكتروني المعتمد للمادة الدراسية وحفظه على جهازك.
        </p>

        <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-line bg-canvas/60 p-3.5">
          <SubjectGlyph name={subject.name} size="md" tone="teal" />
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-navy-900">كتاب {subject.name}</h4>
            <p className="mt-0.5 truncate text-xs text-muted">
              {branchTitle || "المنهاج الرسمي المعتمد"} · بصيغة PDF
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
            جاهز للحفظ
          </span>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/40 p-3.5 text-xs leading-5 text-teal-900">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" />
          <div>
            <span className="mb-0.5 block font-semibold">إشعار الاستخدام التعليمي:</span>
            هذا الكتاب مخصص لغاياتك الدراسية كطالب في هذا المسار. سيتم نقل ملف الـ PDF عبر جلسة آمنة وتخزينه في مجلد التنزيلات على جهازك.
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isDownloading}
            className="flex-1"
          >
            إلغاء
          </Button>
          <Button
            variant="accent"
            onClick={onConfirm}
            disabled={isDownloading}
            loading={isDownloading}
            className="flex-1"
          >
            <Download size={16} />
            موافق، بدء التحميل
          </Button>
        </div>
      </div>
    </div>
  );
}
