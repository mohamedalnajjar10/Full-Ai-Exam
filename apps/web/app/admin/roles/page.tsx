"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSION_GROUPS, type Permission } from "@ai-exam/types";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import { AdminPageHeader, Input, LabeledControl, Modal, Panel, Textarea, fmt } from "../_components/ui";
import { errorMessage } from "../_data/http";
import { createRole, deleteRole, listRoles, saveMatrix, updateRole, type StaffRole } from "../_data/platform";

type RoleDialog = { mode: "create" } | { mode: "edit"; role: StaffRole } | { mode: "delete"; role: StaffRole } | null;

export default function RolesPage() {
  const { showToast } = useToast();
  const { user: me } = useAuth();
  const [roles, setRoles] = useState<StaffRole[] | null>(null);
  const [students, setStudents] = useState(0);
  const [draft, setDraft] = useState<Record<string, Set<Permission>>>({});
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<RoleDialog>(null);

  const apply = useCallback((r: { roles: StaffRole[]; students: number }) => {
    setRoles(r.roles);
    setStudents(r.students);
    setDraft(Object.fromEntries(r.roles.map((x) => [x.id, new Set(x.permissions)])));
  }, []);

  useEffect(() => {
    listRoles()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [apply]);

  const mine = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const dirtyIds = useMemo(
    () => (roles ?? []).filter((r) => r.permissions.length !== draft[r.id]?.size || r.permissions.some((p) => !draft[r.id]?.has(p))).map((r) => r.id),
    [roles, draft],
  );

  /** نفس قواعد الخادم: دور نظام ثابت، ودور فيه صلاحيات ما عندي ما بعدّله */
  const roleEditable = (r: StaffRole) => !r.system && r.permissions.every((p) => mine.has(p));
  const cellEditable = (r: StaffRole, p: Permission) => roleEditable(r) && mine.has(p) && !(me?.staffRole?.id === r.id && p === "roles.manage");

  function toggle(r: StaffRole, p: Permission) {
    if (!cellEditable(r, p)) return;
    setDraft((d) => {
      const n = new Set(d[r.id]);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return { ...d, [r.id]: n };
    });
  }

  async function save() {
    setSaving(true);
    try {
      apply(await saveMatrix(dirtyIds.map((id) => ({ id, permissions: [...draft[id]] }))));
      showToast({ type: "success", message: "حُفظت الصلاحيات — تسري فوراً على أعضاء الأدوار." });
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!roles) {
    return (
      <>
        <AdminPageHeader title="الأدوار والصلاحيات" />
        {loadError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{loadError}</p> : <Spinner className="py-24" />}
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="الأدوار والصلاحيات"
        description="من يستطيع فعل ماذا. المدير العام دور نظام بكل الصلاحيات؛ الأدوار الأخرى قابلة للتعديل، ولا يمكنك منح صلاحية لا تملكها."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog({ mode: "create" })}>
              <Plus size={16} />
              دور جديد
            </Button>
            {dirtyIds.length > 0 && (
              <Button variant="ghost" disabled={saving} onClick={() => apply({ roles, students })}>
                تراجع
              </Button>
            )}
            <Button variant="primary" disabled={dirtyIds.length === 0 || saving} onClick={save}>
              حفظ{dirtyIds.length > 0 && ` (${dirtyIds.length})`}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {roles.map((r) => (
          <div key={r.id} className="group flex flex-col rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-navy-900">{r.name}</p>
              {r.system ? (
                <Lock size={14} className="shrink-0 text-subtle" aria-label="دور نظام" />
              ) : (
                roleEditable(r) && (
                  <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" aria-label={`تعديل ${r.name}`} onClick={() => setDialog({ mode: "edit", role: r })} className="rounded p-1 text-subtle hover:text-navy-900">
                      <Pencil size={13} />
                    </button>
                    <button type="button" aria-label={`حذف ${r.name}`} onClick={() => setDialog({ mode: "delete", role: r })} className="rounded p-1 text-subtle hover:text-rose-600">
                      <Trash2 size={13} />
                    </button>
                  </span>
                )
              )}
            </div>
            <p className="mt-1 flex-1 text-xs leading-5 text-muted">{r.description || "—"}</p>
            <p className="mt-3 text-xs text-muted">
              <b className="tabular text-base text-navy-900">{fmt(r.members)}</b> {r.members === 1 ? "عضو" : "أعضاء"} · <span className="tabular">{draft[r.id]?.size ?? 0}</span> صلاحية
            </p>
          </div>
        ))}
        <div className="flex flex-col rounded-2xl border border-dashed border-line bg-white/60 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-navy-900">طالب</p>
            <Lock size={14} className="text-subtle" aria-label="دور نظام" />
          </div>
          <p className="mt-1 flex-1 text-xs leading-5 text-muted">الدور الافتراضي لكل حساب جديد — بلا وصول للوحة التحكم.</p>
          <p className="mt-3 text-xs text-muted">
            <b className="tabular text-base text-navy-900">{fmt(students)}</b> حساب
          </p>
        </div>
      </div>

      <Panel bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-white px-5 py-3 text-start text-xs font-semibold text-muted">
                الصلاحية
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className={`px-3 py-3 text-center text-xs font-semibold ${dirtyIds.includes(r.id) ? "text-teal-700" : "text-navy-900"}`}>
                  {r.name}
                  {dirtyIds.includes(r.id) && <span className="ms-1" aria-label="تغييرات غير محفوظة">•</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <Fragment key={g.group}>
                <tr>
                  <th colSpan={roles.length + 1} scope="colgroup" className="border-y border-line bg-canvas px-5 py-2 text-start text-xs font-semibold text-teal-700">
                    {g.group}
                  </th>
                </tr>
                {g.items.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/40">
                    <th scope="row" className="sticky start-0 bg-white px-5 py-2.5 text-start font-normal">
                      <span className="block text-[13px] text-ink">{p.label}</span>
                      <span className="font-mono text-[11px] text-subtle" dir="ltr">
                        {p.id}
                      </span>
                    </th>
                    {roles.map((r) => {
                      const on = draft[r.id]?.has(p.id) ?? false;
                      const locked = !cellEditable(r, p.id);
                      return (
                        <td key={r.id} className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`${p.label} — ${r.name}`}
                            title={locked ? (r.system ? "دور نظام" : !mine.has(p.id) ? "لا تملك هذه الصلاحية" : "لا يمكن تعديل هذا الدور") : undefined}
                            disabled={locked}
                            onClick={() => toggle(r, p.id)}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                              on ? (locked ? "border-navy-200 bg-navy-100 text-navy-500" : "border-teal-600 bg-teal-600 text-white") : "border-line bg-white hover:border-navy-300"
                            } ${locked ? "cursor-not-allowed" : ""}`}
                          >
                            {on && <Check size={14} strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>

      {(dialog?.mode === "create" || dialog?.mode === "edit") && (
        <RoleForm
          role={dialog.mode === "edit" ? dialog.role : undefined}
          onClose={() => setDialog(null)}
          onSaved={(r) => {
            apply(r);
            setDialog(null);
          }}
        />
      )}

      <Modal
        open={dialog?.mode === "delete"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`حذف دور «${dialog?.mode === "delete" ? dialog.role.name : ""}»؟`}
        description={dialog?.mode === "delete" && dialog.role.members > 0 ? `لهذا الدور ${dialog.role.members} عضو — انقلهم لدور آخر من صفحة المستخدمين أولاً.` : "لا يمكن التراجع."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              disabled={dialog?.mode === "delete" && dialog.role.members > 0}
              onClick={async () => {
                if (dialog?.mode !== "delete") return;
                try {
                  apply(await deleteRole(dialog.role.id));
                  setDialog(null);
                  showToast({ type: "success", message: "حُذف الدور." });
                } catch (e) {
                  showToast({ type: "error", message: errorMessage(e) });
                }
              }}
            >
              حذف
            </Button>
          </>
        }
      />
    </>
  );
}

function RoleForm({ role, onClose, onSaved }: { role?: StaffRole; onClose: () => void; onSaved: (r: { roles: StaffRole[]; students: number }) => void }) {
  const { showToast } = useToast();
  const [id, setId] = useState("");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [busy, setBusy] = useState(false);
  const idValid = role || /^[a-z][a-z0-9_]{2,39}$/.test(id);
  const valid = idValid && name.trim();

  async function submit() {
    setBusy(true);
    try {
      onSaved(
        role
          ? await updateRole(role.id, { name: name.trim(), description: description.trim(), permissions: role.permissions })
          : await createRole({ id, name: name.trim(), description: description.trim(), permissions: [] }),
      );
      showToast({ type: "success", message: role ? "حُفظ الدور." : "أُنشئ الدور — حدّد صلاحياته من المصفوفة." });
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
      title={role ? `تعديل ${role.name}` : "دور جديد"}
      description={role ? undefined : "يبدأ بلا صلاحيات؛ فعّلها من المصفوفة ثم احفظ."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {role ? "حفظ" : "إنشاء"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!role && (
          <LabeledControl label="المعرّف" hint="أحرف إنجليزية صغيرة وأرقام و_ — مثال: data_entry. لا يتغيّر لاحقاً.">
            {(fid) => <Input id={fid} autoFocus value={id} onChange={(e) => setId(e.target.value.toLowerCase())} dir="ltr" className="w-full font-mono" />}
          </LabeledControl>
        )}
        <LabeledControl label="الاسم">{(fid) => <Input id={fid} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-full" />}</LabeledControl>
        <LabeledControl label="الوصف">{(fid) => <Textarea id={fid} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="w-full" />}</LabeledControl>
      </div>
    </Modal>
  );
}
