import pool from '../db/pool';

export async function getAllCampaigns() {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.status, c.message_template,
            c.delay_min_ms, c.delay_max_ms,
            c.total_contacts, c.sent_count, c.failed_count,
            c.created_at, c.started_at, c.completed_at,
            s.name as session_name, s.phone as session_phone, s.status as session_status,
            cl.name as list_name,
            c.session_id, c.list_id
     FROM campaigns c
     JOIN sessions s ON c.session_id = s.id
     JOIN contact_lists cl ON c.list_id = cl.id
     ORDER BY c.created_at DESC`
  );
  return rows;
}

export async function getCampaignById(id: string) {
  const { rows } = await pool.query(
    `SELECT c.*, s.name as session_name, s.phone as session_phone, s.status as session_status,
            cl.name as list_name
     FROM campaigns c
     JOIN sessions s ON c.session_id = s.id
     JOIN contact_lists cl ON c.list_id = cl.id
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createCampaign(data: {
  name: string;
  session_id: string;
  list_id: string;
  message_template: string;
  delay_min_ms?: number;
  delay_max_ms?: number;
  contact_limit?: number;
}) {
  // Get total contacts count from the list
  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM contacts WHERE list_id = $1',
    [data.list_id]
  );
  const totalContacts = parseInt(countResult.rows[0].total);
  const contactLimit = data.contact_limit || 0;
  // total_contacts = limit if set, otherwise all
  const effectiveTotal = contactLimit > 0 ? Math.min(contactLimit, totalContacts) : totalContacts;

  const { rows } = await pool.query(
    `INSERT INTO campaigns (name, session_id, list_id, message_template, delay_min_ms, delay_max_ms, total_contacts, contact_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name,
      data.session_id,
      data.list_id,
      data.message_template,
      data.delay_min_ms || 3000,
      data.delay_max_ms || 4000,
      effectiveTotal,
      contactLimit,
    ]
  );
  return rows[0];
}

export async function updateCampaignStatus(id: string, status: string) {
  const extra = status === 'running' ? ', started_at = COALESCE(started_at, NOW())' :
                status === 'completed' ? ', completed_at = NOW()' : '';
  await pool.query(
    `UPDATE campaigns SET status = $1, updated_at = NOW()${extra} WHERE id = $2`,
    [status, id]
  );
}

export async function getCampaignLogs(campaignId: string, page: number = 1, limit: number = 50) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT ml.id, ml.contact_phone, ml.status, ml.error_message, ml.wa_message_id, ml.sent_at,
            c.name as contact_name
     FROM message_logs ml
     JOIN contacts c ON ml.contact_id = c.id
     WHERE ml.campaign_id = $1
     ORDER BY ml.sent_at DESC
     LIMIT $2 OFFSET $3`,
    [campaignId, limit, offset]
  );

  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM message_logs WHERE campaign_id = $1',
    [campaignId]
  );

  return {
    logs: rows,
    total: parseInt(countResult.rows[0].total),
    page,
    limit,
  };
}

export async function deleteCampaign(id: string) {
  await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
}
