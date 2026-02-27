import { NavLink, Outlet } from "react-router-dom";

type NavItem = { to: string; label: string; end?: boolean };

const navItems: NavItem[] = [
  { to: "/app", label: "Dashboard", end: true }, // /app에서만 active
  { to: "/app/new", label: "New Job" },
  { to: "/app/queue", label: "Queue" },
  { to: "/app/history", label: "History" },
  { to: "/app/gallery", label: "Gallery" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/settings", label: "Settings" },
];

export default function AppLayout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          padding: 16,
          borderRight: "1px solid #eee",
          background: "#fff",
        }}
      >
        <div style={{ fontWeight: 1000, marginBottom: 12, letterSpacing: -0.2 }}>
          kidmorph
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              style={({ isActive }) => ({
                position: "relative",
                display: "flex",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 12,
                textDecoration: "none",
                color: isActive ? "#111" : "#444",
                fontWeight: isActive ? 900 : 700,
                background: isActive ? "rgba(0,0,0,0.04)" : "transparent",
                transition: "background 120ms ease, color 120ms ease",
              })}
            >
              {({ isActive }) => (
                <>
                  {/* Left focus bar */}
                  <span
                    style={{
                      position: "absolute",
                      left: 6,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: 999,
                      background: isActive ? "#111" : "transparent",
                      opacity: isActive ? 1 : 0,
                      transition: "opacity 120ms ease",
                    }}
                  />
                  <span style={{ paddingLeft: 10 }}>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24, minWidth: 0, overflowX: "hidden" }}>
        <Outlet />
      </main>
    </div>
  );
}