"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, ChevronLeft, ChevronRight, Download, KeyRound, LogOut, Mail, MonitorSmartphone, RotateCcw, ShieldCheck, ShieldOff, UserCheck, UserPlus } from "lucide-react";
import { SUPER_ADMIN_ROLE_ID } from "@ai-exam/types";
import { Button } from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import { AdminPageHeader, Drawer, Input, LabeledControl, Modal, Panel, SearchInput, Select, StatusPill, Table, Td, Th, fmt } from "../_components/ui";
import { can } from "../_components/nav";
import { errorMessage } from "../_data/http";
import {
  ago,
  exportUsers,
  getUser,
  inviteUser,
  listBranches,
  listRoles,
  listUsers,
  sendPasswordReset,
  suspendUser,
  updateUser,
  userAction,
  type AdminUserDetail,
  type StaffRole,
  type UserFilters,
  type UserList,
  type UserStatus,
} from "../_data/platform";

const STATUS: Record<UserStatus, React.ReactNode> = {
  active: <StatusPill tone="ok">نشط</StatusPill>,
  suspended: <StatusPill tone="error">موقوف</StatusPill>,
  unverified: <StatusPill tone="idle">غير مؤكَّد</StatusPill>,
};

export default function UsersPage() {
  return (
    <Suspense>
      <UsersView />
    </Suspense>
  );
}

