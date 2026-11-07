import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

function fallbackApiPlugin(): Plugin {
  const outboxPath = path.resolve(__dirname, '../outbox/warnings.json');

  const TECH_MAP: Record<string, { id: string; name: string; role: string; email: string }> = {
    ELECTRICAL: { id: 'usr_karthik', name: 'Karthik Subramanian (Electrician)', role: 'ELECTRICAL', email: 'arunak0787@gmail.com' },
    AV_EQUIPMENT: { id: 'usr_karthik', name: 'Karthik Subramanian (AV Tech)', role: 'ELECTRICAL', email: 'arunak0787@gmail.com' },
    PLUMBING: { id: 'usr_ramesh', name: 'Ramesh Venkatesan (Plumber)', role: 'PLUMBING', email: 'tech_plumb_1@easwari.edu' },
    NETWORK: { id: 'usr_suresh', name: 'Suresh Kumar (Network Tech)', role: 'NETWORK', email: 'tech_net_1@easwari.edu' },
    SWEEPER: { id: 'usr_thangavel', name: 'Thangavel Murugan (Sanitation)', role: 'SWEEPER', email: 'tech_sweeper_1@easwari.edu' },
    STRUCTURAL_SAFETY: { id: 'usr_selvam', name: 'Selvam Muthuraj (Safety Tech)', role: 'STRUCTURAL_SAFETY', email: 'jeevadarwin007@gmail.com' },
    SOS: { id: 'usr_mohanraj', name: 'Mohanraj Krishnan (Emergency Response)', role: 'SOS', email: 'tech_sos_1@easwari.edu' }
  };

  let mockWorkOrders: any[] = [
    {
      id: 'wo_seed_101',
      ticket_number: 1042,
      node_code: 'PG-201',
      node_name: 'PG Block 201 (Smart Lab)',
      category: 'AV_EQUIPMENT',
      calculated_priority: 'P2_MEDIUM',
      reporter_urgency: 'P2_MEDIUM',
      state: 'TRIAGED',
      assigned_tech_id: 'usr_karthik',
      assigned_tech_name: 'Karthik Subramanian (AV Tech)',
      assigned_tech_role: 'ELECTRICAL',
      assigned_tech_email: 'arunak0787@gmail.com',
      raw_description: 'Audio visual projection HDMI sync issue reported.',
      ai_summary: 'Projector sync loss on HDMI-1 interface',
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  // Map to hold pending clarification conversational threads
  const pendingClarifications = new Map<string, {
    threadId: string;
    originalText: string;
    category: string;
    urgency: string;
    detectedAsset?: string;
    createdAt: number;
  }>();

  // Helper: Extract location (block and room) from text
  function extractLocation(text: string): { code: string; name: string } | null {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // Direct room codes e.g. PG-201, MAIN-201, CIVIL-101, A101, RM-ACAD-204
    const directCode = raw.match(/\b(PG[- ]?([0-9]{3})|MAIN[- ]?([0-9]{3})|CIVIL[- ]?([0-9]{3})|MECH[- ]?([0-9]{3})|A101|RM-ACAD-[0-9]{3}|LAB-[0-9]{3})\b/i);
    if (directCode) {
      const matched = directCode[0].toUpperCase().replace(/\s+/, '-');
      const blkMatch = matched.match(/^[A-Z]+/);
      const blk = blkMatch ? blkMatch[0] : 'Campus';
      return { code: matched, name: `${blk} Block ${matched}` };
    }

    // Pattern: "PG 201", "pg block room 201", "pg room 201", "in pg 201"
    const pgMatch = raw.match(/\b(?:pg|post\s*graduate)\s*(?:block|building)?\s*(?:room|lab|lh)?\s*([0-9]{3})\b/i);
    if (pgMatch) {
      return { code: `PG-${pgMatch[1]}`, name: `PG Block ${pgMatch[1]}` };
    }

    // Pattern: "Main block 201", "Main room 102", "Admin 201"
    const mainMatch = raw.match(/\b(?:main|admin|academic)\s*(?:block|building)?\s*(?:room|lab)?\s*([0-9]{3})\b/i);
    if (mainMatch) {
      return { code: `MAIN-${mainMatch[1]}`, name: `Main Block ${mainMatch[1]}` };
    }

    // Pattern: "Civil block 101", "Civil 101"
    const civilMatch = raw.match(/\bcivil\s*(?:block|building)?\s*(?:room|lab)?\s*([0-9]{3})\b/i);
    if (civilMatch) {
      return { code: `CIVIL-${civilMatch[1]}`, name: `Civil Block ${civilMatch[1]}` };
    }

    // Pattern: "Mech block 301", "Mechanical 302"
    const mechMatch = raw.match(/\b(?:mech|mechanical)\s*(?:block|building)?\s*(?:room|lab)?\s*([0-9]{3})\b/i);
    if (mechMatch) {
      return { code: `MECH-${mechMatch[1]}`, name: `Mechanical Block ${mechMatch[1]}` };
    }

    // Pattern: "Lab 204", "Room 201", "Classroom 302" without explicit block
    const genericRoom = raw.match(/\b(?:room|lab|classroom|hall|lh)\s*#?\s*([0-9]{3})\b/i);
    if (genericRoom) {
      // Default to PG if PG mentioned anywhere, else MAIN
      const bldg = lower.includes('pg') ? 'PG' : lower.includes('civil') ? 'CIVIL' : lower.includes('mech') ? 'MECH' : 'PG';
      return { code: `${bldg}-${genericRoom[1]}`, name: `${bldg} Block ${genericRoom[1]}` };
    }

    // Plain room number like "201", "101", "204" if preceded by "in" or "at"
    const prepRoom = raw.match(/\b(?:in|at|for|near)\s+([0-9]{3})\b/i);
    if (prepRoom) {
      return { code: `PG-${prepRoom[1]}`, name: `PG Block ${prepRoom[1]}` };
    }

    // Plain standalone room number if short reply e.g. "201" or "pg 201"
    const standaloneRoom = raw.match(/^([0-9]{3})$/);
    if (standaloneRoom) {
      return { code: `PG-${standaloneRoom[1]}`, name: `PG Block ${standaloneRoom[1]}` };
    }

    return null;
  }

  // Helper: Extract Category from complaint
  function extractCategory(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('spark') || lower.includes('fan') || lower.includes('light') || lower.includes('bulb') || lower.includes('power') || lower.includes('switch') || lower.includes('socket') || lower.includes('mcb') || lower.includes('breaker') || lower.includes('electric') || lower.includes('ac') || lower.includes('air condition')) {
      return 'ELECTRICAL';
    }
    if (lower.includes('projector') || lower.includes('projection') || lower.includes('hdmi') || lower.includes('display') || lower.includes('screen') || lower.includes('smart board') || lower.includes('audio') || lower.includes('mic')) {
      return 'AV_EQUIPMENT';
    }
    if (lower.includes('leak') || lower.includes('water') || lower.includes('pipe') || lower.includes('tap') || lower.includes('faucet') || lower.includes('flush') || lower.includes('toilet') || lower.includes('washroom') || lower.includes('drain') || lower.includes('basin')) {
      return 'PLUMBING';
    }
    if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet') || lower.includes('lan') || lower.includes('network') || lower.includes('router') || lower.includes('ethernet')) {
      return 'NETWORK';
    }
    if (lower.includes('clean') || lower.includes('dirty') || lower.includes('sweep') || lower.includes('trash') || lower.includes('garbage') || lower.includes('dustbin') || lower.includes('spill') || lower.includes('waste')) {
      return 'SWEEPER';
    }
    if (lower.includes('crack') || lower.includes('ceiling') || lower.includes('wall') || lower.includes('window') || lower.includes('door') || lower.includes('lock') || lower.includes('bench') || lower.includes('table') || lower.includes('chair')) {
      return 'STRUCTURAL_SAFETY';
    }
    if (lower.includes('emergency') || lower.includes('doctor') || lower.includes('ambulance') || lower.includes('faint') || lower.includes('injury') || lower.includes('bleed') || lower.includes('sos')) {
      return 'SOS';
    }
    return 'ELECTRICAL';
  }

  // Helper: Extract Urgency
  function extractUrgency(text: string, category: string): string {
    const lower = text.toLowerCase();
    if (category === 'SOS' || lower.includes('spark') || lower.includes('fire') || lower.includes('smoke') || lower.includes('live wire') || lower.includes('flood')) {
      return 'P0_CRITICAL';
    }
    if (lower.includes('exam') || lower.includes('urgent') || lower.includes('immediately') || lower.includes('blackout')) {
      return 'P1_HIGH';
    }
    if (lower.includes('minor') || lower.includes('clean') || lower.includes('loose')) {
      return 'P3_LOW';
    }
    return 'P2_MEDIUM';
  }

  return {
    name: 'campusops-fallback-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/v1')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost:5173');
        const pathname = url.pathname;

        // 1. Auth Login Mock
        if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { email } = JSON.parse(body || '{}');
              let userId = 'usr_student';
              let fullName = 'Aditya Raman';
              let role = 'STUDENT_FACULTY';

              if (email === 'sys_admin_1@easwari.edu') {
                userId = 'usr_admin';
                fullName = 'Anand Natarajan';
                role = 'SYS_ADMIN';
              } else if (email === 'arunak0787@gmail.com') {
                userId = 'usr_karthik';
                fullName = 'Karthik Subramanian';
                role = 'TECHNICIAN';
              } else if (email?.includes('plumb')) {
                userId = 'usr_ramesh';
                fullName = 'Ramesh Venkatesan';
                role = 'TECHNICIAN';
              } else if (email?.includes('net')) {
                userId = 'usr_suresh';
                fullName = 'Suresh Kumar';
                role = 'TECHNICIAN';
              } else if (email?.includes('sos')) {
                userId = 'usr_mohanraj';
                fullName = 'Mohanraj Krishnan';
                role = 'TECHNICIAN';
              } else if (email?.includes('sweeper')) {
                userId = 'usr_thangavel';
                fullName = 'Thangavel Murugan';
                role = 'TECHNICIAN';
              } else if (email?.includes('jeeva') || email?.includes('selvam')) {
                userId = 'usr_selvam';
                fullName = 'Selvam Muthuraj';
                role = 'TECHNICIAN';
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                access_token: `mock_jwt_${userId}_${Date.now()}`,
                token_type: 'bearer',
                user_id: userId,
                full_name: fullName,
                role: role
              }));
            } catch {
              res.statusCode = 400;
              res.end('{}');
            }
          });
          return;
        }

        // 2. Campus Nodes
        if (pathname === '/api/v1/campus/nodes') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([
            { id: 'node_pg201', code: 'PG-201', node_code: 'PG-201', name: 'PG Block 201 (Smart Lab)', block: 'PG', building_code: 'EEC-MECH-PG', floor: 2, node_type: 'ROOM' },
            { id: 'node_pg101', code: 'PG-101', node_code: 'PG-101', name: 'PG Block 101 (Smart Lab)', block: 'PG', building_code: 'EEC-MECH-PG', floor: 1, node_type: 'ROOM' },
            { id: 'node_a101', code: 'A101', node_code: 'A101', name: 'Lecture Hall A101', block: 'PG', building_code: 'EEC-MECH-PG', floor: 0, node_type: 'ROOM' },
            { id: 'node_acad204', code: 'RM-ACAD-204', node_code: 'RM-ACAD-204', name: 'Academic Lab 204', block: 'MAIN', building_code: 'EEC-ACAD', floor: 2, node_type: 'ROOM' },
            { id: 'node_main201', code: 'MAIN-201', node_code: 'MAIN-201', name: 'Main Block 201', block: 'MAIN', building_code: 'EEC-ACAD', floor: 2, node_type: 'ROOM' },
            { id: 'node_civil101', code: 'CIVIL-101', node_code: 'CIVIL-101', name: 'Civil Block 101', block: 'CIVIL', building_code: 'CIVIL', floor: 1, node_type: 'ROOM' },
            { id: 'node_mech301', code: 'MECH-301', node_code: 'MECH-301', name: 'Mechanical Block 301', block: 'MECH', building_code: 'MECH', floor: 3, node_type: 'ROOM' }
          ]));
          return;
        }

        // 3. Bookings
        if (pathname === '/api/v1/bookings') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
          return;
        }

        // 4. Work Orders GET & POST
        if (pathname === '/api/v1/work-orders') {
          if (req.method === 'GET') {
            const assignedTechId = url.searchParams.get('assigned_tech_id');

            // Read any predictive warnings from outbox
            let warnings: any[] = [];
            if (existsSync(outboxPath)) {
              try {
                warnings = JSON.parse(readFileSync(outboxPath, 'utf8'));
              } catch {}
            }

            const combined = [...mockWorkOrders];

            // Add predictive warnings if not already present
            warnings.forEach((w: any, idx: number) => {
              const existing = combined.find(wo => wo.id === w.id);
              if (!existing) {
                combined.unshift({
                  id: w.id || `pred_wo_${idx}`,
                  ticket_number: 4080 + idx,
                  node_code: w.room || 'PG-201',
                  node_name: `PG Block ${w.room || '201'}`,
                  category: 'AV_EQUIPMENT',
                  calculated_priority: w.severity === 'warning' ? 'P2_MEDIUM' : 'P1_HIGH',
                  reporter_urgency: 'P1_HIGH',
                  state: w.severity === 'resolved' ? 'RESOLVED' : 'TRIAGED',
                  assigned_tech_id: 'usr_karthik',
                  assigned_tech_name: 'Karthik Subramanian (AV Tech)',
                  assigned_tech_role: 'ELECTRICAL',
                  assigned_tech_email: 'arunak0787@gmail.com',
                  raw_description: w.raw_description || `[AUTOMATED PREDICTIVE WARNING] ${w.failureMode} detected in ${w.room}`,
                  ai_summary: `Predictive maintenance: ${w.failureMode} (${w.predictedFailureAt || 'imminent'})`,
                  created_at: w.createdAt || new Date().toISOString()
                });
              }
            });

            // Filter for technician if requested
            let filtered = combined;
            if (assignedTechId) {
              filtered = combined.filter(wo => {
                if (wo.assigned_tech_id === assignedTechId) return true;
                // If technician is Karthik, include all ELECTRICAL and AV_EQUIPMENT
                if (assignedTechId === 'usr_karthik' && (wo.category === 'ELECTRICAL' || wo.category === 'AV_EQUIPMENT')) return true;
                if (assignedTechId === 'usr_ramesh' && wo.category === 'PLUMBING') return true;
                if (assignedTechId === 'usr_suresh' && wo.category === 'NETWORK') return true;
                if (assignedTechId === 'usr_thangavel' && wo.category === 'SWEEPER') return true;
                if (assignedTechId === 'usr_selvam' && wo.category === 'STRUCTURAL_SAFETY') return true;
                if (assignedTechId === 'usr_mohanraj' && wo.category === 'SOS') return true;
                return false;
              });
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(filtered));
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                const cat = parsed.category || 'ELECTRICAL';
                const tech = TECH_MAP[cat] || TECH_MAP.ELECTRICAL;
                const newTicket = {
                  id: `wo_${Date.now()}`,
                  ticket_number: 1050 + mockWorkOrders.length,
                  node_code: parsed.room_code || parsed.node_code || 'PG-201',
                  node_name: parsed.node_name || `Campus Room ${parsed.room_code || 'PG-201'}`,
                  category: cat,
                  calculated_priority: parsed.urgency || parsed.calculated_priority || 'P2_MEDIUM',
                  reporter_urgency: parsed.urgency || 'P2_MEDIUM',
                  state: 'TRIAGED',
                  assigned_tech_id: tech.id,
                  assigned_tech_name: tech.name,
                  assigned_tech_role: tech.role,
                  assigned_tech_email: tech.email,
                  raw_description: parsed.description || parsed.raw_description || 'Maintenance request',
                  ai_summary: parsed.description || 'Maintenance request',
                  created_at: new Date().toISOString()
                };
                mockWorkOrders.unshift(newTicket);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, ticket: newTicket }));
              } catch {
                res.statusCode = 400;
                res.end('{}');
              }
            });
            return;
          }
        }

        // 5. Transitions POST: /api/v1/work-orders/:id/transitions & /transition
        if ((pathname.includes('/transitions') || pathname.includes('/transition')) && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const targetState = parsed.target_state || parsed.targetState || 'RESOLVED';
              const ticketIdMatch = pathname.match(/\/work-orders\/([^\/]+)\/transition/);
              const ticketId = ticketIdMatch ? ticketIdMatch[1] : '';

              const ticket = mockWorkOrders.find(wo => wo.id === ticketId || String(wo.ticket_number) === ticketId);
              if (ticket) {
                ticket.state = targetState;
                if (targetState === 'RESOLVED') {
                  ticket.resolved_at = new Date().toISOString();
                }
              }

              // Also check warnings.json to resolve predictive warning if matching
              if (existsSync(outboxPath)) {
                try {
                  const warnings = JSON.parse(readFileSync(outboxPath, 'utf8'));
                  const wIdx = warnings.findIndex((w: any) => w.id === ticketId || (ticket && w.room === ticket.node_code));
                  if (wIdx >= 0) {
                    if (targetState === 'RESOLVED') {
                      warnings[wIdx].severity = 'resolved';
                      writeFileSync(outboxPath, JSON.stringify(warnings, null, 2), 'utf8');
                    }
                  }
                } catch {}
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: `State transitioned to ${targetState}`,
                target_state: targetState,
                ticket: ticket || null
              }));
            } catch {
              res.statusCode = 400;
              res.end('{}');
            }
          });
          return;
        }

        // 6. AI Intake Chat: POST /api/v1/intake/chat
        if (pathname === '/api/v1/intake/chat' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { text } = JSON.parse(body || '{}');
              const complaint = text || '';
              const loc = extractLocation(complaint);
              const cat = extractCategory(complaint);
              const urgency = extractUrgency(complaint, cat);

              // If location is NOT mentioned or ambiguous -> AI asks for clarification
              if (!loc) {
                const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                pendingClarifications.set(threadId, {
                  threadId,
                  originalText: complaint,
                  category: cat,
                  urgency,
                  createdAt: Date.now()
                });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  is_incident: true,
                  clarification_needed: true,
                  clarification_question: `I understand there is an issue with the ${cat.toLowerCase().replace('_', ' ')}. Which block and room number is this occurring in? (e.g., PG Block Room 201, Main Block 102)`,
                  conversation_thread_id: threadId,
                  category: cat,
                  state: 'AWAITING_CLARIFICATION'
                }));
                return;
              }

              // Location is known -> Create structured ticket immediately
              const tech = TECH_MAP[cat] || TECH_MAP.ELECTRICAL;
              const ticketNum = 1050 + mockWorkOrders.length;
              const newTicket = {
                id: `wo_intake_${Date.now()}`,
                ticket_number: ticketNum,
                node_code: loc.code,
                node_name: loc.name,
                category: cat,
                calculated_priority: urgency,
                reporter_urgency: urgency,
                state: 'TRIAGED',
                assigned_tech_id: tech.id,
                assigned_tech_name: tech.name,
                assigned_tech_role: tech.role,
                assigned_tech_email: tech.email,
                raw_description: complaint,
                ai_summary: `${cat.replace('_', ' ')} breakdown reported in ${loc.code}: "${complaint.substring(0, 80)}"`,
                created_at: new Date().toISOString()
              };

              mockWorkOrders.unshift(newTicket);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                is_incident: true,
                clarification_needed: false,
                work_order_id: newTicket.id,
                ticket_number: newTicket.ticket_number,
                target_node_code: newTicket.node_code,
                target_node_name: newTicket.node_name,
                category: newTicket.category,
                state: newTicket.state,
                assigned_tech_name: newTicket.assigned_tech_name,
                concise_summary: newTicket.ai_summary
              }));
            } catch {
              res.statusCode = 400;
              res.end('{}');
            }
          });
          return;
        }

        // 7. Clarification Reply: POST /api/v1/intake/:threadId/clarify & /api/v1/intake/clarify/:threadId
        if ((pathname.includes('/intake/') && pathname.includes('/clarify')) && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { reply_text } = JSON.parse(body || '{}');
              const threadMatch = pathname.match(/\/intake\/([^\/]+)\/clarify/) || pathname.match(/\/intake\/clarify\/([^\/]+)/);
              const threadId = threadMatch ? threadMatch[1] : '';

              const pending = pendingClarifications.get(threadId);
              const fullText = `${pending?.originalText || ''} ${reply_text || ''}`;
              const loc = extractLocation(reply_text || '') || extractLocation(fullText);

              if (!loc) {
                // Still ambiguous
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  is_incident: true,
                  clarification_needed: true,
                  clarification_question: `Could you please specify the room number, lab code, or building name (e.g. PG Block Room 201 or Civil 101)?`,
                  conversation_thread_id: threadId,
                  state: 'AWAITING_CLARIFICATION'
                }));
                return;
              }

              // Resolved! Create structured ticket
              const cat = pending?.category || extractCategory(fullText);
              const urgency = pending?.urgency || extractUrgency(fullText, cat);
              const tech = TECH_MAP[cat] || TECH_MAP.ELECTRICAL;
              const ticketNum = 1050 + mockWorkOrders.length;

              const newTicket = {
                id: `wo_clarified_${Date.now()}`,
                ticket_number: ticketNum,
                node_code: loc.code,
                node_name: loc.name,
                category: cat,
                calculated_priority: urgency,
                reporter_urgency: urgency,
                state: 'TRIAGED',
                assigned_tech_id: tech.id,
                assigned_tech_name: tech.name,
                assigned_tech_role: tech.role,
                assigned_tech_email: tech.email,
                raw_description: `Report: ${pending?.originalText || ''} (Clarification: ${reply_text})`,
                ai_summary: `${cat.replace('_', ' ')} fault in ${loc.code}: "${(pending?.originalText || reply_text).substring(0, 80)}"`,
                created_at: new Date().toISOString()
              };

              mockWorkOrders.unshift(newTicket);
              pendingClarifications.delete(threadId);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                is_incident: true,
                clarification_needed: false,
                work_order_id: newTicket.id,
                ticket_number: newTicket.ticket_number,
                target_node_code: newTicket.node_code,
                target_node_name: newTicket.node_name,
                category: newTicket.category,
                state: newTicket.state,
                assigned_tech_name: newTicket.assigned_tech_name,
                concise_summary: newTicket.ai_summary
              }));
            } catch {
              res.statusCode = 400;
              res.end('{}');
            }
          });
          return;
        }

        // 8. General Form Intake: POST /api/v1/intake
        if (pathname === '/api/v1/intake' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const { text } = JSON.parse(body || '{}');
              const complaint = text || '';
              const loc = extractLocation(complaint) || { code: 'PG-201', name: 'PG Block 201' };
              const cat = extractCategory(complaint);
              const urgency = extractUrgency(complaint, cat);
              const tech = TECH_MAP[cat] || TECH_MAP.ELECTRICAL;

              const ticketNum = 1050 + mockWorkOrders.length;
              const newTicket = {
                id: `wo_form_${Date.now()}`,
                ticket_number: ticketNum,
                node_code: loc.code,
                node_name: loc.name,
                category: cat,
                calculated_priority: urgency,
                reporter_urgency: urgency,
                state: 'TRIAGED',
                assigned_tech_id: tech.id,
                assigned_tech_name: tech.name,
                assigned_tech_role: tech.role,
                assigned_tech_email: tech.email,
                raw_description: complaint,
                ai_summary: `Form Report: ${cat} in ${loc.code}`,
                created_at: new Date().toISOString()
              };

              mockWorkOrders.unshift(newTicket);

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: true,
                ticket_number: newTicket.ticket_number,
                work_order_id: newTicket.id,
                state: newTicket.state,
                ticket: newTicket
              }));
            } catch {
              res.statusCode = 400;
              res.end('{}');
            }
          });
          return;
        }

        // 9. Comments GET & POST
        if (pathname.includes('/comments')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
          return;
        }

        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), fallbackApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
});
