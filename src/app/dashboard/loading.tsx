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
        className="sidebar flex flex-col flex-shrink-0 gap-2" style={{ padding: "16px 10px" }}
        aria-hidden="true"
      >
        {/* Logo area */}
        <div className="border-b-card" style={{ padding: "8px 6px 16px", marginBottom: 8 }}>
          <div className="skeleton h-8 w-30 rounded-md" />
        </div>
        {/* Nav links */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="skeleton rounded-md h-10" style={{ opacity: 1 - i * 0.07 }}
          />
        ))}
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar skeleton */}
        <header
          className="glass flex items-center justify-between border-b-card backdrop-blur-lg h-16" style={{ padding: "0 24px" }}
          aria-hidden="true"
        >
          <div>
            <div className="skeleton mb-2 rounded-md h-5 w-30" />
            <div className="skeleton rounded-sm h-3 w-40-px" />
          </div>
          <div className="flex gap-3 items-center">
            <div className="skeleton h-8 w-20 rounded-2xl" />
            <div className="skeleton rounded-full h-9 w-9" />
            <div className="skeleton h-9 w-30 rounded-2xl" />
          </div>
        </header>

        {/* Content area skeleton */}
        <div className="dashboard-content flex-1" aria-hidden="true">
          {/* Stat cards */}
          <div className="grid-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card p-6-px">
                <div className="skeleton mb-3 rounded-sm h-3 w-20" />
                <div className="skeleton mb-2 rounded-md h-9 w-25" />
                <div className="skeleton rounded-sm h-3 w-15" />
              </div>
            ))}
          </div>

          {/* Main chart cards */}
          <div className="grid-2 gap-6">
            <div className="card p-6-px">
              <div className="skeleton mb-4 rounded-md h-4-5 w-35" />
              <div className="skeleton rounded-md" style={{ height: 200 }} />
            </div>
            <div className="card p-6-px">
              <div className="skeleton mb-4 rounded-md h-4-5 w-30" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 items-center mb-4">
                  <div className="skeleton flex-shrink-0 rounded-full w-9 h-9" />
                  <div className="flex-1">
                    <div className="skeleton mb-2 rounded-sm h-3-5" style={{ width: "70%" }} />
                    <div className="skeleton rounded-sm h-3" style={{ width: "40%" }} />
                  </div>
                  <div className="skeleton rounded-sm h-3-5 w-15" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
