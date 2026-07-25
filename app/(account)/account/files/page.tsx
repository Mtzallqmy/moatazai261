import { FileManager } from "@/components/file-manager";
import { requireUser } from "@/lib/auth/guards";

export default async function FilesPage(){
  await requireUser("/account/files");
  return <section className="page-section">
    <h1>الملفات</h1>
    <p>مكتبة خاصة لرفع الملفات ومعالجتها وربطها بالدردشة وقواعد المعرفة.</p>
    <FileManager />
  </section>;
}
