import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Box,
  DoorOpen,
  ClipboardList,
  GraduationCap,
  Shield,
  Wrench,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

export type TabType =
  | 'admin-overview'
  | 'room-management'
  | 'work-orders';

interface HeaderProps {
  portalMode: 'student' | 'admin' | 'worker';
  onSwitchPortal: (mode: 'student' | 'admin' | 'worker') => void;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  allInvariantsPass?: boolean;
  onResetChoice: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portalMode,
  onSwitchPortal,
  activeTab,
  onTabChange,
  allInvariantsPass = true,
  onResetChoice,
}) => {
  const { currentUser } = useAuth();
  const twinUrl = (import.meta as any).env?.VITE_TWIN_URL || 'http://localhost:5174';

  const adminNavItems: { id: TabType; label: string; icon: any }[] = [
    { id: 'admin-overview', label: 'Live Database Stats', icon: LayoutDashboard },
    { id: 'work-orders', label: 'Work Orders', icon: ClipboardList },
    { id: 'room-management', label: 'Rooms & Facilities', icon: DoorOpen },
  ];

  const handleBackToTwin = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'NAVIGATE_TWIN' }, '*');
    } else {
      window.location.href = '/';
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 px-5 flex items-center justify-between shrink-0 select-none z-40 shadow-sm">
      {/* Brand & Identity */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Back to 3D Twin Persistent Link */}
        <button
          onClick={handleBackToTwin}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 transition shadow-sm cursor-pointer"
          title="Return to CampusOps 3D Digital Twin"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>← Back to 3D Twin</span>
        </button>

        <div className="h-5 w-px bg-slate-800 mx-1" />

        <div className="flex items-center space-x-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-indigo-950">
            EO
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white font-sans">
                SRM Easwari
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Autonomous
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono -mt-0.5">CampusOps Platform</p>
          </div>
        </div>

        <div className="h-5 w-px bg-slate-800 mx-1" />

        {/* Current Portal Badge */}
        <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
          {portalMode === 'student' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <GraduationCap className="w-3.5 h-3.5" />
              Student & Faculty Portal
            </span>
          ) : portalMode === 'worker' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Wrench className="w-3.5 h-3.5" />
              Worker Portal ({currentUser.name})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Shield className="w-3.5 h-3.5" />
              Admin Operations Portal
            </span>
          )}
        </span>
      </div>

      {/* Center Nav: Only in Admin Mode */}
      {portalMode === 'admin' ? (
        <nav className="hidden md:flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 space-x-1">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      ) : portalMode === 'worker' ? (
        <div className="text-xs text-slate-400 italic hidden md:block">
          Assigned field work orders • Inspect, Hold for Components, or Complete Repairs
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic hidden md:block">
          Simplified maintenance reporting and real-time status assistant
        </div>
      )}

      {/* Right Controls: User Indicator & Logout */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Current User Pill */}
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
            {currentUser.name ? currentUser.name[0] : 'U'}
          </div>
          <div className="text-left text-xs leading-none">
            <span className="text-slate-200 font-medium block">{currentUser.name}</span>
            <span className="text-[10px] text-slate-500 font-mono">{currentUser.role}</span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Logout Button */}
        <button
          onClick={onResetChoice}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-xs font-medium transition"
          title="Logout to Role Selection Screen"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
