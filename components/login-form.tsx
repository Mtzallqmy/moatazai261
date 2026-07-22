"use client";
import { useState } from "react";
import { publicEnv } from "@/config/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({returnTo="/chat"}:{returnTo?:string}){
  const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);const [email,setEmail]=useState("");const [password,setPassword]=useState("");
  const configured=Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL&&publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  async function signIn(provider:"google"|"github"){
    setBusy(provider);setError(null);
    try{const supabase=createSupabaseBrowserClient();const callback=new URL("/auth/callback",window.location.origin);callback.searchParams.set("next",returnTo);const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:callback.toString()}});if(error)throw error;}catch(cause){setError(cause instanceof Error?cause.message:"تعذر بدء تسجيل الدخول");setBusy(null);}
  }
  async function passwordLogin(event:React.FormEvent){event.preventDefault();setBusy("password");setError(null);try{const {error}=await createSupabaseBrowserClient().auth.signInWithPassword({email,password});if(error)throw error;window.location.assign(returnTo);}catch(cause){setError(cause instanceof Error?cause.message:"بيانات الدخول غير صحيحة");setBusy(null);}}
  const passwordEnabled=process.env.NEXT_PUBLIC_PASSWORD_AUTH_ENABLED==="true";
  return <><div className="auth-actions"><button className="button" disabled={!configured||busy!==null} onClick={()=>void signIn("google")}>G&nbsp; المتابعة بواسطة Google</button><button className="button" disabled={!configured||busy!==null} onClick={()=>void signIn("github")}>◖◗&nbsp; المتابعة بواسطة GitHub</button></div>{passwordEnabled&&<form className="password-form" onSubmit={passwordLogin}><input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="البريد الإلكتروني"/><input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="كلمة المرور"/><button className="button primary" disabled={busy!==null}>تسجيل الدخول</button><a href="/forgot-password">نسيت كلمة المرور؟</a></form>}{!configured&&<p className="notice">تسجيل الدخول غير مفعّل حتى تُضاف متغيرات Supabase الصحيحة إلى بيئة المشروع.</p>}{error&&<p className="notice" role="alert">تعذر تسجيل الدخول. تحقق من بياناتك أو حاول مرة أخرى.</p>}</>;
}
