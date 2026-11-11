"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  LifeBuoy,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { fetchWithAuth, readJson } from "@/lib/apiClient";
import {
  AdminPageHeader,
  Modal,
  Panel,
  SearchInput,
  StatusPill,
  Table,
  Td,
  Th,
} from "../_components/ui";

export interface SupportTicket {
  ticketId: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  userId?: string | null;
  createdAt: string;
  resolvedAt?: string;
}

const STATUS_MAP: Record<
  SupportTicket["status"],
  { label: string; tone: "error" | "warn" | "ok" | "idle" }
> = {
  OPEN: { label: "جديدة", tone: "error" },
  IN_PROGRESS: { label: "قيد المتابعة", tone: "warn" },
  RESOLVED: { label: "تم الحل", tone: "ok" },
  CLOSED: { label: "مغلقة", tone: "idle" },
};

export default function AdminSupportPage() {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  async function loadTickets() {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth("/support/admin/tickets");
      if (res.ok) {
        const data = await readJson<SupportTicket[]>(res);
        if (Array.isArray(data)) {
          setTickets(data);
        }
      } else {
        showToast({ message: "تعذر جلب تذاكر الدعم الفني", type: "error" });
      }
    } catch {
      showToast({ message: "خطأ في الاتصال بالخادم", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function handleStatusChange(ticketId: string, nextStatus: SupportTicket["status"]) {
    setIsUpdating(true);
    try {
      const res = await fetchWithAuth(`/support/admin/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        const updated = await readJson<SupportTicket>(res);
        if (updated) {
          setTickets((prev) =>
            prev.map((t) => (t.ticketId === ticketId ? { ...t, status: nextStatus } : t)),
          );
          if (activeTicket?.ticketId === ticketId) {
            setActiveTicket((prev) => (prev ? { ...prev, status: nextStatus } : null));
          }
          showToast({
            message: `تم تحديث حالة التذكرة إلى: ${STATUS_MAP[nextStatus].label}`,
            type: "success",
          });
        }
      } else {
        showToast({ message: "تعذر تحديث حالة التذكرة", type: "error" });
      }
    } catch {
      showToast({ message: "خطأ أثناء تحديث حالة التذكرة", type: "error" });
    } finally {
      setIsUpdating(false);
    }
  }

  const counts = useMemo(() => {
    return {
      all: tickets.length,
      open: tickets.filter((t) => t.status === "OPEN").length,
      inProgress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      resolved: tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchStatus =
        statusFilter === "ALL"
          ? true
          : statusFilter === "RESOLVED"
            ? t.status === "RESOLVED" || t.status === "CLOSED"
            : t.status === statusFilter;

      const q = search.trim().toLowerCase();
      const matchQuery =
        !q ||
        t.ticketId.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q);

      return matchStatus && matchQuery;
    });
  }, [tickets, statusFilter, search]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="خدمة العملاء والدعم"
        title="تذاكر واستفسارات المستخدمين"
        description="متابعة تذاكر الدعم والشكاوى المقدمة من الطلاب والزوار، وتحديث حالتها أو الرد عليها."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={loadTickets}
            loading={isLoading}
            className="gap-2"
          >
            <RefreshCw size={15} />
            تحديث القائمة
          </Button>
        }
      />

      {/* بطاقات الإحصاءات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-muted">
            <span className="text-sm font-medium">إجمالي التذاكر</span>
            <LifeBuoy size={18} className="text-navy-700" />
          </div>
          <p className="mt-2 text-2xl font-bold text-navy-900">{counts.all}</p>
        </div>

        <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-sm font-medium">تذاكر جديدة بانتظار الرد</span>
            <Clock size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-800">{counts.open}</p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-sm font-medium">قيد المتابعة</span>
            <MessageSquare size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-800">{counts.inProgress}</p>
        </div>

        <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between text-teal-700">
            <span className="text-sm font-medium">تم الحل وإغلاقها</span>
            <CheckCircle2 size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-teal-800">{counts.resolved}</p>
        </div>
      </div>

      {/* الفلاتر والبحث */}
      <Panel className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-navy-50/60 p-1">
            {[
              { id: "ALL", label: `الكل (${counts.all})` },
              { id: "OPEN", label: `جديدة (${counts.open})` },
              { id: "IN_PROGRESS", label: `قيد المتابعة (${counts.inProgress})` },
              { id: "RESOLVED", label: `تم الحل (${counts.resolved})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === tab.id
                    ? "bg-white text-navy-900 shadow-xs"
                    : "text-muted hover:text-navy-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-72">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم التذكرة أو الاسم أو البريد..."
            />
          </div>
        </div>
      </Panel>

      {/* جدول التذاكر */}
      <Panel>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-500">
              <LifeBuoy size={24} />
            </div>
            <p className="mt-3 text-sm font-medium text-navy-900">لا توجد تذاكر تطابق هذا الفلتر</p>
            <p className="mt-1 text-xs text-muted">
              {search ? "جرّب تغيير كلمات البحث" : "لم يتم استلام رسائل دعم جديدة حتى الآن"}
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>رقم التذكرة</Th>
                <Th>صاحب الرسالة</Th>
                <Th>نوع الحساب</Th>
                <Th>مقتطف الرسالة</Th>
                <Th>الحالة</Th>
                <Th>تاريخ الإرسال</Th>
                <Th>الإجراء</Th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => {
                const s = STATUS_MAP[ticket.status] || STATUS_MAP.OPEN;
                return (
                  <tr key={ticket.ticketId} className="hover:bg-navy-50/30">
                    <Td className="font-mono text-xs font-bold text-navy-900">
                      {ticket.ticketId}
                    </Td>
                    <Td>
                      <div className="font-semibold text-navy-900">{ticket.name}</div>
                      <div className="text-xs text-muted" dir="ltr">
                        {ticket.email}
                      </div>
                      {ticket.phone && (
                        <div className="text-[11px] text-teal-700" dir="ltr">
                          {ticket.phone}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {ticket.userId ? (
                        <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                          <User size={12} />
                          طالب مسجل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          زائر
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-xs truncate text-xs text-ink/80">
                      <span title={ticket.message}>{ticket.message}</span>
                    </Td>
                    <Td>
                      <StatusPill tone={s.tone}>{s.label}</StatusPill>
                    </Td>
                    <Td className="text-xs text-muted">
                      {new Date(ticket.createdAt).toLocaleDateString("ar-EG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Td>
                    <Td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTicket(ticket)}
                        className="text-xs"
                      >
                        عرض التفاصيل
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      {/* نافذة تفاصيل التذكرة Modal */}
      {activeTicket && (
        <Modal
          open={Boolean(activeTicket)}
          title={`تذكرة الدعم #${activeTicket.ticketId}`}
          onClose={() => setActiveTicket(null)}
        >
          <div className="space-y-5 text-sm">
            {/* بطاقة معلومات المرسل */}
            <div className="rounded-xl border border-line bg-navy-50/40 p-4">
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-muted">الاسم:</span>
                  <div className="font-semibold text-navy-900">{activeTicket.name}</div>
                </div>
                <div>
                  <span className="text-muted">البريد الإلكتروني:</span>
                  <div className="font-semibold text-navy-900" dir="ltr">
                    {activeTicket.email}
                  </div>
                </div>
                {activeTicket.phone && (
                  <div>
                    <span className="text-muted">رقم الهاتف:</span>
                    <div className="font-semibold text-teal-800" dir="ltr">
                      {activeTicket.phone}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-muted">تاريخ الإنشاء:</span>
                  <div className="text-navy-900">
                    {new Date(activeTicket.createdAt).toLocaleString("ar-EG")}
                  </div>
                </div>
              </div>
            </div>

            {/* نص الرسالة الكامل */}
            <div>
              <span className="text-xs font-semibold text-muted">نص رسالة المستخدم:</span>
              <div className="mt-1.5 whitespace-pre-wrap rounded-xl border border-line bg-white p-4 text-sm leading-relaxed text-ink shadow-xs">
                {activeTicket.message}
              </div>
            </div>

            {/* الحالة وتغييرها */}
            <div className="rounded-xl border border-line bg-white p-4">
              <span className="text-xs font-semibold text-muted">تحديث حالة التذكرة:</span>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={activeTicket.status === "IN_PROGRESS" ? "primary" : "secondary"}
                  loading={isUpdating}
                  onClick={() => handleStatusChange(activeTicket.ticketId, "IN_PROGRESS")}
                >
                  قيد المتابعة
                </Button>
                <Button
                  size="sm"
                  variant={activeTicket.status === "RESOLVED" ? "primary" : "secondary"}
                  loading={isUpdating}
                  onClick={() => handleStatusChange(activeTicket.ticketId, "RESOLVED")}
                >
                  <CheckCircle2 size={14} />
                  تحديد كـ تم الحل
                </Button>
                <Button
                  size="sm"
                  variant={activeTicket.status === "CLOSED" ? "primary" : "secondary"}
                  loading={isUpdating}
                  onClick={() => handleStatusChange(activeTicket.ticketId, "CLOSED")}
                >
                  إغلاق التذكرة
                </Button>
                {activeTicket.status !== "OPEN" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={isUpdating}
                    onClick={() => handleStatusChange(activeTicket.ticketId, "OPEN")}
                  >
                    إعادة فتح كجديدة
                  </Button>
                )}
              </div>
            </div>

            {/* أزرار الإجراء السريع */}
            <div className="flex items-center justify-between border-t border-line pt-4">
              <a
                href={`mailto:${activeTicket.email}?subject=${encodeURIComponent(
                  `رد على تذكرة الدعم #${activeTicket.ticketId} — منصة مسار التميز`,
                )}&body=${encodeURIComponent(`مرحباً ${activeTicket.name}،\n\nبخصوص رسالتك:\n> ${activeTicket.message}\n\n`)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 transition-colors"
              >
                <Mail size={15} />
                الرد المباشر عبر البريد
                <ExternalLink size={13} />
              </a>

              <Button variant="secondary" size="sm" onClick={() => setActiveTicket(null)}>
                إغلاق النافذة
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
