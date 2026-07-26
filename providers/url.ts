const versionSegment = /^v\d+(?:beta\d*)?$/i;

export function normalizeProviderBaseUrl(value: string): string {
  const trimmed = value.trim();
  const url = new URL(trimmed);
  url.hash = "";
  url.search = "";
  url.pathname = normalizePathname(url.pathname);
  return url.toString().replace(/\/$/, "");
}

export function normalizeProviderEndpoint(value: string, fallback: string): string {
  const raw = value.trim() || fallback;
  if (/^https?:\/\//i.test(raw)) throw new Error("المسار يجب أن يكون نسبيًا وليس رابطًا كاملًا.");
  const [pathname] = raw.split(/[?#]/, 1);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("المسار يحتوي على مقاطع غير مسموحة.");
  }
  return `/${segments.join("/")}`;
}

export function buildProviderUrl(baseUrl: string, endpoint: string): URL {
  const base = new URL(normalizeProviderBaseUrl(baseUrl));
  const baseSegments = base.pathname.split("/").filter(Boolean);
  const endpointSegments = normalizeProviderEndpoint(endpoint, "/").split("/").filter(Boolean);

  let overlap = Math.min(baseSegments.length, endpointSegments.length);
  while (overlap > 0) {
    const suffix = baseSegments.slice(-overlap).map(lower);
    const prefix = endpointSegments.slice(0, overlap).map(lower);
    if (suffix.every((segment, index) => segment === prefix[index])) break;
    overlap -= 1;
  }

  // Version prefixes are commonly duplicated by hand as /v1 + /v1/chat.
  if (
    overlap === 0 &&
    versionSegment.test(baseSegments.at(-1) ?? "") &&
    versionSegment.test(endpointSegments[0] ?? "") &&
    lower(baseSegments.at(-1) ?? "") === lower(endpointSegments[0] ?? "")
  ) {
    overlap = 1;
  }

  base.pathname = `/${[...baseSegments, ...endpointSegments.slice(overlap)].join("/")}`;
  base.search = "";
  base.hash = "";
  return base;
}

function normalizePathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const output: string[] = [];
  for (const segment of segments) {
    const previous = output.at(-1);
    if (previous && versionSegment.test(previous) && lower(previous) === lower(segment)) continue;
    output.push(segment);
  }
  return output.length ? `/${output.join("/")}` : "/";
}

function lower(value: string) {
  return value.toLowerCase();
}
