import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { requireSupabasePublicEnv } from "@/config/env";

export function createSupabaseMiddlewareClient(request:NextRequest,response:NextResponse){
  const env=requireSupabasePublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(cookies)=>cookies.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
}
