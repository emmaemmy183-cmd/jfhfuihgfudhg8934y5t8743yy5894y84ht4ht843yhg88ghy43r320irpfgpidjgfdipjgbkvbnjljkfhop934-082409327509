import {DEFAULT_TERMS} from '../src/server/content-policy.js';
console.log(`Kennely multilingual word-filter: ${DEFAULT_TERMS.length} unique entries loaded.`);
if(DEFAULT_TERMS.length<3000){console.error('Weniger als 3000 Begriffe geladen. Bitte erst npm install ausführen und die Paketinstallation kontrollieren.');process.exitCode=1;}
