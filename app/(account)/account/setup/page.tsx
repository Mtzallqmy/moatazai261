import { AccountSettings } from "@/components/account-settings";
import { requireUser } from "@/lib/auth/guards";

export default async function Page(){
  await requireUser("/account/setup");
  return <section className="page-section">
    <h1>إعداد الحساب</h1>
    <p>أكمل بياناتك وتفضيلاتك، ويمكنك تعديلها لاحقًا من صفحة الإعدادات.</p>
    <AccountSettings />
  </section>;
}
