import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth, SEEDED_USERS, WORKER_USERS } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Header, TabType } from './components/Header';
import { StudentDashboard } from './views/StudentDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import { WorkerDashboard } from './views/WorkerDashboard';
import { RoomManagementView } from './views/RoomManagementView';
import { WorkOrdersView } from './views/WorkOrdersView';
import { api } from './api/client';
import { GraduationCap, Shield, ArrowRight, Sparkles, Wrench, HardHat } from 'lucide-react';

export const AppContent: React.FC = () => {
  const [portalMode, setPortalMode] = useState<'student' | 'admin' | 'worker' | null>(() => {
    return (localStorage.getItem('campusops_portal_mode') as 'student' | 'admin' | 'worker') || null;
  });
  const [activeTab, setActiveTab] = useState<TabType>('admin-overview');
  const { currentUser, switchUser } = useAuth();

  const handleSelectPortal = async (mode: 'student' | 'admin' | 'worker') => {
    setPortalMode(mode);
    localStorage.setItem('campusops_portal_mode', mode);
    if (mode === 'student') {
      await switchUser(SEEDED_USERS[1]); // student_1@easwari.edu
    } else if (mode === 'worker') {
      await switchUser(WORKER_USERS[0]); // tech_elec_1@easwari.edu (Karthik Subramanian)
    } else {
      await switchUser(SEEDED_USERS[0]); // sys_admin_1@easwari.edu (Anand Natarajan)
    }
  };

  const handleResetChoice = () => {
    setPortalMode(null);
    localStorage.removeItem('campusops_portal_mode');
  };

  // If no portal is selected yet, show the Role Selection Screen
  if (!portalMode) {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 overflow-y-auto">
        {/* Top Header */}
        <div className="max-w-6xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-950">
              EO
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                SRM Easwari Engineering College
              </h2>
              <p className="text-xs text-slate-400 font-mono">Autonomous • Ramapuram, Chennai</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'NAVIGATE_TWIN' }, '*');
                } else {
                  window.location.href = '/';
                }
              }}
              className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              title="Return to 3D Digital Twin"
            >
              <span>← Back to 3D Twin</span>
            </button>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 font-mono">
              CampusOps 1.0
            </span>
          </div>
        </div>

        {/* Central Selection Hero */}
        <div className="max-w-6xl w-full mx-auto my-auto py-8 text-center space-y-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Campus Incident & Operations Platform</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Welcome to CampusOps
            </h1>
            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto">
              Please select your role to proceed to your tailored campus dashboard.
            </p>
          </div>

          {/* 3 Role Cards with Clean Professional Campus Imagery */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* 1. Student & Faculty Card */}
            <div
              onClick={() => handleSelectPortal('student')}
              className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/70 p-6 shadow-xl hover:shadow-2xl transition duration-300 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="h-44 w-full rounded-xl overflow-hidden relative border border-slate-800">
                  <img
                    src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80"
                    alt="Classroom students"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-indigo-600 text-white shadow-md">
                      <GraduationCap className="w-5 h-5" />
                    </span>
                    <span className="text-sm font-bold text-white">Student / Faculty</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition">
                    Student & Faculty Portal
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Witnessed a broken fan, power spark, water leak, or Wi-Fi outage? Report it directly via natural AI chat or structured form.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-indigo-400 text-xs font-bold group-hover:text-indigo-300">
                <span>Enter Student Portal</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* 2. Maintenance Personnel / Worker Card */}
            <div
              onClick={() => handleSelectPortal('worker')}
              className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/70 p-6 shadow-xl hover:shadow-2xl transition duration-300 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="h-44 w-full rounded-xl overflow-hidden relative border border-slate-800">
                  <img
                    src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80"
                    alt="Maintenance technician and electrician at work"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-amber-600 text-white shadow-md">
                      <Wrench className="w-5 h-5" />
                    </span>
                    <span className="text-sm font-bold text-white">Maintenance Worker</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition">
                    Worker & Technician Portal
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Dedicated workspace for specialized technicians (Electrician, Plumber, HVAC, Network, AV, Safety). View only assigned jobs, investigate, hold for parts, or mark complete.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-amber-400 text-xs font-bold group-hover:text-amber-300">
                <span>Enter Worker Portal</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
              </div>
            </div>

            {/* 3. Admin & Operations Card */}
            <div
              onClick={() => handleSelectPortal('admin')}
              className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/70 p-6 shadow-xl hover:shadow-2xl transition duration-300 flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="h-44 w-full rounded-xl overflow-hidden relative border border-slate-800">
                  <img
                    src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80"
                    alt="Engineering Lab and Facility Operations"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-emerald-600 text-white shadow-md">
                      <Shield className="w-5 h-5" />
                    </span>
                    <span className="text-sm font-bold text-white">Administration</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition">
                    Admin Operations Portal
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    View real non-simulated database statistics, manage campus work orders, and coordinate room schedules.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-emerald-400 text-xs font-bold group-hover:text-emerald-300">
                <span>Enter Admin Operations</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="max-w-6xl w-full mx-auto text-center py-3 text-xs text-slate-500 font-mono">
          SRM Easwari Engineering College • Intelligent Campus Operations & Consequence Platform
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans bg-slate-950 text-slate-100 select-none">
      {/* Top Header */}
      {portalMode !== 'student' && portalMode !== 'worker' && (
        <Header
          portalMode={portalMode}
          onSwitchPortal={handleSelectPortal}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onResetChoice={handleResetChoice}
        />
      )}

      {/* Primary Workspace */}
      <main className="flex-1 w-full overflow-hidden flex flex-col bg-[#0B0F19] min-h-0">
        {portalMode === 'student' ? (
          <StudentDashboard
            onSwitchPortal={handleSelectPortal}
            onResetChoice={handleResetChoice}
          />
        ) : portalMode === 'worker' ? (
          <WorkerDashboard
            onSwitchPortal={handleSelectPortal}
            onResetChoice={handleResetChoice}
          />
        ) : (
          <>
            {activeTab === 'admin-overview' && <AdminDashboard />}
            {activeTab === 'work-orders' && <WorkOrdersView />}
            {activeTab === 'room-management' && <RoomManagementView />}
          </>
        )}
      </main>

      {/* Persistent Status Bar */}
      {portalMode !== 'student' && portalMode !== 'worker' && (
        <footer className="h-7 border-t border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0 z-30">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
              <span>PostgreSQL 18: Connected</span>
            </div>

            <div className="h-3 w-px bg-slate-800" />

            <div className="flex items-center space-x-1.5 text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <span>SRM Easwari Digital Twin (13.0324° N, 80.1810° E)</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-slate-400">
              Campus Operations Engine: <strong className="text-emerald-400">Active</strong>
            </span>
          </div>
        </footer>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
