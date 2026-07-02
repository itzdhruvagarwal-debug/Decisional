import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { env } from "@/env";
import { initiateOAuthFlow } from "@/lib/oauth-helper";

async function _handler_GET(req: NextRequest) {
  return initiateOAuthFlow(req, "google", (state, redirectUri) => {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  });
}

// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
