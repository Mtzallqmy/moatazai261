export type HealthSeverity = "info" | "warning" | "critical";
export type PlatformHealthStatus = "operational" | "degraded" | "outage";

export type HealthIssue = {
  code: string;
  title: string;
  detail: string;
  severity: HealthSeverity;
  href?: string;
};

export type PlatformHealthInput = {
  databaseOk: boolean;
  storageOk: boolean;
  chatRuns: number;
  chatFailures: number;
  failedJobs: number;
  ragRuns: number;
  ragFailures: number;
  providers: Array<{
    enabled?: boolean;
    name: string;
    health_status: string;
    circuit_state: string;
    consecutive_failures?: number | null;
    last_error_code?: string | null;
  }>;
  mcp: Array<{
    name: string;
    status: string;
    last_error_code?: string | null;
  }>;
};

export function buildPlatformHealthSummary(input: PlatformHealthInput): {
  status: PlatformHealthStatus;
  score: number;
  issues: HealthIssue[];
} {
  const issues: HealthIssue[] = [];
  if (!input.databaseOk) {
    issues.push({
      code: "DATABASE_UNAVAILABLE",
      title: "قاعدة البيانات غير متاحة",
      detail: "تعذّر تنفيذ فحص القراءة الإداري.",
      severity: "critical",
    });
  }
  if (!input.storageOk) {
    issues.push({
      code: "STORAGE_UNAVAILABLE",
      title: "التخزين غير متاح",
      detail: "تعذّر الوصول إلى حاويات الملفات.",
      severity: "critical",
      href: "/admin/media",
    });
  }
  if (input.failedJobs > 0) {
    issues.push({
      code: "BACKGROUND_JOBS_FAILED",
      title: "مهام خلفية تحتاج المراجعة",
      detail: `${input.failedJobs} مهمة فاشلة مسجلة.`,
      severity: input.failedJobs >= 10 ? "critical" : "warning",
      href: "/admin/jobs",
    });
  }
  const chatErrorRate = input.chatRuns ? input.chatFailures / input.chatRuns : 0;
  if (input.chatRuns >= 5 && chatErrorRate >= 0.1) {
    issues.push({
      code: "CHAT_ERROR_RATE_HIGH",
      title: "معدل أخطاء الدردشة مرتفع",
      detail: `${Math.round(chatErrorRate * 100)}% من تشغيلات آخر 24 ساعة فشلت.`,
      severity: chatErrorRate >= 0.3 ? "critical" : "warning",
      href: "/admin/logs",
    });
  }
  if (input.ragRuns && input.ragFailures / input.ragRuns >= 0.15) {
    issues.push({
      code: "RAG_FAILURE_RATE_HIGH",
      title: "عمليات الاسترجاع تحتاج المراجعة",
      detail: `${input.ragFailures} من ${input.ragRuns} عملية استرجاع فشلت.`,
      severity: "warning",
      href: "/admin/rag-diagnostics",
    });
  }
  for (const provider of input.providers) {
    if (provider.enabled === false) continue;
    if (provider.circuit_state === "open" || provider.health_status === "unavailable") {
      issues.push({
        code: "PROVIDER_UNAVAILABLE",
        title: `${provider.name} غير متاح`,
        detail: provider.last_error_code
          ? `آخر رمز خطأ: ${provider.last_error_code}`
          : "دائرة الحماية مفتوحة أو فشل آخر فحص.",
        severity: "critical",
        href: "/admin/providers",
      });
    } else if (provider.health_status === "degraded" || (provider.consecutive_failures ?? 0) > 0) {
      issues.push({
        code: "PROVIDER_DEGRADED",
        title: `${provider.name} يعمل بصورة متدهورة`,
        detail: `${provider.consecutive_failures ?? 0} حالات فشل متتالية.`,
        severity: "warning",
        href: "/admin/providers",
      });
    }
  }
  for (const server of input.mcp) {
    if (!["healthy", "connected"].includes(server.status)) {
      issues.push({
        code: "MCP_UNHEALTHY",
        title: `خادم الأدوات ${server.name} يحتاج المراجعة`,
        detail: server.last_error_code ? `آخر رمز خطأ: ${server.last_error_code}` : `الحالة الحالية: ${server.status}`,
        severity: "warning",
        href: "/admin/mcp",
      });
    }
  }

  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - critical * 20 - warnings * 7);
  return {
    status: !input.databaseOk ? "outage" : critical || warnings ? "degraded" : "operational",
    score,
    issues,
  };
}
