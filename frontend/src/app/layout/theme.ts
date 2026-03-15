export type Theme = {
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

export function getTheme(pathname: string): Theme {
  const isDashboard = pathname === "/app" || pathname === "/app/";

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