import type { NextAuthConfig } from "next-auth";

export const authConfig = {
    basePath: "/api/auth",
    trustHost: true,
    pages: {
        signIn: "/login",
        error: "/login",
    },
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token }) {
            return token;
        },
        async session({ session, token }) {
            if (token) {
                session.user.id = token.id as string;
                (session.user as any).userType = token.userType;
                (session.user as any).status = token.status;
                (session.user as any).trustScore = token.trustScore;
                (session.user as any).ip = token.ip;
            }
            return session;
        },
        async authorized({ auth: _session }) {
            return true;
        },
    },
    providers: [],
    cookies: {
        sessionToken: {
            name:
                process.env.NODE_ENV === "production"
                    ? "__Secure-authjs.session-token"
                    : "authjs.session-token",
            options: {
                httpOnly: true,
                sameSite: "lax" as const,
                path: "/",
                secure: process.env.NODE_ENV === "production",
            },
        },
    },
} satisfies NextAuthConfig;
