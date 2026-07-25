import { AppShell } from "@/components/app-shell";
import { canAccessAdmin, requireUser } from "@/lib/auth/guards";
export default async function AccountLayout({children}:{children:React.ReactNode}){
  await requireUser();
  const canManage = await canAccessAdmin();
  return <AppShell title="مساحتك الخاصة" canManage={canManage}>{children}</AppShell>;
}
