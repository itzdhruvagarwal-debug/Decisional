/**
 * IPInfo Service — Decisional
 * ─────────────────────────────────────────────────────────
 * Enterprise IP intelligence using ipinfo.io (50K req/month free).
 *
 * FEATURES:
 *  ✅ Full IP lookup (city, region, country, org, timezone)
 *  ✅ VPN / Proxy / Tor / Hosting detection (Privacy API)
 *  ✅ Redis caching (avoid redundant lookups, saves quota)
 *  ✅ Request timeout (AbortController)
 *  ✅ Private/loopback IP detection (skip API calls)
 *  ✅ Structured error logging
 *  ✅ Batch IP lookup support
 *  ✅ Geolocation distance calculation (Haversine)
 *
 * Required env: IPINFO_TOKEN
 */

import { logger } from "./logger";
import { redis } from "./redis";

// ==================== CONFIG ====================

const IPINFO_BASE_URL = "https://ipinfo.io";
const CACHE_TTL_SECONDS = 86400; // 24 hours — IP geo data rarely changes
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds

function getToken(): string {
    return process.env.IPINFO_TOKEN || "";
}

// ==================== TYPES ====================

export interface IPGeoData {
    ip: string;
    city: string;
    region: string;
    country: string; // ISO 3166-1 alpha-2 (e.g., "IN", "US")
    loc: string; // "lat,lng" format
    org: string; // ASN + Org name (e.g., "AS13335 Cloudflare, Inc.")
    postal: string;
    timezone: string; // IANA timezone (e.g., "Asia/Kolkata")
    hostname?: string;
}

export interface IPPrivacyData {
    vpn: boolean;
    proxy: boolean;
    tor: boolean;
    relay: boolean;
    hosting: boolean;
    service: string; // VPN/Proxy service name if detected
}

export interface IPFullInfo {
    geo: IPGeoData;
    privacy: IPPrivacyData | null;
    cached: boolean;
}

// ==================== PRIVATE IP CHECK ====================

const PRIVATE_IP_REGEX =
    /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|0\.0\.0\.0|fc00:|fe80:|fd)/;

function isPrivateIP(ip: string): boolean {
    return !ip || ip === "unknown" || PRIVATE_IP_REGEX.test(ip);
}

// ==================== CORE LOOKUP ====================

/**
 * Get full IP information (geo + privacy).
 * Results are cached in Redis for 24 hours to conserve API quota.
 */
export async function getIPInfo(ipAddress: string): Promise<IPFullInfo | null> {
    if (isPrivateIP(ipAddress)) {
        return {
            geo: {
                ip: ipAddress,
                city: "Local",
                region: "Local",
                country: "XX",
                loc: "0,0",
                org: "Private Network",
                postal: "",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            privacy: {
                vpn: false,
                proxy: false,
                tor: false,
                relay: false,
                hosting: false,
                service: "",
            },
            cached: false,
        };
    }

    // ── Check Redis cache ──
    const cacheKey = `ipinfo:${ipAddress}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached) as IPFullInfo;
            return { ...parsed, cached: true };
        }
    } catch (err) {
        logger.warn("[IPInfo] Redis cache read failed, proceeding with API call", {
            error: err,
        });
    }

    const token = getToken();
    if (!token) {
        logger.error(
            "CRITICAL: IPINFO_TOKEN not configured. IP intelligence is disabled.",
        );
        return null;
    }

    try {
        // ── Geo lookup ──
        const geoRes = await fetch(`${IPINFO_BASE_URL}/${ipAddress}?token=${token}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!geoRes.ok) {
            logger.error("[IPInfo] Geo lookup failed", {
                status: geoRes.status,
                ip: ipAddress,
            });
            return null;
        }

        const geoData = (await geoRes.json()) as IPGeoData;

        // ── Privacy lookup (VPN/Proxy/Tor detection) ──
        let privacyData: IPPrivacyData | null = null;
        try {
            const privacyRes = await fetch(
                `${IPINFO_BASE_URL}/${ipAddress}/privacy?token=${token}`,
                {
                    headers: { Accept: "application/json" },
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                },
            );

            if (privacyRes.ok) {
                privacyData = (await privacyRes.json()) as IPPrivacyData;
            }
        } catch (privErr) {
            logger.warn("[IPInfo] Privacy lookup failed, geo data still available", {
                error: privErr,
            });
        }

        const result: IPFullInfo = {
            geo: geoData,
            privacy: privacyData,
            cached: false,
        };

        // ── Cache result ──
        try {
            await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
        } catch (cacheErr) {
            logger.warn("[IPInfo] Failed to cache result", { error: cacheErr });
        }

        logger.info("[IPInfo] IP lookup successful", {
            ip: ipAddress,
            country: geoData.country,
            city: geoData.city,
            isVPN: privacyData?.vpn || false,
        });

        return result;
    } catch (err: any) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
            logger.warn("[IPInfo] Request timed out", { ip: ipAddress });
        } else {
            logger.error("[IPInfo] Lookup failed", err, { ip: ipAddress });
        }
        return null;
    }
}

// ==================== CONVENIENCE METHODS ====================

/**
 * Quick VPN/Proxy/Tor check. Returns true if suspicious.
 * Used by fraud detection and login security.
 */
