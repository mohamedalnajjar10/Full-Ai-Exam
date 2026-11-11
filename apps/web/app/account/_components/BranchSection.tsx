"use client";
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { fetchPublic } from "@/lib/apiClient";
import { branchLabel } from "@/lib/branch";
import { changeBranch, securityError } from "@/lib/account";
import Section from "./Section";

interface Branch {
  id: string;
  name: string;
}

export default function BranchSection() {
  const { selectedBranch, setSelectedBranch, refresh } = useAuth();
  const { showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [choice, setChoice] = useState<string>(selectedBranch?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPublic("/branches")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setBranches(Array.isArray(data) ? data : []))
      .catch(() => setBranches([]));
  }, []);

  const changed = choice && choice !== selectedBranch?.id;

  async function save() {
    const target = branches.find((b) => b.id === choice);
    if (!target) return;
    setSaving(true);
    setError("");
    try {
      await changeBranch(target.id);
      setSelectedBranch({ id: target.id, name: target.name });
      refresh();
      showToast({ type: "success", message: `أصبح فرعك ${branchLabel(target.name)}.` });
    } catch (err) {
      setError(securityError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      id="branch"
      icon={GraduationCap}
      title="الفرع الدراسي"
      description="يحدد المواد والكتب والخطة اليومية التي تظهر لك. سجل كويزاتك السابقة يبقى كما هو."
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <div role="radiogroup" aria-label="الفرع الدراسي" className="grid gap-2 sm:grid-cols-2">
        {branches.length === 0
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-canvas" />)
          : branches.map((b) => {
              const active = b.id === choice;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setChoice(b.id)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-start text-sm font-medium transition-colors ${
                    active ? "border-teal-600 bg-teal-50/50 text-navy-900 shadow-[0_0_0_1px_var(--color-teal-600)]" : "border-line text-ink hover:border-navy-200"
                  }`}
                >
                  {branchLabel(b.name)}
                  {b.id === selectedBranch?.id && <span className="text-xs text-muted">الحالي</span>}
                </button>
              );
            })}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={!changed} loading={saving}>
          تغيير الفرع
        </Button>
      </div>
    </Section>
  );
}
