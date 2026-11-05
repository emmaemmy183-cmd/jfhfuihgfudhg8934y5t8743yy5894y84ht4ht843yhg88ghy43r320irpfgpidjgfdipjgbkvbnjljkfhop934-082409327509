/** Kennely transparent text screening, not an adjudication of illegality.
 * Casefold/diacritic normalize, compare whole tokens to avoid substring false positives.
 * Default set is deliberately conservative. Moderators may remove/add policy terms.
 * Content matches are quarantined for human review, not destroyed.
 */
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
// No automatic claims that words constitute crimes. Context, quoting and reclamation matter.
export const DEFAULT_TERMS = Object.freeze([...new Set(Object.values(GROUPS).flatMap(s=>s.split(/\s+/u).filter(Boolean)))].sort());
export function normalizeWord(value){return String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('und').replace(/[·._-]/g,'');}
export function tokensFromText(value){return String(value||'').toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').match(/[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*/gu)||[];}
const defaults=new Set(DEFAULT_TERMS.map(normalizeWord));
export function evaluateText(value, customActive=[], disabled=[]){
 const disallowed=new Set([...defaults,...customActive.map(normalizeWord)]);
 for(const word of disabled)disallowed.delete(normalizeWord(word));
 const matches=[...new Set(tokensFromText(value).map(normalizeWord).filter(w=>w.length>=3&&disallowed.has(w)))].slice(0,6);
 return {review:matches.length>0, matches};
}
export function usernameValid(value){return /^[a-z][a-z0-9._]{9,23}$/.test(String(value||''));}
export function usernameReason(value, customActive=[], disabled=[]){
 const username=String(value||'').trim().toLowerCase();
 if(!usernameValid(username))return 'Nutzername: 10 bis 24 Zeichen, beginnt mit Buchstaben. Erlaubt: a-z, 0-9, Punkt, Unterstrich.';
 if(evaluateText(username.replace(/[._]/g,' '),customActive,disabled).review)return 'Dieser Nutzername ist nicht zulässig.';
 return '';
}
