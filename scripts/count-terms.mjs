import {DEFAULT_TERMS} from '../src/server/content-policy.js';
console.log(`Kennely multilingual word-filter: ${DEFAULT_TERMS.length} unique entries loaded.`);
if(DEFAULT_TERMS.length<3000){console.error('Weniger als 3000 Begriffe geladen. npm install erneut ausführen. cuss@2.2.0 und naughty-words@1.2.0 müssen installiert sein. Bis dahin Registrierung geschlossen halten.');process.exitCode=1;}
