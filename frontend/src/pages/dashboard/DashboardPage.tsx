import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listJobs } from "../../features/jobs/backendApi";

export default function DashboardPage() {
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: listJobs,
    refetchInterval: 1500,
  });

  const latestId = (jobs[0] as any)?.id as string | undefined;

  return (
    <div style={wrap}>
      <Backdrop />

      <div style={stage}>
        <div style={center}>
          <div style={headline}>KidMorph Studio</div>

          <div style={lead}>
            성인 데이터를 기반으로 <b>어린이 체형(Child)으로 변환</b>하고,
            <br />
            <b>비교·리포트</b>까지 한 곳에서 관리합니다.
          </div>

          <div style={ctaRow}>
            <Link to="/app/new" style={primaryBtn}>
              시작하기
            </Link>
          </div>

          {latestId && (
            <div style={tinyRow}>
              <Link to={`/app/jobs/${latestId}`} style={tinyLink}>
                최근 작업 열기
              </Link>
            </div>
          )}

          <div style={hint}>입력 → 변환 → 3D 비교 → 리포트</div>
        </div>
      </div>
    </div>
  );
}

function Backdrop() {
  const blobs = useMemo(
    () => [
      { size: 680, x: 8, y: 8, c1: "rgba(120,92,255,0.18)", c2: "rgba(42,226,255,0.12)", dur: 30 },
      { size: 820, x: 52, y: 14, c1: "rgba(255,92,200,0.12)", c2: "rgba(120,92,255,0.10)", dur: 36 },
      { size: 720, x: 72, y: 62, c1: "rgba(42,226,255,0.10)", c2: "rgba(180,255,120,0.08)", dur: 32 },
    ],
    []
  );

  return (
    <div aria-hidden style={bgRoot}>
      <div style={blobLayer}>
        {blobs.map((b, i) => (
          <span
            key={i}
            style={{
              ...blob,
              width: b.size,
              height: b.size,
              left: `${b.x}%`,
              top: `${b.y}%`,
              animationDuration: `${b.dur}s`,
              background: `radial-gradient(circle at 30% 30%, ${b.c1}, transparent 60%),
                           radial-gradient(circle at 70% 70%, ${b.c2}, transparent 62%)`,
            }}
          />
        ))}
      </div>

      <MorphRibbon />

      <div style={grid} />
      <div style={noise} />
      <div style={vignette} />

      <style>{css}</style>
    </div>
  );
}

function MorphRibbon() {
  return (
    <svg style={ribbonSvg} viewBox="0 0 1000 600" preserveAspectRatio="none">
      <defs>
        <linearGradient id="kmStroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(120,92,255,0.00)" />
          <stop offset="0.25" stopColor="rgba(120,92,255,0.28)" />
          <stop offset="0.55" stopColor="rgba(42,226,255,0.22)" />
          <stop offset="0.80" stopColor="rgba(255,92,200,0.20)" />
          <stop offset="1" stopColor="rgba(255,92,200,0.00)" />
        </linearGradient>

        <filter id="kmGlow">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 60 420 C 220 260, 330 520, 520 340 S 760 210, 940 280"
        fill="none"
        stroke="url(#kmStroke)"
        strokeWidth="2.2"
        strokeLinecap="round"
        filter="url(#kmGlow)"
        style={{ ...ribbonPath, animationDuration: "6.5s" }}
      />

      <path
        d="M 80 460 C 260 320, 360 560, 560 380 S 780 240, 960 310"
        fill="none"
        stroke="url(#kmStroke)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.65"
        filter="url(#kmGlow)"
        style={{ ...ribbonPath, animationDuration: "8.5s" }}
      />
    </svg>
  );
}

const wrap: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  isolation: "isolate",
};

const stage: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  height: "100%",
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 24px",
};

const center: React.CSSProperties = {
  maxWidth: 760,
  textAlign: "center",
  color: "rgba(255,255,255,0.92)",
  textShadow: "0 10px 30px rgba(0,0,0,0.55)",
};

const headline: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 1100,
  letterSpacing: -0.5,
};

const lead: React.CSSProperties = {
  marginTop: 12,
  fontSize: 14,
  lineHeight: 1.65,
  color: "rgba(255,255,255,0.72)",
};

const ctaRow: React.CSSProperties = {
  marginTop: 18,
  display: "flex",
  justifyContent: "center",
};

const hint: React.CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  color: "rgba(255,255,255,0.46)",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.92)",
  color: "#0b0b0f",
  textDecoration: "none",
  fontWeight: 1000,
  fontSize: 12,
  display: "inline-block",
  backdropFilter: "blur(10px)",
};

const tinyRow: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "center",
};

const tinyLink: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.55)",
  textDecoration: "none",
  borderBottom: "1px solid rgba(255,255,255,0.18)",
  paddingBottom: 2,
};

const bgRoot: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  WebkitMaskImage:
    "radial-gradient(85% 85% at 55% 35%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)",
  maskImage:
    "radial-gradient(85% 85% at 55% 35%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)",
};

const blobLayer: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 1,
};

const blob: React.CSSProperties = {
  position: "absolute",
  borderRadius: 999,
  filter: "blur(70px)",
  transform: "translateZ(0)",
  animationName: "km-blob-drift",
  animationTimingFunction: "ease-in-out",
  animationIterationCount: "infinite",
  willChange: "transform",
  mixBlendMode: "normal",
};

const ribbonSvg: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0.8,
  mixBlendMode: "screen",
};

const ribbonPath: React.CSSProperties = {
  strokeDasharray: "10 14",
  animationName: "km-dash",
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
};

const grid: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0.06,
  background:
    "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
  backgroundSize: "80px 80px",
  transform: "translateZ(0)",
  mixBlendMode: "overlay",
};

const noise: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0.018,
  background:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 6px)," +
    "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 9px)",
  mixBlendMode: "overlay",
};

const vignette: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(75% 65% at 55% 30%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.30) 60%, rgba(0,0,0,0.86) 100%)",
};

const css = `
@keyframes km-blob-drift {
  0%   { transform: translate3d(-10px, -12px, 0) scale(1.0); }
  45%  { transform: translate3d(18px, 10px, 0)  scale(1.05); }
  70%  { transform: translate3d(-6px, 18px, 0)  scale(0.98); }
  100% { transform: translate3d(-10px, -12px, 0) scale(1.0); }
}

@keyframes km-dash {
  0%   { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -120; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
` as const;