/** Kennely transparent text screening, not an adjudication of illegality.
 * Casefold/diacritic normalize, compare whole tokens to avoid substring false positives.
 * Default set is deliberately conservative. Moderators may remove/add policy terms.
 * Content matches are quarantined for human review, not destroyed.
 */
// LDNOOBW multilingual dictionary (CC BY 4.0). Added via the published 'naughty-words' package.
// Fallback keeps local/offline tests usable; production installs dependency with npm install.
let communityDictionary={};
try { const imported=await import('naughty-words');communityDictionary=imported.default||imported; }
catch { /* Running tests or local development without npm install. */ }
// MIT licensed cuss dataset supplements the multilingual LDNOOBW data.
// Use only rating 2 (high certainty): 0/1 includes many innocent words.
let supplementalHighConfidence=[];
try {
  // Literal specifiers are important: Netlify's esbuild must discover these modules.
  const modules=await Promise.all([
    import('cuss'), import('cuss/ar-latn'), import('cuss/es'),
    import('cuss/fr'), import('cuss/it'), import('cuss/pt'), import('cuss/pt-pt'),
  ]);
  supplementalHighConfidence=modules.flatMap(m=>Object.entries(m.cuss||{})
    .filter(([term,rating])=>rating===2&&term.length>=3&&term.length<60)
    .map(([term])=>term));
} catch { /* No optional supplemental dataset in offline tests. */ }
const GROUPS = {
  de:`arschloch hurensohn miststück drecksau wichser wixer fotze scheißkerl scheisskerl arschgeige bastard nutte missgeburt trottel vollidiot dummschwätzer dreckskerl verreck doch haltsmaul scheißidiot scheissidiot spast spasti schlampe pimmelkopf pissnelke drecksfotze`,
  en:`motherfucker asshole dickhead shithead dumbass jackass fuckface cocksucker pisshead bitchass bastard cunt scumbag wanker fuckwit fucktard fuckoff shitbag`,
  fr:`connard connasse salope enfoiré enculé putain merde filsdepute trouduc batard salaud pauvrecon crétin crétine`,
  es:`gilipollas cabrón cabrona pendejo pendeja malparido malparida hijueputa hijodeputa comemierda mierda chingada pendejazo culero`,
  it:`stronzo stronza coglione cogliona bastardo bastarda vaffanculo puttana testa-di-cazzo stronzetto merda pezzo-di-merda`,
  ro:`muist muistă futuți fututi pizdeț pizdet bouleh prostănac prostănacă curvei curvă jegos jegosule nenorocit împuțit imputit`,
  pt:`filhodaputa caralho porra foda-se fodase otário otaria arrombado escroto merda babaca cuzao cuzão`,
  nl:`klootzak kutwijf teringlijer eikel mongool lulhannes hoerenzoon kankerhond vuilehoer kutkop`,
  pl:`kurwa skurwysyn skurwysynu chuj jebany jebana pierdolony pierdolona suka dziwka idioto debilu`,
  tr:`orospu çocuğu orospucocugu siktir amk amına koyayım amina koyayim şerefsiz serefsiz gerizekalı gerizekali yavşak yavsak`,
  ru:`блядь сука ублюдок мудак еблан пидорас гандон дебил урод`,
  uk:`сука блядь мудак виродок покидьок`,
  bg:`курва копеле боклук идиот простак мръсник`,
  ar:`شرموطة ابنالكلب كلبحقير عرص خرا ياخول ابنالحرام`,
  el:`μαλάκας μαλακία γαμώ καριόλης σκύλα`,
  sq:`kurvë kurve mut trap qelbësirë`,
  sr:`kurva govno pizda jebem majku smrade`,
  cs:`kurva kokot píča zkurvysyn dement`,
  hu:`kurva faszfej geci geciláda`,
  sv:`kukhuvud fitta jävla horunge`,
  no:`drittsekk rævhøl faenfitte`,
};
// Explicitly protect against racist slurs even if an upstream list omits a form.
GROUPS.protected=`nigger nigga niggas niggers niggaz niggah ni99er n1gger n1gga`; // Review, never automatically assert guilt.
// No automatic claims that words constitute crimes. Context, quoting and reclamation matter.
export const DEFAULT_TERMS = Object.freeze([...new Set([
 ...Object.values(GROUPS).flatMap(s=>s.split(/\s+/u).filter(Boolean)),
 ...Object.values(communityDictionary).flatMap(list=>Array.isArray(list)?list:[]).filter(x=>typeof x==='string'&&x.length>2&&x.length<60),
 ...supplementalHighConfidence
])].sort());
export function normalizeWord(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('und').replace(/[·._-]/g,'');}
export function tokensFromText(value){return String(value||'').toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu)||[];}
// Fast exact-token and multi-word matching. No substring matching in prose.
// Pre-index phrases by their first token, avoiding a scan of all terms per request.
const tokenSequence = word => tokensFromText(word).map(normalizeWord);
function buildLexicon(terms, excluded=new Set()) {
 const single=new Set(), phraseStarts=new Map();
 for (const term of terms) {
  const parts=tokenSequence(term);
  if (!parts.length || excluded.has(parts.join(' '))) continue;
  if (parts.length===1) single.add(parts[0]);
  else {
    const group=phraseStarts.get(parts[0])||[];
    group.push(parts);
    phraseStarts.set(parts[0],group);
  }
 }
 return {single,phraseStarts};
}
const defaults=buildLexicon(DEFAULT_TERMS);
export function evaluateText(value, customActive=[], disabled=[]){
 const disabledKeys=new Set(disabled.map(term=>tokenSequence(term).join(' ')));
 const lexicon=(customActive.length||disabled.length)
  ?buildLexicon([...DEFAULT_TERMS,...customActive],disabledKeys):defaults;
 const tokens=tokensFromText(value).map(normalizeWord);
 const matches=new Set();
 for(let i=0;i<tokens.length&&matches.size<6;i++) {
  const word=tokens[i];
  if(word.length>=3 && lexicon.single.has(word))matches.add(word);
  for(const phrase of lexicon.phraseStarts.get(word)||[]) {
   if(phrase.every((part,index)=>tokens[i+index]===part))matches.add(phrase.join(' '));
   if(matches.size>=6)break;
  }
 }
 return {review:matches.size>0, matches:[...matches]};
}
export function usernameValid(value){return /^[a-z][a-z0-9._]{9,23}$/.test(String(value||''));}
export function usernameReason(value, customActive=[], disabled=[]){
 const username=String(value||'').trim().toLowerCase();
 if(!usernameValid(username))return 'Nutzername: 10 bis 24 Zeichen, beginnt mit Buchstaben. Erlaubt: a-z, 0-9, Punkt, Unterstrich.';
 const strictSlurs=['nigger','nigga','n1gger','n1gga','ni99er','niggaz','niggers','niggas','niggah'];
 if(strictSlurs.some(s=>normalizeWord(username).includes(normalizeWord(s))))return 'Dieser Nutzername ist nicht zulässig.';
 if(evaluateText(username.replace(/[._]/g,' '),customActive,disabled).review)return 'Dieser Nutzername ist nicht zulässig.';
 return '';
}
