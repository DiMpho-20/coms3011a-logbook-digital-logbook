import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// 1. Core Root Components (src/)
import Dashboard from "./Dashboard";
import Projects from "./Projects";
import EntryBrowser from "./EntryBrowser";

// 2. Component Pages & Layouts (src/components/)
import LandingPage from "./components/LandingPage";
import EntryFormatBuilder from "./components/EntryFormatBuilder";
import LogbookEntryForm from "./components/LogbookEntryForm";
import { ProtectedRoute } from "./components/ProtectedRoute";

// 3. Auth & Settings Pages (src/pages/)
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <BrowserRouter>
      <div style={{ fontFamily: "sans-serif" }}>
        <Routes>
          {/* Public Home / Landing Page */}
          <Route path="/" element={<LandingPage />} />

          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entries"
            element={
              <ProtectedRoute>
                <EntryBrowser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/format-builder"
            element={
              <ProtectedRoute>
                <EntryFormatBuilder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logbook-entry"
            element={
              <ProtectedRoute>
                <LogbookEntryForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
















