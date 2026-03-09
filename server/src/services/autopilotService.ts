import pool from '../db/pool';
import { getIO } from '../socket/socketManager';
import { SessionManager } from '../whatsapp/SessionManager';
import { renderTemplate } from './templateService';
import { phoneToJid } from '../utils/jidHelper';
import { sleep, randomDelay } from '../utils/delay';

interface AutopilotConfig {
  id: string;
  message_templates: string[];
  messages_per_cycle: number;
  cycle_interval_hours: number;
  delay_between_ms: number;
  delay_min_ms: number;
  delay_max_ms: number;
  daily_limit_per_session: number;
  typing_simulation: boolean;
  break_after_messages: number;
  break_duration_ms: number;
  status: string;
  last_cycle_at: string | null;
  next_cycle_at: string | null;
}

interface Assignment {
  session_id: string;
  list_id: string;
  session_name: string;
  list_name: string;
}

// Number of consecutive failures before flagging a session as restricted
const CONSECUTIVE_FAIL_THRESHOLD = 5;

class AutopilotService {
  private sessionManager!: SessionManager;
  private running = false;
  private cycleTimer: NodeJS.Timeout | null = null;

  setSessionManager(sm: SessionManager) {
    this.sessionManager = sm;
  }

  /** Persist a log entry to the database and emit via socket */
  private async persistLog(message: string, type: string = 'info'): Promise<void> {
    try {
      await pool.query(
        'INSERT INTO autopilot_logs (message, type) VALUES ($1, $2)',
        [message, type]
      );
    } catch (err) {
      console.error('[Autopilot] Failed to persist log:', err);
    }
  }

