import { NextRequest } from "next/server";

export function getSecureClientIp(request: Request | NextRequest | { headers: Headers }): string {
  let headersList: Headers;
  if (request instanceof Request) {
    headersList = request.headers;
  } else if ("headers" in request && typeof request.headers.get === "function") {
    headersList = request.headers as Headers;
  } else {
    return "unknown";
  }

  // If nextRequest contains a verified next-hop client IP (.ip)
  if ("ip" in request && (request as NextRequest & { ip?: string }).ip) {
    return (request as NextRequest & { ip?: string }).ip || "unknown";
  }

  // Parse x-forwarded-for from right to left (last hop is the actual client IP appended by edge proxy)
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",").pop()?.trim() || "unknown";
  }

  // Fallback to direct x-real-ip header
  return headersList.get("x-real-ip") || "unknown";
}
