"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import Logo from "@/components/Logo";

type AdminFrameProps = {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

const navItems = [
  { icon: "OV", label: "Overview", href: "/admin" },
  { icon: "KY", label: "Verifications", href: "/admin/verifications" },
  { icon: "DR", label: "Disputes", href: "/admin/disputes" },
  { icon: "US", label: "Users", href: "/admin/users" },
  { icon: "PY", label: "Payouts", href: "/admin/payouts" },
];

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "Admin").trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}

export default function AdminFrame({ children, user }: AdminFrameProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="admin-shell">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="admin-sidebar-backdrop"
          onClick={closeSidebar}
        />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="admin-brand">
          <Logo />
          <div className="admin-role-pill">System Administrator</div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-link ${active ? "is-active" : ""}`}
                onClick={closeSidebar}
              >
                <span className="admin-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <Link
            href="/dashboard"
            className="admin-nav-link admin-dashboard-link"
            onClick={closeSidebar}
          >
            <span className="admin-nav-icon" aria-hidden="true">
              DB
            </span>
            <span>Back to Dashboard</span>
          </Link>

          <div className="admin-user-card">
            <div className="admin-user-avatar">{getInitials(user.name, user.email)}</div>
            <div className="admin-user-copy">
              <div className="admin-user-name">{user.name || "Admin"}</div>
              <div className="admin-user-email">{user.email || "Admin access"}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin navigation"
          >
            Menu
          </button>
          <div>
            <div className="admin-topbar-title">Admin Console</div>
            <div className="admin-topbar-subtitle">Live operations workspace</div>
          </div>
        </header>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
