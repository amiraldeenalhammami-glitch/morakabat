/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import CompleteProfile from './pages/CompleteProfile';
import StudentDashboard from './pages/StudentDashboard';
import BookingPage from './pages/BookingPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import AdminSlots from './pages/AdminSlots';
import AdminStudents from './pages/AdminStudents';
import AdminSettings from './pages/AdminSettings';
import AdminPreview from './pages/AdminPreview';
import PublicLanding from './pages/PublicLanding';
import OfficerDashboard from './pages/OfficerDashboard';

function HomeRedirect() {
  const { isAdmin, isExamOfficer, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (isExamOfficer) {
    return <Navigate to="/officer" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />

          {/* Student Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout>
                <StudentDashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/book" element={
            <ProtectedRoute>
              <Layout>
                <BookingPage />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <Layout>
                <AdminDashboard />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/slots" element={
            <ProtectedRoute adminOnly>
              <Layout>
                <AdminSlots />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/students" element={
            <ProtectedRoute adminOnly>
              <Layout>
                <AdminStudents />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute adminOnly>
              <Layout>
                <AdminSettings />
              </Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/preview" element={
            <ProtectedRoute adminOnly>
              <Layout>
                <AdminPreview />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Exam Officer Dashboard */}
          <Route path="/officer" element={
            <ProtectedRoute officerOnly>
              <Layout>
                <OfficerDashboard />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Default Redirects */}
          <Route path="/" element={<PublicLanding />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
