import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Send,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  RefreshCw,
  X,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Radio,
  Zap,
  Wifi,
  Droplet,
  Layers,
  Sparkles,
  HardHat,
  ChevronRight,
  SlidersHorizontal,
  LogOut,
} from 'lucide-react';

interface StudentDashboardProps {
  onSwitchPortal?: (mode: 'student' | 'admin' | 'worker') => void;
  onResetChoice?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  showFormAction?: boolean;
  ticketInfo?: {
    ticketNumber?: number;
    state?: string;
    priority?: string;
    location?: string;
    category?: string;
  };
  emergency?: {
    headline: string;
    evacuationRoute?: string;
    assemblyPoint?: string;
    immediateActions?: string[];
  };
}

interface NodeItem {
  id: string;
  node_code: string;
  name: string;
  building_code: string;
  node_type: string;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  onSwitchPortal,
  onResetChoice,
}) => {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Welcome to SRM Easwari Campus Care Help Desk. Spot an equipment breakdown, power fault, water leak, or Wi-Fi outage? Describe your issue below for automated diagnosis and dispatch.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  // Quick Global Search Filter for Tickets
  const [searchQuery, setSearchQuery] = useState('');

  // Structured Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<any>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [formData, setFormData] = useState({
    building_code: 'EEC-ACAD',
    room_code: 'RM-ACAD-204',
    category: 'ELECTRICAL',
    urgency: 'P2_MEDIUM',
    description: '',
  });

  // Recent Tickets / Operational Queue
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load campus rooms
  useEffect(() => {
    const fetchNodes = async () => {
      try {
        const res: any = await api.get('/campus/nodes?node_type=ROOM');
        if (Array.isArray(res)) {
          setNodes(res);
        }
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchNodes();
    fetchRecentTickets();
    const interval = setInterval(fetchRecentTickets, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchRecentTickets = async () => {
    try {
      setLoadingTickets(true);
      const res: any = await api.get('/work-orders?limit=15');
      if (Array.isArray(res)) {
        setMyTickets(res);
      }
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setLoadingTickets(false);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (typeof textToSend === 'string' ? textToSend : inputText).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      if (currentThreadId) {
        // Follow-up clarification reply
        const res: any = await api.post(`/intake/${currentThreadId}/clarify`, {
          reply_text: text,
        });

        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: res.clarification_needed
            ? res.clarification_question || 'Could you provide a few more details?'
            : `Ticket #${res.ticket_number} updated to "${res.state}" (${res.category || 'General'}). Technician dispatched.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          ticketInfo: res.ticket_number
            ? {
                ticketNumber: res.ticket_number,
                state: res.state,
                category: res.category,
                location: res.target_node_code || res.target_node_name,
                priority: res.partial_slots?.reporter_urgency || 'Normal',
              }
            : undefined,
        };

        if (!res.clarification_needed) {
          setCurrentThreadId(null);
        }
        setMessages((prev) => [...prev, botMsg]);
        fetchRecentTickets();
      } else {
        // Initial intake through AI model
        const res: any = await api.post('/intake/chat', {
          text,
          channel: 'CHAT',
        });

        if (res.is_incident === false) {
          const botMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: res.assistant_reply || 'Hello! How can I assist you with campus facilities today?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            showFormAction: Boolean(res.requires_form),
          };
          setMessages((prev) => [...prev, botMsg]);
        } else {
          if (res.conversation_thread_id && res.clarification_needed) {
            setCurrentThreadId(res.conversation_thread_id);
          }

          const botMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: res.clarification_needed
              ? (res.ticket_number ? `Ticket #${res.ticket_number} in progress: ${res.clarification_question}` : res.clarification_question)
              : `Ticket #${res.ticket_number} created for ${res.target_node_code || res.target_node_name || 'campus quadrant'} (${res.category || 'General'}). Automated dispatch initiated.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            ticketInfo: res.ticket_number
              ? {
                  ticketNumber: res.ticket_number,
                  state: res.state,
                  category: res.category,
                  location: res.target_node_code || res.target_node_name,
                }
              : undefined,
            emergency: res.emergency_instructions
              ? {
                  headline: res.emergency_instructions.headline,
                  evacuationRoute: res.emergency_instructions.evacuation_route,
                  assemblyPoint: res.emergency_instructions.assembly_point,
                  immediateActions: res.emergency_instructions.immediate_actions,
                }
              : undefined,
          };
          setMessages((prev) => [...prev, botMsg]);
          fetchRecentTickets();
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: `Diagnostic engine temporarily offline. Please use the "Submit Maintenance Ticket" button to report directly.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          showFormAction: true,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) return;

    try {
      setFormSubmitting(true);
      const text = `Building: ${formData.building_code}, Room: ${formData.room_code}, Category: ${formData.category}, Urgency: ${formData.urgency}. Details: ${formData.description}`;
      const res: any = await api.post('/intake', {
        text,
        channel: 'PORTAL_FORM',
      });
      setFormSuccess(res);
      fetchRecentTickets();
    } catch (err: any) {
      alert(`Submission failed: ${err.message || 'Error'}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const filteredTickets = myTickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.ticket_number?.toString().includes(q) ||
      t.node_code?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.state?.toLowerCase().includes(q) ||
      t.raw_description?.toLowerCase().includes(q) ||
      t.ai_summary?.toLowerCase().includes(q)
    );
  });

  const filteredRooms = nodes.filter(
    (n) => !formData.building_code || n.building_code === formData.building_code
  );

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden text-[#E5E7EB] font-sans antialiased select-none"
      style={{
        backgroundImage: `linear-gradient(to bottom, rgba(10, 15, 26, 0.58) 0%, rgba(13, 18, 30, 0.68) 100%), url('/campus_student_bg.jpg')`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: '#0B0F19',
      }}
    >
      {/* 1. Top Navigation Bar (Structured compact 52px utility bar) */}
      <header className="h-13 border-b border-[#1F2937]/80 bg-[#0B0F19]/85 backdrop-blur-md px-6 flex items-center justify-between shrink-0 select-none z-30">
        {/* Left: Navigation, Brand Badge & Subtle Breadcrumbs */}
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
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500 transition shadow-sm cursor-pointer"
            title="Escape / Switch Role (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>← Switch Role (Esc)</span>
          </button>

          <div className="h-4 w-px bg-[#1F2937]" />

          <div className="flex items-center space-x-2">
            <div className="h-7 w-7 rounded bg-[#2563EB] flex items-center justify-center font-bold text-white text-xs shadow-sm">
              EO
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm tracking-tight text-[#F9FAFB]">
                SRM Easwari
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#111827] text-[#9CA3AF] border border-[#1F2937]">
                Student
              </span>
            </div>
          </div>
        </div>

        {/* Center: Quick Global Search Bar */}
        <div className="hidden md:flex items-center flex-1 max-w-sm mx-6">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facility alerts, ticket ID, or room..."
              className="w-full bg-[#111827]/90 border border-[#1F2937] rounded-md pl-8 pr-12 py-1.5 text-xs text-[#F9FAFB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB] transition"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-[#9CA3AF] font-mono bg-[#1F2937] px-1 py-0.5 rounded border border-[#374151]">
              <span>⌘K</span>
            </div>
          </div>
        </div>

        {/* Right: User Identity & Logout */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* User Identity */}
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-full bg-[#111827] border border-[#1F2937] flex items-center justify-center text-xs font-semibold text-[#F9FAFB]">
              AR
            </div>
            <div className="hidden sm:block text-left text-xs leading-none">
              <span className="text-[#F9FAFB] font-medium block">Aditya Raman</span>
              <span className="text-[10px] text-[#9CA3AF] font-mono mt-0.5 block">Student ID</span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#1F2937]" />

          {/* Logout Button */}
          <button
            onClick={() => onResetChoice?.()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[#9CA3AF] hover:text-rose-300 hover:bg-rose-500/10 border border-[#1F2937] hover:border-rose-500/30 text-xs font-medium transition"
            title="Logout to Role Selection Screen"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Hero & Action Header - Compact to fit in one page without outer scrolling */}
      <div className="border-b border-[#1F2937]/80 px-6 py-2.5 bg-[#0B0F19]/50 backdrop-blur-sm shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[#F9FAFB] tracking-tight">
              Campus Care & Facility Help Desk
            </h1>
            <p className="text-[11px] text-[#9CA3AF] leading-none mt-0.5">
              Report equipment breakdowns, electrical hazards, Wi-Fi outages, or classroom faults with automated dispatch.
            </p>
          </div>
          <button
            onClick={() => {
              setFormSuccess(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium transition shadow-sm border border-blue-500/30 shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Submit Maintenance Ticket</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Split (Two Structured Panels fitting strictly in one single view) */}
      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-6 py-3 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Left Column: AI Diagnostic Assistant (7 cols) */}
        <div className="lg:col-span-7 flex flex-col h-full bg-[#111827]/95 backdrop-blur-md border border-[#1F2937] rounded-xl overflow-hidden shadow-2xl min-h-0">
          {/* Header */}
          <div className="px-4 py-2 border-b border-[#1F2937] bg-[#111827] flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <span className="font-semibold text-xs text-[#F9FAFB] tracking-tight">
                Facility AI Assistant
              </span>
              <span className="text-[11px] text-[#9CA3AF]">|</span>
              <div className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                <span>Operational • Sub-second response</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-[#9CA3AF] bg-[#0B0F19] px-2 py-0.5 rounded border border-[#1F2937]">
              Triage Core v2.4
            </div>
          </div>

          {/* Message Bubbles Container (With its own internal slider/scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-2.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-lg p-3 text-xs leading-relaxed border ${
                    msg.sender === 'user'
                      ? 'bg-[#1F2937] border-[#374151] text-[#F9FAFB]'
                      : 'bg-[#0B0F19]/90 border-[#1F2937] text-[#E5E7EB]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Manual Fallback Action */}
                  {msg.showFormAction && (
                    <div className="mt-2.5 pt-2 border-t border-[#1F2937]">
                      <button
                        onClick={() => {
                          setFormSuccess(null);
                          setIsFormOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-medium transition"
                      >
                        <PlusCircle className="w-3 h-3" />
                        <span>Fill Ticket Form Directly</span>
                      </button>
                    </div>
                  )}

                  {/* Emergency Protocol Box */}
                  {msg.emergency && (
                    <div className="mt-2.5 p-2.5 bg-[#1F1315] border border-[#EF4444] rounded text-[#FCA5A5] text-[11px] space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-[#F87171]">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{msg.emergency.headline}</span>
                      </div>
                      {msg.emergency.evacuationRoute && (
                        <p>
                          <strong className="text-white">Evacuation Route:</strong> {msg.emergency.evacuationRoute}
                        </p>
                      )}
                      {msg.emergency.assemblyPoint && (
                        <p>
                          <strong className="text-white">Assembly Point:</strong> {msg.emergency.assemblyPoint}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Structured Ticket Badge when created */}
                  {msg.ticketInfo && msg.ticketInfo.ticketNumber && (
                    <div className="mt-2.5 pt-2 border-t border-[#1F2937] flex items-center justify-between text-[11px] font-mono text-[#9CA3AF]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#60A5FA]">
                          #{msg.ticketInfo.ticketNumber}
                        </span>
                        <span className="text-[#E5E7EB]">
                          {msg.ticketInfo.location || 'Quadrant Allocated'}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#111827] text-[10px] text-[#10B981] border border-[#1F2937]">
                        {msg.ticketInfo.state || 'DISPATCHED'}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-[#9CA3AF] mt-0.5 px-1 font-mono">
                  {msg.timestamp}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chatbox Input directly linked right below to the AI assistant box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-2.5 border-t border-[#1F2937] bg-[#0E1524] flex items-center gap-2 shrink-0"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  currentThreadId
                    ? 'Type details to clarify issue or location...'
                    : 'Describe campus problem (e.g. AC leaking in Mech 102, switch tripping)...'
                }
                className="w-full bg-[#0B0F19] border border-[#374151] focus:border-[#2563EB] rounded-lg px-3 py-1.5 text-xs text-[#F9FAFB] placeholder-[#9CA3AF] focus:outline-none transition"
              />
              <span className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#9CA3AF] pointer-events-none">
                Press Enter to send
              </span>
            </div>
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-medium text-xs flex items-center gap-1.5 transition shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Right Column: Operational Queue & Recent Activity (5 cols) */}
        <div className="lg:col-span-5 flex flex-col h-full bg-[#111827]/95 backdrop-blur-md border border-[#1F2937] rounded-xl overflow-hidden shadow-2xl min-h-0">
          {/* Header */}
          <div className="px-4 py-2 border-b border-[#1F2937] bg-[#111827] flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-xs text-[#F9FAFB] tracking-tight">
                Operational Queue & Recent Activity
              </span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#1F2937] text-[#9CA3AF] border border-[#374151]">
                {filteredTickets.length}
              </span>
            </div>
            <button
              onClick={fetchRecentTickets}
              className="text-[#9CA3AF] hover:text-[#F9FAFB] p-1 rounded transition"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Table Container (With its own internal slider/scroll) */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {filteredTickets.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#0B0F19]">
                  <tr className="border-b border-[#1F2937] text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF]">
                    <th className="py-2 px-3">Ticket ID</th>
                    <th className="py-2 px-3">Location</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937]">
                  {filteredTickets.map((t) => {
                    const isClarify = t.state === 'AWAITING_CLARIFICATION';
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-[#1F2937]/50 transition group"
                      >
                        {/* Ticket ID & Time */}
                        <td className="py-2.5 px-3 align-top">
                          <span className="font-mono font-medium text-[#60A5FA] block">
                            #{t.ticket_number}
                          </span>
                          <span className="text-[10px] text-[#9CA3AF] font-mono block mt-0.5">
                            {t.created_at
                              ? new Date(t.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </span>
                        </td>

                        {/* Location & Summary */}
                        <td className="py-2.5 px-3 align-top min-w-0 max-w-[130px]">
                          <span className="font-medium text-[#F9FAFB] truncate block text-[11px]">
                            {t.node_code || 'Campus Quad'}
                          </span>
                          <span className="text-[10px] text-[#9CA3AF] truncate block mt-0.5">
                            {t.raw_description || t.ai_summary || 'Diagnostic logged'}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-2.5 px-3 align-top">
                          <span className="text-[11px] text-[#E5E7EB] font-mono block">
                            {t.category || 'GENERAL'}
                          </span>
                        </td>

                        {/* Status Pill Tag */}
                        <td className="py-2.5 px-3 align-top text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
                              t.state === 'RESOLVED'
                                ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                                : t.state === 'IN_PROGRESS'
                                ? 'bg-[#2563EB]/15 text-[#60A5FA] border-[#2563EB]/30'
                                : t.state === 'AWAITING_CLARIFICATION'
                                ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {t.state === 'IN_PROGRESS'
                              ? 'Assigned to Tech'
                              : t.state === 'DISPATCHED'
                              ? 'Investigating'
                              : t.state === 'RESOLVED'
                              ? 'Resolved'
                              : t.state}
                          </span>

                          {isClarify && (
                            <button
                              onClick={() => {
                                setCurrentThreadId(t.conversation_thread_id);
                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    id: Date.now().toString(),
                                    sender: 'assistant',
                                    text: `Awaiting details for Ticket #${t.ticket_number}: ${
                                      t.clarification_question || 'Specify room number or symptoms below.'
                                    }`,
                                    timestamp: new Date().toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }),
                                    ticketInfo: {
                                      ticketNumber: t.ticket_number,
                                      state: t.state,
                                      category: t.category,
                                      location: t.node_code || t.node_name,
                                    },
                                  },
                                ]);
                              }}
                              className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono transition flex items-center gap-1 ml-auto"
                            >
                              <HelpCircle className="w-3 h-3" />
                              <span>Clarify</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* Empty State Fallback: Clean SVG schematic */
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center my-auto">
                <div className="w-12 h-12 rounded-xl bg-[#0B0F19] border border-[#1F2937] flex items-center justify-center mb-2.5">
                  <svg
                    className="w-6 h-6 text-[#9CA3AF]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <h4 className="text-xs font-semibold text-[#F9FAFB]">
                  No active maintenance alerts for your quadrant
                </h4>
                <p className="text-[11px] text-[#9CA3AF] max-w-xs mt-0.5 leading-relaxed">
                  All campus infrastructure in this sector is operating at 100% nominal capacity.
                </p>
                <button
                  onClick={fetchRecentTickets}
                  className="mt-2 text-[11px] text-[#2563EB] hover:text-[#3B82F6] font-medium flex items-center gap-1 transition"
                >
                  <span>View campus status history</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. System Footer / Diagnostic Strip */}
      <footer className="h-7 border-t border-[#1F2937]/80 bg-[#0B0F19]/90 backdrop-blur-md px-6 flex items-center justify-between text-[11px] font-mono text-[#9CA3AF] shrink-0 select-none">
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span>Engine: v2.4 Active</span>
          </span>
          <span className="text-[#374151]">|</span>
          <span>Gateway: Connected</span>
          <span className="text-[#374151]">|</span>
          <span>Node: SRM Easwari Campus Infrastructure</span>
        </div>
        <div className="hidden sm:flex items-center space-x-2 text-[10px]">
          <span>100% WCAG AAA Compliant</span>
        </div>
      </footer>

      {/* Structured "Submit Maintenance Ticket" Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B0F19]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-[#1F2937] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#1F2937] flex items-center justify-between bg-[#111827]">
              <div>
                <h3 className="text-sm font-semibold text-[#F9FAFB]">
                  Submit Maintenance Ticket
                </h3>
                <p className="text-xs text-[#9CA3AF] mt-0.5">
                  Direct dispatch to domain technician
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-[#9CA3AF] hover:text-[#F9FAFB] p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            {formSuccess ? (
              <div className="p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#10B981]/10 text-[#10B981] mx-auto flex items-center justify-center border border-[#10B981]/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-[#F9FAFB]">
                    Ticket Registered Successfully
                  </h4>
                  <p className="text-xs text-[#9CA3AF] mt-1">
                    Logged as <strong className="text-white">Ticket #{formSuccess.ticket_number}</strong> ({formSuccess.state}).
                  </p>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-medium transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Building Block */}
                  <div>
                    <label className="block text-xs font-medium text-[#E5E7EB] mb-1.5">
                      Campus Block
                    </label>
                    <select
                      value={formData.building_code}
                      onChange={(e) =>
                        setFormData({ ...formData, building_code: e.target.value })
                      }
                      className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="EEC-ACAD">Academic Tech Block</option>
                      <option value="EEC-MAIN">Main Admin Block</option>
                      <option value="EEC-MECH-PG">Mechanical & PG Block</option>
                      <option value="EEC-ROBOTICS">ABB Robotics Centre</option>
                      <option value="EEC-AUD-FC">Auditorium & Food Court</option>
                    </select>
                  </div>

                  {/* Room */}
                  <div>
                    <label className="block text-xs font-medium text-[#E5E7EB] mb-1.5">
                      Room / Facility
                    </label>
                    <select
                      value={formData.room_code}
                      onChange={(e) =>
                        setFormData({ ...formData, room_code: e.target.value })
                      }
                      className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                    >
                      {filteredRooms.map((r) => (
                        <option key={r.id} value={r.node_code}>
                          {r.node_code} ({r.name})
                        </option>
                      ))}
                      {filteredRooms.length === 0 && (
                        <option value="GENERAL">General Area</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-[#E5E7EB] mb-1.5">
                      Issue Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="ELECTRICAL">⚡ Electrical / Power</option>
                      <option value="PLUMBING">🚰 Water & Plumbing</option>
                      <option value="NETWORK">🌐 Wi-Fi & IT Network</option>
                      <option value="STRUCTURAL_SAFETY">🪑 Structural & Civil</option>
                      <option value="SOS">🚨 SOS (Medical & Emergency)</option>
                      <option value="SWEEPER">🧹 Sweeper (Sanitation)</option>
                    </select>
                  </div>

                  {/* Urgency */}
                  <div>
                    <label className="block text-xs font-medium text-[#E5E7EB] mb-1.5">
                      Urgency
                    </label>
                    <select
                      value={formData.urgency}
                      onChange={(e) =>
                        setFormData({ ...formData, urgency: e.target.value })
                      }
                      className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg px-3 py-2 text-xs text-[#F9FAFB] focus:outline-none focus:border-[#2563EB]"
                    >
                      <option value="P3_LOW">Normal (Non-blocking)</option>
                      <option value="P2_MEDIUM">Moderate (Impacting class)</option>
                      <option value="P1_HIGH">High (Exam / Lab blocked)</option>
                      <option value="P0_CRITICAL">Critical Emergency (Hazard)</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-[#E5E7EB] mb-1.5">
                    Problem Description
                  </label>
                  <textarea
                    rows={4}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe symptoms, exact location, or equipment ID (e.g. breaker tripping, leaking pipe under sink)..."
                    className="w-full bg-[#0B0F19] border border-[#1F2937] rounded-lg p-3 text-xs text-[#F9FAFB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2563EB] resize-none"
                    required
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#1F2937]">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F9FAFB] text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formSubmitting || !formData.description.trim()}
                    className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-medium text-xs transition"
                  >
                    {formSubmitting ? 'Submitting...' : 'Submit Maintenance Ticket'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
