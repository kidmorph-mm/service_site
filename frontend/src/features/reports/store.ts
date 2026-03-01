export type ReportFormat = "html" | "pdf";

export type ReportItem = {
  id: string;
  jobId: string;
  format: ReportFormat;
  createdAt: string;
};

const KEY = "kidmorph_reports_v1";
const EVT = "kidmorph:reports";

function readAll(): ReportItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReportItem[];
  } catch {
    return [];
  }
}

function writeAll(items: ReportItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVT));
}

export function createReport(jobId: string, format: ReportFormat): ReportItem {
  const item: ReportItem = {
    id: `rep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    jobId,
    format,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  writeAll([item, ...all]);
  return item;
}

export function listReports(jobId?: string): ReportItem[] {
  const all = readAll();
  return jobId ? all.filter((r) => r.jobId === jobId) : all;
}

import { useEffect, useState } from "react";
export function useReports(jobId?: string) {
  const [items, setItems] = useState<ReportItem[]>(() => listReports(jobId));

  useEffect(() => {
    const sync = () => setItems(listReports(jobId));
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [jobId]);

  return items;
}