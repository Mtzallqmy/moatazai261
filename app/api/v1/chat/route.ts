import { featureFlags } from "@/config/feature-flags";
import { AppError, ErrorCode, errorResponse } from "@/lib/errors";
import { chatRequestSchema } from "@/schemas/chat";
export async function POST(request:Request){try{if(!featureFlags.AI_CHAT_ENABLED)throw new AppError(ErrorCode.FEATURE_DISABLED,"الدردشة غير مفعلة حاليًا.",503);const parsed=chatRequestSchema.safeParse(await request.json());if(!parsed.success)throw new AppError(ErrorCode.VALIDATION_ERROR,"بيانات الدردشة غير صالحة.",422);throw new AppError(ErrorCode.FEATURE_DISABLED,"يلزم ربط مستودع المزودات وقاعدة البيانات قبل استقبال الدردشة.",503);}catch(cause){return errorResponse(cause);}}
