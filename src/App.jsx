import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MeetingDetail from './pages/MeetingDetail';
import UploadPage from './pages/Upload';
import SearchChat from './pages/SearchChat';
import Settings from './pages/Settings';
import { Upload } from 'lucide-react';

const LayoutWithDashboardActions = () => {
  const navigate = useNavigate();
  return (
    <Layout
      title="Dashboard"
    >
      <button
        onClick={() => navigate('/upload')}
        className="flex items-center gap-2 bg-primary text-black font-semibold py-2 px-4 rounded-lg hover:bg-cyan-400 transition-colors"
      >
        <Upload size={18} />
        Upload Meeting
      </button>
    </Layout>
  );
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AppContent = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        <Route element={<LayoutWithDashboardActions />}>
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
        </Route>
        <Route element={<Layout title="Upload Meeting" />}>
          <Route path="/upload" element={
            <ProtectedRoute>
              <UploadPage />
            </ProtectedRoute>
          } />
        </Route>
        <Route element={<Layout title="Search & Chat" />}>
          <Route path="/search" element={
            <ProtectedRoute>
              <SearchChat />
            </ProtectedRoute>
          } />
        </Route>
        <Route element={<Layout title="Settings" />}>
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
        </Route>
        <Route element={<Layout title="Meeting Details" />}>
          <Route path="/meetings/:id" element={
            <ProtectedRoute>
              <MeetingDetail />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
