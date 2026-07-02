import { AppError } from "@/lib/errors";
import { logger } from "./logger";

export function getConfiguredAppUrl(requestOrigin?: string): string {
  const configured =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "";
  const normalized = configured.replace(/\/+$/, "");

  if (normalized) return normalized;

  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    return requestOrigin.replace(/\/+$/, "");
  }

  logger.error("Application base URL is not configured");
  throw AppError.badRequest("APP_URL_NOT_CONFIGURED");
}

export function appUrl(path: string, requestOrigin?: string): string {
  return `${getConfiguredAppUrl(requestOrigin)}${path.startsWith("/") ? path : `/${path}`}`;
}
