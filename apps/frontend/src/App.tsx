import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { startFullOfflineSync } from "./lib/offlineProjects";

// Auth pages (Athandwa)
import LandingPage from "./components/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Redesigned pages & layout
import AppLayout from "./components/AppLayout";
import LoadingState from "./components/LoadingState";

// Every other page is code-split: it loads when its route is first visited,
// so the initial bundle stays small and the landing page paints fast.
const VerifyEmail = lazy(() => import("./pages/VerifyEmail").then((m) => ({ default: m.VerifyEmail })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage"));
const EntriesPage = lazy(() => import("./pages/EntriesPage"));
const OpenWorkPage = lazy(() => import("./pages/OpenWorkPage"));
const StatsPage = lazy(() => import("./pages/StatsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const BoardPage = lazy(() => import("./pages/BoardPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const RemindersPage = lazy(() => import("./pages/RemindersPage"));
const GradesPage = lazy(() => import("./pages/GradesPage"));
const GradeModulePage = lazy(() => import("./pages/GradeModulePage"));

export default function App() {
  useEffect(() => startFullOfflineSync(), []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingState message="Loading page..." />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />

        {/* Protected app routes with sidebar layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/entries" element={<EntriesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/open-work" element={<OpenWorkPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="/grades" element={<GradesPage />} />
            <Route path="/grades/:moduleId" element={<GradeModulePage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
