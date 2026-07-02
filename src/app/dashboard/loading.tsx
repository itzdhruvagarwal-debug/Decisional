"use client";

/**
 * Dashboard loading skeleton — mirrors the actual dashboard layout so the
 * transition from skeleton → content feels seamless and premium.
 */
export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      {/* Sidebar skeleton */}
      <aside
        style={{
          width: 260,
          background: "var(--color-bg-secondary)",
          borderRight: "1px solid var(--color-border)",
          padding: "16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {/* Logo area */}
        <div style={{ padding: "8px 6px 16px", borderBottom: "1px solid var(--color-border)", marginBottom: 8 }}>
          <div className="skeleton" style={{ height: 32, width: 120, borderRadius: 8 }} />
        </div>
        {/* Nav links */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: 40, borderRadius: "var(--radius-md)", opacity: 1 - i * 0.07 }}
          />
        ))}
      </aside>

      {/* Main area */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Topbar skeleton */}
        <header
          style={{
            height: 64,
            borderBottom: "1px solid var(--color-border)",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(18, 18, 31, 0.85)",
            backdropFilter: "blur(20px)",
          }}
          aria-hidden="true"
        >
          <div>
            <div className="skeleton" style={{ height: 20, width: 120, borderRadius: 6, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 13, width: 160, borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="skeleton" style={{ height: 32, width: 80, borderRadius: 20 }} />
            <div className="skeleton" style={{ height: 36, width: 36, borderRadius: "50%" }} />
            <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 20 }} />
          </div>
        </header>

        {/* Content area skeleton */}
        <div style={{ padding: 24, flex: 1 }} aria-hidden="true">
          {/* Stat cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div className="skeleton" style={{ height: 13, width: 80, borderRadius: 4, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 36, width: 100, borderRadius: 6, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: 60, borderRadius: 4 }} />
              </div>
            ))}
          </div>

          {/* Main chart card */}
          <div className="grid-2" style={{ gap: 24 }}>
            <div className="card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 18, width: 140, borderRadius: 6, marginBottom: 20 }} />
              <div className="skeleton" style={{ height: 200, borderRadius: "var(--radius-md)" }} />
            </div>
            <div className="card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 18, width: 120, borderRadius: 6, marginBottom: 20 }} />
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}
                >
                  <div className="skeleton" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 14, width: "70%", borderRadius: 4, marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 11, width: "40%", borderRadius: 4 }} />
                  </div>
                  <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
