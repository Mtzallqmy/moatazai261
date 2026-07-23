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
    if(isAdmin&&user){
      const {data:allowed,error}=await supabase.rpc("has_permission",{permission_code:"admin.access",target_user:user.id});
      if(error||!allowed)return NextResponse.redirect(new URL("/403",request.url));
    }
  }catch{
    if(isProtected||isAdmin)return NextResponse.redirect(new URL("/login?error=auth_not_configured",request.url));
  }
  return response;
}
export const config={matcher:["/chat/:path*","/account/:path*","/admin/:path*"]};
