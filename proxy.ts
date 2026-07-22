import { NextResponse, type NextRequest } from "next/server";
import { adminPrefix, protectedPrefixes } from "@/config/security";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/server";

export async function proxy(request:NextRequest){
  const path=request.nextUrl.pathname;
  const isProtected=protectedPrefixes.some((prefix)=>path===prefix||path.startsWith(`${prefix}/`));
  const isAdmin=path===adminPrefix||path.startsWith(`${adminPrefix}/`);
  const response=NextResponse.next({request});
  try{
    const supabase=createSupabaseMiddlewareClient(request,response);
    const {data:{user}}=await supabase.auth.getUser();
    if((isProtected||isAdmin)&&!user)return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(path)}`,request.url));
    const role=typeof user?.app_metadata?.role==="string"?user.app_metadata.role:"user";
    if(isAdmin&&!(["owner","admin"].includes(role)))return NextResponse.redirect(new URL("/chat",request.url));
  }catch{
    if(isProtected||isAdmin)return NextResponse.redirect(new URL("/login?error=auth_not_configured",request.url));
  }
  return response;
}
export const config={matcher:["/chat/:path*","/account/:path*","/admin/:path*"]};
