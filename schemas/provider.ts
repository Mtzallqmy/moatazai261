import { z } from "zod";
export const providerConfigurationSchema=z.object({name:z.string().trim().min(2).max(80),type:z.string().trim().min(2).max(50),baseUrl:z.url().optional(),apiKey:z.string().min(8).max(500),defaultModel:z.string().trim().max(120).optional(),enabled:z.boolean().default(true)});
