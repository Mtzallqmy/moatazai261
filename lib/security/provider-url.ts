import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

const blockedHostnames = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

export function assertSafeProviderUrl(value: string) {
  const url = new URL(value);
  const allowPrivate = process.env.ALLOW_PRIVATE_PROVIDER_URLS === "true";
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new Error("Provider endpoint must use HTTPS");
  }
  const host = normalizeHost(url.hostname);
  if (url.username || url.password) throw new Error("Credentials are not allowed in provider URLs");
  if (!allowPrivate && (blockedHostnames.has(host) || host.endsWith(".local") || isPrivateAddress(host))) {
    throw new Error("Private provider endpoints are blocked");
  }
  return url.toString();
}

export async function assertSafeOutboundUrl(value: string) {
  const safe = assertSafeProviderUrl(value);
  if (process.env.NODE_ENV === "test") return safe;
  if (process.env.ALLOW_PRIVATE_PROVIDER_URLS === "true") return safe;
  const host = normalizeHost(new URL(safe).hostname);
  if (isIP(host)) return safe;
  const addresses = await resolvePublicHostAddresses(host);
  if (addresses.some((address) => isPrivateAddress(address))) {
    throw new Error("Endpoint DNS resolves to a blocked network");
  }
  return safe;
}

function normalizeHost(host: string) {
  return host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export async function resolvePublicHostAddresses(hostname: string): Promise<string[]> {
  const host = normalizeHost(hostname);
  const results = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addresses = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!addresses.length) {
    throw new Error("Provider endpoint DNS could not be resolved");
  }
  return addresses;
}

export function isPrivateAddress(input: string): boolean {
  const host = normalizeHost(input);
  if (!isIP(host)) return false;
  if (host.includes(":")) {
    if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) return true;
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateAddress(mapped) : false;
  }
  const octets = host.split(".").map(Number);
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}
