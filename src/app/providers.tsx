"use client";

import { SessionProvider } from "next-auth/react";
import { SecurityProvider } from "@/components/security/SecurityProvider";
import { ErrorBoundary } from "@/components/security/ErrorBoundary";
import PWARegister from "@/components/pwa/PWARegister";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider
      basePath="/api/auth"
      refetchOnWindowFocus={true}
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
