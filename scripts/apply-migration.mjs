// One-off migration runner. Reads a SQL file path from argv and executes it
// against the configured Postgres connection. The Vercel Postgres tagged-
// template `sql` only supports a single statement, so we use the unpooled
// pg client through @vercel/postgres' raw db connection for multi-statement
// migrations.
import { db } from '@vercel/postgres';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) {
  console.error('usage: node --env-file=.env.local scripts/apply-migration.mjs <migration.sql>');
  process.exit(1);
}

const sqlText = await readFile(path, 'utf8');

const client = await db.connect();
try {
  await client.sql`BEGIN`;
  await client.query(sqlText);
  await client.sql`COMMIT`;
  console.log(`Applied: ${path}`);
} catch (err) {
  await client.sql`ROLLBACK`;
  console.error(`Failed: ${err.message}`);
  process.exit(1);
} finally {
  client.release();
}
