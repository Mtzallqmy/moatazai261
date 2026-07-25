import { PersonalApiKeys } from "@/components/personal-api-keys";
import { requireUser } from "@/lib/auth/guards";
export default async function Page(){await requireUser("/account/api-keys");return <section><h1>مفاتيحي الشخصية</h1><p>يُستخدم مفتاحك أولًا لهذا المزود، ويظل مشفرًا على الخادم ولا يعود إلى المتصفح.</p><PersonalApiKeys/></section>;}
