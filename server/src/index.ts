import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';
import pool from './db/pool';
import { initSocketIO } from './socket/socketManager';
import { SessionManager } from './whatsapp/SessionManager';
import { senderService } from './services/senderService';
import { createSessionRoutes } from './routes/sessionRoutes';
import contactListRoutes from './routes/contactListRoutes';
import campaignRoutes from './routes/campaignRoutes';
import autopilotRoutes from './routes/autopilotRoutes';
import { autopilotService } from './services/autopilotService';

dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const allowedOrigins = CLIENT_URL.split(',').map(u => u.trim());

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Auth
const AUTH_USER = process.env.AUTH_USER || 'coquesito';
const AUTH_PASS = process.env.AUTH_PASS || 'coquito2026';
const AUTH_TOKEN = Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && password === AUTH_PASS) {
    res.json({ token: AUTH_TOKEN });
  } else {
    res.status(401).json({ error: 'Credenciales incorrectas' });
  }
});

app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

// Socket.IO
const io = initSocketIO(server, allowedOrigins);

// Session Manager
const sessionManager = new SessionManager(pool, io);
senderService.setSessionManager(sessionManager);
autopilotService.setSessionManager(sessionManager);

// Routes
app.use('/api/sessions', createSessionRoutes(sessionManager));
app.use('/api/contact-lists', contactListRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/autopilot', autopilotRoutes);

// Ban alerts
app.get('/api/ban-alerts', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ban_alerts WHERE dismissed = false ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ban-alerts/:id/dismiss', async (req, res) => {
  try {
    await pool.query('UPDATE ban_alerts SET dismissed = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats (enhanced)
app.get('/api/dashboard/stats', async (_req, res) => {
  try {
    const [sessions, campaigns, messages, perSession, bans, coverage, autopilot] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'connected') as connected,
        COUNT(*) FILTER (WHERE status = 'disconnected') as disconnected,
        COUNT(*) FILTER (WHERE status IN ('connecting', 'qr_ready')) as pending
        FROM sessions`),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status IN ('draft', 'paused')) as pending
        FROM campaigns`),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM message_logs WHERE sent_at >= NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT s.id as session_id, s.name as session_name, s.phone, s.status as session_status,
        COUNT(ml.id) FILTER (WHERE ml.status = 'sent') as sent,
        COUNT(ml.id) FILTER (WHERE ml.status = 'failed') as failed,
        COUNT(ml.id) as total
        FROM sessions s
        LEFT JOIN message_logs ml ON ml.session_id = s.id AND ml.sent_at >= NOW() - INTERVAL '24 hours'
        GROUP BY s.id, s.name, s.phone, s.status
        ORDER BY COUNT(ml.id) DESC`),
      pool.query(`SELECT id, session_name, phone, reason, status_code, dismissed, created_at
        FROM ban_alerts ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT
        (SELECT COUNT(DISTINCT contact_id) FROM message_logs WHERE status = 'sent') as reached,
        (SELECT COUNT(*) FROM contacts) as total`),
      pool.query(`SELECT status, last_cycle_at, next_cycle_at, messages_per_cycle
        FROM autopilot_config LIMIT 1`),
    ]);

    res.json({
      sessions: sessions.rows[0],
      campaigns: campaigns.rows[0],
      messagesToday: messages.rows[0],
      messagesPerSession: perSession.rows.map((r: any) => ({
        ...r,
        sent: parseInt(r.sent) || 0,
        failed: parseInt(r.failed) || 0,
        total: parseInt(r.total) || 0,
      })),
      banHistory: bans.rows,
      contactCoverage: {
        reached: parseInt(coverage.rows[0].reached) || 0,
        total: parseInt(coverage.rows[0].total) || 0,
      },
      autopilot: autopilot.rows[0] || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard activity (chart data — polled less frequently)
app.get('/api/dashboard/activity', async (_req, res) => {
  try {
    const [daily, hourly] = await Promise.all([
      pool.query(`SELECT DATE(sent_at) as date,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM message_logs WHERE sent_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(sent_at) ORDER BY date ASC`),
      pool.query(`SELECT DATE_TRUNC('hour', sent_at) as hour,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM message_logs WHERE sent_at >= NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', sent_at) ORDER BY hour ASC`),
    ]);

    res.json({
      daily: daily.rows.map((r: any) => ({ date: r.date, sent: parseInt(r.sent) || 0, failed: parseInt(r.failed) || 0 })),
      hourly: hourly.rows.map((r: any) => ({ hour: r.hour, sent: parseInt(r.sent) || 0, failed: parseInt(r.failed) || 0 })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await sessionManager.gracefulShutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Restore previously connected sessions
  try {
    await sessionManager.restoreAllSessions();
    console.log('Sessions restored');

    // Restore autopilot if it was running
    await autopilotService.restoreIfRunning();
  } catch (err) {
    console.error('Failed to restore sessions:', err);
  }
});
