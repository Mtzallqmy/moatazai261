import { FeatureState } from "@/components/feature-state";
export default async function ArticlePage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <FeatureState title="المقال غير متاح" description={`لا يوجد مقال منشور بالمعرّف: ${slug}`}/>;}
