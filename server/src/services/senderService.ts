import pool from '../db/pool';
import { getIO } from '../socket/socketManager';
import { SessionManager } from '../whatsapp/SessionManager';
import { renderTemplate } from './templateService';
import { phoneToJid } from '../utils/jidHelper';
import { sleep, randomDelay } from '../utils/delay';
import { getCampaignById, updateCampaignStatus } from './campaignService';

interface CampaignState {
  running: boolean;
}

class SenderService {
  private activeCampaigns: Map<string, CampaignState> = new Map();
  private sessionManager!: SessionManager;

  setSessionManager(sm: SessionManager) {
    this.sessionManager = sm;
  }

  async startCampaign(campaignId: string): Promise<void> {
    const campaign = await getCampaignById(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const sock = this.sessionManager.getSocket(campaign.session_id);
    if (!sock) throw new Error('WhatsApp session not connected');

    this.activeCampaigns.set(campaignId, { running: true });
    await updateCampaignStatus(campaignId, 'running');

    const io = getIO();
    io.emit('campaign:status', { campaignId, status: 'running' });

    // Fetch uncontacted contacts for this campaign, respecting limit
    const limitClause = campaign.contact_limit > 0 ? `LIMIT $3` : '';
    const queryParams: any[] = [campaign.list_id, campaignId];
    if (campaign.contact_limit > 0) {
      // Limit = total to send minus already sent
      const remaining = campaign.contact_limit - campaign.sent_count;
      if (remaining <= 0) {
        this.activeCampaigns.delete(campaignId);
        await updateCampaignStatus(campaignId, 'completed');
        io.emit('campaign:status', { campaignId, status: 'completed' });
        return;
      }
      queryParams.push(remaining);
    }

    const { rows: contacts } = await pool.query(
      `SELECT c.id, c.phone, c.name, c.custom_fields
       FROM contacts c
       WHERE c.list_id = $1
         AND c.id NOT IN (
           SELECT ml.contact_id FROM message_logs ml
           WHERE ml.campaign_id = $2 AND ml.status = 'sent'
         )
       ORDER BY c.created_at ASC
       ${limitClause}`,
      queryParams
    );

    let sentCount = campaign.sent_count;
    let failedCount = campaign.failed_count;

    for (const contact of contacts) {
      const state = this.activeCampaigns.get(campaignId);
      if (!state || !state.running) {
        await updateCampaignStatus(campaignId, 'paused');
        io.emit('campaign:status', { campaignId, status: 'paused' });
        return;
      }

      // Build variables from contact data
      const variables: Record<string, string> = {
        nombre: contact.name || '',
        telefono: contact.phone || '',
        ...(contact.custom_fields || {}),
      };

      const message = renderTemplate(campaign.message_template, variables);
      const jid = phoneToJid(contact.phone);

      try {
        const result = await sock.sendMessage(jid, { text: message });

        await pool.query(
          `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, wa_message_id, session_id)
           VALUES ($1, $2, $3, 'sent', $4, $5)`,
          [campaignId, contact.id, contact.phone, result?.key?.id || null, campaign.session_id]
        );

        sentCount++;
        await pool.query(
          'UPDATE campaigns SET sent_count = $1, updated_at = NOW() WHERE id = $2',
          [sentCount, campaignId]
        );

        io.emit('campaign:progress', {
          campaignId,
          sent: sentCount,
          failed: failedCount,
          total: campaign.total_contacts,
          currentContact: { phone: contact.phone, name: contact.name },
        });

        io.emit('campaign:message_sent', {
          campaignId,
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name,
          status: 'sent',
        });
      } catch (err: any) {
        await pool.query(
          `INSERT INTO message_logs (campaign_id, contact_id, contact_phone, status, error_message, session_id)
           VALUES ($1, $2, $3, 'failed', $4, $5)`,
          [campaignId, contact.id, contact.phone, err.message, campaign.session_id]
        );

        failedCount++;
        await pool.query(
          'UPDATE campaigns SET failed_count = $1, updated_at = NOW() WHERE id = $2',
          [failedCount, campaignId]
        );

        io.emit('campaign:progress', {
          campaignId,
          sent: sentCount,
          failed: failedCount,
          total: campaign.total_contacts,
          currentContact: { phone: contact.phone, name: contact.name },
        });
      }

      // Random delay between messages
      const delay = randomDelay(campaign.delay_min_ms, campaign.delay_max_ms);
      await sleep(delay);
    }

    // All contacts processed
    this.activeCampaigns.delete(campaignId);
    await updateCampaignStatus(campaignId, 'completed');
    io.emit('campaign:status', { campaignId, status: 'completed' });
  }

  pauseCampaign(campaignId: string): void {
    const state = this.activeCampaigns.get(campaignId);
    if (state) {
      state.running = false;
    }
  }

  isRunning(campaignId: string): boolean {
    return this.activeCampaigns.get(campaignId)?.running || false;
  }
}

export const senderService = new SenderService();
