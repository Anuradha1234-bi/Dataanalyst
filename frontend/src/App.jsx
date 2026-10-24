import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './layouts/MainLayout';
import { AuthLayout } from './layouts/AuthLayout';

import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { DatasetsPage } from './pages/DatasetsPage';
import { UploadPage } from './pages/UploadPage';
import { ProfilingPage } from './pages/ProfilingPage';
import { DataQualityPage } from './pages/DataQualityPage';
import { CleaningPage } from './pages/CleaningPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AnomaliesPage } from './pages/AnomaliesPage';
import { PredictionPage } from './pages/PredictionPage';
import { InsightsPage } from './pages/InsightsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { VisualizationPage } from './pages/VisualizationPage';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          {/* Protected Application Routes */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Top Primary Navigation */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/datasets" element={<DatasetsPage />} />
            <Route path="/visualize" element={<VisualizationPage />} />
            <Route path="/visualization" element={<VisualizationPage />} />

            {/* DATA Group */}
            <Route path="/profile-data" element={<ProfilingPage />} />
            <Route path="/profiling" element={<ProfilingPage />} />
            <Route path="/data-quality" element={<DataQualityPage />} />
            <Route path="/data-cleaning" element={<CleaningPage />} />
            <Route path="/cleaning" element={<CleaningPage />} />

            {/* ANALYSIS Group */}
            <Route path="/data-analyst" element={<AnalysisPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/ask-analyst" element={<AnalysisPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/predictions" element={<PredictionPage />} />
            <Route path="/prediction" element={<PredictionPage />} />

            {/* OUTPUT Group */}
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/reports" element={<ReportsPage />} />

            {/* SYSTEM Group */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          {/* Root and Fallback redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
