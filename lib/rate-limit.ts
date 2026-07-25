import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitDecision = { allowed:boolean; limit:number; remaining:number; resetAt:Date };
export interface RateLimiter { consume(key:string,options:{limit:number;windowMs:number}):Promise<RateLimitDecision>; }
export class UnconfiguredRateLimiter implements RateLimiter { async consume():Promise<RateLimitDecision>{ throw new Error("A distributed rate limiter must be configured before enabling write APIs"); } }

export class SupabaseRateLimiter implements RateLimiter {
  async consume(key:string,options:{limit:number;windowMs:number}):Promise<RateLimitDecision>{
    if(!key || options.limit<1 || options.windowMs<1000)throw new Error("Invalid rate limit configuration");
    const digest=await sha256(key);
    const {data,error}=await createAdminClient().rpc("consume_rate_limit",{
      p_key_hash:digest,
      p_limit:options.limit,
      p_window_seconds:Math.max(1,Math.ceil(options.windowMs/1000)),
    });
    if(error||!data?.[0])throw new Error("Distributed rate limiter is unavailable");
    const row=data[0];
    return{
      allowed:Boolean(row.allowed),
      limit:Number(row.limit_value),
      remaining:Number(row.remaining),
      resetAt:new Date(row.reset_at),
    };
  }
}

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join("");
}

export const rateLimiter:RateLimiter=new SupabaseRateLimiter();

export function rateLimitHeaders(decision:RateLimitDecision){
  return{
    "X-RateLimit-Limit":String(decision.limit),
    "X-RateLimit-Remaining":String(decision.remaining),
    "X-RateLimit-Reset":String(Math.ceil(decision.resetAt.getTime()/1000)),
  };
}
