import React, { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

type NavItem = { to: string; label: string; end?: boolean };

const navItems: NavItem[] = [
  { to: "/app", label: "Dashboard", end: true },
  { to: "/app/new", label: "New Job" },
  { to: "/app/queue", label: "Queue" },
  { to: "/app/history", label: "History" },
  //{ to: "/app/gallery", label: "Gallery" },
  //{ to: "/app/reports", label: "Reports" },
  { to: "/app/settings", label: "Settings" },
];

type Theme = {
  appBg: string;
  text: string;

  sidebarBg: string;
  sidebarText: string;
  sidebarBorder: string;

  navActiveBg: string;
  navInactiveText: string;
  navActiveText: string;
  navActiveBar: string;

  footerBorder: string;
  footerText: string;
};

function isDashboardPath(pathname: string) {
  return pathname === "/app" || pathname === "/app/";
}

function getTheme(pathname: string): Theme {
  const isDashboard = isDashboardPath(pathname);

  if (isDashboard) {
    return {
      appBg: "#0b0b0f",
      text: "rgba(255,255,255,0.92)",

      sidebarBg: "#0b0b0f",
      sidebarText: "rgba(255,255,255,0.88)",
      sidebarBorder: "transparent",

      navActiveBg: "rgba(255,255,255,0.06)",
      navInactiveText: "rgba(255,255,255,0.70)",
      navActiveText: "rgba(255,255,255,0.92)",
      navActiveBar: "rgba(255,255,255,0.92)",

      footerBorder: "rgba(255,255,255,0.10)",
      footerText: "rgba(255,255,255,0.55)",
    };
  }

  return {
    appBg: "#ffffff",
    text: "#111",

    sidebarBg: "#ffffff",
    sidebarText: "#111",
    sidebarBorder: "rgba(0,0,0,0.08)",

    navActiveBg: "rgba(0,0,0,0.04)",
    navInactiveText: "#444",
    navActiveText: "#111",
    navActiveBar: "#111",

    footerBorder: "rgba(0,0,0,0.08)",
    footerText: "#666",
  };
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const isDashboard = isDashboardPath(pathname);
  const theme = useMemo(() => getTheme(pathname), [pathname]);

  return (
    <div style={shell(theme)}>
      <aside style={sidebar(theme)}>
        <div style={brandWrap}>
          <img src="/logo.png" alt="KidMorph" style={brandLogo} />
          <span style={brandText}>kidmorph</span>
        </div>

        <nav style={nav}>
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              style={({ isActive }) => navLinkStyle(theme, isActive)}
            >
              {({ isActive }) => (
                <>
                  <span style={activeBar(theme, isActive)} />
                  <span style={{ paddingLeft: 10 }}>{it.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ paddingTop: 57, borderTop: `1px solid ${theme.footerBorder}` }} />
      </aside>

      <main style={main(theme, isDashboard)}>
        <div style={contentArea(isDashboard)}>
          {isDashboard ? (
            <Outlet />
          ) : (
            <div style={{ maxWidth: 1100, width: "100%", minWidth: 0 }}>
              <Outlet />
            </div>
          )}
        </div>

        <footer style={footer(theme)}>
          <div>© {new Date().getFullYear()} Team wongeon. All rights reserved.</div>
          <div>KidMorph Studio · Built for graduation project</div>
        </footer>
      </main>
    </div>
  );
}

const shell = (t: Theme): React.CSSProperties => ({
  display: "flex",
  minHeight: "100vh",
  width: "100%",
  background: t.appBg,
  color: t.text,
  transition: "background-color 360ms ease, color 360ms ease",
});

const sidebar = (t: Theme): React.CSSProperties => ({
  width: 240,
  flexShrink: 0,
  padding: 16,
  background: t.sidebarBg,
  color: t.sidebarText,

  borderRightWidth: 1,
  borderRightStyle: "solid",
  borderRightColor: t.sidebarBorder,

  display: "flex",
  flexDirection: "column",

  transition: "background-color 360ms ease, color 360ms ease, border-color 360ms ease",
});


const nav: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
  minHeight: 0,
};

const navLinkStyle = (t: Theme, isActive: boolean): React.CSSProperties => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  textDecoration: "none",
  color: isActive ? t.navActiveText : t.navInactiveText,
  fontWeight: isActive ? 900 : 700,
  background: isActive ? t.navActiveBg : "transparent",
  transition: "background-color 260ms ease, color 260ms ease",
});

const activeBar = (t: Theme, isActive: boolean): React.CSSProperties => ({
  position: "absolute",
  left: 6,
  top: 8,
  bottom: 8,
  width: 3,
  borderRadius: 999,
  background: isActive ? t.navActiveBar : "transparent",
  opacity: isActive ? 1 : 0,
  transition: "opacity 220ms ease",
});

const main = (t: Theme, isDashboard: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowX: "hidden",
  display: "flex",
  flexDirection: "column",

  padding: isDashboard ? 24 : 24,

  background: t.appBg,
  color: t.text,
  transition: "background-color 360ms ease, color 360ms ease",
});

const contentArea = (isDashboard: boolean): React.CSSProperties => ({
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  // ✅ isDashboard를 실제로 소비해서 TS6133 제거 (UI 변화 없음)
  ...(isDashboard ? { padding: 0 } : { padding: 0 }),
});

const footer = (t: Theme): React.CSSProperties => ({
  flexShrink: 0,
  paddingTop: 14,
  paddingLeft: 24,
  paddingRight: 24,
  paddingBottom: 18,

  borderTop: `1px solid ${t.footerBorder}`,

  color: t.footerText,
  fontSize: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",

  transition: "border-color 360ms ease, color 360ms ease",
});

const brandWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const brandLogo: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "block",
  borderRadius: 8,
  objectFit: "contain",
};

const brandText: React.CSSProperties = {
  fontWeight: 1000,
  letterSpacing: -0.2,
  lineHeight: 1,
};