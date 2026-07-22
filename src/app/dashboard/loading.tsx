"use client";

/**
 * Dashboard loading skeleton — mirrors the actual dashboard layout so the
 * transition from skeleton → content feels seamless and premium.
 */
export default function Loading() {
  return (
    <div className="dashboard-app-shell">
      {/* Sidebar skeleton */}
      <aside
        className="sidebar flex flex-col flex-shrink-0" style={{ padding: "16px 10px", gap: 8 }}
        aria-hidden="true"
      >
        {/* Logo area */}
        <div className="border-b-card" style={{ padding: "8px 6px 16px", marginBottom: 8 }}>
          <div className="skeleton" style={{ height: 32, width: 120, borderRadius: 8 }} />
        </div>
        {/* Nav links */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="skeleton rounded-md" style={{ height: 40, opacity: 1 - i * 0.07 }}
          />
        ))}
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Topbar skeleton */}
        <header
          className="glass flex items-center justify-between border-b-card backdrop-blur-lg" style={{ height: 64, padding: "0 24px" }}
          aria-hidden="true"
        >
          <div>
            <div className="skeleton mb-2 rounded-md" style={{ height: 20, width: 120 }} />
            <div className="skeleton rounded-sm" style={{ height: 13, width: 160 }} />
          </div>
          <div className="flex gap-3 items-center">
            <div className="skeleton" style={{ height: 32, width: 80, borderRadius: 20 }} />
            <div className="skeleton rounded-full" style={{ height: 36, width: 36 }} />
            <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 20 }} />
          </div>
        </header>

        {/* Content area skeleton */}
        <div className="dashboard-content flex-1" aria-hidden="true">
          {/* Stat cards */}
          <div className="grid-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card" style={{ padding: 24 }}>
                <div className="skeleton mb-3 rounded-sm" style={{ height: 13, width: 80 }} />
                <div className="skeleton mb-2 rounded-md" style={{ height: 36, width: 100 }} />
                <div className="skeleton rounded-sm" style={{ height: 11, width: 60 }} />
              </div>
            ))}
          </div>

          {/* Main chart cards */}
          <div className="grid-2 gap-6">
            <div className="card" style={{ padding: 24 }}>
              <div className="skeleton mb-4 rounded-md" style={{ height: 18, width: 140 }} />
              <div className="skeleton rounded-md" style={{ height: 200 }} />
            </div>
            <div className="card" style={{ padding: 24 }}>
              <div className="skeleton mb-4 rounded-md" style={{ height: 18, width: 120 }} />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 items-center mb-4">
                  <div className="skeleton flex-shrink-0 rounded-full" style={{ width: 36, height: 36 }} />
                  <div className="flex-1">
                    <div className="skeleton mb-2 rounded-sm" style={{ height: 14, width: "70%" }} />
                    <div className="skeleton rounded-sm" style={{ height: 11, width: "40%" }} />
                  </div>
                  <div className="skeleton rounded-sm" style={{ height: 14, width: 60 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
