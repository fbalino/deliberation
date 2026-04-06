import { sql, db, type VercelPoolClient } from '@vercel/postgres';

export { sql };

export type TxClient = VercelPoolClient;

/**
 * Run multiple queries inside a single transaction.
 * If the callback throws, the transaction is rolled back.
 * The callback receives a pool client with .sql tagged-template support.
 */
export async function transaction<T>(
  fn: (tx: VercelPoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  try {
    await client.sql`BEGIN`;
    const result = await fn(client);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`;
    throw error;
  } finally {
    client.release();
  }
}
