import { Pool } from 'pg';
import {
  AuthenticationState,
  SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
  proto,
} from '@whiskeysockets/baileys';

export async function usePostgresAuthState(
  pool: Pool,
  sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // Load or initialize creds
  const credsRow = await pool.query(
    'SELECT creds FROM session_auth_creds WHERE session_id = $1',
    [sessionId]
  );

  let creds: any;
  if (credsRow.rows.length > 0) {
    console.log(`[Auth ${sessionId.slice(0, 8)}] Loading existing creds from DB`);
    creds = JSON.parse(JSON.stringify(credsRow.rows[0].creds), BufferJSON.reviver);
  } else {
    console.log(`[Auth ${sessionId.slice(0, 8)}] No creds found, initializing new`);
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    try {
      const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
      await pool.query(
        `INSERT INTO session_auth_creds (session_id, creds)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (session_id) DO UPDATE SET creds = $2::jsonb`,
        [sessionId, JSON.stringify(serialized)]
      );
      console.log(`[Auth ${sessionId.slice(0, 8)}] Creds saved to DB`);
    } catch (err) {
      console.error(`[Auth ${sessionId.slice(0, 8)}] Failed to save creds:`, err);
    }
  };

  const keys = {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      if (ids.length === 0) return result;

      try {
        const rows = await pool.query(
          `SELECT key_id, key_data FROM session_auth_keys
           WHERE session_id = $1 AND key_type = $2 AND key_id = ANY($3)`,
          [sessionId, type, ids]
        );

        for (const row of rows.rows) {
          const parsed = JSON.parse(
            JSON.stringify(row.key_data),
            BufferJSON.reviver
          );
          result[row.key_id] = parsed;
        }
      } catch (err) {
        console.error(`[Auth ${sessionId.slice(0, 8)}] Failed to get keys:`, err);
      }

      return result;
    },

    set: async (data: Record<string, Record<string, unknown>>) => {
      const queries: Promise<any>[] = [];

      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries)) {
          if (value) {
            const serialized = JSON.parse(
              JSON.stringify(value, BufferJSON.replacer)
            );
            queries.push(
              pool.query(
                `INSERT INTO session_auth_keys (session_id, key_type, key_id, key_data)
                 VALUES ($1, $2, $3, $4::jsonb)
                 ON CONFLICT (session_id, key_type, key_id)
                 DO UPDATE SET key_data = $4::jsonb`,
                [sessionId, type, id, JSON.stringify(serialized)]
              )
            );
          } else {
            queries.push(
              pool.query(
                `DELETE FROM session_auth_keys
                 WHERE session_id = $1 AND key_type = $2 AND key_id = $3`,
                [sessionId, type, id]
              )
            );
          }
        }
      }

      try {
        await Promise.all(queries);
      } catch (err) {
        console.error(`[Auth ${sessionId.slice(0, 8)}] Failed to set keys:`, err);
      }
    },
  };

  return {
    state: { creds, keys },
    saveCreds,
  };
}
