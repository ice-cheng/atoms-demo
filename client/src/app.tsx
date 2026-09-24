import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PublicLayout from './components/PublicLayout';
import DashboardLayout from './components/DashboardLayout';

import HomePage from './pages/HomePage/HomePage';
import LoginPage from './pages/LoginPage/LoginPage';
import RegisterPage from './pages/RegisterPage/RegisterPage';
import DashboardHomePage from './pages/DashboardHomePage/DashboardHomePage';
import NewProjectPage from './pages/NewProjectPage/NewProjectPage';
import ProjectsListPage from './pages/ProjectsListPage/ProjectsListPage';
import ProjectDetailPage from './pages/ProjectDetailPage/ProjectDetailPage';
import TemplatesPage from './pages/TemplatesPage/TemplatesPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import BuildPage from './pages/BuildPage/BuildPage';
import SharePage from './pages/SharePage/SharePage';
import NotFound from './pages/NotFound/NotFound';

const RoutesComponent = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHomePage />} />
          <Route path="new" element={<NewProjectPage />} />
          <Route path="projects" element={<ProjectsListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="build/new" element={<BuildPage />} />
          <Route path="build/:id" element={<BuildPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="share/:token" element={<SharePage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
};

export default RoutesComponent;
