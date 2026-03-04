import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { Pool } from 'pg';
import { Server } from 'socket.io';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { usePostgresAuthState } from './usePostgresAuthState';

const logger = pino({ level: 'silent' });

export class SessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private connecting: Set<string> = new Set();
  private shuttingDown = false;
  private pool: Pool;
  private io: Server;

  constructor(pool: Pool, io: Server) {
    this.pool = pool;
    this.io = io;
  }

  async connectSession(sessionId: string): Promise<void> {
    if (this.connecting.has(sessionId) || this.shuttingDown) return;
    this.connecting.add(sessionId);

    const tag = sessionId.slice(0, 8);

    try {
      // Close existing socket if any
      const existing = this.sessions.get(sessionId);
      if (existing) {
        existing.end(undefined);
        this.sessions.delete(sessionId);
      }

      const { state, saveCreds } = await usePostgresAuthState(this.pool, sessionId);
      const { version } = await fetchLatestBaileysVersion();

      // Check if session has a proxy configured
      const { rows: sessionRows } = await this.pool.query(
        'SELECT proxy_url FROM sessions WHERE id = $1', [sessionId]
      );
      const proxyUrl = sessionRows[0]?.proxy_url;

      let agent: any = undefined;
      if (proxyUrl) {
        if (proxyUrl.startsWith('socks')) {
          agent = new SocksProxyAgent(proxyUrl);
          console.log(`[Session ${tag}] Using SOCKS proxy`);
        } else {
          agent = new HttpsProxyAgent(proxyUrl);
          console.log(`[Session ${tag}] Using HTTP proxy`);
        }
      }

      console.log(`[Session ${tag}] Connecting with Baileys v${version.join('.')}`);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        version,
        printQRInTerminal: false,
        logger,
        agent,
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr);
            await this.updateStatus(sessionId, 'qr_ready');
            this.io.emit('session:qr', { sessionId, qrDataUrl });
            this.io.emit('session:status', { sessionId, status: 'qr_ready' });
          } catch (err) {
            console.error(`[Session ${tag}] QR generation failed:`, err);
          }
        }

        if (connection === 'open') {
          const phone = sock.user?.id.split(':')[0] || '';
          console.log(`[Session ${tag}] Connected! Phone: ${phone}`);
          await this.updateStatus(sessionId, 'connected', phone);
          this.io.emit('session:status', { sessionId, status: 'connected', phone });
        }

        if (connection === 'close') {
          this.sessions.delete(sessionId);

          // Don't reconnect if server is shutting down
          if (this.shuttingDown) return;

          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          console.log(`[Session ${tag}] Connection closed, code: ${statusCode}`);

          if (statusCode === DisconnectReason.loggedOut) {
            // Only clear auth when WhatsApp explicitly logs us out
            console.log(`[Session ${tag}] Logged out by WhatsApp, clearing auth`);
            await this.clearAuth(sessionId);
            await this.updateStatus(sessionId, 'logged_out');
            this.io.emit('session:status', { sessionId, status: 'logged_out' });
          } else if (statusCode === DisconnectReason.restartRequired) {
            console.log(`[Session ${tag}] Restart required, reconnecting immediately`);
            this.connecting.delete(sessionId);
            await this.connectSession(sessionId);
            return;
          } else {
            // Any other disconnect: keep auth, mark disconnected, try to reconnect
            console.log(`[Session ${tag}] Disconnected, will retry in 5s`);
            await this.updateStatus(sessionId, 'disconnected');
            this.io.emit('session:status', { sessionId, status: 'disconnected' });
            setTimeout(() => {
              if (this.shuttingDown) return;
              this.connecting.delete(sessionId);
              this.connectSession(sessionId).catch(console.error);
            }, 5000);
          }
        }
      });

      sock.ev.on('creds.update', saveCreds);

      this.sessions.set(sessionId, sock);
      await this.updateStatus(sessionId, 'connecting');
    } catch (err) {
      console.error(`[Session ${tag}] Failed to connect:`, err);
    } finally {
      this.connecting.delete(sessionId);
    }
  }

  getSocket(sessionId: string): WASocket | undefined {
    return this.sessions.get(sessionId);
  }

  isConnected(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const sock = this.sessions.get(sessionId);
    if (sock) {
      sock.end(undefined);
      this.sessions.delete(sessionId);
    }
    await this.updateStatus(sessionId, 'disconnected');
    this.io.emit('session:status', { sessionId, status: 'disconnected' });
  }

  /**
   * Restore sessions that have auth creds stored in DB.
   * Tries to reconnect any session that has creds (not logged_out).
   */
  async restoreAllSessions(): Promise<void> {
    // Find all sessions that have auth creds stored (meaning they were connected before)
    const { rows } = await this.pool.query(
      `SELECT s.id, s.name, s.status FROM sessions s
       INNER JOIN session_auth_creds sac ON sac.session_id = s.id
       WHERE s.status != 'logged_out'`
    );

    if (rows.length === 0) {
      console.log('[SessionManager] No sessions with stored creds to restore');
      return;
    }

    console.log(`[SessionManager] Restoring ${rows.length} session(s)...`);

    for (const row of rows) {
      try {
        console.log(`[SessionManager] Restoring "${row.name}" (${row.id.slice(0, 8)})`);
        await this.connectSession(row.id);
      } catch (err) {
        console.error(`[SessionManager] Failed to restore session ${row.id}:`, err);
      }
    }
  }

  /**
   * Graceful shutdown: close all sockets without clearing auth.
   * Sessions will be restored on next server start.
   */
  async gracefulShutdown(): Promise<void> {
    this.shuttingDown = true;
    console.log(`[SessionManager] Graceful shutdown, closing ${this.sessions.size} session(s)...`);

    for (const [sessionId, sock] of this.sessions) {
      try {
        sock.end(undefined);
        // Mark as disconnected but keep auth creds for restore
        await this.pool.query(
          'UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['disconnected', sessionId]
        );
      } catch (err) {
        console.error(`[SessionManager] Error closing session ${sessionId.slice(0, 8)}:`, err);
      }
    }

    this.sessions.clear();
    console.log('[SessionManager] All sessions closed');
  }

  private async updateStatus(sessionId: string, status: string, phone?: string): Promise<void> {
    if (phone) {
      await this.pool.query(
        'UPDATE sessions SET status = $1, phone = $2, updated_at = NOW() WHERE id = $3',
        [status, phone, sessionId]
      );
    } else {
      await this.pool.query(
        'UPDATE sessions SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, sessionId]
      );
    }
  }

  private async clearAuth(sessionId: string): Promise<void> {
    console.log(`[Auth ${sessionId.slice(0, 8)}] Clearing all auth data`);
    await this.pool.query('DELETE FROM session_auth_keys WHERE session_id = $1', [sessionId]);
    await this.pool.query('DELETE FROM session_auth_creds WHERE session_id = $1', [sessionId]);
  }
}
