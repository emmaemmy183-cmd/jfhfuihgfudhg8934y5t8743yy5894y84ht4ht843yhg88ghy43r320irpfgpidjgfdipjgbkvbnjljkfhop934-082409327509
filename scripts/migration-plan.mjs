/** Shared migration list. All entries must be additive and repeatable. */
export const MIGRATION_FILES = Object.freeze([
  ['main','db/main.sql'],
  ['media','db/media.sql'],
  ['main','db/social.sql'],
  ['main','db/deutschland.sql'],
  ['main','db/mail_quotas.sql'],
  ['main','db/2027_9.sql'],
  ['main','db/2027_10.sql'],
  ['main','db/2027_12.sql'],
]);

/** Files contain simple DDL (no triggers/compound SQL).
 * Strip SQL line-comments before splitting on semicolons; comments can themselves
 * contain semicolons. Never send a comment fragment to Turso as SQL.
 */
export function migrationStatements(source) {
  return String(source).split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}
