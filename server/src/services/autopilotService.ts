import pool from '../db/pool';
import { getIO } from '../socket/socketManager';
import { SessionManager } from '../whatsapp/SessionManager';
import { renderTemplate } from './templateService';
import { phoneToJid } from '../utils/jidHelper';
import { sleep } from '../utils/delay';

interface AutopilotConfig {
  id: string;
  message_templates: string[];
  messages_per_cycle: number;
  cycle_interval_hours: number;
  delay_between_ms: number;
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

class AutopilotService {
  private sessionManager!: SessionManager;
  private running = false;
  private cycleTimer: NodeJS.Timeout | null = null;

  setSessionManager(sm: SessionManager) {
    this.sessionManager = sm;
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
  }): Promise<AutopilotConfig> {
    const config = await this.getConfig();
    const { rows } = await pool.query(
      `UPDATE autopilot_config SET
        message_templates = COALESCE($1::jsonb, message_templates),
        messages_per_cycle = COALESCE($2, messages_per_cycle),
        cycle_interval_hours = COALESCE($3, cycle_interval_hours),
        delay_between_ms = COALESCE($4, delay_between_ms),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [
        updates.message_templates ? JSON.stringify(updates.message_templates) : null,
        updates.messages_per_cycle ?? null,
        updates.cycle_interval_hours ?? null,
        updates.delay_between_ms ?? null,
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
        io.emit('autopilot:log', { message: 'Sin asignaciones configuradas. Esperando...' });
        await this.waitOrStop(30000);
        continue;
      }

      if (config.message_templates.length === 0) {
        console.log('[Autopilot] No templates configured, waiting...');
        const io = getIO();
        io.emit('autopilot:log', { message: 'Sin templates configurados. Esperando...' });
        await this.waitOrStop(30000);
        continue;
      }

      console.log(`[Autopilot] Starting cycle: ${assignments.length} phones, ${config.messages_per_cycle} msgs each, ${config.message_templates.length} templates`);
      const io = getIO();
      io.emit('autopilot:cycle_start', {
        phones: assignments.length,
        messagesPerCycle: config.messages_per_cycle,
      });

      await this.runCycle(config, assignments);

      if (!this.running) break;

      const intervalMs = config.cycle_interval_hours * 3600 * 1000;
      const nextCycleAt = new Date(Date.now() + intervalMs);

      await pool.query(
        "UPDATE autopilot_config SET last_cycle_at = NOW(), next_cycle_at = $1, updated_at = NOW() WHERE id = $2",
        [nextCycleAt.toISOString(), config.id]
      );

      console.log(`[Autopilot] Cycle complete. Next cycle at ${nextCycleAt.toLocaleTimeString()}`);
      io.emit('autopilot:cycle_end', {
        nextCycleAt: nextCycleAt.toISOString(),
      });

      await this.waitOrStop(intervalMs);
    }
  }

  /**
   * Run a single cycle with round-robin sending.
   * Each phone gets a different template: phone[i] uses templates[i % templates.length]
   */
  private async runCycle(config: AutopilotConfig, assignments: Assignment[]): Promise<void> {
    const io = getIO();
    const templates = config.message_templates;

    // Pre-fetch contacts for each assignment
    const contactQueues: Map<string, any[]> = new Map();

    for (const a of assignments) {
      const { rows } = await pool.query(
        `SELECT c.id, c.phone, c.name, c.custom_fields
         FROM contacts c
         WHERE c.list_id = $1
           AND c.id NOT IN (
             SELECT ml.contact_id FROM message_logs ml WHERE ml.contact_id = c.id AND ml.status = 'sent'
           )
         ORDER BY c.created_at ASC
         LIMIT $2`,
        [a.list_id, config.messages_per_cycle]
      );
      contactQueues.set(a.session_id, rows);

      if (rows.length === 0) {
        console.log(`[Autopilot] No more contacts for ${a.session_name} in ${a.list_name}`);
      }
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (let msgIdx = 0; msgIdx < config.messages_per_cycle; msgIdx++) {
      for (let phoneIdx = 0; phoneIdx < assignments.length; phoneIdx++) {
        if (!this.running) return;

        const assignment = assignments[phoneIdx];
        const queue = contactQueues.get(assignment.session_id);
        if (!queue || msgIdx >= queue.length) continue;

        const contact = queue[msgIdx];
        const sock = this.sessionManager.getSocket(assignment.session_id);

        if (!sock) {
          console.log(`[Autopilot] Session ${assignment.session_name} not connected, skipping`);
          io.emit('autopilot:log', {
            message: `${assignment.session_name} desconectado, saltando`,
            type: 'warning',
          });
          continue;
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
          const result = await sock.sendMessage(jid, { text: message });

          await pool.query(
            `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, wa_message_id)
             VALUES (NULL, $1, $2, 'sent', $3)`,
            [contact.id, contact.phone, result?.key?.id || null]
          );

          totalSent++;
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

          console.log(`[Autopilot] ${assignment.session_name} -> ${contact.phone} [T${(phoneIdx % templates.length) + 1}] (${msgIdx + 1}/${config.messages_per_cycle}) OK`);
        } catch (err: any) {
          await pool.query(
            `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, error_message)
             VALUES (NULL, $1, $2, 'failed', $3)`,
            [contact.id, contact.phone, err.message]
          );

          totalFailed++;
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

          console.log(`[Autopilot] ${assignment.session_name} -> ${contact.phone} FAILED: ${err.message}`);
        }

        await sleep(config.delay_between_ms);
      }
    }

    console.log(`[Autopilot] Cycle finished: ${totalSent} sent, ${totalFailed} failed`);
    io.emit('autopilot:log', {
      message: `Ciclo completado: ${totalSent} enviados, ${totalFailed} fallidos`,
      type: 'success',
    });
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
