import "server-only";
import { z } from "zod";
const schema=z.object({SUPABASE_SERVICE_ROLE_KEY:z.string().min(20).optional(),PLATFORM_OWNER_EMAILS:z.string().default(""),PASSWORD_AUTH_ENABLED:z.enum(["true","false"]).default("false").transform(v=>v==="true")});
export const serverEnv=schema.parse({SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,PLATFORM_OWNER_EMAILS:process.env.PLATFORM_OWNER_EMAILS,PASSWORD_AUTH_ENABLED:process.env.PASSWORD_AUTH_ENABLED});
export const ownerEmails=new Set(serverEnv.PLATFORM_OWNER_EMAILS.split(",").map(v=>v.trim().toLowerCase()).filter(Boolean));
