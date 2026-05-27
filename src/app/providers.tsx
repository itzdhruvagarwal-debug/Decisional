"use client";

import { SessionProvider } from "next-auth/react";
import { SecurityProvider } from "@/components/security/SecurityProvider";
import { ErrorBoundary } from "@/components/security/ErrorBoundary";
import PWARegister from "@/components/pwa/PWARegister";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      basePath="/api/auth"
      refetchOnWindowFocus={true}
      refetchInterval={300}
    >
      <ErrorBoundary componentName="RootLayout">
        <SecurityProvider>
          <PWARegister />
          {children}
        </SecurityProvider>
      </ErrorBoundary>
    </SessionProvider>
  );
}
