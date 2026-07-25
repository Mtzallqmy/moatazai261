import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BackgroundJobInput = {
  ownerUserId?: string;
  jobType: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
};

export class BackgroundJobService {
  async enqueue(input: BackgroundJobInput) {
    const { data, error } = await createAdminClient().from("background_jobs").insert({
      owner_user_id: input.ownerUserId,
      job_type: input.jobType,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      payload: input.payload ?? {},
      priority: input.priority ?? 100,
      max_attempts: input.maxAttempts ?? 3,
    }).select("id,status,created_at").single();
    if (error) throw error;
    return data;
  }

  async complete(jobId: string, result: Record<string, unknown>) {
    const { error } = await createAdminClient().from("background_jobs").update({
      status: "completed",
      progress: 100,
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", "running");
    if (error) throw error;
  }

  async fail(jobId: string, errorCode: string) {
    const { error } = await createAdminClient().from("background_jobs").update({
      status: "failed",
      error_code: errorCode,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (error) throw error;
  }
}

export const backgroundJobService = new BackgroundJobService();
