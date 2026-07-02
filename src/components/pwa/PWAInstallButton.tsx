"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPlatform = "auto" | "ios" | "android";
type InstallVariant = "icon" | "store";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Exclude<InstallPlatform, "auto"> | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (userAgent.includes("android")) return "android";
  return "desktop";
}

function DownloadIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function PhoneIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function getPlatformCopy(platform: InstallPlatform) {
  if (platform === "ios") {
    return {
      title: "Install on iPhone",
      label: "iOS App",
      subtitle: "Add to Home Screen",
      steps: [
        "Open this site in Safari.",
        "Tap the Share button.",
        "Choose Add to Home Screen, then tap Add.",
      ],
    };
  }

  if (platform === "android") {
    return {
      title: "Install on Android",
      label: "Android App",
      subtitle: "Install PWA",
      steps: [
        "Open this site in Chrome.",
        "Tap Install when prompted, or open the browser menu.",
        "Choose Install app or Add to Home screen.",
      ],
    };
  }

  return {
    title: "Install Decisional",
    label: "Install App",
    subtitle: "iOS and Android",
    steps: [
      "On Android, use Chrome's Install app prompt.",
      "On iPhone, open Safari and use Share > Add to Home Screen.",
      "The installed app opens full-screen and works like a mobile app.",
    ],
  };
}

export default function PWAInstallButton({
  className,
  label,
  platform = "auto",
  variant,
  style,
}: {
  className?: string;
  label?: string;
  platform?: InstallPlatform;
  variant?: InstallVariant;
  style?: CSSProperties;
}) {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplay());
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setPromptEvent(null);
      setShowFallback(false);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const resolvedPlatform = platform === "auto" ? detectPlatform() : platform;
  const copy = getPlatformCopy(
    resolvedPlatform === "desktop" ? "auto" : resolvedPlatform,
  );
  const resolvedVariant = variant || (label ? "store" : "icon");

  const install = async () => {
    if (promptEvent && resolvedPlatform !== "ios") {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
          setPromptEvent(null);
          return;
        }
        setShowFallback(true);
      } catch {
        setShowFallback(true);
      }
      return;
    }

    setShowFallback(true);
  };

  return (
    <>
      <button
        type="button"
        className={className || (resolvedVariant === "store" ? "pwa-store-button" : undefined)}
        style={style}
        onClick={install}
        aria-label={label || copy.title}
        title={label || copy.title}
      >
        {resolvedVariant === "icon" ? (
          <DownloadIcon />
        ) : (
          <>
            <span className="pwa-store-button-icon">
              {platform === "ios" || platform === "android" ? (
                <PhoneIcon />
              ) : (
                <DownloadIcon />
              )}
            </span>
            <span className="pwa-store-button-copy">
              <span>{label || copy.label}</span>
              <small>{copy.subtitle}</small>
            </span>
          </>
        )}
      </button>

      {showFallback && (
        <div className="pwa-install-overlay" role="dialog" aria-modal="true">
          <div className="pwa-install-dialog">
            <div className="pwa-install-icon">
              <DownloadIcon />
            </div>
            <h2>{copy.title}</h2>
            <p>
              Decisional is a secure PWA. Install it from the browser and use it
              like a mobile app on your home screen.
            </p>
            <ol className="pwa-install-steps">
              {copy.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="pwa-install-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowFallback(false)}
              >
                Got it
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowFallback(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
