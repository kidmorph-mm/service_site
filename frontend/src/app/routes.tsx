import { createBrowserRouter, Navigate } from "react-router-dom";

import AppLayout from "./layout/AppLayout";

import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import DashboardPage from "../pages/dashboard/DashboardPage";
import NewJobPage from "../pages/jobs/NewJobPage";
import QueuePage from "../pages/jobs/QueuePage";
import HistoryPage from "../pages/jobs/HistoryPage";
import JobDetailPage from "../pages/jobs/JobDetailPage";
import GalleryPage from "../pages/gallery/GalleryPage";
import GallerySamplePage from "../pages/gallery/GallerySamplePage";
import ReportsPage from "../pages/reports/ReportsPage";
import SettingsPage from "../pages/settings/SettingsPage";
import NotFoundPage from "../pages/notfound/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },

  {
    path: "/app",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "new", element: <NewJobPage /> },
      { path: "queue", element: <QueuePage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "jobs/:jobId", element: <JobDetailPage /> },
      { path: "gallery", element: <GalleryPage /> },
      { path: "gallery/:sampleId", element: <GallerySamplePage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "/", element: <Navigate to="/app" replace /> },
  { path: "*", element: <NotFoundPage /> },
]);