import { AccountSettings } from "@/components/account-settings";
import { requireUser } from "@/lib/auth/guards";

export default async function SettingsPage(){
  await requireUser("/account/settings");
  return <section className="page-section">
    <h1>إعدادات الحساب</h1>
    <p>حدّث ملفك الشخصي واللغة والمظهر وخيارات حفظ المحادثات.</p>
    <AccountSettings />
  </section>;
}
