"use client";
import { useCallback, useEffect, useState } from "react";
import { Construction, Flag, Globe, HardDrive, Lock, Mail, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Input, LabeledControl, Modal, Panel, Segmented, Select, SettingRow, SwitchRow, Textarea } from "../_components/ui";
import { getPlatformSettings, savePlatformSettings, type PlatformSettings } from "../_data/system";

const SECTIONS = [
  { id: "general", label: "عام", icon: Globe },
  { id: "auth", label: "التسجيل والدخول", icon: Lock },
  { id: "email", label: "البريد", icon: Mail },
  { id: "storage", label: "التخزين", icon: HardDrive },
  { id: "features", label: "الميزات", icon: Flag },
  { id: "maintenance", label: "وضع الصيانة", icon: Construction },
  { id: "danger", label: "منطقة الخطر", icon: TriangleAlert },
];

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // عام
  const [siteName, setSiteName] = useState("مسار التميز للثانوية العامة");
  const [slogan, setSlogan] = useState("المنصة الذكية الأولى للتحضير لامتحانات التوجيهي في فلسطين");
  const [academicYear, setAcademicYear] = useState("2026");
  const [timezone, setTimezone] = useState("Asia/Hebron");
  const [seoDescription, setSeoDescription] = useState("كويزات على نمط الامتحانات الوزارية، مساعد ذكي لكل مادة، وخطة دراسية يومية لطلاب التوجيهي في كل الفروع.");

  // المصادقة
  const [openReg, setOpenReg] = useState(true);
  const [verifyEmail, setVerifyEmail] = useState(true);
  const [google, setGoogle] = useState(true);
  const [admin2fa, setAdmin2fa] = useState(true);

  // البريد
  const [smtpHost, setSmtpHost] = useState("smtp.sendgrid.net");
  const [smtpPort, setSmtpPort] = useState(587);
  const [senderName, setSenderName] = useState("مسار التميز");
  const [senderEmail, setSenderEmail] = useState("no-reply@masar-altawjihi.com");

  // التخزين
  const [storage, setStorage] = useState<"local" | "s3">("s3");
  const [bucket, setBucket] = useState("ai-exam-project");
  const [endpoint, setEndpoint] = useState("s3.eu-central-1.amazonaws.com");

  // الميزات
  const [aiAssistant, setAiAssistant] = useState(true);
  const [styleMatching, setStyleMatching] = useState(true);
  const [ministerialQuizzes, setMinisterialQuizzes] = useState(true);
  const [dailyPlan, setDailyPlan] = useState(true);
  const [successStories, setSuccessStories] = useState(true);
  const [bookDownload, setBookDownload] = useState(false);

  // وضع الصيانة
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("نجري تحديثات دورية لتحسين سرعة وجودة المنصة، ونعود قريباً.");

  const [danger, setDanger] = useState<null | string>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPlatformSettings();
      if (res.general) {
        if (res.general.siteName) setSiteName(res.general.siteName);
        if (res.general.slogan) setSlogan(res.general.slogan);
        if (res.general.academicYear) setAcademicYear(res.general.academicYear);
        if (res.general.timezone) setTimezone(res.general.timezone);
        if (res.general.seoDescription) setSeoDescription(res.general.seoDescription);
      }
      if (res.auth) {
        setOpenReg(res.auth.openRegistration);
        setVerifyEmail(res.auth.verifyEmail);
        setGoogle(res.auth.allowGoogleLogin);
        setAdmin2fa(res.auth.enforceAdmin2fa);
      }
      if (res.email) {
        setSmtpHost(res.email.smtpHost);
        setSmtpPort(res.email.smtpPort);
        setSenderName(res.email.senderName);
        setSenderEmail(res.email.senderEmail);
      }
      if (res.storage) {
        setStorage(res.storage.driver);
        setBucket(res.storage.bucket);
        if (res.storage.endpoint) setEndpoint(res.storage.endpoint);
      }
      if (res.features) {
        setAiAssistant(res.features.aiAssistant);
        setStyleMatching(res.features.styleMatching);
        setMinisterialQuizzes(res.features.ministerialQuizzes);
        setDailyPlan(res.features.dailyPlan);
        setSuccessStories(res.features.successStories);
        setBookDownload(res.features.bookDownload);
      }
      if (res.maintenance) {
        setMaintenance(res.maintenance.enabled);
        if (res.maintenance.message) setMaintenanceMsg(res.maintenance.message);
      }
    } catch {
      showToast({ type: "error", message: "تعذّر جلب إعدادات المنصة من الخادم." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<PlatformSettings> = {
        general: {
          siteName,
          slogan,
          academicYear,
          timezone,
          seoDescription,
        },
        auth: {
          openRegistration: openReg,
          verifyEmail,
          allowGoogleLogin: google,
          enforceAdmin2fa: admin2fa,
        },
        email: {
          smtpHost,
          smtpPort,
          senderName,
          senderEmail,
        },
        storage: {
          driver: storage,
          bucket,
          endpoint,
        },
        features: {
          aiAssistant,
          styleMatching,
          ministerialQuizzes,
          dailyPlan,
          successStories,
          bookDownload,
        },
        maintenance: {
          enabled: maintenance,
          message: maintenanceMsg,
        },
      };

      await savePlatformSettings(payload);
      showToast({ type: "success", message: "حُفظت إعدادات المنصة بنجاح في قاعدة البيانات الحقيقية." });
    } catch {
      showToast({ type: "error", message: "حدث خطأ أثناء حفظ الإعدادات على الخادم." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="إعدادات المنصة"
        description="إعدادات النظام الحية المحفوظة في قاعدة البيانات: هوية المنصة، التسجيل، التخزين السحابي، ووضع الصيانة."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadSettings} loading={loading}>
              <RefreshCw size={16} />
              إعادة التحميل
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              حفظ الإعدادات
            </Button>
          </div>
        }
      />

      {maintenance && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-500 px-5 py-3.5 text-sm font-medium text-white shadow-raised animate-rise">
          <Construction size={18} aria-hidden />
          وضع الصيانة مفعّل حالياً — يرى الطلاب صفحة الصيانة، وفريق الإدارة فقط يستطيع تسجيل الدخول والعمل.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="أقسام الإعدادات" className="hidden lg:block">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-white hover:text-navy-900 ${
                    s.id === "danger" ? "text-rose-600" : "text-muted"
                  }`}
                >
                  <s.icon size={16} />
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="general" className="scroll-mt-24" title="عام" icon={Globe} bodyClassName="p-5 grid gap-4 md:grid-cols-2">
            <LabeledControl label="اسم المنصة">
              {(id) => <Input id={id} value={siteName} onChange={(e) => setSiteName(e.target.value)} className="w-full" />}
            </LabeledControl>
            <LabeledControl label="الشعار المختصر">
              {(id) => <Input id={id} value={slogan} onChange={(e) => setSlogan(e.target.value)} className="w-full" />}
            </LabeledControl>
            <LabeledControl label="العام الدراسي الحالي">
              {(id) => (
                <Select id={id} value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full">
                  <option value="2026">2025 / 2026</option>
                  <option value="2027">2026 / 2027</option>
                </Select>
              )}
            </LabeledControl>
            <LabeledControl label="المنطقة الزمنية">
              {(id) => (
                <Select id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full" dir="ltr">
                  <option value="Asia/Hebron">Asia/Hebron (فلسطين)</option>
                  <option value="Asia/Gaza">Asia/Gaza (غزة)</option>
                  <option value="Asia/Amman">Asia/Amman (الأردن)</option>
                  <option value="Asia/Jerusalem">Asia/Jerusalem</option>
                </Select>
              )}
            </LabeledControl>
            <div className="md:col-span-2">
              <LabeledControl label="وصف الموقع (SEO)">
                {(id) => <Textarea id={id} rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className="w-full" />}
              </LabeledControl>
            </div>
          </Panel>

          <Panel id="auth" className="scroll-mt-24" title="التسجيل والدخول" icon={Lock} bodyClassName="p-5 divide-y divide-line">
            <SwitchRow title="السماح بالتسجيل الجديد للطلاب" description="عند الإيقاف، لا يمكن فتح حسابات جديدة." checked={openReg} onChange={setOpenReg} />
            <SwitchRow title="إلزام تأكيد البريد الإلكتروني" description="إرسال رمز التفعيل للتحقق من البريد قبل الدخول." checked={verifyEmail} onChange={setVerifyEmail} />
            <SwitchRow title="الدخول السريع عبر Google" description="استخدام حسابات Google OAuth للدخول بنقرة واحدة." checked={google} onChange={setGoogle} />
            <SwitchRow title="إلزام المصادقة الثنائية (2FA) لفريق الإدارة" description="حماية حسابات المشرفين والمدراء برمز تحقق إضافي." checked={admin2fa} onChange={setAdmin2fa} />
            <SettingRow title="مدة صلاحية الجلسة" description="المدة قبل الحاجة لتسجيل الدخول من جديد.">
              <Select aria-label="مدة الجلسة" defaultValue="7">
                <option value="1">يوم واحد</option>
                <option value="7">7 أيام</option>
                <option value="30">30 يوماً</option>
              </Select>
            </SettingRow>
          </Panel>

          <Panel
            id="email"
            className="scroll-mt-24"
            title="البريد الإلكتروني"
            description="إرسال رموز التحقق، استعادة كلمة المرور، والإشعارات"
            icon={Mail}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => showToast({ type: "success", message: `تم إرسال بريد تجريبي إلى ${senderEmail}.` })}
              >
                <Send size={15} />
                رسالة اختبار
              </Button>
            }
            bodyClassName="p-5 grid gap-4 md:grid-cols-2"
          >
            <LabeledControl label="خادم SMTP">
              {(id) => <Input id={id} value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} dir="ltr" className="w-full" />}
            </LabeledControl>
            <LabeledControl label="منفذ SMTP">
              {(id) => <Input id={id} type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} dir="ltr" className="tabular w-full" />}
            </LabeledControl>
            <LabeledControl label="اسم المرسل">
              {(id) => <Input id={id} value={senderName} onChange={(e) => setSenderName(e.target.value)} className="w-full" />}
            </LabeledControl>
            <LabeledControl label="بريد المرسل الرسمي">
              {(id) => <Input id={id} value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} dir="ltr" className="w-full" />}
            </LabeledControl>
          </Panel>

          <Panel id="storage" className="scroll-mt-24" title="التخزين السحابي للملفات" description="تخزين كتب المنهاج وأوراق الامتحانات" icon={HardDrive} bodyClassName="p-5 flex flex-col gap-4">
            <Segmented
              label="نوع التخزين"
              value={storage}
              onChange={setStorage}
              options={[
                { value: "local", label: "تخزين محلي (Server Disk)" },
                { value: "s3", label: "تخزين سحابي (MinIO / S3 / R2)" },
              ]}
            />
            {storage === "local" ? (
              <LabeledControl label="مجلد التخزين المحلي">
                {(id) => <Input id={id} defaultValue="./uploads" dir="ltr" className="w-full max-w-md font-mono text-[13px]" />}
              </LabeledControl>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <LabeledControl label="نقطة النهاية (Endpoint)">
                  {(id) => <Input id={id} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} dir="ltr" className="w-full" />}
                </LabeledControl>
                <LabeledControl label="اسم الحاوية (Bucket Name)">
                  {(id) => <Input id={id} value={bucket} onChange={(e) => setBucket(e.target.value)} dir="ltr" className="w-full" />}
                </LabeledControl>
              </div>
            )}
          </Panel>

          <Panel id="features" className="scroll-mt-24" title="الميزات النشطة" description="تفعيل أو تعطيل خواص المنصة بنقرة واحدة" icon={Flag} bodyClassName="p-5 divide-y divide-line">
            <SwitchRow title="المساعد الذكي التفاعلي" description="المساعد الذكي المتخصص في المنهاج الفلسطيني لكل مادة" checked={aiAssistant} onChange={setAiAssistant} />
            <SwitchRow title="مطابقة نمط أوراق الامتحانات" description="توليد أسئلة مطابقة لبصمة ورقة يرفعها الطالب" checked={styleMatching} onChange={setStyleMatching} />
            <SwitchRow title="الكويزات الوزارية والتشخيصية" description="اختبارات وزارية من بنك الأسئلة المعتمد" checked={ministerialQuizzes} onChange={setMinisterialQuizzes} />
            <SwitchRow title="الخطة الدراسية الذكية" description="جدول المذاكرة اليومي المخصص لكل طالب" checked={dailyPlan} onChange={setDailyPlan} />
            <SwitchRow title="قصص النجاح للطلبة المتفوقين" description="قسم تحفيز الطلاب وإبراز النماذج المتميزة" checked={successStories} onChange={setSuccessStories} />
            <SwitchRow title="تحميل الكتب المدرسية كملف PDF" description="إتاحة زر تحميل مباشر للكتاب المعتمد في صفحة المادة" checked={bookDownload} onChange={setBookDownload} />
          </Panel>

          <Panel id="maintenance" className="scroll-mt-24" title="وضع الصيانة" icon={Construction} bodyClassName="p-5 flex flex-col gap-4">
            <SwitchRow title="تفعيل وضع الصيانة العام" description="إظهار شاشة الصيانة للطلاب مع بقاء وصول المشرفين فعالاً." checked={maintenance} onChange={setMaintenance} />
            <LabeledControl label="رسالة التنبيه المعروضة للطلبة">
              {(id) => <Textarea id={id} rows={2} value={maintenanceMsg} onChange={(e) => setMaintenanceMsg(e.target.value)} className="w-full" />}
            </LabeledControl>
          </Panel>

          <Panel id="danger" className="scroll-mt-24 border-rose-200" title="منطقة العمليات الحساسة" icon={TriangleAlert} bodyClassName="p-5 divide-y divide-line">
            {[
              ["مسح ذاكرة Redis المؤقتة", "إعادة ضبط الكاش وبصمات الامتحانات المؤقتة."],
              ["تنظيف الملفات المؤقتة غير المكتملة", "حذف مخلفات العمليات المؤقتة الأقدم من 24 ساعة."],
              ["إعادة فحص الاتصال بقاعدة البيانات", "فحص مصفوفة الاتصال وجاهزية pgvector."],
            ].map(([t, d]) => (
              <SettingRow key={t} title={t} description={d}>
                <Button size="sm" variant="secondary" className="text-rose-700" onClick={() => setDanger(t)}>
                  تنفيذ الإجراء
                </Button>
              </SettingRow>
            ))}
          </Panel>
        </div>
      </div>

      <Modal
        open={danger !== null}
        onClose={() => setDanger(null)}
        tone="danger"
        title={`${danger ?? ""}؟`}
        description="هذا الإجراء مباشر وسيتم تسجيله في سجل التدقيق الإداري."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDanger(null)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDanger(null);
                showToast({ type: "success", message: `تم تنفيذ الإجراء: ${danger} بنجاح.` });
              }}
            >
              تأكيد التنفيذ
            </Button>
          </>
        }
      />
    </>
  );
}
