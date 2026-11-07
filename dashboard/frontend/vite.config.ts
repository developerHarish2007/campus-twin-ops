import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

function fallbackApiPlugin(): Plugin {
  const outboxPath = path.resolve(__dirname, '../outbox/warnings.json');
  let mockWorkOrders: any[] = [
    {
      id: 'wo_seed_101',
      ticket_number: 1042,
      node_code: 'A101',
      node_name: 'Lecture Hall A101 (Main)',
      category: 'AV_EQUIPMENT',
      calculated_priority: 'P2_MEDIUM',
      reporter_urgency: 'P2_MEDIUM',
      state: 'TRIAGED',
      assigned_tech_name: 'Karthik Subramanian (AV Tech)',
      assigned_tech_role: 'ELECTRICAL',
      raw_description: 'Audio visual projection HDMI sync issue reported.',
      ai_summary: 'Projector sync loss on HDMI-1 interface',
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ];

  return {
    name: 'campusops-fallback-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/v1')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost:5173');
        const pathname = url.pathname;

        // Campus Nodes
        if (pathname === '/api/v1/campus/nodes') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([
            { id: 'node_pg201', code: 'PG-201', name: 'PG Block 201 (Smart Lab)', block: 'PG', floor: 2 },
            { id: 'node_a101', code: 'A101', name: 'Lecture Hall A101', block: 'PG', floor: 0 },
            { id: 'node_pg101', code: 'PG-101', name: 'PG Block 101 (Smart Lab)', block: 'PG', floor: 1 },
            { id: 'node_main201', code: 'MAIN-201', name: 'Main Block 201', block: 'MAIN', floor: 2 },
            { id: 'node_civil101', code: 'CIVIL-101', name: 'Civil Block 101', block: 'CIVIL', floor: 1 }
          ]));
          return;
        }

        // Bookings
        if (pathname === '/api/v1/bookings') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify([]));
          return;
        }

        // Work Orders GET
        if (pathname === '/api/v1/work-orders' && req.method === 'GET') {
          let warnings: any[] = [];
          if (existsSync(outboxPath)) {
            try {
              warnings = JSON.parse(readFileSync(outboxPath, 'utf8'));
            } catch {}
          }

          const combined = [...mockWorkOrders];
          // Inject predictive warnings as work orders
          warnings.forEach((w: any, idx: number) => {
            combined.unshift({
              id: w.id || `pred_wo_${idx}`,
              ticket_number: 4080 + idx,
              node_code: w.room || 'PG-201',
              node_name: `PG Block ${w.room || '201'}`,
              category: 'AV_EQUIPMENT',
              calculated_priority: w.severity === 'warning' ? 'P2_MEDIUM' : 'P1_HIGH',
              reporter_urgency: 'P1_HIGH',
              state: 'TRIAGED',
              assigned_tech_name: 'Karthik Subramanian (AV Tech)',
              assigned_tech_role: 'ELECTRICAL',
              raw_description: w.raw_description || `[AUTOMATED PREDICTIVE WARNING] ${w.failureMode} detected in ${w.room}`,
              ai_summary: `Predictive maintenance warning: ${w.failureMode} at ${w.predictedFailureAt || 'imminent'}`,
              created_at: w.createdAt || new Date().toISOString()
            });
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(combined));
          return;
        }

        // Transitions POST
        if (pathname.includes('/transitions') || pathname.includes('/transition')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, message: 'State transitioned in fallback mode' }));
          return;
        }

        // Intake POST
        if (pathname.startsWith('/api/v1/intake') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const newTicket = {
                id: `intake_${Date.now()}`,
                ticket_number: 1050 + mockWorkOrders.length,
                node_code: 'PG-201',
                node_name: 'PG Block 201',
                category: 'AV_EQUIPMENT',
                calculated_priority: 'P1_HIGH',
                reporter_urgency: 'P1_HIGH',
                state: 'TRIAGED',
                assigned_tech_name: 'Karthik Subramanian (AV Tech)',
                assigned_tech_role: 'ELECTRICAL',
                raw_description: parsed.text || 'Student incident report',
                ai_summary: parsed.text || 'Student incident report',
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

        // Comments
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
