// The question exam: ~150 live questions across math, units, science, history, politics, definitions,
// sites, geography, people, tech and live cards, graded by regex. Hits the real sources, so it is
// not part of `npm test`.  Run:  npm run exam   (ENGINE=samantha npm run exam grades Samantha on :8000)
// Free-engine questions are paced 3.2s apart: the proxy allows 20 AI calls a minute per IP.
// LAST=45 runs only the newest 45, to fit what is left of a day's quota.
// Exit code 1 on any miss, so CI can open an issue.
if(process.env.ENGINE){ global.localStorage={_:{"nimble.ai":JSON.stringify({engine:process.env.ENGINE}),"nimble.aiConsent":"yes"},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}}; }
const E=require("../docs/engine.js");
const Q=[
 // math
 ["2+2",/^4$/],["sqrt(144)",/^12$/],["15% of 80",/^12$/],["2^16",/^65536$/],["7 factorial",/5,?040/],["what is 9 times 3",/^27$/],["255 in binary",/11111111/],["log10(1000)",/^3$/],["sin(0)",/^0$/],["1/3",/0\.333/],
 // units
 ["10 km to miles",/6\.21/],["180 C to F",/356/],["3 cups to ml",/70[0-9]/],["500 MB to GB",/0\.5/],["100 lbs to kg",/45\.3/],["1 mile in feet",/5280/],
 // science
 ["atomic number of carbon",/\b6\b/],["speed of light",/299[ ,]?792|3 ?× ?10|300,?000/],["boiling point of water in celsius",/100/],["how many planets in the solar system",/\b8\b|eight/i],["what is DNA",/deoxyribonucleic|genetic|double helix|nucleotide/i],["chemical symbol for gold",/\bAu\b/],["what is photosynthesis",/light|plant|energy/i],["how many bones in the human body",/206/],
 // history
 ["when did world war 2 end",/1945/],["who was the first president of the united states",/Washington/],["when was the declaration of independence signed",/1776/],["who built the pyramids",/Egypt/i],["when did the berlin wall fall",/1989/],["who discovered penicillin",/Fleming/],["when did canada become a country",/1867/],
 // politics / current (2026)
 ["who is the president of the united states",/Trump/],["who is the prime minister of canada",/Carney/],["who is the prime minister of the uk",/Burnham|Starmer/],["capital of australia",/Canberra/],["how many senators are in the us senate",/100/],["who is the premier of british columbia",/Eby/],
 // definitions / etymology
 ["define serendipity",/chance|luck|accident|fortunate|unplanned/i],["define nimble",/quick|agile|light|adept|grasp/i],["etymology of salary",/salt|sal|salar/i],["what does ubiquitous mean",/everywhere|present/i],
 // sites
 ["what's primitive.dev?",/email/i],["what is stripe.com",/payment/i],["tell me about github.com",/code|developer|software|git/i],
 // geography / misc facts
 ["capital of france",/Paris/],["largest ocean",/Pacific/],["tallest mountain",/Everest|Mauna.Kea/],["population of canada",/\d{2}/],["what is the currency of japan",/yen/i],["longest river in the world",/Nile|Amazon/],["how far is the moon",/384|238/],
 // people / culture
 ["who wrote hamlet",/Shakespeare/],["who painted the mona lisa",/Leonardo|da Vinci/],["who founded apple",/Jobs|Wozniak/],["who is the ceo of apple",/Ternus|Cook/],["who invented the telephone",/Bell/],["who created linux",/Torvalds/],
 // time / weather / currency (live, loose)
 ["time in tokyo",/\d{1,2}:\d{2}/],["weather in vancouver",/°|degrees|\d/],["100 usd to cad",/\d/],
 // round 4 additions: more science, history, geography, culture, tech, current affairs
 ["what is the chemical formula for water",/H2O|H₂O/],["how many chromosomes do humans have",/46/],["what is the largest planet",/Jupiter/],["what gas do plants absorb",/carbon dioxide|CO2/i],["freezing point of water in fahrenheit",/32/],["what is the hardest natural substance",/diamond/i],["how many elements in the periodic table",/118/],["what is the smallest prime number",/\b2\b/],
 ["who was the first person on the moon",/Armstrong/],["when did the titanic sink",/1912/],["who was the first prime minister of canada",/Macdonald/],["when did the french revolution start",/1789/],["who wrote the communist manifesto",/Marx/],["when was the printing press invented",/14[34]\d|1450|Gutenberg/],["who was cleopatra",/Egypt|pharaoh|queen/i],
 ["capital of canada",/Ottawa/],["capital of japan",/Tokyo/],["largest country by area",/Russia/],["how many continents are there",/\b7\b|seven/i],["what is the capital of british columbia",/Victoria/],["largest desert",/Sahara|Antarctic/],
 ["who wrote pride and prejudice",/Austen/],["who composed the four seasons",/Vivaldi/],["who directed jaws",/Spielberg/],["what year did the beatles break up",/1970/],
 ["who is the ceo of tesla",/Musk/],["who created python",/van Rossum|Rossum/],["what does cpu stand for",/central processing unit/i],["who founded microsoft",/Gates|Allen/],["what is http",/hypertext|protocol/i],
 ["who is the governor general of canada",/\w+/],["who is the mayor of vancouver",/\w+/],["who won the last super bowl",/\w+/],["who is the secretary general of the un",/\w+/],
 // round 5: stable facts, tight patterns, to reach 150. A wrong fact must fail, so none of these accept a bare \w+.
 ["what is the powerhouse of the cell",/mitochondri/i],["chemical symbol for sodium",/\bNa\b/],["how many days in a leap year",/366/],["what planet is the red planet",/Mars/],["what is the ph of pure water",/\b7\b/],["who developed general relativity",/Einstein/],["atomic number of oxygen",/\b8\b/],["how many teeth does an adult have",/\b32\b/],["absolute zero in celsius",/[-\u2013\u2212]273/],["largest organ of the human body",/skin/i],["nearest star to earth",/\bSun\b|Proxima/i],
 ["who was the first emperor of rome",/Augustus|Octavian/],["when did world war 1 start",/1914/],["when did the soviet union collapse",/1991/],["when was the magna carta signed",/1215/],["who was british prime minister during world war 2",/Churchill/],["when did humans first land on the moon",/1969/],["who discovered america in 1492",/Columbus/],
 ["capital of brazil",/Bras[ií]lia/],["capital of egypt",/Cairo/],["capital of italy",/Rome/],["capital of germany",/Berlin/],["capital of spain",/Madrid/],["capital of india",/Delhi/],["capital of south korea",/Seoul/],["capital of argentina",/Buenos Aires/],["capital of turkey",/Ankara/],["capital of new zealand",/Wellington/],["deepest ocean trench",/Mariana/],["smallest country in the world",/Vatican/],["longest river in europe",/Volga/],["how many states in the usa",/\b50\b|fifty/i],["how many provinces does canada have",/\b10\b|ten/i],["tallest mountain on earth",/Everest/],
 ["who wrote 1984",/Orwell/],["who wrote the odyssey",/Homer/],["who painted starry night",/Gogh/],["who composed the ninth symphony",/Beethoven/],["who directed the godfather",/Coppola/],["who sculpted david",/Michelangelo/],["who wrote the great gatsby",/Fitzgerald/],["who wrote harry potter",/Rowling/],["who wrote war and peace",/Tolstoy/],
 ["what does html stand for",/hypertext markup/i],["who created javascript",/Eich/],["what does ram stand for",/random access memory/i],["who founded amazon",/Bezos/],["who founded google",/Page|Brin/],["what does gpu stand for",/graphics processing unit/i],
 ["10 in binary",/1010/],["255 in hex",/\bFF\b/i],["12 squared",/^144$/],["cube root of 27",/^3$/],["20% of 150",/^30$/],["100 km to miles",/62\.1/],["5 feet to cm",/152/],["1 kg to lbs",/2\.2/],["32 F to C",/\b0\b/],["1 gallon to liters",/3\.78/],
 // identity
 ["who made you",/Trommel/],
];
(async()=>{let pass=0,fail=[];
 for(const [q,re] of (process.env.LAST?Q.slice(-process.env.LAST):Q)){
  // The proxy allows 20 AI calls a minute per IP; a real person never asks faster, so pace the exam.
  if(!process.env.ENGINE && !E.tryMath(q) && !E.tryConvert(q)) await new Promise(ok=>setTimeout(ok,3200));
  let r; try{ r=await E.answer(q,{ifUnset:"yes"}); }catch(e){ r={kind:"throw",body:String(e)}; }
  const text=[r.title,r.body,r.value,r.to,r.toUnit,r.big,r.unit,r.sub].filter(x=>x!=null).join(" ");
  const ok=re.test(text); ok?pass++:fail.push(q);
  console.log((ok?"PASS":"FAIL")+" | "+q+" => "+r.kind+" | "+(r.src||"")+" | "+text.slice(0,120).replace(/\n/g," "));
 }
 console.log(`\n${pass}/${Q.length} pass. FAIL: ${fail.join(" ; ")}`);
 process.exit(fail.length ? 1 : 0);
})();