function UsersView() {
  const params = useSearchParams();
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const canManage = can(me, "users.manage");

  const [filters, setFilters] = useState<UserFilters>({ page: 1 });
  const [q, setQ] = useState("");
  const [list, setList] = useState<UserList | null>(null);
  const [loadError, setLoadError] = useState("");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(params.get("invite") === "1" && canManage);

  const load = useCallback(async (f: UserFilters) => {
    try {
      setList(await listUsers(f));
      setLoadError("");
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب من الخادم عند تغيّر الفلاتر
    void load(filters);
  }, [filters, load]);

  // البحث بعد ما يوقف الكتابة — مش طلب مع كل حرف
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === (q.trim() || undefined) ? f : { ...f, q: q.trim() || undefined, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    listRoles()
      .then((r) => setRoles(r.roles))
      .catch(() => undefined);
    listBranches()
      .then(setBranches)
      .catch(() => undefined);
  }, []);

  /** الأدوار يلي بقدر أمنحها: صلاحياتها ضمن صلاحياتي، والمدير العام للمدير العام بس */
  const assignable = useMemo(() => {
    const mine = new Set(me?.permissions ?? []);
    const iAmSuper = me?.staffRole?.id === SUPER_ADMIN_ROLE_ID;
    return roles.filter((r) => (r.id === SUPER_ADMIN_ROLE_ID ? iAmSuper : r.permissions.every((p) => mine.has(p))));
  }, [roles, me]);

  const setFilter = (k: keyof UserFilters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value === "all" ? undefined : e.target.value, page: 1 }));
  const pages = list ? Math.max(1, Math.ceil(list.total / list.limit)) : 1;

  return (
    <>
      <AdminPageHeader
        title="المستخدمون"
        description="كل الحسابات: طلاب وفريق إدارة. ابحث، غيّر الأدوار، أوقف الحسابات المسيئة، أو أنهِ الجلسات."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportUsers(filters).catch((e) => showToast({ type: "error", message: errorMessage(e) }))}>
              <Download size={16} />
              تصدير CSV
            </Button>
            {canManage && (
              <Button variant="accent" onClick={() => setInviteOpen(true)}>
                <UserPlus size={17} />
                دعوة عضو فريق
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["كل الحسابات", list?.stats.total],
            ["نشطون هذا الأسبوع", list?.stats.activeWeek],
            ["بانتظار تأكيد البريد", list?.stats.unverified],
            ["موقوفون", list?.stats.suspended],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white px-5 py-4 shadow-card">
            <p className="text-[13px] text-muted">{k}</p>
            <p className="tabular mt-1 text-2xl font-bold text-navy-900">{v === undefined ? "—" : fmt(v)}</p>
          </div>
        ))}
      </div>

      <Panel bodyClassName="">
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <SearchInput placeholder="الاسم أو البريد…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-56 flex-1" aria-label="بحث" />
          <Select aria-label="الدور" value={filters.role ?? "all"} onChange={setFilter("role")}>
            <option value="all">كل الأدوار</option>
            <option value="student">طالب</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select aria-label="الحالة" value={filters.status ?? "all"} onChange={setFilter("status")}>
            <option value="all">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="unverified">غير مؤكَّد</option>
            <option value="suspended">موقوف</option>
          </Select>
          <Select aria-label="الفرع" value={filters.branchId ?? "all"} onChange={setFilter("branchId")}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-rose-700">{loadError}</p>
        ) : !list ? (
          <Spinner className="py-16" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>المستخدم</Th>
                  <Th>الدور</Th>
                  <Th>الفرع</Th>
                  <Th>الحالة</Th>
                  <Th>الأمان</Th>
                  <Th>توليد اليوم</Th>
                  <Th>آخر نشاط</Th>
                </tr>
              </thead>
              <tbody>
                {list.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-muted">
                      لا حسابات مطابقة.
                    </td>
                  </tr>
                )}
                {list.items.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => setOpenId(u.id)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name || u.email} size={34} />
                        <div className="min-w-0">
                          <button type="button" className="block max-w-56 truncate text-start font-medium text-navy-900 hover:underline" onClick={() => setOpenId(u.id)}>
                            {u.name || "بلا اسم"}
                          </button>
                          <p className="max-w-56 truncate text-xs text-muted" dir="ltr">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${u.role === "student" ? "bg-slate-100 text-slate-600" : "bg-navy-50 text-navy-800"}`}>{u.roleName}</span>
                    </Td>
                    <Td className="text-[13px]">{u.branch?.name ?? <span className="text-subtle">—</span>}</Td>
                    <Td>{STATUS[u.status]}</Td>
                    <Td>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {u.twoFactor ? <ShieldCheck size={15} className="text-teal-600" aria-label="المصادقة الثنائية مفعّلة" /> : <ShieldOff size={15} className="text-subtle" aria-label="بلا مصادقة ثنائية" />}
                        {u.provider === "google" ? "Google" : "بريد"}
                      </span>
                    </Td>
                    <Td>
                      <span className={`tabular text-[13px] ${u.dailyQuota !== null && u.generationsToday >= u.dailyQuota ? "font-semibold text-rose-600" : "text-ink"}`}>{u.generationsToday}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-[13px] text-muted">{ago(u.lastActiveAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-muted">
              <span>
                عرض <span className="tabular">{list.items.length}</span> من <span className="tabular">{fmt(list.total)}</span>
              </span>
              {pages > 1 && (
                <span className="flex items-center gap-1">
                  <button type="button" aria-label="الصفحة السابقة" disabled={list.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))} className="rounded-lg p-1.5 hover:bg-navy-50 disabled:opacity-30">
                    <ChevronRight size={16} />
                  </button>
                  <span className="tabular">
                    {list.page} / {pages}
                  </span>
                  <button type="button" aria-label="الصفحة التالية" disabled={list.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))} className="rounded-lg p-1.5 hover:bg-navy-50 disabled:opacity-30">
                    <ChevronLeft size={16} />
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </Panel>

      <UserDrawer userId={openId} assignable={assignable} canManage={canManage} myId={me?.id} onClose={() => setOpenId(null)} onChanged={() => void load(filters)} />

      {inviteOpen && (
        <InviteDialog
          roles={assignable}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            setInviteOpen(false);
            void load(filters);
          }}
        />
      )}
    </>
  );
}

/* ───────── تفاصيل المستخدم ───────── */

function UserDrawer({
  userId,
  assignable,
  canManage,
  myId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  assignable: StaffRole[];
  canManage: boolean;
  myId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [quota, setQuota] = useState("");

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- مستخدم جديد بالدرج
    setUser(null);
    getUser(userId)
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setQuota(u.dailyQuota?.toString() ?? "");
      })
      .catch((e) => showToast({ type: "error", message: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [userId, showToast]);

  async function act(action: () => Promise<AdminUserDetail | { message: string }>, success: string) {
    setBusy(true);
    try {
      const r = await action();
      if ("id" in r) {
        setUser(r);
        setQuota(r.dailyQuota?.toString() ?? "");
      }
      onChanged();
      showToast({ type: "success", message: success });
      return true;
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const self = user?.id === myId;
  const roleOptions = user && user.role && user.role !== "student" && !assignable.some((r) => r.id === user.role) ? null : assignable;
  const quotaValue = quota.trim() === "" ? null : Number(quota);
  const quotaDirty = user && quotaValue !== user.dailyQuota && (quotaValue === null || (Number.isInteger(quotaValue) && quotaValue >= 0));

  return (
    <>
      <Drawer
        open={userId !== null}
        onClose={onClose}
        title={user ? user.name || "بلا اسم" : ""}
        subtitle={user ? <span dir="ltr">{user.email}</span> : ""}
        footer={
          user &&
          canManage &&
          !self &&
          (user.status === "suspended" ? (
            <Button variant="accent" disabled={busy} onClick={() => act(() => userAction(user.id, "unsuspend"), "أُعيد تفعيل الحساب.")}>
              <UserCheck size={16} />
              إعادة التفعيل
            </Button>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => setSuspendOpen(true)}>
              <Ban size={16} />
              إيقاف الحساب
            </Button>
          ))
        }
      >
        {!user ? (
          <Spinner className="py-16" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar name={user.name || user.email} size={56} />
              <div>
                <div className="flex items-center gap-2">
                  {STATUS[user.status]}
                  {self && <StatusPill tone="idle">حسابك</StatusPill>}
                </div>
                <p className="mt-1.5 text-[13px] text-muted">
                  انضم {ago(user.createdAt)} · آخر نشاط {ago(user.lastActiveAt)}
                </p>
              </div>
            </div>

            {user.status === "suspended" && user.suspendedReason && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
                موقوف {ago(user.suspendedAt)}: {user.suspendedReason}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledControl
                label="الدور"
                hint={self ? "لا يمكنك تغيير دورك بنفسك." : roleOptions === null ? "لا يمكنك تعديل حساب لديه صلاحيات لا تملكها." : "الصلاحيات تسري فوراً."}
              >
                {(id) => (
                  <Select
                    id={id}
                    value={user.role ?? ""}
                    disabled={!canManage || self || busy || roleOptions === null}
                    onChange={(e) => act(() => updateUser(user.id, { role: e.target.value }), "تغيّر الدور.")}
                    className="w-full"
                  >
                    <option value="student">طالب</option>
                    {(roleOptions ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {roleOptions === null && <option value={user.role ?? ""}>{user.roleName}</option>}
                  </Select>
                )}
              </LabeledControl>
              <LabeledControl label="حصة التوليد اليومية" hint="فارغ = حصة الدور أو الافتراضية · 0 = ممنوع.">
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} type="number" min={0} value={quota} disabled={!canManage || busy} onChange={(e) => setQuota(e.target.value)} placeholder="افتراضي" className="tabular w-full" dir="ltr" />
                    {quotaDirty && (
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => updateUser(user.id, { dailyQuota: quotaValue }), "حُفظت الحصة.")}>
                        حفظ
                      </Button>
                    )}
                  </div>
                )}
              </LabeledControl>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
              <p className="text-[13px] text-ink">
                توليد اليوم: <b className="tabular">{user.quota.used}</b>
                {user.quota.limit === null ? " · بلا حد" : <> من <b className="tabular">{user.quota.limit}</b></>}
              </p>
              {canManage && user.quota.used > 0 && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => userAction(user.id, "reset-quota"), "صُفّرت حصة اليوم.")}>
                  <RotateCcw size={14} />
                  تصفير
                </Button>
              )}
            </div>

            {canManage && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-navy-900">الأمان</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {user.status === "unverified" && (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => userAction(user.id, "verify-email"), "أُكّد البريد.")}>
                      <Mail size={15} />
                      تأكيد البريد يدوياً
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => sendPasswordReset(user.id), "أُرسل رابط إعادة تعيين كلمة المرور.")}>
                    <KeyRound size={15} />
                    {user.hasPassword ? "إرسال رابط كلمة مرور" : "إرسال رابط تعيين كلمة مرور"}
                  </Button>
                  {user.twoFactor && (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => act(() => userAction(user.id, "disable-2fa"), "عُطّلت المصادقة الثنائية.")}>
                      <ShieldOff size={15} />
                      تعطيل المصادقة الثنائية
                    </Button>
                  )}
                  {!self && (
                    <Button variant="secondary" size="sm" disabled={busy || user.sessions.length === 0} onClick={() => act(() => userAction(user.id, "end-sessions"), "أُنهيت كل جلسات المستخدم.")}>
                      <LogOut size={15} />
                      إنهاء كل الجلسات
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-[13px] font-semibold text-navy-900">
                الجلسات النشطة <span className="tabular font-normal text-muted">({user.sessions.length})</span>
              </p>
              {user.sessions.length === 0 ? (
                <p className="rounded-xl border border-line px-3.5 py-3 text-[13px] text-muted">لا جلسات نشطة.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {user.sessions.slice(0, 5).map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <MonitorSmartphone size={16} className="shrink-0 text-muted" />
                      <p className="flex-1 text-[13px] text-ink">آخر تجديد {ago(s.createdAt)}</p>
                      <span className="text-xs text-subtle">تنتهي {new Date(s.expiresAt).toLocaleDateString("ar-EG-u-nu-latn")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-canvas p-4">
              <p className="mb-2 text-[13px] font-semibold text-navy-900">النشاط التعليمي</p>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ["محادثات", user.activity.chats],
                    ["رسائل", user.activity.messages],
                    ["أسئلة مولّدة", user.activity.generated],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-muted">{k}</dt>
                    <dd className="tabular text-base font-bold text-navy-900">{fmt(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={suspendOpen && user !== null}
        onClose={() => setSuspendOpen(false)}
        tone="danger"
        title={`إيقاف حساب ${user?.name || user?.email || ""}؟`}
        description="تُنهى جلساته فوراً ولن يستطيع الدخول حتى تعيد تفعيله."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSuspendOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (user && (await act(() => suspendUser(user.id, reason.trim()), "أُوقف الحساب."))) {
                  setSuspendOpen(false);
                  setReason("");
                }
              }}
            >
              إيقاف
            </Button>
          </>
        }
      >
        <LabeledControl label="السبب (يُحفظ مع الحساب)">{(id) => <Input id={id} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="مثال: إساءة استخدام المساعد" className="w-full" />}</LabeledControl>
      </Modal>
    </>
  );
}

/* ───────── الدعوة ───────── */

function InviteDialog({ roles, onClose, onInvited }: { roles: StaffRole[]; onClose: () => void; onInvited: () => void }) {
  const { showToast } = useToast();
  const staff = roles.filter((r) => r.id !== "student");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(staff.find((r) => r.id === "reviewer")?.id ?? staff[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && roleId;

  async function submit() {
    setBusy(true);
    try {
      await inviteUser({ email: email.trim(), name: name.trim() || undefined, roleId });
      showToast({ type: "success", message: "أُرسلت الدعوة — يصله رابط لتعيين كلمة المرور." });
      onInvited();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="دعوة عضو فريق"
      description="يُنشأ حساب بالدور المختار ويصله بريد بإنشاء كلمة مرور. الحسابات الموجودة تُرقّى من صفحتها."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            إرسال الدعوة
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <LabeledControl label="البريد الإلكتروني">{(id) => <Input id={id} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="w-full" />}</LabeledControl>
        <LabeledControl label="الاسم (اختياري)">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="w-full" />}</LabeledControl>
        <LabeledControl label="الدور" hint={staff.length === 0 ? "لا توجد أدوار يمكنك منحها." : "تظهر فقط الأدوار التي صلاحياتها ضمن صلاحياتك."}>
          {(id) => (
            <Select id={id} value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full">
              {staff.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          )}
        </LabeledControl>
      </div>
    </Modal>
  );
}
