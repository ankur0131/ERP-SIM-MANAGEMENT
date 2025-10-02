import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import './styles/theme.css'; // Import theme variables
import Sidebar from './components/Layout/Sidebar';
import Navbar from './components/Layout/Navbar';
import Dashboard from './pages/Dashboard';
import StudentManagement from './pages/StudentManagement';
import FacultyManagement from './pages/FacultyManagement';
import CourseManagement from './pages/CourseManagement';
import AcademicCalendar from './pages/AcademicCalendar';
import FinanceManagement from './pages/FinanceManagement';
import AttendanceExams from './pages/AttendanceExams';
import LibraryManagement from './pages/LibraryManagement';
import NoticeBoard from './pages/NoticeBoard';
import AnalyticsReports from './pages/AnalyticsReports';
import HelpdeskSupport from './pages/HelpdeskSupport';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { getToken, clearAuth } from './utils/auth';
import { fetchJSON } from './utils/api';

// Role-based login wrapper that uses URL to determine role
const RoleBasedLogin: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;

  if (path.startsWith('/admin')) {
    return <Login />;
  } else if (path.startsWith('/faculty')) {
    // For now, redirect to admin login with faculty styling
    // In a real implementation, you'd have separate components
    return <Login />;
  } else if (path.startsWith('/student')) {
    // For now, redirect to admin login with student styling
    // In a real implementation, you'd have separate components
    return <Login />;
  }

  return <Login />;
};

// Role-based signup wrapper
const RoleBasedSignup: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;

  if (path.startsWith('/admin')) {
    return <Signup />;
  } else if (path.startsWith('/faculty')) {
    return <Signup />;
  } else if (path.startsWith('/student')) {
    return <Signup />;
  }

  return <Signup />;
};

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if current path is an auth screen
  const isAuthScreen = location.pathname === '/login' || location.pathname === '/signup' ||
                     location.pathname.startsWith('/admin') ||
                     location.pathname.startsWith('/faculty') ||
                     location.pathname.startsWith('/student');

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Validate token on load/route change
  useEffect(() => {
    const token = getToken();
    if (!isAuthScreen && token) {
      fetchJSON('/user/me').catch(() => {
        clearAuth();
        navigate('/login', { replace: true });
      });
    }
  }, [isAuthScreen, location.pathname, navigate]);

  return (
    isAuthScreen ? (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/admin" element={<RoleBasedLogin />} />
        <Route path="/admin/*" element={<RoleBasedLogin />} />
        <Route path="/faculty" element={<RoleBasedLogin />} />
        <Route path="/faculty/*" element={<RoleBasedLogin />} />
        <Route path="/student" element={<RoleBasedLogin />} />
        <Route path="/student/*" element={<RoleBasedLogin />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    ) : (
      <div className="flex h-screen bg-gray-100">
        <Sidebar 
          isCollapsed={isSidebarCollapsed} 
          setIsCollapsed={setIsSidebarCollapsed}
          isMobile={isMobile}
          setIsMobileOpen={setIsMobileOpen}
        />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar 
            onMenuClick={() => setIsMobileOpen(!isMobileOpen)}
          />
          <main className="flex-1 overflow-y-auto layout-content">
            <div className="container py-4 md:py-6">
              <Routes>
                <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/students" element={<RequireAuth><StudentManagement /></RequireAuth>} />
                <Route path="/faculty" element={<RequireAuth><FacultyManagement /></RequireAuth>} />
                <Route path="/courses" element={<RequireAuth><CourseManagement /></RequireAuth>} />
                <Route path="/academic-calendar" element={<RequireAuth><AcademicCalendar /></RequireAuth>} />
                <Route path="/finance" element={<RequireAuth><FinanceManagement /></RequireAuth>} />
                <Route path="/attendance" element={<RequireAuth><AttendanceExams /></RequireAuth>} />
                <Route path="/library" element={<RequireAuth><LibraryManagement /></RequireAuth>} />
                <Route path="/notices" element={<RequireAuth><NoticeBoard /></RequireAuth>} />
                <Route path="/analytics" element={<RequireAuth><AnalyticsReports /></RequireAuth>} />
                <Route path="/support" element={<RequireAuth><HelpdeskSupport /></RequireAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    )
  );
}

export default App;

function RequireAuth({ children }: { children: React.ReactElement }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
