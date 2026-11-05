import { execute } from '../src/server/db.js';

for (const which of ['main', 'media']) {
  try {
    const response = await execute(process.env, which, 'SELECT 1 AS online');
    if (response.rows?.[0]?.online !== 1) throw new Error('Unerwartete Antwort von Turso');
    console.log(`${which}: Verbindung erfolgreich (SELECT 1).`);
  } catch (error) {
    console.error(`${which}: ${error.message}`);
    process.exitCode = 1;
  }
}
