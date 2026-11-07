import React, { useState, useEffect } from 'react';
import { useAuth, WORKER_USERS } from '../context/AuthContext';
import { api } from '../api/client';
import {
  Wrench,
  Zap,
  Droplet,
  Wifi,
  HardHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Play,
  RotateCcw,
  RefreshCw,
  MapPin,
  MessageSquare,
  Send,
  X,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  Search,
  Filter,
  Check,
  ArrowUpRight,
  ChevronRight,
  Radio,
  FileText,
  UserCheck,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

interface WorkerDashboardProps {
  onSwitchPortal?: (mode: 'student' | 'admin' | 'worker') => void;
  onResetChoice?: () => void;
}

export const WorkerDashboard: React.FC<WorkerDashboardProps> = ({
  onSwitchPortal,
  onResetChoice,
}) => {
  const { currentUser, switchUser } = useAuth();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'HOLD' | 'RESOLVED'>('ALL');

  // Modal for holding for parts
  const [holdingTicketId, setHoldingTicketId] = useState<string | null>(null);
  const [partHoldReason, setPartHoldReason] = useState('');

  // Modal for communicating with Admin
  const [commTicket, setCommTicket] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [loadingComments, setLoadingComments] = useState<boolean>(false);
  const [submittingComment, setSubmittingComment] = useState<boolean>(false);
  const [commError, setCommError] = useState<string | null>(null);

  // Fetch strictly the current worker's assigned work orders
  const fetchMyWorkOrders = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const techId = currentUser.id || 'usr_karthik';
      const res: any = await api.get(`/work-orders?assigned_tech_id=${techId}&limit=100`);
      if (Array.isArray(res)) {
        setWorkOrders(res);
      } else {
        setWorkOrders([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch worker tickets', err);
      setErrorMsg(err?.message || 'Failed to load assigned work orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyWorkOrders();
    const interval = setInterval(fetchMyWorkOrders, 3000);
    return () => clearInterval(interval);
  }, [currentUser.id]);

  // Execute FSM transition
  const handleTransition = async (
    ticketId: string,
    targetState: 'IN_PROGRESS' | 'BLOCKED_PARTS' | 'RESOLVED',
    notes?: string
  ) => {
    try {
      setActionLoading(ticketId);
      setErrorMsg(null);
      await api.post(`/work-orders/${ticketId}/transitions`, {
        target_state: targetState,
        reason: notes || `Technician ${currentUser.name} updated status to ${targetState}`,
        resolution_notes:
          targetState === 'RESOLVED'
            ? notes || 'Repair completed and verified operational.'
            : undefined,
      });
      setHoldingTicketId(null);
      setPartHoldReason('');
      await fetchMyWorkOrders();
    } catch (err: any) {
      console.error('Transition error:', err);
      setErrorMsg(err?.message || `Failed to transition work order to ${targetState}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Open Communication with Admin
  const openCommModal = async (ticket: any) => {
    setCommTicket(ticket);
    setCommError(null);
    setNewCommentText('');
    try {
      setLoadingComments(true);
      const res: any = await api.get(`/work-orders/${ticket.id}/comments`);
      setComments(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('Failed to load comments:', err);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !commTicket) return;
    try {
      setSubmittingComment(true);
      setCommError(null);
      const res: any = await api.post(`/work-orders/${commTicket.id}/comments`, {
        message: newCommentText.trim(),
      });
      setComments((prev) => [...prev, res]);
      setNewCommentText('');
      fetchMyWorkOrders();
    } catch (err: any) {
      setCommError(err?.message || 'Failed to send comment to admin');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Helper icons for domain
  const getDomainIcon = (domain?: string, className = 'w-4 h-4') => {
    switch (domain) {
      case 'ELECTRICAL':
        return <Zap className={`${className} text-amber-400`} />;
      case 'PLUMBING':
        return <Droplet className={`${className} text-cyan-400`} />;
      case 'NETWORK':
        return <Wifi className={`${className} text-blue-400`} />;
      case 'SOS':
        return <AlertTriangle className={`${className} text-rose-400`} />;
      case 'SWEEPER':
        return <Sparkles className={`${className} text-teal-400`} />;
      case 'STRUCTURAL_SAFETY':
      default:
        return <HardHat className={`${className} text-amber-500`} />;
    }
  };

  const getWorkerInitials = (fullName: string) => {
    const clean = fullName.replace(/^(dr\.|mr\.|mrs\.|er\.|ms\.)\s+/i, '').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (parts[0] || 'W').substring(0, 2).toUpperCase();
  };

  // Computed worker metrics
  const inProgressCount = workOrders.filter((w) => w.state === 'IN_PROGRESS').length;
  const blockedPartsCount = workOrders.filter((w) => w.state === 'BLOCKED_PARTS').length;
  const resolvedCount = workOrders.filter((w) => w.state === 'RESOLVED' || w.state === 'CLOSED').length;
  const pendingAssignedCount = workOrders.filter(
    (w) => w.state === 'ASSIGNED' || w.state === 'TRIAGED'
  ).length;

  // Filtered tickets
  const filteredWorkOrders = workOrders.filter((wo) => {
    if (statusFilter === 'ACTIVE') {
      if (wo.state !== 'ASSIGNED' && wo.state !== 'TRIAGED' && wo.state !== 'IN_PROGRESS') {
        return false;
      }
    } else if (statusFilter === 'HOLD') {
      if (wo.state !== 'BLOCKED_PARTS') return false;
    } else if (statusFilter === 'RESOLVED') {
      if (wo.state !== 'RESOLVED' && wo.state !== 'CLOSED') return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      wo.ticket_number?.toString().includes(q) ||
      wo.node_code?.toLowerCase().includes(q) ||
      wo.node_name?.toLowerCase().includes(q) ||
      wo.raw_description?.toLowerCase().includes(q) ||
      wo.ai_summary?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden text-[#E2E8F0] font-sans antialiased select-none"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(12, 16, 26, 0.54) 0%, rgba(15, 20, 32, 0.64) 100%), url('/campus_worker_bg.jpg')`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: '#0C0F17',
      }}
    >
      {/* =========================================================================
          SECTION A: Unified Navigation Header (Compact, 52px, Structured)
      ========================================================================= */}
      <header className="h-13 border-b border-[#1E2638] bg-[#0C101B]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0 select-none z-30">
        {/* Left: Navigation, Brand Identity & Breadcrumb */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* Back to 3D Twin Button */}
          <button
            onClick={() => {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'NAVIGATE_TWIN' }, '*');
              } else {
                window.location.href = '/';
              }
            }}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 transition shadow-sm cursor-pointer"
            title="Return to CampusOps 3D Digital Twin"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>← Back to 3D Twin</span>
          </button>

          {/* Escape / Switch Role Button */}
          <button
            onClick={() => onResetChoice?.()}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white border border-slate-700 hover:border-amber-500 transition shadow-sm cursor-pointer"
            title="Escape / Switch Role (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>← Switch Role (Esc)</span>
          </button>

          <div className="h-4 w-px bg-[#1E2638]" />

          <div className="flex items-center space-x-2.5">
            <div className="h-7 w-7 rounded bg-[#10B981] flex items-center justify-center font-bold text-white text-xs shadow-sm">
              CO
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-[#F8FAFC]">
                CampusOps
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#161D2E] text-[#94A3B8] border border-[#1E2638]">
                Technician
              </span>
            </div>
          </div>
        </div>

        {/* Center: Live Operational Status Telemetry */}
        <div className="hidden lg:flex items-center space-x-4 text-xs font-mono text-[#808D9E]">
          <span className="flex items-center gap-1.5 text-[#10B981]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-slate-300">Shift Active</span>
          </span>
          <span className="text-[#1E2638]">•</span>
          <span>PostgreSQL 18 Telemetry Connected</span>
          <span className="text-[#1E2638]">•</span>
          <span>Automated Work Orders FSM</span>
        </div>

        {/* Right: Worker Callout & Logout */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* Current Worker Profile */}
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-[#161D2E] border border-[#1E2638] flex items-center justify-center text-xs font-mono font-bold text-[#F8FAFC]">
              {getWorkerInitials(currentUser.name)}
            </div>
            <div className="hidden sm:block text-left text-xs leading-none">
              <span className="text-[#F8FAFC] font-medium block">{currentUser.name}</span>
              <span className="text-[10px] text-[#808D9E] font-mono mt-0.5 block truncate max-w-[140px]">
                {currentUser.title || 'Specialized Technician'}
              </span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#1E2638]" />

          {/* Logout Button */}
          <button
            onClick={() => onResetChoice?.()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#808D9E] hover:text-rose-300 hover:bg-rose-500/10 border border-[#1E2638] hover:border-rose-500/30 text-xs font-medium transition"
            title="Logout to Role Selection Screen"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col justify-between">
        <div className="max-w-7xl w-full mx-auto p-6 space-y-5">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#FCA5A5] text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-xs text-[#808D9E] hover:text-white"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* =========================================================================
              SECTION B: Worker Identity & Operational Briefing Section
          ========================================================================= */}
          <section className="bg-[#121724]/90 backdrop-blur-md border border-[#1E2638] rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start sm:items-center space-x-4">
              {/* Discipline Monogram Badge */}
              <div className="w-12 h-12 rounded-xl bg-[#161D2E] border border-[#1E2638] flex items-center justify-center text-[#10B981] shadow-inner shrink-0">
                {getDomainIcon(currentUser.domain, 'w-6 h-6')}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl font-bold text-[#F8FAFC] tracking-tight">
                    {currentUser.name}
                  </h1>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                    {currentUser.title || 'Senior Campus Specialist'}
                  </span>
                  <span className="text-xs font-mono text-[#808D9E] bg-[#161D2E] px-2 py-0.5 rounded border border-[#1E2638]">
                    {currentUser.domain || 'GENERAL'}
                  </span>
                </div>
                <p className="text-xs text-[#808D9E] mt-1 flex items-center gap-2">
                  <span>{currentUser.dept}</span>
                  <span className="text-[#334155]">•</span>
                  <span>Filtered strictly to your domain dispatch queue</span>
                </p>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={fetchMyWorkOrders}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#161D2E] hover:bg-[#1B2337] border border-[#1E2638] text-xs font-medium text-[#F8FAFC] transition shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#10B981]' : 'text-[#808D9E]'}`} />
                <span>Sync Queue</span>
              </button>
            </div>
          </section>

          {/* =========================================================================
              SECTION C: Specialized Worker Directory (Technician Duty Roster)
          ========================================================================= */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#808D9E]">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#94A3B8]">
                Technician Roster // Select Specialized Domain
              </span>
              <span className="text-[11px]">6 Registered Specialized Units</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {WORKER_USERS.map((worker) => {
                const isSelected = currentUser.email === worker.email;
                return (
                  <button
                    key={worker.email}
                    onClick={() => switchUser(worker)}
                    className={`group text-left p-3 rounded-lg border transition flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-[#182132] border-[#10B981] shadow-md'
                        : 'bg-[#121724]/80 hover:bg-[#161D2E] border-[#1E2638] text-[#808D9E] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-1 rounded bg-[#0C101B] border border-[#1E2638]">
                        {getDomainIcon(worker.domain, 'w-3.5 h-3.5')}
                      </div>
                      {isSelected ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      ) : (
                        <span className="text-[10px] font-mono text-[#475569] group-hover:text-[#808D9E]">
                          {worker.domain?.substring(0, 3)}
                        </span>
                      )}
                    </div>

                    <div>
                      <div
                        className={`text-xs font-semibold truncate ${
                          isSelected ? 'text-[#F8FAFC]' : 'text-[#CBD5E1]'
                        }`}
                      >
                        {worker.name}
                      </div>
                      <div className="text-[10px] text-[#808D9E] truncate font-mono mt-0.5">
                        {worker.domain?.replace('_', ' ')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* =========================================================================
              SECTION D: Operational Overview Ledger (Sophisticated Unified Strip)
          ========================================================================= */}
          <section className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#1E2638] bg-[#121724]/90 backdrop-blur-md border border-[#1E2638] rounded-xl shadow-lg overflow-hidden">
            {/* Stat 1: Assigned */}
            <div className="p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#808D9E]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>AWAITING TRIAGE</span>
                </span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-[#F8FAFC] tracking-tight">
                  {pendingAssignedCount}
                </span>
                <span className="text-xs text-[#808D9E]">ready for inspection</span>
              </div>
            </div>

            {/* Stat 2: In Progress */}
            <div className="p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#808D9E]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  <span>ACTIVE REPAIR</span>
                </span>
                <Play className="w-3.5 h-3.5 text-[#10B981]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-[#10B981] tracking-tight">
                  {inProgressCount}
                </span>
                <span className="text-xs text-[#808D9E]">technician on-site</span>
              </div>
            </div>

            {/* Stat 3: Blocked / Hold */}
            <div className="p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#808D9E]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>PARTS HOLD</span>
                </span>
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-amber-400 tracking-tight">
                  {blockedPartsCount}
                </span>
                <span className="text-xs text-[#808D9E]">awaiting components</span>
              </div>
            </div>

            {/* Stat 4: Resolved */}
            <div className="p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#808D9E]">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>VERIFIED COMPLETE</span>
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold font-mono text-[#F8FAFC] tracking-tight">
                  {resolvedCount}
                </span>
                <span className="text-xs text-[#808D9E]">closed operations</span>
              </div>
            </div>
          </section>

          {/* =========================================================================
              SECTION E: Assigned Work Orders (Professional Field Work Area)
          ========================================================================= */}
          <section className="bg-[#121724]/90 backdrop-blur-md border border-[#1E2638] rounded-xl p-5 shadow-lg space-y-4">
            {/* Header & Filter Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2638] pb-4">
              <div>
                <h2 className="text-base font-bold text-[#F8FAFC] tracking-tight">
                  Assigned Maintenance Orders
                </h2>
                <p className="text-xs text-[#808D9E] mt-0.5">
                  Actionable work tickets assigned directly to {currentUser.name}
                </p>
              </div>

              {/* Filter Tabs & Search */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#808D9E] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search room or details..."
                    className="bg-[#0C101B] border border-[#1E2638] rounded-lg pl-8 pr-3 py-1 text-xs text-[#F8FAFC] placeholder-[#808D9E] focus:outline-none focus:border-[#10B981] w-48 transition"
                  />
                </div>

                {/* Status Segmented Filters */}
                <div className="flex items-center bg-[#0C101B] border border-[#1E2638] rounded-lg p-0.5 text-xs font-mono">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded transition ${
                      statusFilter === 'ALL'
                        ? 'bg-[#1E2638] text-white font-semibold'
                        : 'text-[#808D9E] hover:text-[#F8FAFC]'
                    }`}
                  >
                    All ({workOrders.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-2.5 py-1 rounded transition ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-[#1E2638] text-white font-semibold'
                        : 'text-[#808D9E] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Active ({pendingAssignedCount + inProgressCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('HOLD')}
                    className={`px-2.5 py-1 rounded transition ${
                      statusFilter === 'HOLD'
                        ? 'bg-[#1E2638] text-amber-300 font-semibold'
                        : 'text-[#808D9E] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Hold ({blockedPartsCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('RESOLVED')}
                    className={`px-2.5 py-1 rounded transition ${
                      statusFilter === 'RESOLVED'
                        ? 'bg-[#1E2638] text-teal-300 font-semibold'
                        : 'text-[#808D9E] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Done ({resolvedCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Work Orders List or Refined Empty State */}
            {filteredWorkOrders.length === 0 ? (
              /* Refined Empty State (Occupies only the space it needs) */
              <div className="py-10 px-6 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-[#161D2E] border border-[#1E2638] mx-auto flex items-center justify-center text-[#10B981]">
                  <Check className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#F8FAFC]">No active work orders</h3>
                <p className="text-xs text-[#808D9E] max-w-md mx-auto leading-relaxed">
                  You're all caught up. New maintenance requests assigned to your department will
                  appear here automatically.
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-[#10B981] hover:underline pt-1 inline-block"
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredWorkOrders.map((wo) => {
                  const isActioning = actionLoading === wo.id;
                  const isAssigned = wo.state === 'ASSIGNED' || wo.state === 'TRIAGED';
                  const isInProgress = wo.state === 'IN_PROGRESS';
                  const isBlocked = wo.state === 'BLOCKED_PARTS';
                  const isResolved = wo.state === 'RESOLVED' || wo.state === 'CLOSED';
                  const hasDisruptedClass = Boolean(wo.partial_slots?.disrupted_class);
                  const isCriticalPriority =
                    wo.calculated_priority === 'P0' || wo.calculated_priority === 'P0_CRITICAL';

                  return (
                    <div
                      key={wo.id}
                      className="p-4 rounded-xl bg-[#0D121D]/90 border border-[#1E2638] hover:border-[#273248] transition space-y-3.5 shadow-sm"
                    >
                      {/* Ticket Top Row: ID, Priority, Room, State, and Timestamps */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Ticket Number */}
                          <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/40 px-2.5 py-0.5 rounded border border-blue-800/40">
                            #{wo.ticket_number}
                          </span>

                          {/* Priority Pill */}
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              isCriticalPriority
                                ? 'bg-rose-950/50 text-rose-300 border-rose-800/60'
                                : wo.calculated_priority === 'P1' ||
                                  wo.calculated_priority === 'P1_HIGH'
                                ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                                : 'bg-[#161D2E] text-[#94A3B8] border-[#1E2638]'
                            }`}
                          >
                            {wo.calculated_priority || 'NORMAL'}
                          </span>

                          {/* Room & Building */}
                          <div className="flex items-center gap-1.5 text-xs text-[#F8FAFC] font-semibold pl-1">
                            <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>{wo.node_code || 'General Facility'}</span>
                            {wo.node_name && (
                              <span className="text-[#808D9E] font-normal">
                                ({wo.node_name})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Tag & Timestamp */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span
                            className={`text-[11px] px-2.5 py-0.5 rounded font-mono font-medium border ${
                              isAssigned
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : isInProgress
                                ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/25'
                                : isBlocked
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                                : 'bg-teal-500/10 text-teal-400 border-teal-500/25'
                            }`}
                          >
                            {isAssigned
                              ? 'AWAITING INSPECTION'
                              : isInProgress
                              ? 'UNDER REPAIR'
                              : isBlocked
                              ? 'ON HOLD (PARTS)'
                              : 'RESOLVED'}
                          </span>

                          <span className="text-[10px] font-mono text-[#64748B]">
                            {wo.created_at
                              ? new Date(wo.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </span>
                        </div>
                      </div>

                      {/* Scheduled Class Consequence Warning Banner */}
                      {hasDisruptedClass && (
                        <div className="p-2.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/30 text-xs text-[#FCA5A5] flex items-center gap-2.5">
                          <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0" />
                          <div className="leading-snug">
                            <strong className="text-white">Scheduled Class Blocked:</strong>{' '}
                            {wo.partial_slots.disrupted_class.course_title} in{' '}
                            {wo.partial_slots.disrupted_class.impacted_room_code}. Relocation
                            suggested to{' '}
                            <span className="font-mono text-amber-300 font-bold">
                              {wo.partial_slots.disrupted_class.recommended_room_code}
                            </span>
                            . High priority.
                          </div>
                        </div>
                      )}

                      {/* Admin Message Notification Banner */}
                      {wo.admin_comments_count > 0 && (
                        <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200 flex items-start gap-2.5">
                          <MessageSquare className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="text-white">Admin Communication:</strong>
                              {wo.latest_comment_author_role !== 'TECHNICIAN' && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#10B981] text-black">
                                  New Note
                                </span>
                              )}
                            </div>
                            <p className="text-[#CBD5E1] italic mt-0.5 line-clamp-2">
                              "{wo.latest_comment_message}"
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Problem Description */}
                      <p className="text-xs text-[#CBD5E1] leading-relaxed bg-[#080B12]/60 p-3 rounded-lg border border-[#1A2234]">
                        {wo.ai_summary || wo.raw_description}
                      </p>

                      {/* Hold Reason Alert if Blocked */}
                      {isBlocked && (
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                          <PauseCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            <strong>On Hold:</strong> Waiting for replacement spare parts or inventory approval.
                          </span>
                        </div>
                      )}

                      {/* Action Bar (State transitions & Admin messaging) */}
                      <div className="pt-2 border-t border-[#1E2638] flex flex-wrap items-center justify-between gap-3">
                        {/* Direct Communication with Admin */}
                        <button
                          onClick={() => openCommModal(wo)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            wo.admin_comments_count > 0 &&
                            wo.latest_comment_author_role !== 'TECHNICIAN'
                              ? 'bg-[#2563EB] text-white border-blue-400 font-semibold'
                              : 'bg-[#161D2E] hover:bg-[#1B2337] text-[#CBD5E1] border-[#1E2638]'
                          }`}
                          title="Communicate with Campus Operations Admin"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                          <span>Message Admin {wo.comments_count > 0 ? `(${wo.comments_count})` : ''}</span>
                          {wo.admin_comments_count > 0 &&
                            wo.latest_comment_author_role !== 'TECHNICIAN' && (
                              <span className="relative flex h-2 w-2 ml-0.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                            )}
                        </button>

                        {/* Transition Buttons */}
                        <div className="flex items-center gap-2">
                          {/* Step 1: Assigned -> Start Inspection */}
                          {isAssigned && (
                            <button
                              onClick={() => handleTransition(wo.id, 'IN_PROGRESS')}
                              disabled={isActioning}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Inspection</span>
                            </button>
                          )}

                          {/* Step 2: In Progress -> Hold for Components OR Mark Completed */}
                          {isInProgress && (
                            <>
                              <button
                                onClick={() => setHoldingTicketId(wo.id)}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium transition disabled:opacity-50"
                              >
                                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                                <span>Hold for Parts</span>
                              </button>

                              <button
                                onClick={() => handleTransition(wo.id, 'RESOLVED')}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Completed</span>
                              </button>
                            </>
                          )}

                          {/* Step 3: Blocked Parts -> Resume Work OR Complete */}
                          {isBlocked && (
                            <>
                              <button
                                onClick={() =>
                                  handleTransition(
                                    wo.id,
                                    'IN_PROGRESS',
                                    'Parts received and verified.'
                                  )
                                }
                                disabled={isActioning}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Resume (Parts Received)</span>
                              </button>

                              <button
                                onClick={() => handleTransition(wo.id, 'RESOLVED')}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Completed</span>
                              </button>
                            </>
                          )}

                          {/* Step 4: Resolved */}
                          {isResolved && (
                            <span className="inline-flex items-center gap-1 text-xs text-[#10B981] font-medium font-mono">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Verified Operational</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* =========================================================================
            SECTION F: Pinned Telemetry Status Strip
        ========================================================================= */}
        <footer className="h-7 border-t border-[#1E2638] bg-[#0C101B]/95 px-6 flex items-center justify-between text-[11px] font-mono text-[#808D9E] shrink-0 select-none">
          <div className="flex items-center space-x-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span>Engine: v2.4 Active</span>
            </span>
            <span className="text-[#334155]">|</span>
            <span>Gateway: Connected</span>
            <span className="text-[#334155]">|</span>
            <span>Sector: SRM Easwari Campus Infrastructure</span>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-[10px]">
            <span>Field Technician Console • 100% WCAG AAA</span>
          </div>
        </footer>
      </div>

      {/* =========================================================================
          MODALS: Preserved 100% Functionality
      ========================================================================= */}

      {/* Modal 1: Communication with Admin */}
      {commTicket && (
        <div className="fixed inset-0 z-50 bg-[#0C0F17]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121724] border border-[#1E2638] rounded-xl max-w-xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#1E2638] bg-[#0D121D] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                    Ticket #{commTicket.ticket_number}
                  </span>
                  <span className="text-sm font-bold text-[#F8FAFC]">
                    Message Campus Operations Admin
                  </span>
                </div>
                <p className="text-xs text-[#808D9E] mt-0.5">
                  Send status notes, problem updates, or component requests directly
                </p>
              </div>
              <button
                onClick={() => setCommTicket(null)}
                className="p-1 rounded-lg text-[#808D9E] hover:text-white hover:bg-[#1E2638] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Discussion Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#080B12]/40 min-h-[220px]">
              {loadingComments ? (
                <div className="py-8 text-center text-xs text-[#808D9E] font-mono">
                  Loading communication records...
                </div>
              ) : comments.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#808D9E] italic">
                  No notes or instructions logged yet. Send an update to Admin below.
                </div>
              ) : (
                comments.map((c) => {
                  const isMyMsg = c.author_user_id === currentUser.id;
                  return (
                    <div
                      key={c.id}
                      className={`flex flex-col ${isMyMsg ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#808D9E] mb-1">
                        <span className="font-semibold text-[#CBD5E1]">{c.author_name}</span>
                        <span className="text-[#475569]">({c.author_role})</span>
                        <span>
                          {new Date(c.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`p-3 rounded-lg text-xs max-w-md leading-relaxed border ${
                          isMyMsg
                            ? 'bg-[#10B981]/15 border-[#10B981]/30 text-[#F1F5F9]'
                            : 'bg-[#161D2E] border-[#1E2638] text-[#CBD5E1]'
                        }`}
                      >
                        {c.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Error banner */}
            {commError && (
              <div className="px-4 py-2 bg-[#EF4444]/20 text-[#FCA5A5] text-xs border-t border-[#EF4444]/30">
                {commError}
              </div>
            )}

            {/* Message Input Box */}
            <form
              onSubmit={handleSendComment}
              className="p-3 border-t border-[#1E2638] bg-[#0D121D] flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Type your update, problem details, or question to Admin..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="flex-1 bg-[#080B12] border border-[#1E2638] rounded-lg px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#808D9E] focus:outline-none focus:border-[#10B981]"
              />
              <button
                type="submit"
                disabled={submittingComment || !newCommentText.trim()}
                className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold text-xs transition disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Hold for Components */}
      {holdingTicketId && (
        <div className="fixed inset-0 z-50 bg-[#0C0F17]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121724] border border-[#1E2638] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <PauseCircle className="w-5 h-5" />
              <span>Hold Work Order for Replacement Components</span>
            </div>
            <p className="text-xs text-[#808D9E] leading-relaxed">
              Place this ticket on hold while required replacement parts (breakers, pipes, cables, valves, sanitation supplies) are being procured or allocated.
            </p>

            <div>
              <label className="text-xs text-[#CBD5E1] font-medium block mb-1.5">
                Component / Parts Required Note:
              </label>
              <textarea
                value={partHoldReason}
                onChange={(e) => setPartHoldReason(e.target.value)}
                placeholder="e.g. Awaiting 63A MCCB Breaker from Central Stores..."
                rows={3}
                className="w-full rounded-lg bg-[#080B12] border border-[#1E2638] p-3 text-xs text-[#F8FAFC] placeholder-[#808D9E] focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E2638]">
              <button
                onClick={() => setHoldingTicketId(null)}
                className="px-3 py-1.5 rounded-lg text-[#808D9E] text-xs hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleTransition(
                    holdingTicketId,
                    'BLOCKED_PARTS',
                    partHoldReason || 'Waiting for replacement components.'
                  )
                }
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs shadow-sm transition"
              >
                Confirm Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
