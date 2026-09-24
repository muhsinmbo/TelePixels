import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PatientIntake from './pages/PatientIntake';
import PatientPortal from './pages/PatientPortal';
import PatientList from './pages/PatientList';
import PendingRequests from './pages/PendingRequests';
import StudyUpload from './pages/StudyUpload';
import UltrasoundReportPage from './pages/UltrasoundReportPage';
import ReportingInterface from './pages/ReportingInterface';
import FinalizedReports from './pages/FinalizedReports';
import Analytics from './pages/Analytics';
import DICOMViewerPage from './pages/DICOMViewerPage';
import AdminPortal from './pages/AdminPortal';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';
import BrandLogo from './components/BrandLogo';
import { Menu } from 'lucide-react';
import DevPerspectiveSwitcher from './components/DevPerspectiveSwitcher';
import InactivityTracker from './components/InactivityTracker';
import { cn } from './lib/utils';
import { seedDefaultPricing } from './services/pricingInitialiser';

import EditPatientIntake from './pages/EditPatientIntake';

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

function ProtectedRoute({ children, roles }: { children: React.ReactNode, roles?: string[] }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [isMobileOpen, setIsMobileOpen] = React.useState<boolean>(false);

  const effectiveTheme = profile?.systemTheme || 'cyber';

  React.useEffect(() => {
    if (effectiveTheme === 'teleradiology') {
      document.body.classList.add('theme-teleradiology');
    } else {
      document.body.classList.remove('theme-teleradiology');
    }
  }, [effectiveTheme]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[var(--background)] gap-4 theme-transition">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-primary font-mono animate-pulse">Synchronizing Data...</p>
    </div>
  );
  if (!user || (!profile && !loading)) return <Navigate to="/login" />;
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to="/" />;

  const isViewer = location.pathname === '/viewer';

  const handleSetCollapsed = (val: boolean) => {
    setIsCollapsed(val);
    localStorage.setItem('sidebar_collapsed', String(val));
  };

  return (
    <InactivityTracker timeoutMs={28800000}>
      <div className={cn(
        "flex h-screen overflow-hidden bg-[var(--background)] text-[var(--text-main)] transition-colors duration-300"
      )}>
        <Sidebar 
          isCollapsed={isCollapsed} 
          setIsCollapsed={handleSetCollapsed} 
          isMobileOpen={isMobileOpen} 
          setIsMobileOpen={setIsMobileOpen} 
          isHidden={false} 
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile/Tablet Header Bar */}
          {!isViewer && (
            <header className="md:hidden flex items-center justify-between h-16 px-4 bg-slate-100/5 dark:bg-black/30 backdrop-blur-md border-b border-white/10 shrink-0 z-40 select-none">
              <Link to="/" className="hover:opacity-80 transition-opacity">
                <BrandLogo type="full" className="h-8" />
              </Link>
              <button 
                onClick={() => setIsMobileOpen(true)}
                className="p-2 rounded-xl text-[var(--text-main)] hover:text-[var(--primary)] active:scale-95 transition-all outline-none flex items-center justify-center border border-white/10 bg-white/5 cursor-pointer"
                aria-label="Open navigation menu"
              >
                <Menu size={20} />
              </button>
            </header>
          )}

          <div className={cn(
            "flex-1 flex flex-col min-h-0",
            isViewer ? "p-0 overflow-hidden" : "p-4 md:p-6 lg:p-4 overflow-y-auto"
          )}>
            <div className="h-full flex flex-col w-full">
              {children}
            </div>
          </div>
        </main>
        <DevPerspectiveSwitcher />
      </div>
    </InactivityTracker>
  );
}

export default function App() {
  React.useEffect(() => {
    // Pricing seeding moved to AuthContext to ensure auth is ready
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/portal" element={<PatientPortal />} />
          <Route path="/portal/:mrn/:code" element={<PatientPortal />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/intake" element={
            <ProtectedRoute roles={['receptionist', 'facilityadmin', 'superadmin']}>
              <PatientIntake />
            </ProtectedRoute>
          } />
          
          <Route path="/patients" element={
            <ProtectedRoute>
              <PatientList />
            </ProtectedRoute>
          } />
          
          <Route path="/pending" element={
            <ProtectedRoute roles={['radiographer', 'sonographer', 'facilityadmin', 'superadmin']}>
              <PendingRequests />
            </ProtectedRoute>
          } />
          
          <Route path="/upload/:patientId/:requestId" element={
            <ProtectedRoute roles={['radiographer', 'sonographer', 'facilityadmin', 'superadmin']}>
              <StudyUpload />
            </ProtectedRoute>
          } />
          
          <Route path="/ultrasound-report/:patientId/:requestId" element={
            <ProtectedRoute roles={['sonographer', 'facilityadmin', 'superadmin']}>
              <UltrasoundReportPage />
            </ProtectedRoute>
          } />
          
          <Route path="/reporting" element={
            <ProtectedRoute roles={['radiologist', 'facilityadmin', 'superadmin']}>
              <ReportingInterface />
            </ProtectedRoute>
          } />

          <Route path="/finalized" element={
            <ProtectedRoute roles={['receptionist', 'radiologist', 'sonographer', 'facilityadmin', 'superadmin']}>
              <FinalizedReports />
            </ProtectedRoute>
          } />

          <Route path="/analytics" element={
            <ProtectedRoute roles={['superadmin', 'facilityadmin']}>
              <Analytics />
            </ProtectedRoute>
          } />

          <Route path="/viewer" element={
            <ProtectedRoute roles={['radiologist', 'radiographer', 'facilityadmin', 'superadmin']}>
              <DICOMViewerPage />
            </ProtectedRoute>
          } />

          <Route path="/admin" element={
            <ProtectedRoute roles={['superadmin', 'facilityadmin']}>
              <AdminPortal />
            </ProtectedRoute>
          } />

          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />

          <Route path="/edit-patient/:patientId" element={
            <ProtectedRoute roles={['receptionist', 'facilityadmin', 'superadmin']}>
              <EditPatientIntake />
            </ProtectedRoute>
          } />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
