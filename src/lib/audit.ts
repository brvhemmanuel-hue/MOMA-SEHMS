import { defaultDb, type Db } from './db';

/** Never pass passwords or other secrets in metadata. */
export async function audit(
  userId: string | null, action: string, entity?: string, entityId?: string,
  metadata: Record<string, unknown> = {}, db: Db = defaultDb,
) {
  await db.query(
    'insert into activity_logs (user_id, action, entity, entity_id, metadata) values ($1,$2,$3,$4,$5)',
    [userId, action, entity ?? null, entityId ?? null, JSON.stringify(metadata)],
  );
}
