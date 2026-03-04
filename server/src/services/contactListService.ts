import fs from 'fs';
import { parse } from 'csv-parse';
import pool from '../db/pool';
import { normalizePhone } from '../utils/jidHelper';

export async function getAllContactLists() {
  const { rows } = await pool.query(
    'SELECT id, name, total_count, created_at FROM contact_lists ORDER BY created_at DESC'
  );
  return rows;
}

export async function getContactListById(id: string) {
  const { rows } = await pool.query(
    'SELECT id, name, total_count, created_at FROM contact_lists WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function getContacts(listId: string, page: number = 1, limit: number = 50) {
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `SELECT c.id, c.phone, c.name, c.custom_fields, c.created_at,
            CASE WHEN ml.id IS NOT NULL THEN true ELSE false END as sent,
            ml.sent_at as last_sent_at,
            ml.campaign_id as sent_campaign_id
     FROM contacts c
     LEFT JOIN LATERAL (
       SELECT ml2.id, ml2.sent_at, ml2.campaign_id
       FROM message_logs ml2
       WHERE ml2.contact_id = c.id AND ml2.status = 'sent'
       ORDER BY ml2.sent_at DESC LIMIT 1
     ) ml ON true
     WHERE c.list_id = $1
     ORDER BY c.created_at ASC
     LIMIT $2 OFFSET $3`,
    [listId, limit, offset]
  );

  const countResult = await pool.query(
    'SELECT COUNT(*) as total FROM contacts WHERE list_id = $1',
    [listId]
  );

  const sentResult = await pool.query(
    `SELECT COUNT(DISTINCT ml.contact_id) as sent_count
     FROM message_logs ml
     JOIN contacts c ON ml.contact_id = c.id
     WHERE c.list_id = $1 AND ml.status = 'sent'`,
    [listId]
  );

  return {
    contacts: rows,
    total: parseInt(countResult.rows[0].total),
    sent_count: parseInt(sentResult.rows[0].sent_count),
    page,
    limit,
  };
}

export async function createContactListFromCSV(name: string, filePath: string): Promise<any> {
  // Create the list first
  const { rows: listRows } = await pool.query(
    'INSERT INTO contact_lists (name) VALUES ($1) RETURNING id, name, total_count, created_at',
    [name]
  );
  const list = listRows[0];

  // Parse CSV
  const records: any[] = [];
  const parser = fs.createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, bom: true })
  );

  for await (const record of parser) {
    records.push(record);
  }

  if (records.length === 0) {
    return { ...list, total_count: 0 };
  }

  // Detect phone and name columns (case-insensitive, flexible matching)
  const columns = Object.keys(records[0]);

  function findColumn(candidates: string[]): string | null {
    for (const col of columns) {
      const normalized = col.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const candidate of candidates) {
        if (normalized === candidate || normalized.includes(candidate)) {
          return col;
        }
      }
    }
    return null;
  }

  const phoneCol = findColumn(['telefono', 'phone', 'numero', 'numerodetelefono', 'celular', 'whatsapp', 'tel']);
  const nameCol = findColumn(['nombre', 'name', 'cliente', 'contacto']);

  console.log(`[CSV Import] Detected columns - phone: "${phoneCol}", name: "${nameCol}" (from: ${columns.join(', ')})`);

  // Batch insert contacts
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const values: any[] = [];
    const placeholders: string[] = [];

    batch.forEach((record, idx) => {
      const phone = phoneCol ? (record[phoneCol] || '') : '';
      const contactName = nameCol ? (record[nameCol] || '') : '';

      // Everything else goes to custom_fields
      const customFields = { ...record };
      if (phoneCol) delete customFields[phoneCol];
      if (nameCol) delete customFields[nameCol];

      const base = idx * 4;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      values.push(list.id, normalizePhone(phone), contactName, JSON.stringify(customFields));
    });

    await pool.query(
      `INSERT INTO contacts (list_id, phone, name, custom_fields)
       VALUES ${placeholders.join(', ')}`,
      values
    );
    totalInserted += batch.length;
  }

  // Update count
  await pool.query(
    'UPDATE contact_lists SET total_count = $1 WHERE id = $2',
    [totalInserted, list.id]
  );

  // Cleanup uploaded file
  fs.unlink(filePath, () => {});

  return { ...list, total_count: totalInserted };
}

export async function deleteContactList(id: string) {
  await pool.query('DELETE FROM contact_lists WHERE id = $1', [id]);
}
