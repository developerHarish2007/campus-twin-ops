import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  ClipboardList,
  Search,
  MessageSquare,
  Play,
  CheckCircle,
  Pause,
  Wrench,
  Clock,
  User,
  Mail,
  Briefcase,
  Shield,
  ArrowRight,
  Send,
  X,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

const ROLE_BADGES: Record<string, { label: string; icon: string; color: string }> = {
  ELECTRICAL: { label: 'Electrician', icon: '⚡', color: 'bg-[#ec9665]/20 text-[#f4aa7f] border-[#ec9665]/40' },
  PLUMBING: { label: 'Plumber', icon: '🔧', color: 'bg-[#9c6c4c]/25 text-[#d8bca4] border-[#9c6c4c]/45' },
  NETWORK: { label: 'Network Eng', icon: '🌐', color: 'bg-[#523624]/60 text-[#d8bca4] border-[#9c6c4c]/50' },
  STRUCTURAL_SAFETY: { label: 'Safety/Carpenter', icon: '🔨', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  SOS: { label: 'SOS Medical/Emergency', icon: '🚨', color: 'bg-rose-500/25 text-rose-300 border-rose-500/50' },
  SWEEPER: { label: 'Sweeper / Cleaning', icon: '🧹', color: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
};

export const WorkOrdersView: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser.role === 'SYS_ADMIN' || currentUser.role === 'FACILITIES_ADMIN';

  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [clarifyText, setClarifyText] = useState('');
  const [isSubmittingClarify, setIsSubmittingClarify] = useState(false);
  const [transitionStatus, setTransitionStatus] = useState<string | null>(null);
  const [quickIntakeText, setQuickIntakeText] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  const handleQuickIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIntakeText.trim()) return;
    try {
      setIsSubmittingQuick(true);
      await api.post('/intake', {
        text: quickIntakeText.trim(),
        channel: 'WORK_ORDERS_LEDGER',
      });
      setQuickIntakeText('');
      fetchWorkOrders();
    } catch (err: any) {
      alert(`Intake failed: ${err.message || 'Error'}`);
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      const data: any = await api.get('/work-orders');
      setWorkOrders(data);
      if (selectedTicket) {
        const updated = data.find((w: any) => w.id === selectedTicket.id);
        if (updated) setSelectedTicket(updated);
      } else if (data.length > 0) {
        setSelectedTicket(data[0]);
      } else {
        setSelectedTicket(null);
      }
    } catch (err) {
      console.error('Failed to fetch work orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkOrders();
    const interval = setInterval(fetchWorkOrders, 3000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleTransition = async (targetState: string, reason: string) => {
    if (!selectedTicket) return;
    try {
      setTransitionStatus(null);
      await api.post(`/work-orders/${selectedTicket.id}/transition`, {
        target_state: targetState,
        reason: reason,
        resolution_notes: targetState === 'RESOLVED' ? 'Repairs completed and operational tests verified.' : undefined,
      });
      setTransitionStatus(`Ticket state updated to ${targetState}`);
      fetchWorkOrders();
    } catch (err: any) {
      setTransitionStatus(`Transition failed: ${err.message || 'FSM rule constraint'}`);
    }
  };

  const handleClarifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !clarifyText.trim()) return;
    try {
      setIsSubmittingClarify(true);
      await api.post(`/intake/${selectedTicket.conversation_thread_id}/clarify`, {
        reply_text: clarifyText,
      });
      setClarifyText('');
      fetchWorkOrders();
    } catch (err: any) {
      alert(`Clarification failed: ${err.message || 'Error'}`);
    } finally {
      setIsSubmittingClarify(false);
    }
  };

  const filteredTickets = workOrders.filter((wo) => {
    const matchesState = filterState === 'ALL' || wo.state === filterState;
    const matchesSearch =
      wo.ticket_number?.toString().includes(searchQuery) ||
      (wo.node_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.raw_description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.assigned_tech_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesState && matchesSearch;
  });

  const getStatusDot = (state: string) => {
    switch (state) {
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-[#f4aa7f] shadow-[0_0_8px_#f4aa7f]';
      case 'ASSIGNED':
        return 'bg-[#ec9665] shadow-[0_0_8px_#ec9665]';
      case 'IN_PROGRESS':
        return 'bg-[#d8bca4] shadow-[0_0_8px_#d8bca4]';
      case 'BLOCKED_PARTS':
        return 'bg-[#9c6c4c] shadow-[0_0_8px_#9c6c4c]';
      case 'AWAITING_CLARIFICATION':
        return 'bg-amber-400 shadow-[0_0_8px_#f59e0b]';
      case 'MERGED_DUPLICATE':
        return 'bg-[#5f493b]';
      default:
        return 'bg-[#ec9665]';
    }
  };

  const getStateBadge = (state: string) => {
    switch (state) {
      case 'TRIAGED':
        return 'bg-[#ec9665]/15 text-[#f4aa7f] border-[#ec9665]/30';
      case 'ASSIGNED':
        return 'bg-[#ec9665]/25 text-[#f4aa7f] border-[#ec9665]/50 font-bold';
      case 'IN_PROGRESS':
        return 'bg-[#9c6c4c]/30 text-[#d8bca4] border-[#9c6c4c]/50';
      case 'BLOCKED_PARTS':
        return 'bg-[#523624]/70 text-[#f4aa7f] border-[#9c6c4c]/40';
      case 'AWAITING_CLARIFICATION':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
      case 'MERGED_DUPLICATE':
        return 'bg-[#5f493b]/40 text-[#d8bca4]/60 border-[#5f493b]';
      case 'RESOLVED':
        return 'bg-[#ec9665]/30 text-white border-[#ec9665]/60 font-bold';
      default:
        return 'bg-[#523624] text-[#d8bca4] border-[#9c6c4c]/30';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'P0_CRITICAL':
        return 'bg-rose-500/25 text-rose-200 border-rose-500/50 font-bold shadow-[0_0_10px_rgba(244,63,94,0.25)]';
      case 'P1_HIGH':
        return 'bg-[#ec9665]/25 text-[#f4aa7f] border-[#ec9665]/40 font-bold';
      case 'P2_MEDIUM':
        return 'bg-[#9c6c4c]/20 text-[#d8bca4] border-[#9c6c4c]/35';
      default:
        return 'bg-[#523624]/40 text-[#d8bca4]/70 border-[#9c6c4c]/30';
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent text-[#d8bca4] overflow-hidden">
      {/* Top Ledger Context Filter Strip (Glassmorphism) */}
      <div className="h-12 border-b border-[#9c6c4c]/30 bg-[#24160f]/75 backdrop-blur-md px-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-4 h-4 text-[#ec9665]" />
            <h1 className="text-xs font-bold uppercase tracking-wider text-[#f4aa7f] font-mono">
              Work Order Operational Ledger
            </h1>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-[#ec9665]/15 text-[#f4aa7f] border border-[#ec9665]/30">
            {workOrders.length} Records
          </span>
        </div>

        {/* Search & State Filter Controls with Spring Behavior */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#9c6c4c] absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search ticket, room, trade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input rounded-md px-2.5 pl-8 py-1 text-xs placeholder-[#9c6c4c] focus:outline-none font-mono w-56 shadow-inner"
            />
          </div>

          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="glass-input rounded-md px-2.5 py-1 text-xs text-[#d8bca4] focus:outline-none font-mono cursor-pointer"
          >
            <option value="ALL" className="bg-[#180f0a] text-[#d8bca4]">All States ({workOrders.length})</option>
            <option value="TRIAGED" className="bg-[#180f0a] text-[#d8bca4]">Triaged</option>
            <option value="ASSIGNED" className="bg-[#180f0a] text-[#d8bca4]">Assigned</option>
            <option value="IN_PROGRESS" className="bg-[#180f0a] text-[#d8bca4]">In Progress</option>
            <option value="BLOCKED_PARTS" className="bg-[#180f0a] text-[#d8bca4]">Blocked on Parts</option>
            <option value="AWAITING_CLARIFICATION" className="bg-[#180f0a] text-[#d8bca4]">Awaiting Clarification</option>
            <option value="MERGED_DUPLICATE" className="bg-[#180f0a] text-[#d8bca4]">Merged Duplicate</option>
            <option value="RESOLVED" className="bg-[#180f0a] text-[#d8bca4]">Resolved</option>
          </select>

          <button
            onClick={fetchWorkOrders}
            className="p-1.5 bg-[#523624]/60 hover:bg-[#ec9665] text-[#d8bca4] hover:text-[#180f0a] rounded-md border border-[#9c6c4c]/40 text-xs transition spring-interactive shadow-sm"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main 60/40 Asymmetric Workspace Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* 60% Left Pane: Spatial Ledger Table (Edge-to-Edge) */}
        <div className="flex-1 border-r border-[#9c6c4c]/30 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#24160f]/90 backdrop-blur-md text-[#d8bca4]/70 border-b border-[#9c6c4c]/30 font-mono sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2.5 px-3 w-8 border-r border-[#9c6c4c]/20 text-center">●</th>
                <th className="py-2.5 px-3 w-20 border-r border-[#9c6c4c]/20">Ticket</th>
                <th className="py-2.5 px-3 w-40 border-r border-[#9c6c4c]/20">Room / Node</th>
                <th className="py-2.5 px-3 w-44 border-r border-[#9c6c4c]/20">Category</th>
                <th className="py-2.5 px-3 w-28 border-r border-[#9c6c4c]/20 text-right">Priority</th>
                <th className="py-2.5 px-3 w-36 border-r border-[#9c6c4c]/20 text-right">State</th>
                <th className="py-2.5 px-3 text-right">Assigned Worker</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#9c6c4c]/20 font-sans">
              {filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                const roleBadge = ROLE_BADGES[t.assigned_tech_role || t.category];
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={`cursor-pointer transition h-9 select-none spring-row ${
                      isSelected
                        ? 'bg-[#ec9665]/20 border-l-2 border-l-[#ec9665] shadow-sm'
                        : 'hover:bg-[#523624]/35'
                    }`}
                  >
                    <td className="py-2 px-3 border-r border-[#9c6c4c]/20 text-center">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${getStatusDot(t.state)}`}
                        title={t.state}
                      />
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-[#ec9665] border-r border-[#9c6c4c]/20">
                      #{t.ticket_number}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#d8bca4] border-r border-[#9c6c4c]/20">
                      {t.node_code || 'Campus General'}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#f4aa7f] text-[11px] border-r border-[#9c6c4c]/20">
                      {t.category || 'PENDING_TRIAGE'}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-[#9c6c4c]/20">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${getPriorityBadge(
                          t.calculated_priority
                        )}`}
                      >
                        {t.calculated_priority || 'P2'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right border-r border-[#9c6c4c]/20">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono border ${getStateBadge(
                          t.state
                        )}`}
                      >
                        {t.state}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {t.assigned_tech_name ? (
                        <div className="inline-flex items-center space-x-1.5 justify-end">
                          <span className="font-semibold text-[#f4aa7f]">{t.assigned_tech_name}</span>
                          {roleBadge && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono border ${roleBadge.color}`}
                            >
                              {roleBadge.icon} {roleBadge.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#9c6c4c] italic text-[11px] font-mono">
                          Unassigned
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredTickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-[#9c6c4c] text-xs font-mono">
                    {workOrders.length === 0
                      ? 'No work orders in ledger. New incident reports filed from Dashboard will be recorded here.'
                      : 'No work orders matching filter criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 40% Right Pane: Contextual Inspector Drawer (Frosted Glass, Fixed 410px width) */}
        <div className="w-[410px] glass-drawer flex flex-col justify-between overflow-y-auto shrink-0 shadow-2xl">
          {selectedTicket ? (
            <div className="p-4 space-y-4">
              {/* Drawer Header */}
              <div className="pb-3 border-b border-[#9c6c4c]/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono font-bold text-[#ec9665]">
                      Ticket #{selectedTicket.ticket_number}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono border ${getStateBadge(
                        selectedTicket.state
                      )}`}
                    >
                      {selectedTicket.state}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#d8bca4] mt-1">
                    {selectedTicket.node_name
                      ? `${selectedTicket.node_name} (${selectedTicket.node_code})`
                      : 'Campus General Infrastructure'}
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono border ${getPriorityBadge(
                    selectedTicket.calculated_priority
                  )}`}
                >
                  {selectedTicket.calculated_priority}
                </span>
              </div>

              {/* Status Alert Message */}
              {transitionStatus && (
                <div className="p-2.5 bg-[#ec9665]/20 border border-[#ec9665]/40 rounded-md text-xs text-[#f4aa7f] font-mono shadow-sm">
                  {transitionStatus}
                </div>
              )}

              {/* Reported Description */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase text-[#9c6c4c]">
                  Reported Incident Description
                </span>
                <div className="p-3 bg-[#180f0a]/80 border border-[#9c6c4c]/35 rounded-lg text-xs text-[#d8bca4] leading-relaxed font-mono shadow-inner">
                  {selectedTicket.raw_description || 'No raw description provided.'}
                </div>
              </div>

              {/* AI Structured Summary */}
              {selectedTicket.ai_summary && (
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#ec9665]">
                    AI Entity Extraction Summary
                  </span>
                  <div className="p-3 bg-[#523624]/50 border border-[#ec9665]/35 rounded-lg text-xs text-[#f4aa7f] font-mono shadow-inner">
                    {selectedTicket.ai_summary}
                  </div>
                </div>
              )}

              {/* Assigned Worker Telemetry Card */}
              <div className="p-3 bg-[#24160f]/80 border border-[#9c6c4c]/35 rounded-lg space-y-2 shadow-inner">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#9c6c4c] flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-[#ec9665]" />
                  <span>Assigned Maintenance Personnel</span>
                </span>

                {selectedTicket.assigned_tech_name ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">
                        {selectedTicket.assigned_tech_name}
                      </span>
                      {(() => {
                        const badge =
                          ROLE_BADGES[
                            selectedTicket.assigned_tech_role || selectedTicket.category
                          ];
                        return badge ? (
                          <span
                            className={`inline-flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] font-mono border ${badge.color}`}
                          >
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-center space-x-1.5 text-xs text-[#d8bca4]/80 font-mono">
                      <Mail className="w-3 h-3 text-[#9c6c4c]" />
                      <span>{selectedTicket.assigned_tech_email || 'No email registered'}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-[10px] text-[#f4aa7f] bg-[#ec9665]/15 px-2 py-0.5 rounded border border-[#ec9665]/30 w-fit font-mono">
                      <span>✓ Dispatched via Resend API</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-2.5 text-center text-xs text-[#9c6c4c] bg-[#180f0a]/50 rounded-md border border-dashed border-[#9c6c4c]/30 font-mono">
                    Pending technician assignment (Score-based auto-dispatch)
                  </div>
                )}
              </div>

              {/* Emergency Instructions Card */}
              {selectedTicket.partial_slots?.emergency_instructions && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg space-y-2 text-xs shadow-md">
                  <div className="flex items-center space-x-1.5 text-rose-300 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>EMERGENCY PROTOCOL ACTIVE</span>
                  </div>
                  <div className="font-semibold text-rose-200">
                    {selectedTicket.partial_slots.emergency_instructions.hazard_title}
                  </div>
                  <p className="text-[11px] text-[#d8bca4]">
                    {selectedTicket.partial_slots.emergency_instructions.evacuation_route}
                  </p>
                  <div className="text-[10px] text-rose-300 font-mono bg-rose-950/70 p-2 rounded border border-rose-900">
                    Assembly Point:{' '}
                    {selectedTicket.partial_slots.emergency_instructions.assembly_point}
                  </div>
                </div>
              )}

              {/* Clarification Interaction (if awaiting) */}
              {selectedTicket.state === 'AWAITING_CLARIFICATION' && (
                <div className="p-3 bg-[#523624]/60 border border-amber-500/40 rounded-lg space-y-2 shadow-inner">
                  <div className="flex items-center space-x-1.5 text-amber-300 text-xs font-bold">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Clarification Required</span>
                  </div>
                  <p className="text-xs text-[#d8bca4] italic">
                    "{selectedTicket.clarification_question || 'Please provide additional details.'}"
                  </p>
                  <form onSubmit={handleClarifySubmit} className="space-y-2 pt-1">
                    <input
                      type="text"
                      placeholder="e.g. Near switchboard in Room 204..."
                      value={clarifyText}
                      onChange={(e) => setClarifyText(e.target.value)}
                      className="w-full glass-input rounded-md px-2.5 py-1.5 text-xs text-[#f4aa7f] font-mono focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingClarify || !clarifyText.trim()}
                      className="w-full py-1.5 bg-[#ec9665] hover:bg-[#f4aa7f] text-[#180f0a] disabled:opacity-50 rounded-md text-xs font-bold font-mono transition spring-interactive shadow"
                    >
                      {isSubmittingClarify ? 'Submitting...' : 'Submit Clarification'}
                    </button>
                  </form>
                </div>
              )}

              {/* FSM Lifecycle Action Triggers */}
              <div className="space-y-2 pt-2 border-t border-[#9c6c4c]/30">
                <span className="text-[10px] font-mono uppercase text-[#9c6c4c] tracking-wider">
                  Available FSM Actions
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {selectedTicket.state === 'ASSIGNED' && (
                    <button
                      onClick={() => handleTransition('IN_PROGRESS', 'Technician on-site inspection')}
                      className="col-span-2 py-2 bg-gradient-to-r from-[#ec9665] to-[#f4aa7f] text-[#180f0a] rounded-md text-xs font-bold font-mono transition spring-interactive flex items-center justify-center space-x-1.5 shadow-[0_4px_16px_rgba(236,150,101,0.35)]"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Repair</span>
                    </button>
                  )}

                  {selectedTicket.state === 'IN_PROGRESS' && (
                    <>
                      <button
                        onClick={() =>
                          handleTransition('RESOLVED', 'Repairs completed and operational tests passed.')
                        }
                        className="py-2 bg-gradient-to-r from-[#ec9665] to-[#f4aa7f] text-[#180f0a] rounded-md text-xs font-bold font-mono transition spring-interactive flex items-center justify-center space-x-1.5 shadow-[0_4px_14px_rgba(236,150,101,0.3)]"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Mark Resolved</span>
                      </button>
                      <button
                        onClick={() =>
                          handleTransition(
                            'BLOCKED_PARTS',
                            'Awaiting replacement parts from central inventory'
                          )
                        }
                        className="py-2 bg-[#9c6c4c] hover:bg-[#9c6c4c]/90 text-white rounded-md text-xs font-bold font-mono transition spring-interactive flex items-center justify-center space-x-1.5 shadow"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Block on Parts</span>
                      </button>
                    </>
                  )}

                  {selectedTicket.state === 'BLOCKED_PARTS' && (
                    <button
                      onClick={() =>
                        handleTransition('IN_PROGRESS', 'Replacement parts received from store')
                      }
                      className="col-span-2 py-2 bg-gradient-to-r from-[#ec9665] to-[#f4aa7f] text-[#180f0a] rounded-md text-xs font-bold font-mono transition spring-interactive flex items-center justify-center space-x-1.5 shadow"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Repair</span>
                    </button>
                  )}

                  {(selectedTicket.state === 'RESOLVED' || selectedTicket.state === 'CLOSED') && (
                    <div className="col-span-2 py-2 text-center text-xs text-[#f4aa7f] bg-[#ec9665]/15 border border-[#ec9665]/35 rounded-md font-mono shadow-sm">
                      ✓ Lifecycle Complete (State: {selectedTicket.state})
                    </div>
                  )}

                  {selectedTicket.state === 'TRIAGED' && (
                    <div className="col-span-2 py-2 text-center text-xs text-[#f4aa7f] bg-[#523624]/60 border border-[#ec9665]/35 rounded-md font-mono shadow-sm">
                      Awaiting Automated Worker Dispatch
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="pb-3 border-b border-[#9c6c4c]/30 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ClipboardList className="w-4 h-4 text-[#ec9665]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#f4aa7f] font-mono">
                    Operational Dispatch Station
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ec9665]/20 text-[#f4aa7f] border border-[#ec9665]/40">
                  Ready
                </span>
              </div>

              {/* Direct Rapid Incident Intake */}
              <div className="p-3 bg-[#180f0a]/70 border border-[#9c6c4c]/30 rounded-lg space-y-2.5">
                <span className="text-[11px] font-bold text-white flex items-center space-x-1.5 font-mono">
                  <span>⚡</span>
                  <span>Report Maintenance Incident</span>
                </span>
                <p className="text-[11px] text-[#d8bca4]/70 font-mono">
                  Enter facility issue description for automated entity triage and worker notification dispatch.
                </p>
                <form onSubmit={handleQuickIntake} className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="e.g. Water leaking from ceiling AC in RM-ACAD-204"
                    value={quickIntakeText}
                    onChange={(e) => setQuickIntakeText(e.target.value)}
                    className="w-full glass-input rounded-md p-2 text-xs text-[#f4aa7f] font-mono focus:outline-none resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingQuick || !quickIntakeText.trim()}
                    className="w-full py-1.5 bg-gradient-to-r from-[#ec9665] to-[#f4aa7f] text-[#180f0a] font-bold rounded-md text-xs font-mono transition spring-interactive flex items-center justify-center space-x-1 shadow disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{isSubmittingQuick ? 'Filing...' : 'Submit Work Order'}</span>
                  </button>
                </form>
              </div>

              {/* Active Ledger Metrics */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase text-[#9c6c4c] tracking-wider block">
                  Queue Health Telemetry
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 bg-[#180f0a]/60 rounded-lg border border-[#9c6c4c]/25">
                    <span className="text-[10px] text-[#9c6c4c] block">Total Orders</span>
                    <span className="text-base font-bold text-white">{workOrders.length}</span>
                  </div>
                  <div className="p-2.5 bg-[#180f0a]/60 rounded-lg border border-[#9c6c4c]/25">
                    <span className="text-[10px] text-[#9c6c4c] block">In Progress</span>
                    <span className="text-base font-bold text-[#ec9665]">
                      {workOrders.filter((w) => w.state === 'IN_PROGRESS').length}
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#180f0a]/60 rounded-lg border border-[#9c6c4c]/25">
                    <span className="text-[10px] text-[#9c6c4c] block">Awaiting Dispatch</span>
                    <span className="text-base font-bold text-[#f4aa7f]">
                      {workOrders.filter((w) => w.state === 'TRIAGED' || w.state === 'ASSIGNED').length}
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#180f0a]/60 rounded-lg border border-[#9c6c4c]/25">
                    <span className="text-[10px] text-[#9c6c4c] block">Resolved</span>
                    <span className="text-base font-bold text-emerald-400">
                      {workOrders.filter((w) => w.state === 'RESOLVED' || w.state === 'CLOSED').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Invariant Guarantees */}
              <div className="p-3 bg-[#24160f]/60 rounded-lg border border-[#9c6c4c]/30 text-[10px] font-mono space-y-1.5 text-[#d8bca4]/80">
                <div className="flex items-center space-x-1.5 text-[#ec9665] font-bold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Strict Invariant Protection Active</span>
                </div>
                <div>• FSM transition trigger guard active</div>
                <div>• Audit ledger is strictly append-only</div>
                <div>• Groq multi-agent entity classifier enabled</div>
              </div>
            </div>
          )}

          {/* Drawer Footer Status */}
          <div className="p-3 border-t border-[#9c6c4c]/30 text-[10px] text-[#9c6c4c] font-mono flex items-center justify-between bg-[#180f0a]/50">
            <span>FSM: STRICT TRIGGER GUARDS</span>
            <span>AUDIT: IMMUTABLE</span>
          </div>
        </div>
      </div>
    </div>
  );
};