export async function isVPNOrProxy(ipAddress: string): Promise<boolean> {
    const info = await getIPInfo(ipAddress);
    if (!info?.privacy) return false;
    return !!(info.privacy.vpn || info.privacy.proxy || info.privacy.tor);
}

/**
 * Get country code for an IP address.
 * Returns "XX" if unknown.
 */
export async function getCountry(ipAddress: string): Promise<string> {
    const info = await getIPInfo(ipAddress);
    return info?.geo.country || "XX";
}

/**
 * Get city + region string for an IP address.
 */
export async function getLocation(
    ipAddress: string,
): Promise<{ city: string; region: string; country: string }> {
    const info = await getIPInfo(ipAddress);
    return {
        city: info?.geo.city || "Unknown",
        region: info?.geo.region || "Unknown",
        country: info?.geo.country || "XX",
    };
}

/**
 * Check if two IPs are from the same country.
 * Useful for detecting login location anomalies.
 */
export async function isSameCountry(
    ip1: string,
    ip2: string,
): Promise<boolean> {
    const [country1, country2] = await Promise.all([
        getCountry(ip1),
        getCountry(ip2),
    ]);
    return country1 === country2 && country1 !== "XX";
}

/**
 * Calculate distance between two IPs in kilometers.
 * Uses Haversine formula on lat/lng from geolocation.
 * Returns -1 if either IP can't be located.
 */
export async function getDistanceBetweenIPs(
    ip1: string,
    ip2: string,
): Promise<number> {
    const [info1, info2] = await Promise.all([getIPInfo(ip1), getIPInfo(ip2)]);

    if (!info1?.geo.loc || !info2?.geo.loc) return -1;

    const coords1 = info1.geo.loc.split(",").map(Number);
    const coords2 = info2.geo.loc.split(",").map(Number);

    return haversineDistance(coords1[0] ?? 0, coords1[1] ?? 0, coords2[0] ?? 0, coords2[1] ?? 0);
}

// ==================== BATCH LOOKUP ====================

/**
 * Lookup multiple IPs in batch. Uses cache first, then API for misses.
 * Useful for admin dashboards showing user locations.
 */
export async function batchLookup(
    ips: string[],
): Promise<Map<string, IPFullInfo | null>> {
    const results = new Map<string, IPFullInfo | null>();
    const uncached: string[] = [];

    // Filter out private IPs first
    const publicIps = ips.filter((ip) => !isPrivateIP(ip));
    for (const ip of ips) {
        if (isPrivateIP(ip)) {
            results.set(ip, null);
        }
    }

    if (publicIps.length > 0) {
        let cachedValues: (string | null)[] = [];
        try {
            const keys = publicIps.map((ip) => `ipinfo:${ip}`);
            cachedValues = await redis.mget(...keys);
        } catch (err) {
            logger.warn("[IPInfo] redis.mget failed, treating all public IPs as uncached", err);
            cachedValues = new Array(publicIps.length).fill(null);
        }

        publicIps.forEach((ip, idx) => {
            const cached = cachedValues[idx];
            if (cached) {
                try {
                    const parsed = JSON.parse(cached) as IPFullInfo;
                    results.set(ip, { ...parsed, cached: true });
                } catch {
                    uncached.push(ip);
                }
            } else {
                uncached.push(ip);
            }
        });
    }

    // Fetch uncached IPs using IPInfo Batch API
    if (uncached.length > 0) {
        const token = getToken();
        if (token) {
            try {
                // Request both standard geo and privacy data for each IP
                const payload: string[] = [];
                for (const ip of uncached) {
                    payload.push(ip);
                    payload.push(`${ip}/privacy`);
                }

                const response = await fetch(`${IPINFO_BASE_URL}/batch?token=${token}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });

                if (response.ok) {
                    const batchResult = (await response.json()) as Record<string, any>;

                    for (const ip of uncached) {
                        const geo = batchResult[ip] as IPGeoData | undefined;
                        const privacy = batchResult[`${ip}/privacy`] as IPPrivacyData | undefined;

                        if (geo) {
                            const fullInfo: IPFullInfo = {
                                geo,
                                privacy: privacy || null,
                                cached: false,
                            };
                            results.set(ip, fullInfo);

                            // Cache in Redis asynchronously
                            const cacheKey = `ipinfo:${ip}`;
                            redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(fullInfo)).catch((err) => {
                                logger.warn("[IPInfo] Failed to cache batch result", { error: err, ip });
                            });
                        } else {
                            results.set(ip, null);
                        }
                    }
                } else {
                    logger.error("[IPInfo] Batch lookup API failed, falling back to sequential", {
                        status: response.status,
                    });
                    for (const ip of uncached) {
                        const info = await getIPInfo(ip);
                        results.set(ip, info);
                    }
                }
            } catch (err) {
                logger.error("[IPInfo] Batch lookup API request failed, falling back to sequential", err);
                for (const ip of uncached) {
                    const info = await getIPInfo(ip);
                    results.set(ip, info);
                }
            }
        } else {
            logger.error("CRITICAL: IPINFO_TOKEN not configured for batch lookup.");
            for (const ip of uncached) {
                results.set(ip, null);
            }
        }
    }

    return results;
}

// ==================== HELPERS ====================

/**
 * Haversine distance between two lat/lng points in km.
 */
function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}
