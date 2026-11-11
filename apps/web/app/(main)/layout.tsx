import PublicShell from "@/components/layout/PublicShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
