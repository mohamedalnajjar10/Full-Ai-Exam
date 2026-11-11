"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Code, Panel, SearchInput, Select, Table, Td, Th } from "../_components/ui";
import { getAuditLogs, type SystemAuditEntry } from "../_data/system";

const AREA: Record<string, string> = {
  ai: "الذكاء الاصطناعي",
  content: "المحتوى",
  retrieval: "التقطيع والتضمين",
  staging: "المراجعة",
  user: "المستخدمون",
  role: "الصلاحيات",
  auth: "الدخول",
  quiz: "الامتحانات",
  system: "النظام",
};

export default function AuditPage() {
  const { showToast } = useToast();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [area, setArea] = useState("all");
  const [range, setRange] = useState("7");
  const [logs, setLogs] = useState<SystemAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState("الآن");

  // تأخير زمني 300ms لمنع إغراق الخادم بطلبات البحث أثناء الكتابة
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const loadLogs = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await getAuditLogs({ q: debouncedQ, area, range });
        setLogs(res);
        setLastRefreshed(new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } catch {
        if (!isBackground) {
          showToast({ type: "error", message: "تعذّر جلب سجلات التدقيق من الخادم." });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedQ, area, range, showToast],
  );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // تحديث دوري حي عند البقاء في الصفحة
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadLogs(true);
      }
    }, 15000);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadLogs(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadLogs]);

  const handleExportCsv = () => {
    if (logs.length === 0) {
      showToast({ type: "error", message: "لا توجد سجلات لتصديرها." });
      return;
    }
    const headers = ["المعرف", "الوقت", "الفاعل", "الدور", "الإجراء", "الهدف", "التفاصيل", "IP"];
    const csvRows = logs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.actor}"`,
      `"${l.role}"`,
      `"${l.action}"`,
      `"${(l.target || "").replace(/"/g, '""')}"`,
      `"${(l.detail || "").replace(/"/g, '""')}"`,
      `"${l.ip}"`,
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast({ type: "success", message: "تم تصدير سجل التدقيق كملف CSV بنجاح." });
  };

  return (
    <>
      <AdminPageHeader
        title="سجل التدقيق"
        description="كل تغيير يجريه فريق الإدارة أو الطلاب أو النظام مسجّل تلقائياً مع الفاعل والوقت والتفاصيل الحقيقية."
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`inline-block h-2 w-2 rounded-full ${refreshing ? "bg-amber-400 animate-pulse" : "bg-teal-500"}`} />
              {refreshing ? "جارٍ التحديث..." : `محدّث: ${lastRefreshed}`}
            </span>
            <Button variant="secondary" onClick={() => loadLogs(true)} loading={loading || refreshing}>
              <RefreshCw size={16} />
              تحديث
            </Button>
            <Button variant="secondary" onClick={handleExportCsv}>
              <Download size={16} />
              تصدير
            </Button>
          </div>
        }
      />
      <Panel bodyClassName="">
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchInput
            placeholder="بحث بالفاعل، الهدف، أو التفاصيل…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-56 flex-1"
            aria-label="بحث"
          />
          <Select aria-label="المجال" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">كل المجالات</option>
            {Object.entries(AREA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select aria-label="الفترة" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1">اليوم</option>
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يوماً</option>
          </Select>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>الوقت</Th>
              <Th>الفاعل</Th>
              <Th>الإجراء</Th>
              <Th>الهدف</Th>
              <Th>التفاصيل</Th>
              <Th>IP</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((a) => (
              <tr key={a.id} className="hover:bg-canvas/50">
                <Td className="tabular whitespace-nowrap text-[13px] text-muted">
                  {new Date(a.timestamp).toLocaleString("ar-EG", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    {a.actor === "النظام" || a.actor === "مدير النظام" ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">⚙</span>
                    ) : (
                      <Avatar name={a.actor} size={28} />
                    )}
                    <span className="whitespace-nowrap text-[13px]">{a.actor}</span>
                  </div>
                </Td>
                <Td>
                  <Code>{a.action}</Code>
                  <p className="mt-1 text-[11px] text-muted">{AREA[a.action.split(".")[0]] || AREA[a.action.split("_")[0]] || "إجراء عام"}</p>
                </Td>
                <Td className="text-[13px]">
                  <span dir="auto">{a.target}</span>
                </Td>
                <Td className="max-w-md text-[13px] text-muted">
                  <span dir="auto">{a.detail}</span>
                </Td>
                <Td className="font-mono text-[12px] text-subtle">
                  <span dir="ltr">{a.ip}</span>
                </Td>
              </tr>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-sm text-muted">
                  لا توجد سجلات تدقيق مطابقة لبحثك في هذه الفترة.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
