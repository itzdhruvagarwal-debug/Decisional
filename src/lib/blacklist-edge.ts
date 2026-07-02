/**
 * Edge-Compatible Dynamic Blacklisting Checker
 * Uses standard HTTP fetch to query Upstash Redis REST API.
 * This is edge-safe and can run inside Next.js Middleware.
 */

export async function isIpBannedEdge(ip: string): Promise<boolean> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!restUrl || !restToken) {
    // Upstash REST credentials not set. Fall back to false (allow)
    return false;
  }

  try {
    const key = `ban:ip:${ip}`;
    // Query Upstash Redis via HTTP GET
    const response = await fetch(`${restUrl}/get/${key}`, {
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
      // Short timeout (1s) to avoid delaying request pipeline if Redis is slow
      signal: AbortSignal.timeout(1000),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    // Upstash REST returns { result: "value" } or { result: null }
    return data && data.result !== null;
  } catch (_err) {
    // Fail closed in production for security, fail open in development/testing
    if (process.env.NODE_ENV === "production") {
      return true;
    }
    return false;
  }
}