  /** Get recent logs from the database */
  async getLogs(limit: number = 100): Promise<any[]> {
    const { rows } = await pool.query(
      'SELECT id, message, type, created_at FROM autopilot_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  }

  /** Clean up old logs (keep last 500) */
  async cleanOldLogs(): Promise<void> {
    await pool.query(
      `DELETE FROM autopilot_logs WHERE id NOT IN (
        SELECT id FROM autopilot_logs ORDER BY created_at DESC LIMIT 500
      )`
    );
  }

  async getConfig(): Promise<AutopilotConfig> {
    const { rows } = await pool.query('SELECT * FROM autopilot_config LIMIT 1');
    if (rows.length > 0) {
      const row = rows[0];
      return {
        ...row,
        message_templates: Array.isArray(row.message_templates) ? row.message_templates : [],
      };
    }

    const { rows: created } = await pool.query(
      `INSERT INTO autopilot_config (message_templates, messages_per_cycle, cycle_interval_hours, delay_between_ms)
       VALUES ($1::jsonb, 20, 4, 3000)
       RETURNING *`,
      [JSON.stringify([])]
    );
    return { ...created[0], message_templates: [] };
  }

  async updateConfig(updates: {
    message_templates?: string[];
    messages_per_cycle?: number;
    cycle_interval_hours?: number;
    delay_between_ms?: number;
    delay_min_ms?: number;
    delay_max_ms?: number;
    daily_limit_per_session?: number;
    typing_simulation?: boolean;
    break_after_messages?: number;
    break_duration_ms?: number;
  }): Promise<AutopilotConfig> {
    const config = await this.getConfig();
    const { rows } = await pool.query(
      `UPDATE autopilot_config SET
        message_templates = COALESCE($1::jsonb, message_templates),
        messages_per_cycle = COALESCE($2, messages_per_cycle),
        cycle_interval_hours = COALESCE($3, cycle_interval_hours),
        delay_between_ms = COALESCE($4, delay_between_ms),
        delay_min_ms = COALESCE($5, delay_min_ms),
        delay_max_ms = COALESCE($6, delay_max_ms),
        daily_limit_per_session = COALESCE($7, daily_limit_per_session),
        typing_simulation = COALESCE($8, typing_simulation),
        break_after_messages = COALESCE($9, break_after_messages),
        break_duration_ms = COALESCE($10, break_duration_ms),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [
        updates.message_templates ? JSON.stringify(updates.message_templates) : null,
        updates.messages_per_cycle ?? null,
        updates.cycle_interval_hours ?? null,
        updates.delay_between_ms ?? null,
        updates.delay_min_ms ?? null,
        updates.delay_max_ms ?? null,
        updates.daily_limit_per_session ?? null,
        updates.typing_simulation ?? null,
        updates.break_after_messages ?? null,
        updates.break_duration_ms ?? null,
        config.id,
      ]
    );
    const row = rows[0];
    return { ...row, message_templates: Array.isArray(row.message_templates) ? row.message_templates : [] };
  }

  async getAssignments(): Promise<Assignment[]> {
    const { rows } = await pool.query(
      `SELECT aa.session_id, aa.list_id,
              s.name as session_name, cl.name as list_name
       FROM autopilot_assignments aa
       JOIN sessions s ON s.id = aa.session_id
       JOIN contact_lists cl ON cl.id = aa.list_id
       ORDER BY s.name`
    );
    return rows;
  }

  async setAssignment(sessionId: string, listId: string): Promise<void> {
    await pool.query(
      `INSERT INTO autopilot_assignments (session_id, list_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO UPDATE SET list_id = $2`,
      [sessionId, listId]
    );
  }

  async removeAssignment(sessionId: string): Promise<void> {
    await pool.query('DELETE FROM autopilot_assignments WHERE session_id = $1', [sessionId]);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const config = await this.getConfig();
    await pool.query(
      "UPDATE autopilot_config SET status = 'running', updated_at = NOW() WHERE id = $1",
      [config.id]
    );

    const io = getIO();
    io.emit('autopilot:status', { status: 'running' });
    await this.persistLog('Autopilot iniciado', 'success');

    console.log('[Autopilot] Started');
    this.runLoop().catch(err => {
      console.error('[Autopilot] Loop error:', err);
      this.stop();
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }

    const config = await this.getConfig();
    await pool.query(
      "UPDATE autopilot_config SET status = 'stopped', next_cycle_at = NULL, updated_at = NOW() WHERE id = $1",
      [config.id]
    );

    const io = getIO();
    io.emit('autopilot:status', { status: 'stopped' });
    await this.persistLog('Autopilot detenido', 'warning');
    console.log('[Autopilot] Stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  async restoreIfRunning(): Promise<void> {
    const config = await this.getConfig();
    if (config.status === 'running') {
      console.log('[Autopilot] Was running before shutdown, restarting...');
      this.running = true;
      this.runLoop().catch(err => {
        console.error('[Autopilot] Restore loop error:', err);
        this.stop();
      });
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const config = await this.getConfig();
      const assignments = await this.getAssignments();

      if (assignments.length === 0) {
        console.log('[Autopilot] No assignments configured, waiting...');
        const io = getIO();
        const msg = 'Sin asignaciones configuradas. Esperando...';
        io.emit('autopilot:log', { message: msg });
        await this.persistLog(msg, 'warning');
        await this.waitOrStop(30000);
        continue;
      }

      if (config.message_templates.length === 0) {
        console.log('[Autopilot] No templates configured, waiting...');
        const io = getIO();
        const msg = 'Sin templates configurados. Esperando...';
        io.emit('autopilot:log', { message: msg });
        await this.persistLog(msg, 'warning');
        await this.waitOrStop(30000);
        continue;
      }

      console.log(`[Autopilot] Starting cycle: ${assignments.length} phones, ${config.messages_per_cycle} msgs each, ${config.message_templates.length} templates`);
      const io = getIO();
      const cycleStartMsg = `Ciclo iniciado: ${assignments.length} telefonos, ${config.messages_per_cycle} msgs c/u`;
      io.emit('autopilot:cycle_start', {
        phones: assignments.length,
        messagesPerCycle: config.messages_per_cycle,
      });
      await this.persistLog(cycleStartMsg, 'info');

      await this.runCycle(config, assignments);

      if (!this.running) break;

      const intervalMs = config.cycle_interval_hours * 3600 * 1000;
      const nextCycleAt = new Date(Date.now() + intervalMs);

      await pool.query(
        "UPDATE autopilot_config SET last_cycle_at = NOW(), next_cycle_at = $1, updated_at = NOW() WHERE id = $2",
        [nextCycleAt.toISOString(), config.id]
      );

      const cycleEndMsg = `Ciclo completado. Proximo: ${nextCycleAt.toLocaleTimeString()}`;
      console.log(`[Autopilot] Cycle complete. Next cycle at ${nextCycleAt.toLocaleTimeString()}`);
      io.emit('autopilot:cycle_end', {
        nextCycleAt: nextCycleAt.toISOString(),
      });
      await this.persistLog(cycleEndMsg, 'success');

      await this.waitOrStop(intervalMs);
    }
  }

  /**
   * Flag a session as restricted: update DB, remove from autopilot, notify frontend.
   */
  private async flagRestricted(sessionId: string, sessionName: string, consecutiveFails: number): Promise<void> {
    const io = getIO();

    // Get phone
    const { rows: sInfo } = await pool.query('SELECT phone FROM sessions WHERE id = $1', [sessionId]);
    const phone = sInfo[0]?.phone || null;

    // 1. Update session status
    await pool.query(
      "UPDATE sessions SET status = 'restricted', updated_at = NOW() WHERE id = $1",
      [sessionId]
    );

    // 2. Save alert (reuse ban_alerts table with reason='restricted')
    const { rows: alertRows } = await pool.query(
      `INSERT INTO ban_alerts (session_id, session_name, phone, reason, status_code)
       VALUES ($1, $2, $3, 'restricted', 0) RETURNING *`,
      [sessionId, sessionName, phone]
    );

    // 3. Remove from autopilot
    await pool.query('DELETE FROM autopilot_assignments WHERE session_id = $1', [sessionId]);

    // 4. Notify frontend
    io.emit('session:status', { sessionId, status: 'restricted' });
    io.emit('session:banned', alertRows[0]); // reuse ban alert component
    io.emit('autopilot:assignment_removed', { sessionId, reason: 'restricted' });

    const msg = `⚠️ ${sessionName} marcado como RESTRINGIDO (${consecutiveFails} fallos consecutivos). Removido del autopilot.`;
    io.emit('autopilot:log', { message: msg, type: 'error' });
    await this.persistLog(msg, 'error');

    console.log(`[Autopilot] Session "${sessionName}" flagged as restricted after ${consecutiveFails} consecutive failures`);
  }

  /**
   * Get today's sent count for a session from session_daily_counts.
   */
  private async getDailySentCount(sessionId: string): Promise<number> {
    const { rows } = await pool.query(
      'SELECT sent_count FROM session_daily_counts WHERE session_id = $1 AND date = CURRENT_DATE',
      [sessionId]
    );
    return rows[0]?.sent_count || 0;
  }

  /**
   * Increment today's sent/failed count for a session.
   */
  private async incrementDailyCount(sessionId: string, field: 'sent_count' | 'failed_count'): Promise<void> {
    await pool.query(
      `INSERT INTO session_daily_counts (session_id, date, ${field})
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (session_id, date) DO UPDATE SET ${field} = session_daily_counts.${field} + 1`,
      [sessionId]
    );
  }

  /**
   * Run a single cycle with round-robin sending.
   * Each phone gets a different template: phone[i] uses templates[i % templates.length]
   * Anti-ban features:
   * - Random delay between min/max (human-like timing)
   * - Typing simulation (composing presence before sending)
   * - Daily limit per session (prevents oversaturation)
   * - Periodic breaks every N messages (simulates human pauses)
   * - Consecutive failure detection (restriction flagging)
   */
  private async runCycle(config: AutopilotConfig, assignments: Assignment[]): Promise<void> {
    const io = getIO();
    const templates = config.message_templates;

    // Track consecutive failures per session for restriction detection
    const consecutiveFailures: Map<string, number> = new Map();
    const restrictedInCycle: Set<string> = new Set();
    const dailyLimitReached: Set<string> = new Set();

    // Pre-fetch contacts for each assignment and check daily limits
    const contactQueues: Map<string, any[]> = new Map();

    for (const a of assignments) {
      // Check daily limit before fetching contacts
      const dailySent = await this.getDailySentCount(a.session_id);
      const remaining = config.daily_limit_per_session - dailySent;

      if (remaining <= 0) {
        dailyLimitReached.add(a.session_id);
        const limitMsg = `${a.session_name}: limite diario alcanzado (${dailySent}/${config.daily_limit_per_session})`;
        io.emit('autopilot:log', { message: limitMsg, type: 'warning' });
        await this.persistLog(limitMsg, 'warning');
        console.log(`[Autopilot] ${a.session_name} daily limit reached (${dailySent}/${config.daily_limit_per_session})`);
        continue;
      }

      // Fetch contacts, capped by remaining daily allowance
      const fetchLimit = Math.min(config.messages_per_cycle, remaining);

      const { rows } = await pool.query(
        `SELECT c.id, c.phone, c.name, c.custom_fields
         FROM contacts c
         WHERE c.list_id = $1
           AND c.id NOT IN (
             SELECT ml.contact_id FROM message_logs ml WHERE ml.contact_id = c.id AND ml.status = 'sent'
           )
         ORDER BY c.created_at ASC
         LIMIT $2`,
        [a.list_id, fetchLimit]
      );
      contactQueues.set(a.session_id, rows);
      consecutiveFailures.set(a.session_id, 0);

      if (rows.length === 0) {
        console.log(`[Autopilot] No more contacts for ${a.session_name} in ${a.list_name}`);
      } else if (fetchLimit < config.messages_per_cycle) {
        const capMsg = `${a.session_name}: limitado a ${fetchLimit} msgs (quedan ${remaining} del limite diario)`;
        io.emit('autopilot:log', { message: capMsg, type: 'info' });
        await this.persistLog(capMsg, 'info');
      }
    }

    // Check if all sessions hit daily limit
    if (dailyLimitReached.size === assignments.length) {
      const allLimitMsg = 'Todas las sesiones alcanzaron el limite diario. Ciclo omitido.';
      io.emit('autopilot:log', { message: allLimitMsg, type: 'warning' });
      await this.persistLog(allLimitMsg, 'warning');
      return;
    }

    let totalSent = 0;
    let totalFailed = 0;
    let totalMessages = 0; // counter for break logic

    for (let msgIdx = 0; msgIdx < config.messages_per_cycle; msgIdx++) {
      for (let phoneIdx = 0; phoneIdx < assignments.length; phoneIdx++) {
        if (!this.running) return;

        const assignment = assignments[phoneIdx];

        // Skip sessions already flagged as restricted or at daily limit
        if (restrictedInCycle.has(assignment.session_id)) continue;
        if (dailyLimitReached.has(assignment.session_id)) continue;

        const queue = contactQueues.get(assignment.session_id);
        if (!queue || msgIdx >= queue.length) continue;

        const contact = queue[msgIdx];
        const sock = this.sessionManager.getSocket(assignment.session_id);

        if (!sock) {
          const skipMsg = `${assignment.session_name} desconectado, saltando`;
          console.log(`[Autopilot] Session ${assignment.session_name} not connected, skipping`);
          io.emit('autopilot:log', { message: skipMsg, type: 'warning' });
          await this.persistLog(skipMsg, 'warning');
          continue;
        }

        // ANTI-BAN: Take a break every N messages
        if (config.break_after_messages > 0 && totalMessages > 0 && totalMessages % config.break_after_messages === 0) {
          const breakSecs = Math.round(config.break_duration_ms / 1000);
          const breakMsg = `Pausa de ${breakSecs}s despues de ${totalMessages} mensajes...`;
          io.emit('autopilot:log', { message: breakMsg, type: 'info' });
          await this.persistLog(breakMsg, 'info');
          console.log(`[Autopilot] Taking ${breakSecs}s break after ${totalMessages} messages`);
          await sleep(config.break_duration_ms);
          if (!this.running) return;
        }

        // Each phone gets a different template (rotates through the list)
        const template = templates[phoneIdx % templates.length];

        const variables: Record<string, string> = {
          nombre: contact.name || '',
          telefono: contact.phone || '',
          ...(contact.custom_fields || {}),
        };
        const message = renderTemplate(template, variables);
        const jid = phoneToJid(contact.phone);

        try {
          // ANTI-BAN: Simulate typing before sending
          if (config.typing_simulation) {
            try {
              await sock.sendPresenceUpdate('composing', jid);
              await sleep(randomDelay(1500, 4000));
            } catch (_) { /* presence update failures are non-critical */ }
          }

          const result = await sock.sendMessage(jid, { text: message });

          // ANTI-BAN: Send "paused" presence after message (stopped typing)
          if (config.typing_simulation) {
            try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
          }

          await pool.query(
            `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, wa_message_id, session_id)
             VALUES (NULL, $1, $2, 'sent', $3, $4)`,
            [contact.id, contact.phone, result?.key?.id || null, assignment.session_id]
          );

          totalSent++;
          totalMessages++;
          await this.incrementDailyCount(assignment.session_id, 'sent_count');

          // Reset consecutive failures on success
          consecutiveFailures.set(assignment.session_id, 0);

          io.emit('autopilot:message_sent', {
            sessionName: assignment.session_name,
            contactPhone: contact.phone,
            contactName: contact.name,
            status: 'sent',
            msgNumber: msgIdx + 1,
            templateIdx: phoneIdx % templates.length,
            totalSent,
            totalFailed,
          });

          const sentMsg = `[OK] ${assignment.session_name} -> ${contact.name || contact.phone} (msg #${msgIdx + 1})`;
          await this.persistLog(sentMsg, 'success');
          console.log(`[Autopilot] ${assignment.session_name} -> ${contact.phone} [T${(phoneIdx % templates.length) + 1}] (${msgIdx + 1}/${config.messages_per_cycle}) OK`);
        } catch (err: any) {
          await pool.query(
            `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, error_message, session_id)
             VALUES (NULL, $1, $2, 'failed', $3, $4)`,
            [contact.id, contact.phone, err.message, assignment.session_id]
          );

          totalFailed++;
          totalMessages++;
          await this.incrementDailyCount(assignment.session_id, 'failed_count');

          const fails = (consecutiveFailures.get(assignment.session_id) || 0) + 1;
          consecutiveFailures.set(assignment.session_id, fails);

          io.emit('autopilot:message_sent', {
            sessionName: assignment.session_name,
            contactPhone: contact.phone,
            contactName: contact.name,
            status: 'failed',
            error: err.message,
            msgNumber: msgIdx + 1,
            totalSent,
            totalFailed,
          });

          const failMsg = `[FAIL] ${assignment.session_name} -> ${contact.name || contact.phone} (msg #${msgIdx + 1}) — fallo ${fails}/${CONSECUTIVE_FAIL_THRESHOLD}`;
          await this.persistLog(failMsg, 'error');
          console.log(`[Autopilot] ${assignment.session_name} -> ${contact.phone} FAILED (${fails}/${CONSECUTIVE_FAIL_THRESHOLD}): ${err.message}`);

          // Check if threshold reached — flag as restricted
          if (fails >= CONSECUTIVE_FAIL_THRESHOLD) {
            restrictedInCycle.add(assignment.session_id);
            await this.flagRestricted(assignment.session_id, assignment.session_name, fails);
          }
        }

        // ANTI-BAN: Random delay between messages (human-like timing)
        const delay = randomDelay(config.delay_min_ms, config.delay_max_ms);
        await sleep(delay);
      }
    }

    const summaryMsg = `Ciclo completado: ${totalSent} enviados, ${totalFailed} fallidos` +
      (restrictedInCycle.size > 0 ? `, ${restrictedInCycle.size} restringido(s)` : '') +
      (dailyLimitReached.size > 0 ? `, ${dailyLimitReached.size} al limite diario` : '');
    console.log(`[Autopilot] Cycle finished: ${totalSent} sent, ${totalFailed} failed, ${restrictedInCycle.size} restricted, ${dailyLimitReached.size} at daily limit`);
    io.emit('autopilot:log', { message: summaryMsg, type: 'success' });
    await this.persistLog(summaryMsg, 'success');
    await this.cleanOldLogs();
  }

  private waitOrStop(ms: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.running) return resolve();

      const checkInterval = setInterval(() => {
        if (!this.running) {
          clearInterval(checkInterval);
          if (this.cycleTimer) {
            clearTimeout(this.cycleTimer);
            this.cycleTimer = null;
          }
          resolve();
        }
      }, 1000);

      this.cycleTimer = setTimeout(() => {
        clearInterval(checkInterval);
        this.cycleTimer = null;
        resolve();
      }, ms);
    });
  }
}

export const autopilotService = new AutopilotService();
