// Nimble answer engine. Shared by the web app (/app) and the landing page demo.
const ANSWER_PROXY = "https://nimble-answers.trommatic.workers.dev";

// Every network source goes through here: hard timeout, non-2xx = null, bad JSON = null.
// A dead upstream costs one timeout, never a hung answer. TIMEOUT_MS is the calibration knob.
const TIMEOUT_MS = 6000;
// The answer proxy runs up to three models (tiebreak) and can take 10s+; 6s cut it off and
// the web app fell through to a Wikipedia list article. Native uses 15s, so match it.
const PROXY_TIMEOUT_MS = 15000;
const LOCAL_TIMEOUT_MS = 40000; // a local 9B model on a busy Mac needs far longer than a hosted API
async function getJSON(url, opts){
  try{
    const {timeout, ...init} = opts || {};
    const r = await fetch(url, {...init, signal: AbortSignal.timeout(timeout || (url.startsWith(ANSWER_PROXY) && opts?.method==="POST" ? PROXY_TIMEOUT_MS : TIMEOUT_MS))});
    return r.ok ? await r.json() : null;
  }catch{ return null; }
}

// --- offline math ---
// A small recursive-descent evaluator over the whitelisted text. No eval and no Function:
// Cloudflare Workers forbid both, and the agent API at /api runs this same engine there.
const MATH_FNS = new Set(["sqrt","sin","cos","tan","log","log2","log10","abs","round","floor","ceil","cbrt"]);
// Every number on screen goes through here, so steps and the answer round the same way.
const mathFmt = v => String(+v.toPrecision(12));
// Steps show the operator as typed, so ** reads as ^.
const mathSym = op => op === "**" ? "^" : op;
// When steps is an array, each operation pushes one line "a op b = result" in evaluation order.
// Each node carries its display text: a typed literal, or the value of a reduced sub-expression.
function evalMath(src, steps){
  const tk = src.match(/Math\.[A-Za-z0-9]+|\d+\.?\d*|\.\d+|\*\*|[-+*\/(),]/g) || [];
  if(tk.join("") !== src.replace(/\s+/g,"")) throw 0;
  let i = 0;
  const peek = () => tk[i], next = () => tk[i++];
  const bin = (a, op, b, v) => {
    if(steps) steps.push(a.text + mathSym(op) + b.text + " = " + mathFmt(v));
    return {text: mathFmt(v), value: v};
  };
  const expr = () => { let v = term(); while(peek()==="+"||peek()==="-"){ const op = next(), b = term(); v = bin(v, op, b, op==="+" ? v.value+b.value : v.value-b.value); } return v; };
  const term = () => { let v = unary(); while(peek()==="*"||peek()==="/"){ const op = next(), b = unary(); v = bin(v, op, b, op==="*" ? v.value*b.value : v.value/b.value); } return v; };
  const unary = () => {
    if(peek()==="-"){ i++; const a = unary(); return a.leaf ? {text:"-"+a.text, value:-a.value, leaf:true} : {text:mathFmt(-a.value), value:-a.value}; }
    if(peek()==="+"){ i++; return unary(); }
    return power();
  };
  const power = () => { const b = atom(); if(peek()!=="**") return b; i++; const e = unary(); return bin(b, "**", e, b.value ** e.value); };
  const atom = () => {
    const t = next();
    if(t===undefined) throw 0;
    if(t==="("){ const v = expr(); if(next()!==")") throw 0; return v; }
    if(t==="Math.PI") return {text:"pi", value:Math.PI, leaf:true};
    if(t==="Math.E") return {text:"e", value:Math.E, leaf:true};
    if(t.startsWith("Math.")){
      const f = t.slice(5);
      if(!MATH_FNS.has(f) || next()!=="(") throw 0;
      const a = expr(); if(next()!==")") throw 0;
      // Floating point leaves tan(pi) at -1.2e-16; a trig value that small is 0.
      const raw = Math[f](a.value), v = /^(sin|cos|tan)$/.test(f) && Math.abs(raw) < 1e-12 ? 0 : raw;
      if(steps) steps.push(f + "(" + a.text + ") = " + mathFmt(v));
      return {text: mathFmt(v), value: v};
    }
    const n = Number(t); if(Number.isNaN(n)) throw 0; return {text:t, value:n, leaf:true};
  };
  const v = expr(); if(i!==tk.length) throw 0; return v.value;
}
// "what's nine plus ten" is math, not a Wikipedia search for Vine. Spoken numbers 0-20, the
// tens and the usual operator words; anything left over fails the whitelist below.
const WORD_NUM={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1e6};
function spokenMath(s){
  // "1,000" is one thousand; "2, 4 and 9" (comma then space) stays a list.
  return s.toLowerCase().replace(/[?!]+$/,"").replace(/(\d),(\d{3})\b/g,"$1$2").replace(/^\s*(what(?:'s|\u2019s| is)|whats|calculate|compute|how much is|solve|evaluate)\s+(?:the\s+)?/,"")
    .replace(/\b(multiplied by|times)\b/g,"*").replace(/\bdivided by\b/g,"/").replace(/\bto the power of\b/g,"^").replace(/\bplus\b/g,"+").replace(/\bminus\b/g,"-")
    .replace(/\b[a-z]+\b/g,w=>w in WORD_NUM ? WORD_NUM[w] : w)
    // "twenty one" is 21, "one hundred" is 100, "two thousand" is 2000.
    .replace(/\b([2-9]0) ([1-9])\b/g,(_,a,b)=>+a + +b).replace(/\b(\d+) (100|1000|1000000)\b/g,(_,a,b)=>a*b)
    .replace(/\bsquared\b/g,"^2").replace(/\bcubed\b/g,"^3")
    .replace(/\b(square root|sqrt|cube root|cbrt)(?: of)? ([\d.]+)/g,(_,k,n)=>(/^c/.test(k)?"cbrt(":"sqrt(")+n+")")
    // "split 120 four ways", "double 36", "what percent is 20 of 80", "20 is what percent of 80", "increase 50 by 10%".
    .replace(/^split ([\d.]+) ([\d.]+) ways$/,"($1/$2)").replace(/^(double|twice|triple) ([\d.]+)$/,(_,k,n)=>"("+n+"*"+(k==="triple"?3:2)+")")
    .replace(/^(?:what )?percent(?:age)? is ([\d.]+) of ([\d.]+)$/,"($1/$2*100)").replace(/^([\d.]+) is what percent(?:age)? of ([\d.]+)$/,"($1/$2*100)")
    .replace(/^(increase|decrease|raise|reduce) ([\d.]+) by ([\d.]+) ?(?:%|percent)$/,(_,k,a,b)=>"("+a+"*(1"+(/^(increase|raise)$/.test(k)?"+":"-")+b+"/100))")
    .replace(/^an? (?=[\d])/,"")
    .replace(/\b(?:a |one )?(half|third|quarter) of ([\d.]+)/g,(_,k,n)=>"("+n+"/"+{half:2,third:3,quarter:4}[k]+")")
    .replace(/([\d.]+)\s*(?:%|percent)\s*off\s*([\d.]+)/g,"($2-$2*$1/100)")
    .replace(/([\d.]+)\s*(?:%|percent)\s*(?:tip\s+)?(?:of|on)\s*/g,"$1/100*")
    .replace(/\b(?:the )?(?:average|mean) of ([\d.]+(?:\s*(?:,\s*and\b|,|\band\b)\s*[\d.]+)+)/g,(_,l)=>{ const n=l.split(/\s*(?:,|\band\b)\s*/).filter(Boolean); return "(("+n.join("+")+")/"+n.length+")"; });
}
// The on-device expression behind a math query, or null. Percent-of is rewritten to a division
// and a product, so "20% of 50" evaluates as 20/100*50.
function mathSource(s){
  const t = spokenMath(s).trim().replace(/([\d.]+)\s*%\s*of\s*/g,"$1/100*").replace(/\^/g,"**").replace(/\bpi\b/g,"Math.PI").replace(/\be\b/g,"Math.E")
    .replace(/\b(sqrt|sin|cos|tan|log2|log10|abs|round|floor|ceil|cbrt)\b/g,"Math.$1")
    // "log" is base 10, as in school and in the apps; "ln" is the natural log.
    .replace(/\blog\b/g,"Math.log10").replace(/\bln\b/g,"Math.log").replace(/(\d)\s*(?=Math\.)/g,"$1*");
  if(!/^[0-9+\-*/(). ,]*(Math\.[A-Za-z0-9]+|[0-9+\-*/(). ,])*$/.test(t)) return null;
  // "cos(pi)" and "ln(e)" have no digit but are still a calculation; a bare "pi" or "e" is not.
  if(!/[0-9]|Math\.(PI|E)\b/.test(t) || !/[+\-*/]|Math\.[a-z]/.test(t)) return null;
  return t;
}
function tryMath(s){
  const t = mathSource(s); if(t===null) return null;
  try{ const v = evalMath(t);
    // 0.1+0.2 is 0.30000000000000004 in floating point; 12 digits is the same rounding the steps use.
    return (typeof v==="number" && isFinite(v)) ? +v.toPrecision(12) : null; }
  catch{ return null; }
}
// "7 factorial", "7!", "255 in binary", "255 in hex": exact, offline, as text (factorials outgrow a double's digits).
// Factorials stop at 20!, the largest that fits 64 bits, so the apps give the same answers.
// Null for anything else. The AI used to answer these, so they failed with no network.
function numberFact(s){
  const q = String(s).trim().toLowerCase().replace(/\?$/, "");
  const f = /^(?:what is )?(\d{1,3})\s*(?:!|factorial)$|^(?:what is )?(?:the )?factorial (?:of )?(\d{1,3})$/.exec(q);
  if(f && +(f[1] || f[2]) <= 20){ let n = BigInt(f[1] || f[2]), out = 1n; while(n > 1n) out *= n--; return out.toLocaleString("en-US"); }
  const b = /^(?:convert )?(\d{1,15}) (?:in|to|into) (binary|hex|hexadecimal|octal)$/.exec(q);
  if(b) return BigInt(b[1]).toString({binary:2, hex:16, hexadecimal:16, octal:8}[b[2]]).toUpperCase();
  return null;
}
// "Show steps": one line per evaluation step, or null. A single operation has one step and
// nothing to expand, so it gets null too: a plain "2+2" shows no button.
function mathSteps(s){
  const t = mathSource(s); if(t===null) return null;
  const steps = [];
  try{ const v = evalMath(t, steps); if(!(typeof v==="number" && isFinite(v))) return null; }
  catch{ return null; }
  return steps.length >= 2 ? steps : null;
}

// --- units (ponytail: flat table in base units; add rows, not code) ---
const U={mm:[.001,"len"],cm:[.01,"len"],m:[1,"len"],km:[1000,"len"],in:[.0254,"len"],inch:[.0254,"len"],inches:[.0254,"len"],ft:[.3048,"len"],foot:[.3048,"len"],feet:[.3048,"len"],yd:[.9144,"len"],yard:[.9144,"len"],yards:[.9144,"len"],mi:[1609.344,"len"],mile:[1609.344,"len"],miles:[1609.344,"len"],meter:[1,"len"],meters:[1,"len"],metre:[1,"len"],metres:[1,"len"],kilometer:[1000,"len"],kilometers:[1000,"len"],kilometre:[1000,"len"],kilometres:[1000,"len"],
g:[.001,"mass"],gram:[.001,"mass"],grams:[.001,"mass"],kg:[1,"mass"],kilogram:[1,"mass"],kilograms:[1,"mass"],oz:[.028349523125,"mass"],ounce:[.028349523125,"mass"],ounces:[.028349523125,"mass"],lb:[.45359237,"mass"],lbs:[.45359237,"mass"],pound:[.45359237,"mass"],pounds:[.45359237,"mass"],
ml:[.001,"vol"],l:[1,"vol"],liter:[1,"vol"],liters:[1,"vol"],litre:[1,"vol"],litres:[1,"vol"],cup:[.2365882365,"vol"],cups:[.2365882365,"vol"],gal:[3.785411784,"vol"],gallon:[3.785411784,"vol"],gallons:[3.785411784,"vol"],
mph:[.44704,"speed"],kph:[.277778,"speed"],kmh:[.277778,"speed"],"km/h":[.277778,"speed"],
kb:[1e3,"data"],mb:[1e6,"data"],gb:[1e9,"data"],tb:[1e12,"data"],kilobytes:[1e3,"data"],megabytes:[1e6,"data"],gigabytes:[1e9,"data"],terabytes:[1e12,"data"],
sec:[1,"time"],second:[1,"time"],seconds:[1,"time"],min:[60,"time"],minute:[60,"time"],minutes:[60,"time"],hr:[3600,"time"],hour:[3600,"time"],hours:[3600,"time"],day:[86400,"time"],days:[86400,"time"],week:[604800,"time"],weeks:[604800,"time"],
c:[0,"temp"],celsius:[0,"temp"],f:[0,"temp"],fahrenheit:[0,"temp"],k:[0,"temp"],kelvin:[0,"temp"]};
function convertValue(v,from,to){
  const a=U[from], b=U[to]; if(!a||!b||a[1]!==b[1]) return null;
  if(a[1]==="temp"){ const K=from[0]==="c"?v+273.15:from[0]==="f"?(v-32)*5/9+273.15:v;
    return to[0]==="c"?K-273.15:to[0]==="f"?(K-273.15)*9/5+32:K; }
  return v*a[0]/b[0];
}
function tryConvert(s){
  const q=s.trim().toLowerCase();
  let m=q.match(/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*°?\s*([a-z/]+)\s+(?:to|in|into|as)\s+°?([a-z/]+)\??$/);
  let v,from,to;
  if(m){ [,v,from,to]=m; }
  else { m=q.match(/^how many\s+([a-z/]+)\s+(?:are\s+)?in\s+(-?\d+(?:\.\d+)?)\s*°?\s*([a-z/]+)\??$/); if(!m) return null; [,to,v,from]=m; }
  const out=convertValue(+v,from,to); if(out===null) return null;
  const t=n=>(+(+n).toFixed(6)).toString();
  // "180 c to f" reads back as °C and °F, not the letters that were typed.
  const T={c:"\u00B0C",f:"\u00B0F",k:"K"}, temp=U[from]&&U[from][1]==="temp";
  return {from:t(v),to:t(out),fromUnit:temp?T[from[0]]:from,toUnit:temp?T[to[0]]:to};
}

// --- graph (sampled locally with tryMath, works offline) ---
function graphExpr(s){
  let q=s.trim().toLowerCase();
  const verb=/^(plot|graph|draw|sketch)\s+/.test(q); q=q.replace(/^(plot|graph|draw|sketch)\s+/,"");
  const y=/^(y|f\(x\))\s*=\s*/.test(q); q=q.replace(/^(y|f\(x\))\s*=\s*/,"");
  return (verb||y) && q.includes("x") && /^[0-9a-z+\-*/^(). ]+$/.test(q) ? q : null;
}
function samplePoints(expr){
  const pts=[];
  for(let i=0;i<=200;i++){ const x=-10+i/10;
    // Substitute x, then make implicit multiplication explicit: 2(x), (x)(x), 3sin(x).
    const y=tryMath(expr.replace(/x/g,`(${x})`).replace(/(?<=[0-9)])\s*(?=[a-z(])/g,"*"));
    if(y!==null) pts.push({x,y}); }
  return pts;
}
function graph(expr){
  try{
    const pts=samplePoints(expr); if(pts.length<3) return null;
    const W=480,H=200, xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys), ys_=Math.max(y1-y0,1e-9);
    const X=x=>(x-x0)/(x1-x0)*W, Y=y=>H-(y-y0)/ys_*H;
    let d="",prev=null;
    for(const p of pts){ d+=(prev===null||p.x-prev>(x1-x0)/50?"M":"L")+X(p.x).toFixed(1)+" "+Y(p.y).toFixed(1); prev=p.x; }
    const ax=(y0<=0&&y1>=0?`<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>`:"")+(x0<=0&&x1>=0?`<line y1="0" y2="${H}" x1="${X(0)}" x2="${X(0)}"/>`:"");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><g stroke="currentColor" stroke-opacity=".3">${ax}</g><path d="${d}" fill="none" stroke="var(--yellow-deep, #ffca30)" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }catch{ return null; }
}

// ponytail: encyclopedia paragraphs are not answers; keep the first sentence.
// Don't split after a short capitalized abbreviation (Mr., Dr., St., Ver.).
const SENTENCE_BREAK = /(?<!\b[A-Z][a-z]{0,2}\.)(?<=[.!?])\s+(?=[A-Z0-9"(])/;
// Wikipedia drops the pronunciation parenthetical and leaves "Haiku  is"; one space, never two.
const first = (t) => t.trim().split(SENTENCE_BREAK)[0].replace(/\s{2,}/g," ");

// Multiple sources: a second source is listed only when its text backs the sentence. Same rule as
// AnswerSources in Sources/Models/QueryResult.swift; keep the two in step.
const GLUE = new Set("that this with from which were have they their also been into about after there these those when where while would could should will".split(" "));
const keyWords = (s) => (s.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !GLUE.has(w));
// Most content words of the sentence must appear in the text, and every number in the sentence too.
function agrees(body, text){
  const want = [...new Set(keyWords(body))];
  if(!want.length || !text) return false;
  const have = new Set(keyWords(text)), nums = body.match(/\d+/g) || [];
  return want.filter(w => have.has(w)).length >= Math.ceil(want.length * 0.6) && nums.every(n => text.includes(n));
}
// URLs compare decoded and lowercase, so DDG's and Wikipedia's spellings of one article match.
const norm = u => { try { return decodeURIComponent(String(u)).toLowerCase(); } catch { return String(u).toLowerCase(); } };
// Up to three linked sources, first candidate first, deduped by URL. The first candidate is the
// primary and needs no agreement; every other candidate must back the sentence. Never a new fetch.
function sourcesFor(body, candidates){
  const out = [];
  candidates.forEach((c, i) => {
    if(!c || !c.url || out.length >= 3 || out.some(o => norm(o.url) === norm(c.url))) return;
    if(i === 0 || agrees(body, c.grounding || c.body)) out.push({name:c.src, url:c.url});
  });
  return out;
}

// A Wikipedia page is listed as a source only when its article is the topic the question names or an
// entity the answer names. "Hamlet (1996 film)" is the article Hamlet; "Capital punishment in France"
// is not "capital of France". Every word of the article's name (a parenthesized qualifier dropped) must
// be a word of the question or of the answer's entities.
function onTopic(title, query, body){
  const ents = (body && body.match(ENTITY_RE)) || [];
  const allowed = new Set([...keyWords(query), ...keyWords(ents.filter(e=>!NOT_ENTITY.has(e)).join(" "))]);
  const words = keyWords(String(title||"").replace(/\s*\(.*?\)/g, ""));
  // A disambiguated page ("Capital (French magazine)") must be an entity the answer names, not just a word of the question.
  const pool = /\(.*?\)/.test(title||"") ? new Set(keyWords(ents.filter(e=>!NOT_ENTITY.has(e)).join(" "))) : allowed;
  return words.length > 0 && words.every(w => pool.has(w));
}

// The linked sources as "Name · Name", each one a link. Names only: no new words in the UI.
function sourceRow(list){
  const esc=t=>String(t).replace(/</g,"&lt;");
  return list.map(s=>'<a href="'+hrefOf(s.url)+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>').join(" \u00B7 ");
}

// Photos: only real pictures from Wikipedia's lead image. Logos, flags, icons and SVG drawings are
// skipped, so a topic with only a logo shows its text and no photo. https only.
// A raw .svg is never a photo. An SVG diagram's REST thumbnail is a PNG render (".svg.png"): a picture
// like any other, so the lead image falls back to it. Only png, jpg, jpeg and webp count.
const NOT_PHOTO = /\.svg(\?|$)|logo|flag|icon|coat[_ ]of[_ ]arms|seal|map|commons-/i;
const PHOTO_EXT = /\.(png|jpe?g|webp)(\?|$)/i;
function wikiPhoto(sum){
  const t = sum && sum.thumbnail, u = t && t.source;
  if(!u || !/^https:\/\//.test(u) || NOT_PHOTO.test(u) || !PHOTO_EXT.test(u)) return null;
  return {url:u, width:t.width||null, height:t.height||null};
}
// Topic photo for an AI answer the proxy sent without one. The picture must be of an entity the ANSWER names
// ("Jupiter" in "Jupiter is the largest planet."). Words in the question never pick a photo. Entities the question
// does not echo come first. An echoed one ("Titanic" in "when did the titanic sink") is a fallback, and only when its
// page also shares a content word with the answer. The page must contain the entity and carry a real picture.
// No entity, or no page that passes, means no photo: a missing picture beats a wrong one.
// Math, units, weather and time never get one.
const NO_PHOTO_Q = /\b(weather|forecast|temperature|time|clock|convert|math|sum|plus|minus|times|divided|percent)\b|\d/i;
const ENTITY_RE = /\b\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,3}/gu;
// Capitalised runs the answer names. A lowercase particle inside a run keeps it whole ("Leonardo da Vinci").
const ANSWER_ENTITY_RE = /\b\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:da|de|del|della|der|di|du|la|le|van|von|of|the)\s+)?\p{Lu}[\p{L}'’-]+){0,3}/gu;
const NOT_ENTITY = new Set(["The","A","An","It","This","That","In","On","At","As","Its","He","She","They","There","Yes","No","I","Of","For","And","But","If","When","Where","Who","What","From","With","By","To","Is","Was","These","Those","We","You"]);
const DATE_WORD = new Set("January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday".split(" "));
// The entities an answer names, in photo order. A name after a preposition is never the subject
// ("the largest planet in the Solar System is Jupiter" gives Jupiter, and the Solar System is dropped). The question's own words count
// only when the answer names nothing else. Leading sentence words and dates are dropped.
const PREP = new Set(["of","in","from","at","on","near","into","across","between","among","within"]);
function answerEntities(query, body){
  const q = String(query||"").toLowerCase(), text = String(body||""), out = [];
  for(const m of text.matchAll(ANSWER_ENTITY_RE)){
    const words = m[0].split(/\s+/);
    while(words.length && (NOT_ENTITY.has(words[0]) || DATE_WORD.has(words[0]))) words.shift();
    const name = words.join(" ");
    if(!name || out.some(e=>e.name===name)) continue;
    const before = text.slice(0, m.index).replace(/\b(the|a|an|its|his|her|their|our)\s+$/i, "").match(/(\S+)\s*$/);
    out.push({name, echo: q.includes(name.toLowerCase()), prep: !!before && PREP.has(before[1].toLowerCase())});
  }
  const pool = out.some(e=>!e.echo) ? out.filter(e=>!e.echo) : out;
  return pool.filter(e=>!e.prep).slice(0,3).map(({name, echo})=>({name, echo}));
}
// Does a summary give the photo for this entity? Its page must contain the entity, have a real picture, and for an
// echoed entity share a content word with the answer (answerWords, already without the entity's own words).
function photoFromEntity(sum, entity, answerWords){
  if(!sum || !sum.image || !sum.extract) return false;
  const have = sum.extract.toLowerCase();
  if(!entity.name.toLowerCase().split(/\s+/).every(w=>have.includes(w))) return false;
  if(!entity.echo) return true;
  const own = new Set(keyWords(entity.name)), lead = new Set(keyWords(sum.extract));
  return [...answerWords].some(w => !own.has(w) && lead.has(w));
}
// One Wikipedia page for the topic: its title, link, lead extract, and lead photo when it is a real picture.
async function summaryTopic(title){
  const sum = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if(!sum || sum.type==="disambiguation" || !sum.title) return null;
  const page = sum.content_urls?.desktop?.page;
  return {title: sum.title, page: /^https:\/\//.test(page||"") ? page : null, extract: sum.extract || null, image: wikiPhoto(sum)};
}
// The photo and the grounding are picked separately. The photo comes only from the entities the answer names
// (photoFromEntity). The grounding text can still come from the question's search hits, as "Why this answer".
// The question's Wikipedia search needs only the question, so answer() starts it next to the AI call and hands it in.
const topicSearch = query => getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`);
async function topicFor(query, body, searching){
  if(NO_PHOTO_Q.test(query)) return null;
  const ents = answerEntities(query, body);
  const [search, ...first] = await Promise.all([
    searching || topicSearch(query),
    ...ents.map(e=>summaryTopic(e.name)),
  ]);
  const answerWords = new Set(keyWords(body||""));
  const hit = ents.findIndex((e,i)=>photoFromEntity(first[i], e, answerWords));
  const pic = hit >= 0 ? first[hit] : null;
  const names = ents.map(e=>e.name);
  const titles = (search?.query?.search||[]).map(x=>x.title).filter(t=>t && !/^list of /i.test(t) && !names.includes(t)).slice(0,2);
  const all = [...first, ...(await Promise.all(titles.map(summaryTopic)))].filter(Boolean);
  const text = all.find(t=>t.extract && t.page);
  if(!pic && !text) return null;
  return {
    photo: pic ? {url:pic.image.url, width:pic.image.width, height:pic.image.height, title:pic.title} : null,
    grounding: text ? {title:text.title, url:text.page, extract:text.extract} : null,
  };
}

// A DuckDuckGo abstract from Wikipedia names its article; that article's lead photo goes with it.
async function abstractPhoto(url){
  const m = /^https:\/\/en\.wikipedia\.org\/wiki\/([^?#]+)/.exec(url||"");
  if(!m) return null;
  return wikiPhoto(await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${m[1]}`));
}

async function ddg(query){
  const d = await getJSON(`${ANSWER_PROXY}/?ddg=${encodeURIComponent(query)}`);
  if(d){
    const heading = d.Heading || query;
    if(d.Answer) return {title:heading, body:d.Answer, src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null};
    if(d.AbstractText) return {title:heading, body:first(d.AbstractText), src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null, grounding:d.AbstractText, image:await abstractPhoto(d.AbstractURL)};
    if(d.Definition) return {title:heading, body:d.Definition, src:d.DefinitionSource||"DuckDuckGo", url:d.DefinitionURL};
  }
  return null;
}

// A question that names a relation and a subject: "capital of X", "who wrote X", "when was X". Only an intro
// sentence that carries the relation word answers it, so a page without one gives no answer, never a guess.
// "Capital punishment in France" is excluded: it has the word "capital" but is not the capital city.
const RELATIONS = [
  {re:/^(?:what(?:'s| is)(?: the)?\s+|the\s+)?capital(?:\s+city)?\s+of\s+(.+?)\s*\??$/i, word:/\bcapital\b/i, not:/capital punishment/i},
  {re:/^who\s+(?:wrote|written|authored|painted|composed|directed|invented|discovered|founded|created)\s+(.+?)\s*\??$/i, word:/\b(?:written|wrote|author|authored|composed|painted|directed|invented|discovered|founded|created)\b/i},
  {re:/^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$/i, word:/\b(?:1[0-9]{3}|20[0-9]{2})\b/},
];
// Pack-only relations: the online fallback and the Mac and iOS apps do not have these, so the web keeps its own list.
const PACK_ONLY_RELATIONS = [
  {re:/^population\s+of\s+(.+?)\s*\??$/i, word:/\bpopulation (?:of|is|was|at|about|around|over|estimated)\b[^.]*\d/i},
];
function relationOf(query, list = RELATIONS){
  const q = String(query||"").trim();
  for(const r of list){
    const m = r.re.exec(q); if(!m) continue;
    // "when was X born": the year sentence must also carry the verb ("a German-born physicist" has no birth year).
    const verb = m[2];
    const word = verb ? new RegExp(`^(?=[\\s\\S]*\\b${verb}\\b)[\\s\\S]*?(?:${r.word.source})`, "i") : r.word;
    return {subject:m[1].replace(/^the\s+/i,""), word, not:r.not};
  }
  return null;
}
const wikiURL = title => "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(title).replace(/ /g,"_"));
// The lead section's text (not the summary's first paragraph), so the sentence with the answer is there.
async function introOf(title){
  const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(title)}`);
  const p = d?.query?.pages?.[0];
  if(!p || p.missing || !p.extract || !p.title || /^list of /i.test(p.title) || /may refer to/i.test(p.extract.slice(0,300))) return null;
  return {title:p.title, extract:p.extract};
}
// The first sentence with the relation word. A search hit must also name the subject, so the sentence is about it.
function relationSentence(extract, rel, subject, ownPage){
  const ws = keyWords(subject), have = s => new Set(keyWords(s));
  return extract.split(SENTENCE_BREAK).map(s => s.replace(/\s*\(\s*\)/g,"").replace(/\s+,/g,",").trim())
    .find(s => rel.word.test(s) && !(rel.not && rel.not.test(s)) && (ownPage || (ws.length ? ws.every(w => have(s).has(w)) : s.toLowerCase().includes(subject.toLowerCase())))) || null;
}
async function relationWiki(query, rel){
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`);
  const hits = (s?.query?.search||[]).map(x=>x.title).filter(t => t && !/^list of /i.test(t)).slice(0,5);
  const intros = await Promise.all([introOf(rel.subject), ...hits.map(introOf)]);
  for(let i = 0; i < intros.length; i++){
    const it = intros[i]; if(!it) continue;
    const body = relationSentence(it.extract, rel, rel.subject, i === 0);
    if(body) return {title:it.title, body, src:"Wikipedia", url:wikiURL(it.title), grounding:it.extract};
  }
  return null;
}
// A specific question ("what was the first color photograph of a rainbow") that only a generic topic page answers.
// That page is background: flagged, never presented as the answer. Same rule as QueryEngine.isSpecificQuestion in Swift.
const QUESTION_WORDS = ["what","who","when","where","which","how"];
const QUESTION_FILLER = new Set([...QUESTION_WORDS,"was","is","are","were","the","a","an","of","in","on","to","did","does","do","it","its","that"]);
const words = s => String(s).toLowerCase().match(/\p{L}+/gu) || [];
function isSpecificQuestion(question, topic){
  const w = words(question);
  if(!w.length || !QUESTION_WORDS.includes(w[0])) return false;
  const topicWords = new Set(words(topic));
  return w.some(x => !QUESTION_FILLER.has(x) && !topicWords.has(x));
}
function labelIfGeneric(hit, question){
  if(!hit || hit.src!=="Wikipedia" || !hit.title || !isSpecificQuestion(question, hit.title)) return hit;
  return {...hit, background:true};
}
async function wiki(query){
  const rel = relationOf(query);
  if(rel) return relationWiki(query, rel); // a relation question never falls back to a loose search hit
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5&origin=*`);
  let titles = (s?.query?.search||[]).map(x=>x.title);
  if(!titles.length){ // fulltext search down or empty: prefix search is a separate endpoint
    const o = await getJSON(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json&origin=*`);
    titles = o?.[1] || [];
  }
  // List articles and disambiguation pages never answer; the next hit gets its turn.
  titles = titles.filter(t => t && !/^list of /i.test(t)).slice(0,5);
  const sums = await Promise.all(titles.map(t => getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`)));
  for(const sum of sums){
    if(!sum?.extract || sum.type==="disambiguation" || /^list of /i.test(sum.title||"")) continue;
    return {title:sum.title, body:first(sum.extract), src:"Wikipedia", url:sum.content_urls?.desktop?.page, image:wikiPhoto(sum), grounding:sum.extract};
  }
  return null;
}

// "What's primitive.dev?" is a question about a website, and Wikipedia answered it with the
// nearest word ("Div (mythology)"). Read the site's own title + description via the proxy.
const SITE_TLDS = "com|net|org|dev|io|ai|app|co|ca|me|xyz|tv|gg|so|sh|to|fm|cc|us|uk|info|biz|tech|cloud|site|online|page|wiki|design|studio";
const SITE_RE = new RegExp(`^(?:(?:what(?:['\u2019]s|\\s+is)|whats|who(?:['\u2019]s|\\s+is)|tell me about|about)\\s+)?(?:the\\s+)?(?:https?:\\/\\/)?(?:www\\.)?((?:[a-z0-9-]+\\.)+(?:${SITE_TLDS}))(?:\\/\\S*)?(?:\\s+(?:website|site|company|app))?\\s*\\??$`, "i");
function siteHost(query){ const m = query.trim().match(SITE_RE); return m ? m[1].toLowerCase() : null; }
async function site(query){
  const host = siteHost(query);
  if(!host) return null;
  const d = await getJSON(`${ANSWER_PROXY}/?site=${encodeURIComponent(host)}`);
  // Best sentence the page gives about itself: meta description, else headline + first paragraph.
  // A page that only renders with JavaScript has no text in its HTML; say so rather than echo its <title>.
  const body = d && (d.description || [d.h1, d.text].filter(Boolean).join(". ") || (d.js ? "This site loads with JavaScript." : d.title));
  if(!body) return null;
  const image = d.image && /^https:\/\//.test(d.image.url||"") ? {url:d.image.url, width:d.image.width||null, height:d.image.height||null} : null;
  return {title:d.title || d.siteName || host, body:first(body), src:host, url:`https://${host}`, image, icon: image ? null : `https://www.google.com/s2/favicons?domain=${host}&sz=64`, grounding:body};
}

// "define X" must never fall through to Wikipedia search: that turns "define nimble"
// into a game studio. Wiktionary is deterministic, CORS-open, and needs no key.
async function dictionary(query){
  const w = /^(?:define|definition of|meaning of)\s+(.+)$/i.exec(query.trim())?.[1];
  if(!w) return null;
  const d = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.toLowerCase())}`);
  // Wiktionary lists senses by history, not use ("nimble": "adept at taking or grasping" first),
  // so show the first two: the everyday meaning is nearly always one of them.
  const m = d?.en?.[0], senses = (m?.definitions||[]).map(x=>x.definition?.replace(/<[^>]+>/g,"").trim().replace(/\.$/,"")).filter(Boolean).slice(0,2);
  const def = senses.length>1 ? `${senses[0]}; ${senses[1][0].toLowerCase()}${senses[1].slice(1)}.` : senses[0] ? `${senses[0]}.` : null;
  if(def) return {title:w, body:`(${m.partOfSpeech.toLowerCase()}) ${def}`, src:"Wiktionary", url:`https://en.wiktionary.org/wiki/${encodeURIComponent(w)}`};
  // Wiktionary miss or down: Free Dictionary API, same shape, no key.
  const f = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.toLowerCase())}`);
  const mm = f?.[0]?.meanings?.[0], fd = mm?.definitions?.[0]?.definition;
  if(fd) return {title:w, body:`(${mm.partOfSpeech}) ${fd}`, src:"Free Dictionary", url:f[0].sourceUrls?.[0]};
  return null;
}

// A card is one big number, a small label under it and one quiet line: {kind:"card", big, unit, sub, src, url}.
const card=(big,unit,sub,src,url)=>({kind:"card", big:String(big), unit, sub, src, url});

// Etymology card via wordroot's public API.
const LANG={enm:"Middle English",ang:"Old English",la:"Latin",fr:"French",fro:"Old French",frm:"Middle French",grc:"Ancient Greek",el:"Greek",non:"Old Norse",de:"German",gmh:"Middle High German",goh:"Old High German",nl:"Dutch",dum:"Middle Dutch",it:"Italian",es:"Spanish",pt:"Portuguese",ar:"Arabic",he:"Hebrew",sa:"Sanskrit",ja:"Japanese",zh:"Chinese","gem-pro":"Proto-Germanic","ine-pro":"Proto-Indo-European","itc-pro":"Proto-Italic"};
async function etymology(query){
  const m = /^(?:origin|etymology|root|where\s+does\s+the\s+word)\s+(?:of\s+)?(?:the\s+word\s+)?(.+?)(?:\s+come\s+from)?\s*\??$/i.exec(query.trim());
  if(!m) return null;
  const w = m[1].trim();
  const e = await getJSON(`https://wordroot.jaybulb.com/api/etymology/${encodeURIComponent(w.toLowerCase())}`);
  if(!e?.etymology?.length) return null;
  const first = e.etymology[0];
  // The language belongs in the sub line as a name, not inline after the word as a code.
  const lang = LANG[first.langCode] || first.langCode;
  const sub = `${first.relation.charAt(0).toUpperCase() + first.relation.slice(1)} from ${first.ancestor}${lang ? ", " + lang : ""}`;
  return card(w, "", sub, "Wordroot", `https://wordroot.jaybulb.com/#search=${encodeURIComponent(w)}`);
}

// --- currency ("100 usd to eur") via Frankfurter (ECB rates, CORS-open, no key) ---
// ECB codes only: Frankfurter serves these, so a pair of words like "the to and" never reads as money.
const CCY = new Set("USD EUR GBP JPY CAD AUD CHF CNY INR MXN BRL KRW SEK NOK DKK NZD SGD HKD ZAR TRY PLN CZK HUF ILS THB PHP IDR MYR ISK RON BGN".split(" "));
// "100 usd to eur" is an amount. "eur to usd" and "eur to usd rate" have no amount: those are a pair quote (markets).
// Spoken names for the common ones: "1 euro to usd". Not "pound": that is a weight.
const CCY_NAME={euro:"EUR",euros:"EUR",dollar:"USD",dollars:"USD",yen:"JPY",yuan:"CNY",rupee:"INR",rupees:"INR",peso:"MXN",pesos:"MXN"};
function currencyExpr(s){
  s=s.replace(/\b[a-z]+\b/gi,w=>CCY_NAME[w.toLowerCase()]||w);
  const m=/^(?:convert\s+)?(?:(-?\d+(?:\.\d+)?)\s*)?([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})(\s+rate)?\??$/i.exec(s.trim());
  if(!m || U[m[2].toLowerCase()] || U[m[3].toLowerCase()]) return null;
  const pair = m[1]===undefined;
  if(pair && !(CCY.has(m[2].toUpperCase()) && CCY.has(m[3].toUpperCase()))) return null;
  return {v: m[1]===undefined ? 1 : +m[1], from:m[2].toUpperCase(), to:m[3].toUpperCase(), pair};
}
async function currency(query){
  const c=currencyExpr(query); if(!c || c.pair) return null;
  const d=await getJSON(`https://api.frankfurter.dev/v1/latest?base=${c.from}&symbols=${c.to}`)
       || await getJSON(`https://open.er-api.com/v6/latest/${c.from}`); // fallback: same rate map shape
  const fmt=n=>n.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
  // Offline (or both sources down): the last rate this device fetched for the pair, labelled with its day.
  const key=`nimble.fx.${c.from}.${c.to}`;
  let rate=d?.rates?.[c.to], src, url, day=d?.date, saved=false;
  if(rate){
    src=d.base?"Frankfurter":"ExchangeRate-API"; url=d.base?"https://frankfurter.dev":"https://www.exchangerate-api.com";
    try{ localStorage.setItem(key, JSON.stringify({rate, src, url, day: day || new Date().toISOString().slice(0,10)})); }catch{}
  } else {
    let last=null; try{ last=JSON.parse(localStorage.getItem(key)); }catch{}
    if(!last?.rate) return null;
    ({rate, src, url, day}=last); saved=true;
  }
  return {...card(fmt(c.v*rate), c.to, `${c.v.toLocaleString("en")} ${c.from} at ${saved?"the last saved":"today's"} rate`, src, url),
    ...(day ? {asOf:day, asOfDay:true} : {})};
}

// --- freshness: "as of Oct 12, 3:41 pm" for anything time-sensitive. asOf is an ISO time, or a date with asOfDay. ---
// Pure: the day or time is formatted from the value, never from the clock, so tests can pin it with a zone.
function asOfLabel(when, day, tz){
  const d=new Date(when); if(isNaN(d)) return "";
  if(day) return new Intl.DateTimeFormat("en",{month:"short",day:"numeric",timeZone:"UTC"}).format(d);
  return new Intl.DateTimeFormat("en",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",...(tz?{timeZone:tz}:{})}).format(d).replace(/\b(AM|PM)\b/,m=>m.toLowerCase());
}
const asOfNow = o => ({...o, asOf:new Date().toISOString()});

// --- time-sensitive questions: the answer changes over time, so a text answer shows its fetch time. Same rule in Swift and Kotlin. ---
const TS_PRESENT = /\b(current|currently|latest|now|today|tonight|right now|this year|this week|this month|as of|newest|recent|recently|incumbent|last)\b/;
const TS_ROLE = /\b(ceo|cfo|chairman|president|prime minister|premier|mayor|governor|leader|champion|record|holds|population|price|cost|worth|winner|won|king|queen|monarch|ruler|chancellor|pope|head of)\b/;
const TS_PAST = /^(who|when|where) (was|were)\b|\b(first|originally|founded|born|died|invented|discovered|history|historical|ancient|medieval)\b|\b(1[0-9]{3}|20[0-1][0-9]|202[0-4])\b/;
// True when the answer can change over time. Lowercase, word-list only; history questions are false.
function isTimeSensitive(query){
  const s=String(query||"").toLowerCase();
  if(TS_PRESENT.test(s)) return true;
  if(TS_ROLE.test(s)) return !TS_PAST.test(s);
  return false;
}

// --- markets: crypto (CoinGecko simple/price), stocks (Stooq daily CSV), currency pairs (Frankfurter series). ---
// All keyless and called from the browser with a short timeout. A failed or unreadable source is
// {kind:"market", unavailable:true}: the page shows a calm state, never a number we did not get,
// and the AI never runs for a price question.
const QUOTE_TIMEOUT_MS = 4000;
const CRYPTO = {bitcoin:["bitcoin","Bitcoin","BTC"], btc:["bitcoin","Bitcoin","BTC"], ethereum:["ethereum","Ethereum","ETH"], eth:["ethereum","Ethereum","ETH"],
  solana:["solana","Solana","SOL"], sol:["solana","Solana","SOL"], dogecoin:["dogecoin","Dogecoin","DOGE"], doge:["dogecoin","Dogecoin","DOGE"]};
const CRYPTO_KEYS = Object.keys(CRYPTO).join("|");
// "bitcoin price", "price of bitcoin", "what's the current price of ethereum", or a bare "btc" (the short names only).
const CRYPTO_RE = new RegExp(`^(?:(?:what(?:'s| is) the )?(?:current )?price (?:of |for )?(${CRYPTO_KEYS})|(${CRYPTO_KEYS}) price|(btc|eth|sol|doge))\\s*\\??$`, "i");
// Capitals that are words or acronyms: a bare "AI" or "US" is never a stock lookup.
const NOT_TICKER = new Set("NFL NBA MLB NHL MLS EPL AI US UK EU OK TV IT ID PC CEO CFO NASA USA GDP CPU GPU API URL DNA HTML CSS JS FAQ NYC UN OR AND THE ARE NOT ALL ANY NEW CAN PDF SMS VPN RAM SSD USB TBD WHO HOW WHY YES NO DJ MP PM AM TO OF IN IS ON AT BY DO GO UP".split(" "));
// "AAPL", "$AAPL", "AAPL stock", "stock price of AAPL", "aapl price". A bare word needs the capitals (so "who is apple" never matches).
const STOCK_RE = /^(?:(?:what(?:'s| is) the )?(?:stock )?(?:price|quote) (?:of |for )?)?\$?([A-Za-z]{1,5})(?: (?:stock|stock price|share price|shares?|price|quote))?\s*\??$/i;
function stockSymbol(q){
  const s=q.trim(), m=STOCK_RE.exec(s); if(!m) return null;
  const bare = s === m[1] || s === "$"+m[1];
  if(bare && !(/^\$?[A-Z]{2,5}$/.test(s) && !NOT_TICKER.has(m[1]))) return null;
  return m[1].toUpperCase();
}
async function quoteText(url){
  try{ const r=await fetch(url,{signal:AbortSignal.timeout(QUOTE_TIMEOUT_MS)}); return r.ok ? await r.text() : null; }catch{ return null; }
}
const usd = n => new Intl.NumberFormat("en",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:n<1?4:2}).format(n);
// "Up 0.56% in the last 24 hours", "Down 1.20% on Oct 9", "Flat today". Words carry the direction, not colour.
function changeText(pct, when){
  if(typeof pct!=="number" || !isFinite(pct)) return "";
  const a=Math.abs(pct).toFixed(2);
  return a==="0.00" ? "Flat "+when : (pct>0?"Up ":"Down ")+a+"% "+when;
}
const dayLabel = iso => asOfLabel(iso, true);
// Stooq daily CSV (Date,Open,High,Low,Close,Volume). The last two closes give the change. Anything else is null.
function parseDaily(csv){
  const rows=String(csv||"").trim().split(/\r?\n/).map(l=>l.split(","));
  const head=rows.shift()||[];
  const iD=head.findIndex(h=>/^date$/i.test(h.trim())), iC=head.findIndex(h=>/^close$/i.test(h.trim()));
  if(iD<0 || iC<0) return null;
  const pts=rows.map(r=>({date:(r[iD]||"").trim(), close:+r[iC]}))
    .filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date) && isFinite(p.close) && p.close>0)
    .sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  if(pts.length<2) return null;
  const last=pts[pts.length-1], prev=pts[pts.length-2];
  return {date:last.date, close:last.close, pct:(last.close-prev.close)/prev.close*100};
}
async function cryptoCard(key){
  const [id,name,sym]=CRYPTO[key];
  const base={kind:"market", title:`${name} (${sym})`, src:"CoinGecko", url:"https://www.coingecko.com"};
  const d=await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,{timeout:QUOTE_TIMEOUT_MS});
  const q=d?.[id];
  if(typeof q?.usd!=="number" || !isFinite(q.usd)) return {...base, unavailable:true};
  return {...base, big:usd(q.usd), change:changeText(q.usd_24h_change, "in the last 24 hours"),
    asOf:new Date((q.last_updated_at || Date.now()/1000)*1000).toISOString()};
}
// Through the proxy's ?quote= (Yahoo's chart API; Stooq walled its CSV behind a bot check in Oct 2026).
// A name ("apple stock") comes back as its ticker. Anything short of a real price is the calm unavailable state.
async function stockCard(sym){
  const base={kind:"market", title:sym, src:"Yahoo Finance", url:`https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`};
  const d=await getJSON(`${ANSWER_PROXY}/?quote=${encodeURIComponent(sym)}`,{timeout:QUOTE_TIMEOUT_MS});
  if(typeof d?.price!=="number" || !isFinite(d.price) || !d.symbol) return {...base, unavailable:true};
  const big = d.currency && d.currency!=="USD" ? d.price.toFixed(2)+" "+d.currency : usd(d.price);
  return {...base, title:d.name && d.name!==d.symbol ? `${d.name} (${d.symbol})` : d.symbol, url:`https://finance.yahoo.com/quote/${encodeURIComponent(d.symbol)}`,
    big, change:changeText(d.pct, "today"), asOf:d.time};
}
async function fxCard(from,to){
  const base={kind:"market", title:`${from} to ${to}`, src:"Frankfurter", url:"https://frankfurter.dev"};
  const start=new Date(Date.now()-14*864e5).toISOString().slice(0,10);
  const d=await getJSON(`https://api.frankfurter.dev/v1/${start}..?base=${from}&symbols=${to}`,{timeout:QUOTE_TIMEOUT_MS});
  const days=Object.keys(d?.rates||{}).filter(k=>typeof d.rates[k]?.[to]==="number").sort();
  if(days.length<2) return {...base, unavailable:true};
  const day=days[days.length-1], last=d.rates[day][to], prev=d.rates[days[days.length-2]][to];
  return {...base, big:last.toFixed(4)+" "+to, change:changeText((last-prev)/prev*100, "on "+dayLabel(day)), asOf:day, asOfDay:true};
}
// The market card for a query, or null when the query is not a market question (the chain goes on).
async function market(query){
  const q=query.trim();
  const c=CRYPTO_RE.exec(q); if(c) return cryptoCard((c[1]||c[2]||c[3]).toLowerCase());
  const fx=currencyExpr(q); if(fx && fx.pair) return fxCard(fx.from, fx.to);
  const sym=stockSymbol(q); if(sym) return stockCard(sym);
  return null;
}

// --- sports: ESPN's public scoreboard (keyless, CORS-open). Web first; Swift and Kotlin follow. ---
// A sports question names a team we know (or a league, for "nfl scores") and has a score word.
// A bare team name ("lakers") is enough. A common word ("heat", "jazz") needs the score word too, so a
// definition never reaches ESPN. A game we did not find says so; a failed request is the calm
// "Scores unavailable right now". A score is never guessed, and the AI never runs for one.
const SPORTS_TIMEOUT_MS = 4000;
const SPORTS_LEAGUES = {
  nba:{path:"basketball/nba", name:"NBA", url:"https://www.espn.com/nba/scoreboard", unit:"quarter", periods:4},
  nfl:{path:"football/nfl", name:"NFL", url:"https://www.espn.com/nfl/scoreboard", unit:"quarter", periods:4},
  mlb:{path:"baseball/mlb", name:"MLB", url:"https://www.espn.com/mlb/scoreboard"},
  nhl:{path:"hockey/nhl", name:"NHL", url:"https://www.espn.com/nhl/scoreboard", unit:"period", periods:3},
  epl:{path:"soccer/eng.1", name:"Premier League", url:"https://www.espn.com/soccer/league/_/name/eng.1"},
  mls:{path:"soccer/usa.1", name:"MLS", url:"https://www.espn.com/soccer/league/_/name/usa.1"},
};
// Teams split by ";". A "|" lists the names a fan types (the first is the ESPN display name). Without one,
// the big four also answer to the last word ("Lakers"); soccer names are listed in full.
const SPORTS_TEAMS = {
  nba:"Atlanta Hawks;Boston Celtics;Brooklyn Nets;Charlotte Hornets;Chicago Bulls;Cleveland Cavaliers;Dallas Mavericks;Denver Nuggets;Detroit Pistons;Golden State Warriors;Houston Rockets;Indiana Pacers;LA Clippers|Clippers;Los Angeles Lakers;Memphis Grizzlies;Miami Heat;Milwaukee Bucks;Minnesota Timberwolves;New Orleans Pelicans;New York Knicks;Oklahoma City Thunder;Orlando Magic;Philadelphia 76ers|76ers|Sixers;Phoenix Suns;Portland Trail Blazers|Trail Blazers;Sacramento Kings;San Antonio Spurs;Toronto Raptors;Utah Jazz;Washington Wizards",
  nfl:"Arizona Cardinals;Atlanta Falcons;Baltimore Ravens;Buffalo Bills;Carolina Panthers;Chicago Bears;Cincinnati Bengals;Cleveland Browns;Dallas Cowboys;Denver Broncos;Detroit Lions;Green Bay Packers;Houston Texans;Indianapolis Colts;Jacksonville Jaguars;Kansas City Chiefs;Las Vegas Raiders;Los Angeles Chargers;Los Angeles Rams;Miami Dolphins;Minnesota Vikings;New England Patriots;New Orleans Saints;New York Giants;New York Jets;Philadelphia Eagles;Pittsburgh Steelers;San Francisco 49ers;Seattle Seahawks;Tampa Bay Buccaneers;Tennessee Titans;Washington Commanders",
  mlb:"Arizona Diamondbacks;Atlanta Braves;Baltimore Orioles;Boston Red Sox|Red Sox;Chicago Cubs;Chicago White Sox|White Sox;Cincinnati Reds;Cleveland Guardians;Colorado Rockies;Detroit Tigers;Houston Astros;Kansas City Royals;Los Angeles Angels;Los Angeles Dodgers;Miami Marlins;Milwaukee Brewers;Minnesota Twins;New York Mets;New York Yankees;Athletics;Philadelphia Phillies;Pittsburgh Pirates;San Diego Padres;San Francisco Giants;Seattle Mariners;St. Louis Cardinals;Tampa Bay Rays;Texas Rangers;Toronto Blue Jays|Blue Jays;Washington Nationals",
  nhl:"Anaheim Ducks;Boston Bruins;Buffalo Sabres;Calgary Flames;Carolina Hurricanes;Chicago Blackhawks;Colorado Avalanche;Columbus Blue Jackets|Blue Jackets;Dallas Stars;Detroit Red Wings|Red Wings;Edmonton Oilers;Florida Panthers;Los Angeles Kings;Minnesota Wild;Montreal Canadiens;Nashville Predators;New Jersey Devils;New York Islanders;New York Rangers;Ottawa Senators;Philadelphia Flyers;Pittsburgh Penguins;San Jose Sharks;Seattle Kraken;St. Louis Blues;Tampa Bay Lightning;Toronto Maple Leafs|Maple Leafs;Utah Mammoth|Utah Hockey Club|Mammoth;Vancouver Canucks;Vegas Golden Knights|Golden Knights;Washington Capitals;Winnipeg Jets",
  epl:"Arsenal;Aston Villa|Villa;AFC Bournemouth|Bournemouth;Brentford;Brighton & Hove Albion|Brighton;Burnley;Chelsea;Crystal Palace|Palace;Everton;Fulham;Leeds United|Leeds;Liverpool;Manchester City|Man City;Manchester United|Man United|Man Utd;Newcastle United|Newcastle;Nottingham Forest|Nottingham;Sunderland;Tottenham Hotspur|Tottenham|Spurs;West Ham United|West Ham;Wolverhampton Wanderers|Wolves",
  mls:"Atlanta United FC|Atlanta United;Austin FC;CF Montréal|CF Montreal|Montreal;Charlotte FC;Chicago Fire FC|Chicago Fire;FC Cincinnati|Cincinnati;Colorado Rapids|Rapids;Columbus Crew|Columbus Crew SC;D.C. United|DC United;FC Dallas|Dallas FC;Houston Dynamo FC|Houston Dynamo;Inter Miami CF|Inter Miami;LA Galaxy|Galaxy;Los Angeles FC|LAFC;Minnesota United FC|Minnesota United;Nashville SC|Nashville;New England Revolution|Revolution;New York City FC|NYCFC;New York Red Bulls|Red Bulls;Orlando City SC|Orlando City;Philadelphia Union;Portland Timbers|Timbers;Real Salt Lake|Salt Lake;San Diego FC;San Jose Earthquakes|Earthquakes;Seattle Sounders FC|Sounders|Seattle Sounders;Sporting Kansas City|Sporting KC;St. Louis City SC|St. Louis City;Toronto FC;Vancouver Whitecaps FC|Whitecaps|Vancouver Whitecaps",
};
// Nicknames that are also everyday words: these match only with a score word, never alone.
const SPORTS_COMMON = new Set("heat magic jazz thunder wild kings nets suns spurs warriors hawks bulls bears giants cardinals panthers rangers jets stars rockets nuggets pelicans clippers wizards hornets pistons titans chiefs chargers raiders packers vikings lions cowboys eagles falcons saints rams dolphins patriots colts broncos bills ravens steelers texans jaguars browns bengals seahawks commanders buccaneers lightning flames senators bruins blues ducks sharks devils hurricanes capitals islanders flyers avalanche predators kraken coyotes canadiens sabres athletics guardians orioles royals rays tigers twins angels reds cubs mets braves astros padres nationals mariners pirates phillies yankees brewers rockies marlins diamondbacks dodgers wolves villa palace crew union revolution timbers galaxy rapids dynamo sounders whitecaps earthquakes mammoth blazers sixers raptors cavaliers bucks grizzlies pacers".split(" "));
const sportsFold = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g," ").trim();
// alias -> [{lg, keys}], and one regex over every alias (longest first) to find the team in a query.
const SPORTS_INDEX = new Map();
for(const lg of Object.keys(SPORTS_TEAMS)){
  for(const raw of SPORTS_TEAMS[lg].split(";")){
    const parts = raw.split("|").map(s=>s.trim());
    const names = parts.length>1 || !["nba","nfl","mlb","nhl"].includes(lg) ? parts : [parts[0], parts[0].split(" ").pop()];
    const keys = [...new Set(names.map(sportsFold))];
    for(const k of keys){ if(!SPORTS_INDEX.has(k)) SPORTS_INDEX.set(k, []); SPORTS_INDEX.get(k).push({lg, keys}); }
  }
}
const SPORTS_ALIAS_RE = new RegExp("(?:^|[^a-z0-9])(" + [...SPORTS_INDEX.keys()].sort((a,b)=>b.length-a.length)
  .map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|") + ")(?![a-z0-9])");
const SPORTS_LEAGUE_RE = /^(?:(?:today's|todays|latest|recent|last night's)\s+)?(nba|nfl|mlb|nhl|mls|epl|premier league)\s+(?:scores?|results?|games?)$/;
// A score word. "win" and "game" count; "history" and "coach" do not, so they never reach a scoreboard.
const SPORTS_INTENT_RE = /\b(scores?|scored|won|wins?|winner|lose|loses|lost|loss|beat|beats|beaten|games?|results?|final|finals|playing|match|tonight|last night)\b/;
// Questions about the future, opinions, rosters and news are never a score lookup.
const SPORTS_NEG_RE = /\b(will|would|should|could|might|why|how many|how much|how to|how do|odds|predict\w*|bet|best|worst|trade|traded|draft|drafted|sign|signed|coach|roster|news|history|rumou?rs?)\b/;

// The sports question in a query: {league} for "nfl scores", or {team, teams, lastNight} for a team. Else null.
function sportsQuery(query){
  const q = sportsFold(query).replace(/[?!.]+$/,"").trim();
  const lm = SPORTS_LEAGUE_RE.exec(q);
  if(lm) return {league: lm[1]==="premier league" ? "epl" : lm[1], lastNight: /last night/.test(q)};
  if(SPORTS_NEG_RE.test(q)) return null;
  const m = SPORTS_ALIAS_RE.exec(q); if(!m) return null;
  const team = m[1], intent = SPORTS_INTENT_RE.test(q);
  if(!intent && q !== team && q !== "the "+team) return null;   // a bare name, or "the" and the name, and nothing else
  if(!intent && SPORTS_COMMON.has(team)) return null;
  const teams = {};
  for(const {lg, keys} of SPORTS_INDEX.get(team)){ teams[lg] = teams[lg] || new Set(); keys.forEach(k=>teams[lg].add(k)); }
  return {team, teams, lastNight: /last night/.test(q)};
}

// The day as YYYYMMDD in the zone asked for (ESPN's ?dates= wants this shape). A bad date is "".
const ymdOf = (date, tz) => isNaN(date) ? "" : new Intl.DateTimeFormat("en-CA",{year:"numeric", month:"2-digit", day:"2-digit", ...(tz?{timeZone:tz}:{})})
  .format(date).replace(/-/g,"");
const sportsDay = (now, back, tz) => ymdOf(new Date(now.getTime() - back*864e5), tz);
// One league's events for one day (ymd), or the current scoreboard when ymd is null: an array (possibly empty), or null when the request failed.
async function sportsBoard(lg, ymd){
  const d = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS_LEAGUES[lg].path}/scoreboard${ymd ? "?dates="+ymd : ""}`, {timeout:SPORTS_TIMEOUT_MS});
  return d && Array.isArray(d.events) ? d.events : null;
}
const ordinal = n => n + (n%10===1 && n%100!==11 ? "st" : n%10===2 && n%100!==12 ? "nd" : n%10===3 && n%100!==13 ? "rd" : "th");
// "Final", "Final/OT", "3rd quarter 4:12", "Scheduled for 7:30 pm". Soccer and baseball use ESPN's own short text.
function sportsStatus(ev, lg, now, tz){
  const t = ev.status?.type || {}, st = ev.status || {}, L = SPORTS_LEAGUES[lg] || {};
  if(t.state==="post") return t.detail || t.shortDetail || "Final";
  if(t.state==="pre") return "Scheduled for " + kickoffLabel(ev.date, now, tz);
  if(t.name==="STATUS_HALFTIME") return "Halftime";
  if(t.state==="in" && L.unit && st.period>=1 && st.period<=L.periods && st.displayClock) return `${ordinal(st.period)} ${L.unit} ${st.displayClock}`;
  return t.shortDetail || t.detail || "In progress";
}
// "7:30 pm" today, "Oct 13, 7:30 pm" on another day. The clock reads in the zone asked for.
function kickoffLabel(iso, now, tz){
  const d = new Date(iso); if(isNaN(d)) return "";
  const zone = tz ? {timeZone:tz} : {};
  const time = new Intl.DateTimeFormat("en",{hour:"numeric", minute:"2-digit", ...zone}).format(d).replace(/\s+/g," ").replace(/\b(AM|PM)\b/, m=>m.toLowerCase());
  const dayOf = x => new Intl.DateTimeFormat("en-CA",{year:"numeric", month:"2-digit", day:"2-digit", ...zone}).format(x);
  if(dayOf(d)===dayOf(now)) return time;
  return new Intl.DateTimeFormat("en",{month:"short", day:"numeric", ...zone}).format(d) + ", " + time;
}
// The game's own date in words, "Thursday, Oct 8", in the zone asked for.
const sportsDayWords = (iso, tz) => { const d = new Date(iso); return isNaN(d) ? "" : new Intl.DateTimeFormat("en",{weekday:"long", month:"short", day:"numeric", ...(tz?{timeZone:tz}:{})}).format(d); };
// One game as a row: our team first, the winner marked, a tie said in words. ESPN gives no score before kickoff.
// dated: a finished game found by the look-back says its day ("Final, Thursday, Oct 8").
function gameRow(ev, ours, lg, now, tz, dated){
  const comps = ev.competitions?.[0]?.competitors || [];
  const order = ours ? [ours, ...comps.filter(c=>c!==ours)] : [...comps].sort((a,b)=>(a.homeAway==="away"?0:1)-(b.homeAway==="away"?0:1));
  const state = ev.status?.type?.state;
  const teams = order.map(c=>({name: c.team?.shortDisplayName || c.team?.name || "", score: state==="pre" ? "" : String(c.score ?? ""), winner: c.winner===true}));
  const tied = state==="post" && !teams.some(t=>t.winner);
  const day = dated && state==="post" ? ", " + sportsDayWords(ev.date, tz) : "";
  return {teams, state, status: sportsStatus(ev, lg, now, tz) + day + (tied ? ", tied" : "")};
}
// Every event where the team plays, with the team's own side, found by any of its names.
function sportsHits(events, keys){
  const out = [];
  for(const ev of events){
    const comps = ev.competitions?.[0]?.competitors || [];
    const ours = comps.find(c=>[c.team?.displayName, c.team?.shortDisplayName, c.team?.name].some(n=>keys.has(sportsFold(n))));
    if(ours) out.push({ev, ours});
  }
  return out;
}
// The event where the team plays, found by any of its names.
function sportsFind(events, keys){ return sportsHits(events, keys)[0] || null; }
const sportsTime = ev => Date.parse(ev.date) || 0;
const sportsState = ev => ev.status?.type?.state;
// The team's most recent game on one board: the latest Final, else one in progress, else the next scheduled.
function sportsRecent(events, keys){
  const hits = sportsHits(events, keys);
  const finals = hits.filter(h=>sportsState(h.ev)==="post").sort((a,b)=>sportsTime(b.ev)-sportsTime(a.ev));
  if(finals.length) return finals[0];
  const live = hits.find(h=>sportsState(h.ev)==="in"); if(live) return live;
  return hits.filter(h=>sportsState(h.ev)==="pre").sort((a,b)=>sportsTime(a.ev)-sportsTime(b.ev))[0] || null;
}
// A league's most recent day on its current scoreboard: the latest Final's day, else a game in progress, else the next
// scheduled day. Returns that day's games (possibly none).
function sportsRecentDay(events, tz){
  const finals = events.filter(e=>sportsState(e)==="post").sort((a,b)=>sportsTime(b)-sportsTime(a));
  const live = events.filter(e=>sportsState(e)==="in");
  const next = events.filter(e=>sportsState(e)==="pre").sort((a,b)=>sportsTime(a)-sportsTime(b));
  const pick = finals[0] || live[0] || next[0];
  if(!pick) return [];
  const day = ymdOf(new Date(pick.date), tz);
  return events.filter(e=>ymdOf(new Date(e.date), tz)===day);
}
// After a finished game, the team's next one from its ESPN team page (one call), so "canucks score" also says
// when they play next. Null when ESPN lists none or the call fails.
async function sportsNext(lg, ours, now, tz){
  const id = ours?.team?.id; if(!id) return null;
  const d = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS_LEAGUES[lg].path}/teams/${id}`, {timeout:SPORTS_TIMEOUT_MS});
  const e = d?.team?.nextEvent?.[0], c = e?.competitions?.[0];
  const ev = c && {...e, status: e.status || c.status}, mine = c?.competitors?.find(x=>x.team?.id===id);
  return ev && mine && sportsState(ev)==="pre" ? gameRow(ev, mine, lg, now, tz, false) : null;
}
// The sports card for a query, or null when the query is not about sports. The order is fixed:
// 1. today, then yesterday ("last night" is yesterday only), by the day's board;
// 2. the team's or league's current scoreboard (no date): the most recent game, Final, else in progress, else next;
// 3. each day back to seven days ago, most recent first.
// A failed request with no game found is "unavailable", never "no game". opts.now and opts.tz are for tests.
async function sports(query, opts={}){
  const p = sportsQuery(query); if(!p) return null;
  const now = opts.now || new Date(), tz = opts.tz, src = "ESPN", asOf = now.toISOString();
  const days = p.lastNight ? [1] : [0, 1];
  let failed = false;
  if(p.league){
    const lg = p.league, L = SPORTS_LEAGUES[lg], base = {kind:"sports", src, title:`${L.name} scores`, league:L.name, url:L.url};
    const show = (evs, dated) => ({...base, rows: evs.slice(0,8).map(e=>gameRow(e, null, lg, now, tz, dated)), asOf});
    for(const back of days){
      const ev = await sportsBoard(lg, sportsDay(now, back, tz));
      if(!ev){ failed = true; continue; }
      if(ev.length) return show(ev, false);
    }
    const board = await sportsBoard(lg, null);
    if(!board) failed = true;
    else { const evs = sportsRecentDay(board, tz); if(evs.length) return show(evs, true); }
    for(let back=2; back<=7; back++){
      const ev = await sportsBoard(lg, sportsDay(now, back, tz));
      if(!ev){ failed = true; continue; }
      if(ev.length) return show(ev, true);
    }
    return failed ? {...base, unavailable:true} : {...base, none:true, lastNight:p.lastNight, asOf};
  }
  const title = p.team.replace(/\b\w/g, c=>c.toUpperCase()), base = {kind:"sports", src, title};
  const found = async (lg, hit, dated) => {
    const next = sportsState(hit.ev)==="post" ? await sportsNext(lg, hit.ours, now, tz).catch(()=>null) : null;
    return {...base, url: SPORTS_LEAGUES[lg].url, rows:[gameRow(hit.ev, hit.ours, lg, now, tz, dated), ...(next ? [next] : [])], asOf};
  };
  for(const back of days) for(const lg of Object.keys(p.teams)){
    const ev = await sportsBoard(lg, sportsDay(now, back, tz));
    if(!ev){ failed = true; continue; }
    const hit = sportsFind(ev, p.teams[lg]); if(hit) return found(lg, hit, false);
  }
  for(const lg of Object.keys(p.teams)){
    const ev = await sportsBoard(lg, null);
    if(!ev){ failed = true; continue; }
    const hit = sportsRecent(ev, p.teams[lg]); if(hit) return found(lg, hit, true);
  }
  for(let back=2; back<=7; back++) for(const lg of Object.keys(p.teams)){
    const ev = await sportsBoard(lg, sportsDay(now, back, tz));
    if(!ev){ failed = true; continue; }
    const hit = sportsFind(ev, p.teams[lg]); if(hit) return found(lg, hit, true);
  }
  return failed ? {...base, url:"https://www.espn.com", unavailable:true} : {...base, url:"https://www.espn.com", none:true, lastNight:p.lastNight, asOf};
}

// --- weather / local time via Open-Meteo (geocoding + forecast, no key) ---
async function geocode(place){
  const g=await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en`);
  return g?.results?.[0]||null;
}
// The next 12 hours as a range: "next 12 h 8 to 12°C", or one figure when it holds. Empty when Open-Meteo sends none.
const next12=(t)=>{ const v=(t||[]).filter(Number.isFinite).map(Math.round); if(!v.length) return "";
  const lo=Math.min(...v), hi=Math.max(...v); return `next 12 h ${lo===hi?lo:`${lo} to ${hi}`}°C`; };
async function weather(query){
  // "weather in vancouver", "vancouver weather", "forecast for tokyo". A leading question word is not a place.
  const q=query.trim();
  const place=/^(?:what(?:'s| is) the )?(?:weather|forecast) (?:in|for|at) (.+?)\??$/i.exec(q)?.[1]
    || (/^(?!(?:what|how|is|the|will|does)\b)([a-z][a-z .'-]+?) (?:weather|forecast)(?: today| now)?\??$/i.exec(q)?.[1]);
  if(!place) return null;
  const loc=await geocode(place); if(!loc) return null;
  const w=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&forecast_hours=12`);
  const c=w?.current; if(!c) return null;
  const sky={0:"clear",1:"mostly clear",2:"partly cloudy",3:"overcast",45:"fog",48:"fog",51:"drizzle",53:"drizzle",55:"drizzle",61:"rain",63:"rain",65:"heavy rain",71:"snow",73:"snow",75:"heavy snow",80:"showers",81:"showers",82:"heavy showers",95:"thunderstorm"}[c.weather_code]||"";
  return asOfNow(card(Math.round(c.temperature_2m), "°C", [loc.name, loc.country, sky, `wind ${Math.round(c.wind_speed_10m)} km/h`, next12(w.hourly?.temperature_2m)].filter(Boolean).join(", "), "Open-Meteo", "https://open-meteo.com"));
}
const timePlace=q=>/^(?:what(?:'s|’s| is) the |what )?(?:current |local )?time (?:is it |now )?(?:in|at) (.+?)(?: right now| now)?\??$/i.exec(q.trim())?.[1];
function timeCard(name, tz, src, url, now=new Date()){
  try{
    const big=new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
    const day=new Intl.DateTimeFormat("en",{timeZone:tz,weekday:"long",month:"long",day:"numeric"}).format(now);
    return asOfNow(card(big, name, `${day}, ${tz}`, src, url));
  }catch{ return null; }
}
// "time in tokyo" with no network: the device's own IANA list names about 400 cities (Asia/Tokyo, Europe/Paris).
// Places it does not name (a country, a smaller city) go to the geocoder below.
function deviceTime(query){
  const place=timePlace(query); if(!place || typeof Intl.supportedValuesOf!=="function") return null;
  const want=place.trim().toLowerCase().replace(/\s+/g,"_");
  const tz=Intl.supportedValuesOf("timeZone").find(z=>z.split("/").pop().toLowerCase()===want);
  return tz ? timeCard(tz.split("/").pop().replace(/_/g," "), tz, "IANA time zones", "https://www.iana.org/time-zones") : null;
}
async function localTime(query){
  const place=timePlace(query); if(!place) return null;
  const loc=await geocode(place); if(!loc?.timezone) return null;
  return timeCard(loc.name, loc.timezone, "Open-Meteo", "https://open-meteo.com");
}

// --- AI engine (settings) ---
// Nimble is the free house proxy. The others call the vendor straight from the browser with
// the visitor's own key, stored in localStorage and sent nowhere else.
const SYSTEM = "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN.";
const ENGINES = {
  nimble:{name:"Nimble (free)", model:"", base:ANSWER_PROXY},
  claude:{name:"Claude", key:true, model:"claude-opus-5-5", base:"https://api.anthropic.com"},
  openai:{name:"OpenAI", key:true, model:"gpt-5", base:"https://api.openai.com"},
  ollama:{name:"Ollama (local)", model:"llama3.1:8b", base:"http://localhost:11434"},
  // Samantha is the house local model (oMLX on :8000, OpenAI chat shape). Opt-in until she
  // passes the same QA as the free proxy; then she becomes the default.
  samantha:{name:"Samantha (local)", model:"Qwen3.5-9B-OptiQ-4bit", base:"http://localhost:8000"},
};
function aiConfig(){
  try{ return {engine:"nimble", apiKey:"", model:"", baseURL:"", ...JSON.parse(localStorage.getItem("nimble.ai")||"{}")}; }
  catch{ return {engine:"nimble", apiKey:"", model:"", baseURL:""}; }
}
function saveAIConfig(c){ try{ localStorage.setItem("nimble.ai", JSON.stringify(c)); }catch{} }
// --- AI answers switch ---
// unset or "yes" = the model may answer, "no" = DuckDuckGo and Wikipedia only (Settings, "AI: off").
// The web never interrupts a question to ask; the privacy page names every service. Apple builds ask once at
// first launch instead, because App Review 5.1.2(i) requires it there.
// Outside a browser (the /api and /mcp workers) there is no localStorage and the caller
// asked for an answer on purpose, so that side counts as "yes".
let memConsent = null; // fallback when storage is blocked, so a choice still lasts the page
function aiConsent(v){
  if(typeof localStorage==="undefined") return "yes";
  if(v!==undefined){
    memConsent = v;
    try{ v ? localStorage.setItem("nimble.aiConsent", v) : localStorage.removeItem("nimble.aiConsent"); }catch{}
    return v;
  }
  try{ const s = localStorage.getItem("nimble.aiConsent"); return s==="yes"||s==="no" ? s : null; }
  catch{ return memConsent; }
}
// Who receives the question, named on the privacy page and in the Apple apps' first-launch prompt. Mirrors AppState.aiRecipient.
function aiRecipient(){
  const c = aiConfig(), e = ENGINES[c.engine] || ENGINES.nimble;
  switch(e.key && !c.apiKey ? "nimble" : c.engine){
    case "claude": return "Anthropic (Claude)";
    case "openai": return "OpenAI";
    case "ollama": return "your own Ollama server";
    case "samantha": return "Samantha, running on this Mac";
    default: return "Nimble's answer service (open models from OpenAI, Alibaba and Google, run on Groq and Cloudflare)";
  }
}
// --- Mascot: Flit (default) or Fen, the one in the empty state and the loading card. This device only. ---
// Storage blocked (private windows, site data cleared) keeps the choice for the page instead.
let memMascot = "nim";
function mascot(v){
  if(v!==undefined){ memMascot = v; try{ localStorage.setItem("nimble.mascot", v); }catch{} return v; }
  // A saved "flit" (retired 6.21.0) reads as Nim.
  try{ return localStorage.getItem("nimble.mascot")==="fen" ? "fen" : "nim"; }
  catch{ return memMascot; }
}
// --- Share card shape: wide, square or story. This device only; storage blocked keeps the choice for the page. ---
let memShape = "wide";
function cardShape(v){
  if(v!==undefined){ memShape = v; try{ localStorage.setItem("nimble.shape", v); }catch{} return v; }
  try{ const s=localStorage.getItem("nimble.shape"); return SHARE_SHAPES[s] ? s : "wide"; }
  catch{ return memShape; }
}
// --- Follow-ups: the last three AI exchanges, memory only, so "and in celsius?" has context ---
const TURNS_MAX = 3, turnList = [];
const turns = {
  list(){ return turnList.map(t=>({...t})); },
  add(q, a){
    if(typeof localStorage==="undefined") return; // the /api and /mcp workers serve many callers, so they keep no memory
    q = String(q||"").trim(); a = String(a||"").trim(); if(!q || !a) return;
    turnList.push({q, a}); while(turnList.length>TURNS_MAX) turnList.shift();
  },
  clear(){ turnList.length = 0; },
};
// Earlier exchanges as chat messages, oldest first, ahead of the new question.
const turnMessages = () => turnList.flatMap(t=>[{role:"user", content:t.q}, {role:"assistant", content:t.a}]);
// The free proxy grounds every question in live Wikipedia intros plus today's date, because model
// weights are frozen ("Justin Trudeau" in 2026). Local engines get the same grounding here.
async function grounding(query){
  const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&format=json&formatversion=2&origin=*&gsrsearch=${encodeURIComponent(query)}`);
  const pages = d?.query?.pages || [];
  const trim = t => { const ss = (t||"").split(/(?<=[.!?])\s+/); return [...ss.slice(0,4), ...ss.slice(4).filter(x=>/\b(current|incumbent|since)\b/i.test(x))].join(" "); };
  return pages.map(p=>`${p.title}: ${trim(p.extract)}`).join("\n\n").slice(0,6000);
}
// out.aiError: the worker's reason when its AI call failed (quota, capacity); empty for a plain UNKNOWN.
async function gemma(query, out={}){
  let c = aiConfig(), e = ENGINES[c.engine] || ENGINES.nimble;
  if(e.key && !c.apiKey){ c = {engine:"nimble"}; e = ENGINES.nimble; } // no key = free proxy
  const base = c.baseURL || e.base, model = c.model || e.model, H = {"Content-Type":"application/json"};
  let d, text, src, image = null, refs = [], why = {};
  if(c.engine==="claude" && e===ENGINES.claude){
    d = await getJSON(base+"/v1/messages", {method:"POST", headers:{...H, "x-api-key":c.apiKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model, max_tokens:256, system:SYSTEM, messages:[...turnMessages(), {role:"user", content:query}]})});
    text = (d?.content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""); src = model;
  }else if(e===ENGINES.openai || e===ENGINES.ollama || e===ENGINES.samantha){
    const local = e!==ENGINES.openai;
    const ctx = local ? await grounding(query) : "";
    const system = SYSTEM + (ctx ? ` Today is ${new Date().toISOString().slice(0,10)}. Your training data is out of date; when the reference text below covers the question, trust it over your memory. Never mention the reference text.\n\nReference (live Wikipedia):\n${ctx}` : "");
    // Ollama speaks the OpenAI chat shape at /v1 (needs OLLAMA_ORIGINS set for the browser).
    d = await getJSON(base+"/v1/chat/completions", {method:"POST", headers:{...H, ...(c.apiKey?{Authorization:"Bearer "+c.apiKey}:{})},
      body:JSON.stringify({model, max_tokens:256, ...(e===ENGINES.samantha ? {chat_template_kwargs:{enable_thinking:false}} : {}), messages:[{role:"system", content:system}, ...turnMessages(), {role:"user", content:query}]}), ...(local ? {timeout:LOCAL_TIMEOUT_MS} : {})});
    text = d?.choices?.[0]?.message?.content; src = model;
  }else{
    d = await getJSON(ANSWER_PROXY, {method:"POST", headers:H, body:JSON.stringify({q:query, turns:turns.list()})});
    text = d?.answer; src = d?.source||"Nimble AI";
    if(typeof d?.aiError==="string" && d.aiError) out.aiError = d.aiError;
    image = d?.image && /^https:\/\//.test(d.image.url||"") ? d.image : null;
    // Wikipedia pages behind the proxy's answer; the worker has already matched them to the sentence.
    refs = Array.isArray(d?.refs) ? d.refs.filter(r => r && /^https:\/\//.test(r.url||"") && r.extract).map(r => ({src:"Wikipedia", title:r.title||"Wikipedia", url:r.url, grounding:r.extract})) : [];
    // The proxy names its page in topic/topicUrl (the page its photo or sentence came from). When it does, that page
    // gives the photo credit and the Why text. Older proxies send neither: the photo's page is the first on-topic ref.
    const named = typeof d?.topic==="string" && d.topic.trim() && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(d?.topicUrl||"")
      ? {title:d.topic.trim(), url:d.topicUrl, grounding:(refs.find(r => r.url===d.topicUrl)||{}).grounding} : null;
    const topic = named || (image && (refs.find(r => onTopic(r.title, query, "")) || refs.find(r => onTopic(r.title, query, text))));
    if(image && topic) image = {...image, title:topic.title};
    // The Why link opens the named page's intro, only when the proxy named one that came with its text.
    if(named && named.grounding) why = {grounding:named.grounding, groundingTitle:named.title, groundingUrl:named.url};
  }
  // The proxy's two models clash and no source settles it: both answers come back, and answer() shows them side by side.
  const alts = d && d.disagree === true && Array.isArray(d.alts)
    ? d.alts.filter(x => x && typeof x.model==="string" && typeof x.answer==="string" && x.answer.trim()).map(x => ({model:x.model, answer:x.answer.trim()})) : [];
  if(alts.length >= 2) return {title:query, body:"", src, disagree:alts, ...(refs.length ? {refs} : {})};
  const a = (text||"").trim();
  // A compare ("paris vs london population") also comes as two label/value rows, shown side by side.
  const rows = Array.isArray(d?.rows) ? d.rows.filter(r => r && typeof r.label==="string" && typeof r.value==="string") : [];
  return a && a.toUpperCase()!=="UNKNOWN" ? {title:query, body:a, src, ...(image ? {image} : {}), ...(refs.length ? {refs} : {}), ...(rows.length===2 ? {rows} : {}), ...why} : null;
}

// "Who made you" is about us, not the Wikipedia article for whatever the words match (it used to
// return YouTube). Answered locally, no model call.
async function identity(query){
  if(!/^(who (made|created|built|invented|wrote|developed|designed|programmed|owns|runs) (you|nimble|this app)|who are you|what are you|who is (nimble|your (creator|maker|developer|owner))|what('s| is) your name|what('s| is) nimble|tell me about (yourself|nimble)|are you (an? )?(ai|bot|robot|human|person|real person|chatgpt|gpt|claude|siri|alexa|gemini|google|llm|language model|chat ?bot)|what (ai |language )?models? (are you|is this|do you use|powers? you|runs? you)|what (ai|llm) (are you|is this|do you use)|how do you work|where do (you get your answers|your answers come from))\s*\??$/i.test(query.trim())) return null;
  return {title:query, body:"Nimble is an instant-answer app made by Joshua Trommel. Math, units and school courses are worked out on your device. Other questions go to free open models (gpt-oss and Qwen on Groq, Qwen3 and Gemma on Cloudflare), or to Claude, OpenAI or Ollama if you add your own key, with Wikipedia and DuckDuckGo as backup. More of his work is at jaybulb.com.", src:"Nimble"};
}

// "news" and "what's happening in <place>": the top three headlines from keyless RSS, served by the
// proxy's ?news route (BBC, CBC, NPR, Guardian, Global; a place keeps only matching stories).
const NEWS_RE = /^(?:(?:latest|top|today['\u2019]?s|breaking)\s+)?news(?:\s+(?:in|from|for|around)\s+(.+?))?\s*\??$|^what(?:['\u2019]s| is) happening(?:\s+(?:in|at|around)\s+(.+?))?\s*\??$/i;
async function news(query){
  const m = query.trim().match(NEWS_RE);
  if(!m) return null;
  const place = (m[1]||m[2]||"").trim();
  const d = await getJSON(`${ANSWER_PROXY}/?news=${encodeURIComponent(place)}`);
  const items = (d?.items||[]).filter(i=>i && i.url && i.sentence && i.outlet).slice(0,3)
    .map(i=>({...i, image: i.image && /^https:\/\//.test(i.image.url||"") ? i.image : null}));
  return items.length ? {kind:"news", items, src:[...new Set(items.map(i=>i.outlet))].join(", "), asOf:new Date().toISOString()} : null;
}

// --- offline pack lookup (docs/pack/wikipedia-top-v1.json.gz, held in IndexedDB by the page) ---
// Plain on purpose: title or alias match wins, else a keyword score over title, description and extract.
// A hit needs a title or alias word and a score of at least PACK_MIN. Otherwise: not in the pack. Never a guess.
const PACK_MIN = 3;
const PACK_STOP = new Set("a an and are as at be by did do does for from how i in is it its of on or that the to was were what when where which who whom whose why with".split(" "));
function packTokens(s){
  return String(s||"").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim()
    .split(" ").filter(Boolean);  // exact words: stemming turned "Frances" into "france"
}
// Every entry that matches the query, best first. A title match counts only when the title is about the query:
// "Avatar: The Way of Water" is not an article about water, so the one word in its title is a weak match only.
const TITLE_FILLER = new Set(["inc", "ltd", "corp", "co", "plc"]);
const SUPERLATIVE = /^(largest|longest|deepest|tallest|highest|biggest|smallest|oldest|hottest|coldest)$/;
function packHits(query, pack){
  if(!pack || !Array.isArray(pack.entries)) return [];
  const want = new Set(packTokens(query).filter(w => !PACK_STOP.has(w)));
  if(!want.size) return [];
  const wanted = [...want], sup = wanted.find(w => SUPERLATIVE.test(w));
  const hits = [];
  pack.entries.forEach((e, i) => {
    // Title words the query does not ask for. "Alexander the Great" is not about "the great gatsby", so one stray word
    // is no longer forgiven. A trailing "(film)" and "Inc." do not count, and "sinking" covers "sink". "(TV series)"
    // and "(2026 film)" do count: "who wrote the odyssey" is not about this year's film.
    const titleWords = packTokens(e.t.replace(/\s*\((?![^)]*(\d|series))[^)]*\)$/i, "")).filter(w => !PACK_STOP.has(w) && !TITLE_FILLER.has(w));
    const extra = titleWords.filter(w => !wanted.some(q => w === q || (q.length >= 4 && new RegExp("^" + q + "(ing|ed)$").test(w)))).length;
    // "largest ocean" is answered by a title the question cannot name (Pacific Ocean): one stray word passes when
    // the lead sentence says the title "is the largest". "The Don is the fifth-longest river" does not.
    const ok = extra === 0 || (extra === 1 && !!sup && new RegExp("\\bis the " + sup + "\\b", "i").test(String(e.e||"").split(/(?<=\.)\s/)[0]));
    const title = new Set(packTokens(e.t).concat((e.a||[]).flatMap(packTokens)));
    const desc = new Set(packTokens(e.d)), text = new Set(packTokens(e.e));
    let score = 0, named = false;
    for(const w of want){
      if(title.has(w)){
        if(ok){ score += 3; named = true; } else score += 1;
      }
      else if(desc.has(w)) score += 2;
      else if(text.has(w)) score += 1;
    }
    if(named && score >= PACK_MIN) hits.push({entry:e, score, index:i, len:titleWords.length});
  });
  // Ties go to the shorter title (the plainer article), then to the more-viewed entry (earlier in the pack).
  return hits.sort((a, b) => b.score - a.score || a.len - b.len || a.index - b.index);
}
function packSearch(query, pack){
  return packHits(query, pack)[0] || null;
}
// The sentences of a pack entry that answer the question. A relation question ("capital of X") takes the first sentence
// that carries the relation word (the same rule as the online fallback), after the lead sentence; no such sentence means no answer, never a guess.
// Any other question takes the one or two sentences sharing the most content words with it (the title's own words
// are in every sentence, so they do not count). No overlap: the first sentence.
function packText(entry, query, rel){
  const sents = String(entry.e||"").split(SENTENCE_BREAK).filter(Boolean); // same breaks as first(): "Apple Inc. Founded" stays whole
  if(!sents.length) return "";
  if(rel){
    // The relation sentence often starts with "Its" or "He": the lead sentence before it names the subject.
    const main = sents.find(x => rel.word.test(x) && !(rel.not && rel.not.test(x)));
    if(!main) return "";
    return sents[0] === main ? main : sents[0] + " " + main;
  }
  const titleWords = new Set(packTokens(entry.t));
  const want = new Set(packTokens(query).filter(w => !PACK_STOP.has(w) && !titleWords.has(w)));
  // A sentence answers only if it shares the question's own words: two of them, or all when the question has fewer.
  // "how many bones in the human body" matched "Human penis" on one title word, and its first sentence was the answer.
  // A question that is only the title ("what is DNA") takes the first sentence; anything else with no overlap is a miss.
  const need = Math.min(2, want.size);
  const best = sents.map((s, i) => { const toks = new Set(packTokens(s)); return {s, i, n:[...want].filter(w => toks.has(w)).length}; })
    .filter(x => x.n >= Math.max(1, need)).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 2).sort((a, b) => a.i - b.i);
  return best.length ? best.map(x => x.s).join(" ") : want.size ? "" : sents[0];
}
// The answer card for a pack hit: the sentences that answer, its article link, and the pack's build date.
// A relation question tries each matching entry until one carries the relation sentence ("Apple" the fruit has no founder,
// "Apple Inc." does). No entry does: null, and the caller says it is not in the pack.
function packAnswer(query, pack){
  const rel = relationOf(query, [...RELATIONS, ...PACK_ONLY_RELATIONS]);
  for(const hit of packHits(rel ? rel.subject : query, pack)){
    const e = hit.entry, text = packText(e, query, rel);
    if(text) return {kind:"pack", title:e.t, text, url:e.u, asOf:pack.builtAt||"", src:"Offline pack · Wikipedia (CC BY-SA)"};
  }
  return null;
}

// Physical constants answer from a table, offline: the models gave "the gravitational constant" as a definition
// with no number. Exact SI values (2019 redefinition) plus G and standard gravity, from NIST's CODATA list.
const CONSTANTS = [
  [/^(?:newton'?s )?(?:universal )?(?:gravitational constant|constant of gravitation|big g)$/, "Gravitational constant", "6.67430 × 10⁻¹¹ m³⋅kg⁻¹⋅s⁻²"],
  [/^speed of light(?: in (?:a )?vacuum)?$/, "Speed of light", "299,792,458 m/s"],
  [/^planck'?s? constant$/, "Planck constant", "6.62607015 × 10⁻³⁴ J⋅s"],
  [/^avogadro'?s? (?:number|constant)$/, "Avogadro constant", "6.02214076 × 10²³ per mole"],
  [/^boltzmann'?s? constant$/, "Boltzmann constant", "1.380649 × 10⁻²³ J/K"],
  [/^(?:elementary charge|charge (?:of|on) an? (?:electron|proton))$/, "Elementary charge", "1.602176634 × 10⁻¹⁹ C"],
  [/^(?:ideal |universal |molar )?gas constant$/, "Gas constant", "8.314462618 J/(mol⋅K)"],
  [/^(?:standard gravity|acceleration (?:due to|of) gravity(?: on earth)?|gravitational acceleration(?: on earth)?)$/, "Standard gravity", "9.80665 m/s²"],
];
// --- Pre-Calculus, offline ---
// The BC Pre-Calculus 12 shapes a calculator cannot read on its own: log bases, exponential equations,
// geometric sequences, degrees and radians, half-life, quadratics, remainders, asymptotes, exact trig
// values, trig equations, amplitude and period, inverses and transformations. Every answer is computed,
// never looked up, and it needs no network. Null for anything else. Graded by test/exam-pc12.js.
const pcNum = v => String(+(+v).toPrecision(10));
// A number as a small fraction when it is one ("1/2", "-3"), else its decimal.
function pcFrac(v){
  for(let d = 1; d <= 12; d++){ const n = Math.round(v * d); if(Math.abs(n / d - v) < 1e-9) return d === 1 ? String(n) : n + "/" + d; }
  return pcNum(v);
}
// A multiple of pi as "5π/6", "π", "2π", or null when it is not a twelfth of pi.
function pcPi(v){
  const f = pcFrac(v / Math.PI); if(!/^-?\d+(\/\d+)?$/.test(f)) return null;
  const [n, d] = f.split("/"); const k = n === "1" ? "" : n === "-1" ? "-" : n;
  return n === "0" ? "0" : k + "π" + (d ? "/" + d : "");
}
// The exact form of a trig value at a standard angle ("-√3/2"), or null.
function pcExact(v){
  const table = [[0,"0"],[0.5,"1/2"],[Math.SQRT2/2,"√2/2"],[Math.sqrt(3)/2,"√3/2"],[1,"1"],[Math.sqrt(3)/3,"√3/3"],[Math.sqrt(3),"√3"],[2,"2"],[2/Math.sqrt(3),"2√3/3"],[Math.SQRT2,"√2"],[(Math.sqrt(6)-Math.SQRT2)/4,"(√6 - √2)/4"],[(Math.sqrt(6)+Math.SQRT2)/4,"(√6 + √2)/4"],[2-Math.sqrt(3),"2 - √3"],[2+Math.sqrt(3),"2 + √3"]];
  const hit = table.find(([x]) => Math.abs(Math.abs(v) - x) < 1e-9);
  return hit ? (v < 0 && hit[1] !== "0" ? "-" : "") + hit[1] : null;
}
// A typed number or expression: "5pi/6", "π/3", "0.5", "1/2".
function pcVal(s){
  const t = String(s).trim().replace(/π/g, "pi").replace(/(\d)\s*(?=pi\b)/g, "$1*").replace(/^pi$/, "1*pi");
  const n = Number(t); return Number.isFinite(n) && t !== "" ? n : tryMath(t);
}
// An expression in x at one value of x, with "2x" and "3(x+1)" read as products.
function pcAt(expr, x){
  const s = expr.replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/x/g, "(" + x + ")").replace(/(?<=[\d)])(?=\()/g, "*");
  // "0+" keeps a bare value ("x" at 5) a calculation, which tryMath requires.
  return tryMath("0+(" + s + ")");
}
// A polynomial of degree two or less as [a, b, c], read by evaluating it; null when it is not one.
function pcQuad(expr){
  if(!/x/.test(expr) || /x\s*\^\s*(?:[3-9]|\d{2})/.test(expr)) return null;
  const p = [0, 1, -1, 2, 3].map(x => pcAt(expr, x)); if(p.some(v => v === null)) return null;
  const c = p[0], a = (p[1] + p[2]) / 2 - c, b = (p[1] - p[2]) / 2;
  return [2, 3].every((x, i) => Math.abs(a*x*x + b*x + c - p[i + 3]) < 1e-9) ? [a, b, c] : null;
}
function pcRoots([a, b, c]){
  if(Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const d = b*b - 4*a*c; if(d < -1e-12) return [];
  const s = Math.sqrt(Math.max(d, 0)); return [...new Set([(-b - s) / (2*a), (-b + s) / (2*a)].map(v => +v.toPrecision(12)))];
}
// The real roots of a polynomial: the quadratic formula up to degree two, rational candidates p/q above it.
function pcPolyRoots(expr){
  const co = pcQuad(expr); if(co) return pcRoots(co);
  if(pcAt(expr, 0.5) === null) return null;
  const found = new Set();
  for(let d = 1; d <= 6; d++) for(let n = -60 * d; n <= 60 * d; n++){ const x = n / d, v = pcAt(expr, x); if(v !== null && Math.abs(v) < 1e-9) found.add(+x.toPrecision(12)); }
  return [...found].sort((a, b) => a - b);
}
// The highest power of x typed, the polynomial's degree as written.
const pcDegree = expr => Math.max(/x/.test(expr) ? 1 : 0, ...[...expr.matchAll(/x\s*\^\s*(\d+)/g)].map(m => +m[1]));
// A polynomial's degree read from how fast it grows, so "(x - 1)(x + 2)(x - 3)" counts as 3.
function pcDeg(expr){
  const a = pcAt(expr, 1e4), b = pcAt(expr, 2e4); if(a === null || b === null || a === 0) return null;
  const d = Math.log2(Math.abs(b / a)); return Math.abs(d - Math.round(d)) < 0.01 && d > -0.01 && d < 8.5 ? Math.round(d) : null;
}
// A polynomial's coefficients, highest power first, solved from its values at 0..n. Null when it is not one.
function pcCoeffs(expr){
  const n = pcDeg(expr); if(n === null) return null;
  const A = [], ys = [];
  for(let i = 0; i <= n; i++){ const y = pcAt(expr, i); if(y === null) return null; A.push([...Array(n + 1)].map((_, j) => i ** (n - j))); ys.push(y); }
  for(let c = 0; c <= n; c++){
    const p = A.findIndex((r, i) => i >= c && Math.abs(r[c]) > 1e-12); if(p < 0) return null;
    [A[c], A[p]] = [A[p], A[c]]; [ys[c], ys[p]] = [ys[p], ys[c]];
    for(let r = 0; r <= n; r++) if(r !== c){ const f = A[r][c] / A[c][c]; for(let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; ys[r] -= f * ys[c]; }
  }
  const co = ys.map((y, i) => +(y / A[i][i]).toFixed(9));
  const check = pcAt(expr, n + 1.5); if(check === null || Math.abs(co.reduce((s, c) => s * (n + 1.5) + c, 0) - check) > 1e-6 * Math.max(1, Math.abs(check))) return null;
  return co;
}
// Coefficients back to text: [1, 0, -1] is "x^2 - 1".
function pcPoly(co){
  const n = co.length - 1, parts = [];
  co.forEach((c, i) => {
    if(Math.abs(c) < 1e-12) return;
    const p = n - i, mag = Math.abs(c), num = pcFrac(mag), body = p === 0 ? num : (mag === 1 ? "" : num) + "x" + (p > 1 ? "^" + p : "");
    parts.push(parts.length ? (c < 0 ? "- " : "+ ") + body : (c < 0 ? "-" : "") + body);
  });
  return parts.join(" ") || "0";
}
// Long division of coefficient lists: [quotient, remainder].
function pcDivide(num, den){
  const q = [], r = [...num];
  while(r.length >= den.length){ const f = r[0] / den[0]; q.push(f); den.forEach((d, i) => { r[i] -= f * d; }); r.shift(); }
  return [q.length ? q : [0], r.length ? r : [0]];
}
// The roots of any expression in x that are small fractions p/q, found by trying them. Exact zeros only.
function pcScanRoots(expr){
  const found = new Set();
  for(let d = 1; d <= 6; d++) for(let n = -60 * d; n <= 60 * d; n++){ const x = n / d, v = pcAt(expr, x); if(v !== null && Math.abs(v) < 1e-9) found.add(+x.toPrecision(12)); }
  return [...found].sort((a, b) => a - b);
}
// "(x + 3) - 2" from shifts: the transformed function written out.
const pcShift = (h, k) => "f(x" + (h ? (h > 0 ? " - " + pcNum(h) : " + " + pcNum(-h)) : "") + ")" + (k ? (k > 0 ? " + " + pcNum(k) : " - " + pcNum(-k)) : "");
const pcSign = r => r < 0 ? "+ " + pcFrac(-r) : "- " + pcFrac(r);
const PC_FACTS = [
  [/^(?:what is )?(?:the )?reciprocal of sine$/, "Cosecant: csc x = 1/sin x."],
  [/^(?:what is )?(?:the )?reciprocal of cosine$/, "Secant: sec x = 1/cos x."],
  [/^(?:what is )?(?:the )?reciprocal of tangent$/, "Cotangent: cot x = 1/tan x."],
  [/^sin\s*\^?\s*2\s*\(?x\)?\s*\+\s*cos\s*\^?\s*2\s*\(?x\)?$/, "1 (the Pythagorean identity)."],
  [/^(?:what is )?(?:the )?change of base (?:formula|rule)(?: for logarithms| for logs)?$/, "logᵦ(x) = log(x)/log(b), using any base for the logs on the right."],
  [/^(?:what are )?(?:the )?(?:laws|rules) of (?:logarithms|logs)$/, "log(ab) = log(a) + log(b), log(a/b) = log(a) - log(b), log(aⁿ) = n·log(a)."],
  [/^(?:what is )?(?:a )?polynomial of degree (?:3|three) called$/, "A cubic."],
  [/^(?:what is )?(?:a )?polynomial of degree (?:4|four) called$/, "A quartic."],
  [/^(?:what is )?(?:a )?polynomial of degree (?:5|five) called$/, "A quintic."],
  [/^(?:what is )?(?:a )?polynomial of degree (?:2|two) called$/, "A quadratic."],
  [/^simplify sin\s*\(?x\)?\s*\/\s*cos\s*\(?x\)?$/, "tan x."],
  [/^simplify cos\s*\(?x\)?\s*\/\s*sin\s*\(?x\)?$/, "cot x."],
  [/^simplify 1\s*\/\s*cos\s*\(?x\)?$/, "sec x."],
  [/^simplify 1\s*\/\s*sin\s*\(?x\)?$/, "csc x."],
  [/^simplify 1\s*-\s*sin\s*\^?\s*2\s*\(?x\)?$/, "cos²x."],
  [/^simplify 1\s*-\s*cos\s*\^?\s*2\s*\(?x\)?$/, "sin²x."],
  [/^simplify 1\s*\+\s*tan\s*\^?\s*2\s*\(?x\)?$/, "sec²x."],
  [/^(?:the )?(?:cos\s*\(?a\s*\+\s*b\)?|cosine sum)\s*(?:identity|formula)?$|^(?:the )?(?:sum|addition) (?:identity|formula) for cos(?:ine)?$/, "cos(a + b) = cos a cos b - sin a sin b."],
  [/^(?:the )?(?:cos\s*\(?a\s*-\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?difference (?:identity|formula) for cos(?:ine)?$/, "cos(a - b) = cos a cos b + sin a sin b."],
  [/^(?:the )?(?:sin\s*\(?a\s*\+\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?(?:sum|addition) (?:identity|formula) for sin(?:e)?$/, "sin(a + b) = sin a cos b + cos a sin b."],
  [/^(?:the )?(?:sin\s*\(?a\s*-\s*b\)?)\s*(?:identity|formula)?$|^(?:the )?difference (?:identity|formula) for sin(?:e)?$/, "sin(a - b) = sin a cos b - cos a sin b."],
  [/^(?:the )?double[- ]angle (?:identity|formula) for sin(?:e)?$|^sin\s*\(?2x\)?\s*(?:identity|formula)$/, "sin 2x = 2 sin x cos x."],
  [/^(?:the )?double[- ]angle (?:identity|formula|identities|formulas) for cos(?:ine)?$|^cos\s*\(?2x\)?\s*(?:identity|formula)$/, "cos 2x = cos²x - sin²x = 2cos²x - 1 = 1 - 2sin²x."],
  [/^(?:the )?double[- ]angle (?:identity|formula) for tan(?:gent)?$|^tan\s*\(?2x\)?\s*(?:identity|formula)$/, "tan 2x = 2 tan x/(1 - tan²x)."],
  [/^(?:what is )?(?:the (?:number|constant) )?e$|^(?:what is )?euler'?s number$/, "e ≈ 2.718281828, the base of the natural logarithm."],
  [/^(?:what is )?(?:the )?remainder theorem$/, "When a polynomial P(x) is divided by x - a, the remainder is P(a)."],
  [/^(?:what is )?(?:the )?factor theorem$/, "x - a is a factor of P(x) exactly when P(a) = 0."],
  [/^(?:what is )?(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(?:log|ln)(?:_?\d+)?\s*\(?x\)?$/, "x > 0. A logarithm is defined only for positive numbers."],
  [/^(?:what is )?(?:the )?range of (?:y\s*=\s*|f\(x\)\s*=\s*)?(?:log|ln)(?:_?\d+)?\s*\(?x\)?$/, "All real numbers."],
  [/^(?:what is )?(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?\d+\s*\^\s*x$/, "All real numbers."],
  [/^(?:what is )?(?:the )?range of (?:y\s*=\s*|f\(x\)\s*=\s*)?\d+\s*\^\s*x$/, "y > 0."],
  [/^(?:what is )?(?:the )?formula for the sum of (?:a |the first n terms of a )?geometric (?:series|sequence)$/, "Sₙ = a(1 - rⁿ)/(1 - r), for r ≠ 1."],
  [/^(?:what is )?(?:the )?formula for (?:the )?(?:sum of )?(?:an |the )?infinite geometric series$/, "S = a/(1 - r), when |r| < 1."],
];
// --- Pre-Calculus 11, offline ---
// Radicals, absolute value, quadratics in vertex form, inequalities, systems, rational expressions, the sine and
// cosine laws and simple interest. precalc() asks it first; null means "not mine". Graded by
// COURSE=pc11 node test/exam-course.js. Mirrored in kmp/shared/.../Precalc11.kt.
// √n as [k, m] with k√m and m square-free: √50 is [5, 2].
function pcRad(n){ let k = 1, m = n; for(let f = 2; f * f <= m; f++) while(m % (f * f) === 0){ m /= f * f; k *= f; } return [k, m]; }
const pcRadText = (k, m) => m === 1 ? String(k) : (k === 1 ? "" : k) + "√" + m;
const pcGcd = (a, b) => b ? pcGcd(b, a % b) : Math.abs(a);
// The real zeros of an expression in x: exact for a quadratic, small fractions otherwise.
const pcZeros = e => { const co = pcQuad(e); return co ? pcRoots(co).sort((a, b) => a - b) : pcScanRoots(e); };
// a(x - h)² + k, written the way a textbook does.
const pcVertexForm = (a, h, k) => (a === 1 ? "" : a === -1 ? "-" : pcFrac(a)) + (h === 0 ? "x²" : "(x " + (h < 0 ? "+ " + pcFrac(-h) : "- " + pcFrac(h)) + ")²") + (k === 0 ? "" : k < 0 ? " - " + pcFrac(-k) : " + " + pcFrac(k));
function pc11(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"});
  let m;
  if(/^(?:the )?quadratic formula$/.test(q)) return out("x = (-b ± √(b² - 4ac))/2a, the roots of ax² + bx + c = 0.");
  if(/^(?:the )?(?:law|rule) of sines?$|^(?:the )?sine law$/.test(q)) return out("a/sin A = b/sin B = c/sin C: each side over the sine of the angle across from it.");
  if(/^(?:the )?(?:law|rule) of cosines?$|^(?:the )?cosine law$/.test(q)) return out("c² = a² + b² - 2ab cos C, where C is the angle between sides a and b.");
  // Radicals: √50, √12 + √27, 3√2 · 4√6, 1/√2
  const T = "(\\d*)\\s*(?:√|sqrt)\\s*\\(?\\s*(\\d+)\\s*\\)?", r = q.replace(/^(?:simplify|rationalize|evaluate)\s+/, "");
  const rad = (c, n) => { const [k, s] = pcRad(+n); return [(c === "" ? 1 : +c) * k, s]; };
  const approx = (k, s) => pcRadText(k, s) + (s === 1 ? "" : " ≈ " + pcNum(k * Math.sqrt(s)));
  if((m = new RegExp("^" + T + "$").exec(r))) return out(approx(...rad(m[1], m[2])));
  if((m = new RegExp("^" + T + "\\s*([+-])\\s*" + T + "$").exec(r))){
    const [k1, s1] = rad(m[1], m[2]), [k2, s2] = rad(m[4], m[5]), sg = m[3] === "-" ? -1 : 1;
    if(s1 === s2){ const k = k1 + sg * k2; return out(k === 0 ? "0" : approx(k, s1)); }
    return out(pcRadText(k1, s1) + (sg < 0 ? " - " : " + ") + pcRadText(k2, s2) + " ≈ " + pcNum(k1 * Math.sqrt(s1) + sg * k2 * Math.sqrt(s2)));
  }
  if((m = new RegExp("^" + T + "\\s*[*×·]\\s*" + T + "$").exec(r))){
    const c = (m[1] === "" ? 1 : +m[1]) * (m[3] === "" ? 1 : +m[3]), [k, s] = pcRad(+m[2] * +m[4]); return out(approx(c * k, s));
  }
  if((m = new RegExp("^(\\d+)\\s*\\/\\s*" + T + "$").exec(r))){
    const [k, s] = rad(m[2], m[3]), top = +m[1], g = pcGcd(top, k * s), n = top / g, d = k * s / g;
    return out(s === 1 ? pcFrac(top / k) : (n === 1 ? "" : n) + "√" + s + (d === 1 ? "" : "/" + d) + " ≈ " + pcNum(top / (k * Math.sqrt(s))));
  }
  // |-7| + |3|, then solve |2x + 1| = 7
  if(/\|/.test(q) && !/x/.test(q)){ const v = tryMath(r.replace(/\|([^|]+)\|/g, "abs($1)")); if(v !== null) return {kind:"math", value:v}; }
  if((m = /^solve\s+\|\s*([^|]*x[^|]*)\|\s*=\s*(-?[\d.]+)$/.exec(q))){
    const c = +m[2]; if(c < 0) return out("No solution: an absolute value is never negative.");
    const xs = [...new Set([...pcScanRoots("(" + m[1] + ")-(" + c + ")"), ...pcScanRoots("(" + m[1] + ")+(" + c + ")")])].sort((a, b) => a - b);
    return xs.length ? out(xs.map(x => "x = " + pcFrac(x)).join(" or ")) : null;
  }
  // vertex, axis of symmetry, maximum or minimum, discriminant, vertex form, number of real roots
  const F = "(?:y\\s*=\\s*|f\\(x\\)\\s*=\\s*)?(.+?)(?:\\s*=\\s*0)?";
  if((m = new RegExp("^(vertex form|vertex|axis of symmetry|maximum value|minimum value|maximum|minimum|discriminant) of " + F + "$").exec(q)) || ((m = new RegExp("^complete the square (?:for|of|on) " + F + "$").exec(q)) && (m = [m[0], "vertex form", m[1]])) || ((m = new RegExp("^how many (?:real )?(?:roots|solutions|zeros|x-intercepts) (?:does|do|has) " + F + " have$").exec(q)) && (m = [m[0], "count", m[1]]))){
    const co = pcQuad(m[2].replace(/x²/g, "x^2")); if(!co || Math.abs(co[0]) < 1e-12) return null;
    const [a, b, c] = co, h = +(-b / (2 * a)).toPrecision(12), k = +(c - b * b / (4 * a)).toPrecision(12), d = +(b * b - 4 * a * c).toPrecision(12), f = m[1];
    if(f === "vertex") return out("(" + pcFrac(h) + ", " + pcFrac(k) + ")");
    if(f === "axis of symmetry") return out("x = " + pcFrac(h));
    if(f === "discriminant") return out("b² - 4ac = " + pcNum(d) + (d > 0 ? ", so two real roots." : d === 0 ? ", so one real root." : ", so no real roots."));
    if(f === "count") return out(d > 0 ? "2 real roots (the discriminant is " + pcNum(d) + ")." : d === 0 ? "1, a double root (the discriminant is 0)." : "None. The discriminant is " + pcNum(d) + ", so it has no real roots.");
    if(/^max/.test(f)) return out(a < 0 ? pcFrac(k) + ", at x = " + pcFrac(h) + "." : "None: it opens upward. Its minimum is " + pcFrac(k) + ".");
    if(/^min/.test(f)) return out(a > 0 ? pcFrac(k) + ", at x = " + pcFrac(h) + "." : "None: it opens downward. Its maximum is " + pcFrac(k) + ".");
    return out("y = " + pcVertexForm(a, h, k));
  }
  // linear and quadratic inequalities
  if((m = /^solve\s+([^<>≤≥=]*x[^<>≤≥=]*?)\s*(<=|>=|=<|=>|≤|≥|<|>)\s*([^<>≤≥=]+)$/.exec(q))){
    const op = {"<=":"≤", "=<":"≤", ">=":"≥", "=>":"≥"}[m[2]] || m[2], co = pcQuad(("(" + m[1] + ")-(" + m[3] + ")").replace(/x²/g, "x^2")); if(!co) return null;
    const [a, b, c] = co, strict = op === "<" || op === ">", want = op === "<" || op === "≤" ? -1 : 1, le = strict ? "<" : "≤", ge = strict ? ">" : "≥";
    if(Math.abs(a) < 1e-12){
      if(Math.abs(b) < 1e-12) return null;
      return out("x " + ((want > 0) === (b > 0) ? ge : le) + " " + pcFrac(+(-c / b).toPrecision(12)));
    }
    // s > 0: the answer lies outside the roots, where the parabola has the sign of a.
    const rs = pcRoots(co).sort((p, t) => p - t), s = Math.sign(a) * want;
    if(rs.length < 2){
      if(s > 0) return out(rs.length && strict ? "x ≠ " + pcFrac(rs[0]) : "All real numbers.");
      return out(rs.length && !strict ? "x = " + pcFrac(rs[0]) : "No solution.");
    }
    const [r1, r2] = rs.map(pcFrac);
    return out(s > 0 ? "x " + le + " " + r1 + " or x " + ge + " " + r2 : r1 + " " + le + " x " + le + " " + r2);
  }
  // systems: y = x^2 and y = x + 2, or x + y = 10 and x - y = 4
  if((m = /^solve\s+(?:the system\s+)?([^=]+=[^=]+?)\s*(?:\band\b|,|;)\s*([^=]+=[^=]+)$/.exec(q)) && /x/.test(q)){
    const ys = [m[1], m[2]].map(e => (/^y\s*=\s*(.+)$/.exec(e.trim()) || [])[1]);
    if(ys[0] && ys[1] && !/y/.test(ys[0] + ys[1])){
      const xs = pcZeros("(" + ys[0] + ")-(" + ys[1] + ")");
      const pts = xs.map(x => [x, pcAt(ys[0], x)]); if(pts.some(([, y]) => y === null)) return null;
      return out(pts.length ? pts.map(([x, y]) => "(" + pcFrac(x) + ", " + pcFrac(+y.toPrecision(12)) + ")").join(" and ") : "No solution: the graphs never meet.");
    }
    // Each equation as Ax + By = C, read by evaluating it at three points and checked at a fourth.
    const line = e => {
      const [lhs, rhs] = e.split("="), f = (x, y) => pcAt(("(" + lhs + ")-(" + rhs + ")").replace(/y/g, "(" + y + ")"), x);
      const c = f(0, 0), a = f(1, 0), b = f(0, 1), t = f(1, 1);
      return [c, a, b, t].some(v => v === null) || Math.abs(t - (a + b - c)) > 1e-9 ? null : [a - c, b - c, -c];
    };
    const p = line(m[1]), u = line(m[2]); if(!p || !u) return null;
    const det = p[0] * u[1] - p[1] * u[0]; if(Math.abs(det) < 1e-12) return out("No single solution: the lines are parallel or the same line.");
    return out("x = " + pcFrac(+((p[2] * u[1] - p[1] * u[2]) / det).toPrecision(12)) + ", y = " + pcFrac(+((p[0] * u[2] - p[2] * u[0]) / det).toPrecision(12)));
  }
  // rational expressions: add over x, cancel common factors, name the values x cannot take
  if((m = /^simplify\s+((?:\s*[+-]?\s*\d+\s*\/\s*\(?\s*\d*\s*x\s*\)?\s*)+)$/.exec(q))){
    let s = 0; for(const [, sg, a, b] of m[1].matchAll(/([+-]?)\s*(\d+)\s*\/\s*\(?\s*(\d*)\s*x\s*\)?/g)) s += (sg === "-" ? -1 : 1) * +a / (b === "" ? 1 : +b);
    const f = pcFrac(+s.toPrecision(12)).split("/"); return out(s === 0 ? "0" : f[0] + "/" + (f[1] ? "(" + f[1] + "x)" : "x") + ", x ≠ 0");
  }
  if((m = /^simplify\s+\(?([^()]*x[^()]*)\)?\s*\/\s*\(([^()]*x[^()]*)\)$/.exec(q)) || (m = /^simplify\s+\(?([^()]*x[^()]*)\)?\s*\/\s*([^()\/]*x[^()\/]*)$/.exec(q))){
    let top = pcCoeffs(m[1]), bot = pcCoeffs(m[2]); if(!top || !bot) return null;
    const bad = pcZeros(m[2]);
    for(const z of bad) while(top.length > 1 && bot.length > 1){
      const [qt, rt] = pcDivide(top, [1, -z]), [qb, rb] = pcDivide(bot, [1, -z]); if(Math.abs(rt[0]) > 1e-9 || Math.abs(rb[0]) > 1e-9) break; top = qt; bot = qb;
    }
    const poly = co => pcPoly(co.map(c => +c.toFixed(9))), wrap = s => /\s[+-]\s/.test(s) ? "(" + s + ")" : s;
    const body = bot.length === 1 ? (Math.abs(bot[0] - 1) < 1e-12 ? poly(top) : wrap(poly(top)) + "/" + pcFrac(bot[0])) : wrap(poly(top)) + "/" + wrap(poly(bot));
    return out(body + (bad.length ? ", x ≠ " + bad.map(pcFrac).join(", ") : ""));
  }
  if((m = /^(?:the )?(?:non-?permissible values|restrictions?|excluded values)(?: on| of| for)?\s+(.+)$/.exec(q))){
    const d = /\/\s*\(([^()]+)\)\s*$/.exec(m[1]) || /\/\s*([^()\/]+)$/.exec(m[1]); if(!d) return null;
    const xs = pcZeros(d[1]); return out(xs.length ? xs.map(x => "x ≠ " + pcFrac(x)).join(", ") : "None: the denominator is never zero.");
  }
  // triangles: the cosine law for a side or an angle, the sine law (with its ambiguous case), the third angle
  if((m = /angle opposite (?:the )?(?:side )?(?:of (?:length )?)?([\d.]+)\b.*?\bsides? (?:of )?([\d.]+)\s*,\s*([\d.]+)\s*,?\s*and\s*([\d.]+)/.exec(q))){
    const s = +m[1], all = [+m[2], +m[3], +m[4]], i = all.indexOf(s); if(i < 0) return null; all.splice(i, 1);
    const [p, t] = all, c = (p * p + t * t - s * s) / (2 * p * t);
    return out(Math.abs(c) > 1 ? "No triangle has those sides." : pcNum(+(Math.acos(c) * 180 / Math.PI).toFixed(2)) + "°");
  }
  if(/\btriangle\b|\bangle [abc]\b/.test(q) && /\b[abc]\s*=\s*[\d.]+/.test(q)){
    const ang = {}, side = {}, deg = Math.PI / 180, L = "abc".split("");
    const rest = q.replace(/\bangle\s*([abc])\s*=\s*([\d.]+)\s*(?:°|degrees?|deg)?/g, (_, k, v) => { ang[k] = +v; return " "; });
    for(const [, k, v] of rest.matchAll(/\b([abc])\s*=\s*([\d.]+)/g)) side[k] = +v;
    const want = (/\b(?:find|what is)\s+(?:side\s+)?([abc])$/.exec(rest.trim()) || [])[1], wantAng = (/\bangle\s*([abc])\b(?!\s*=)/.exec(q) || [])[1];
    if(Object.keys(ang).length === 2) ang[L.find(k => !(k in ang))] = 180 - Object.values(ang).reduce((s, v) => s + v, 0);
    const pair = L.find(k => k in side && k in ang);
    if(want && !(want in side) && want in ang){
      const [p, t] = L.filter(k => k !== want);
      if(p in side && t in side) return out(want + " ≈ " + pcNum(+Math.sqrt(side[p] ** 2 + side[t] ** 2 - 2 * side[p] * side[t] * Math.cos(ang[want] * deg)).toFixed(3)));
      if(pair) return out(want + " ≈ " + pcNum(+(side[pair] * Math.sin(ang[want] * deg) / Math.sin(ang[pair] * deg)).toFixed(3)));
    }
    if(wantAng){
      const A = wantAng.toUpperCase();
      if(wantAng in ang) return out(A + " = " + pcNum(ang[wantAng]) + "°");
      if(L.every(k => k in side)){
        const [p, t] = L.filter(k => k !== wantAng), c = (side[p] ** 2 + side[t] ** 2 - side[wantAng] ** 2) / (2 * side[p] * side[t]);
        return out(Math.abs(c) > 1 ? "No triangle has those sides." : A + " ≈ " + pcNum(+(Math.acos(c) / deg).toFixed(2)) + "°");
      }
      if(pair && wantAng in side){
        const s = side[wantAng] * Math.sin(ang[pair] * deg) / side[pair]; if(s > 1) return out("No triangle: that side is too short to reach.");
        const a1 = Math.asin(s) / deg, a2 = 180 - a1;
        return out(A + " ≈ " + pcNum(+a1.toFixed(2)) + "°" + (a2 + ang[pair] < 180 && Math.abs(a2 - a1) > 1e-9 ? " (or " + pcNum(+a2.toFixed(2)) + "°, the ambiguous case)" : ""));
      }
    }
  }
  // the angle in a quadrant with a given sine, cosine or tangent
  if((m = /\b(sin|cos|tan)\s*\(?\s*(?:theta|θ|x|a|t)\s*\)?\s*=\s*(-?√\d\s*\/\s*\d|-?[\d./]+)\b.*?\bquadrant\s+(iv|i{1,3}|[1-4])\b/.exec(q))){
    const v = pcVal(m[2].replace(/√(\d)/, "sqrt($1)")); if(v === null) return null;
    const ref = {sin:Math.asin, cos:Math.acos, tan:Math.atan}[m[1]](Math.abs(v)) * 180 / Math.PI, n = {i:1, ii:2, iii:3, iv:4}[m[3]] || +m[3];
    if(!isFinite(ref)) return out("No angle: sine and cosine stay between -1 and 1.");
    return out(pcNum(+[ref, 180 - ref, 180 + ref, 360 - ref][n - 1].toFixed(2)) + "°");
  }
  // simple interest, I = Prt
  if((m = /simple interest\b.*?\$?\s*([\d,]+(?:\.\d+)?)\D*?([\d.]+)\s*%.*?([\d.]+)\s*(years?|months?)/.exec(q))){
    const p = +m[1].replace(/,/g, ""), i = p * +m[2] / 100 * +m[3] / (/^m/.test(m[4]) ? 12 : 1);
    return out("$" + i.toFixed(2) + " in interest, for $" + (p + i).toFixed(2) + " in all (I = Prt).");
  }
  return null;
}
// --- Foundations of Mathematics and Pre-Calculus 10, offline ---
// Primes, factors and multiples, exponent laws, expanding and common factors, area and volume, right-triangle
// trigonometry, lines, and pay. precalc() asks it after pc11(); null means "not mine". Graded by
// COURSE=fmpc10 node test/exam-course.js. Mirrored in kmp/shared/.../Precalc10.kt.
const SUP = n => String(n).replace(/[-0-9]/g, c => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
const pcPow = (v, n) => n === 0 ? "" : v + (n === 1 ? "" : SUP(n));
// ax + by = c, read by evaluating both sides at three points and checked at a fourth; null when not a line.
function pcLine(e){
  const [lhs, rhs] = e.split("="); if(rhs === undefined) return null;
  const f = (x, y) => pcAt(("(" + lhs + ")-(" + rhs + ")").replace(/y/g, "(" + y + ")"), x);
  const c = f(0, 0), a = f(1, 0), b = f(0, 1), t = f(1, 1);
  return [c, a, b, t].some(v => v === null) || Math.abs(t - (a + b - c)) > 1e-9 ? null : [a - c, b - c, -c];
}
const pcLineOf = s => pcLine(/=/.test(s) ? s : "y = " + s);
function fm10(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"}), money = v => "$" + v.toFixed(2);
  const nums = s => (s.match(/\d+/g) || []).map(Number);
  let m;
  // primes, factors and multiples
  if((m = /^(?:the )?prime factori[sz]ation of (\d+)$/.exec(q)) && +m[1] > 1 && +m[1] < 1e12){
    let n = +m[1]; const parts = [];
    for(let p = 2; p * p <= n; p++){ let k = 0; while(n % p === 0){ n /= p; k++; } if(k) parts.push(pcPow(p, k)); }
    if(n > 1) parts.push(String(n));
    return out(parts.join(" × ") + (parts.length === 1 && !/[⁰-⁹]/.test(parts[0]) ? ", a prime" : ""));
  }
  if((m = /^(?:the )?(greatest common (?:factor|divisor)|gcf|gcd|highest common factor|hcf|least common multiple|lcm|lowest common multiple) of ([\d,\s]+(?:and\s+\d+)?)$/.exec(q))){
    const n = nums(m[2]); if(n.length < 2) return null;
    const lcm = (a, b) => a / pcGcd(a, b) * b;
    return out(String(/^(g|h)/.test(m[1]) ? n.reduce(pcGcd) : n.reduce(lcm)));
  }
  if((m = /^is (\d+) a perfect (square|cube)$/.exec(q))){
    const n = +m[1], k = m[2] === "square" ? 2 : 3, r = Math.round(n ** (1 / k)), mark = k === 2 ? "√" : "∛";
    return out(r ** k === n ? "Yes. " + r + SUP(k) + " = " + n + "." : "No. " + mark + n + " ≈ " + pcNum(n ** (1 / k)) + ", not a whole number.");
  }
  if((m = /^(?:write|express|rewrite)\s+(\d+)\s*\^\s*\(?\s*-\s*(\d+)\s*\)?\s+(?:as a fraction|with a positive exponent)$/.exec(q))) return out("1/" + (+m[1]) ** +m[2]);
  // exponent laws on one variable: x^3 * x^5, (2x^3)^2, x^7 / x^3
  if((m = /^simplify\s+([\d\s()^*\/·×.a-z-]+)$/.exec(q)) && (m[1].match(/[a-z]/g) || []).every((v, i, a) => v === a[0]) && /[a-z]/.test(m[1]) && !/[+]|\s-\s/.test(m[1])){
    const v = m[1].match(/[a-z]/)[0], e = m[1].replace(/[·×]/g, "*").replace(new RegExp(v, "g"), "x").replace(/(?<=[\dx)])\s*(?=x)/g, "*");
    const c = pcAt(e, 1), t = pcAt(e, 2), u = pcAt(e, 3); if(c === null || t === null || u === null || c === 0) return null;
    const n = Math.round(Math.log2(t / c)); if(Math.abs(c * 3 ** n - u) > 1e-9 * Math.max(1, Math.abs(u))) return null;
    const k = c === 1 ? "" : c === -1 ? "-" : pcFrac(c);
    return out(n === 0 ? pcFrac(c) : n > 0 ? k + pcPow(v, n) : (c < 0 ? "-" : "") + pcFrac(Math.abs(c)) + "/" + pcPow(v, -n));
  }
  // expand (x + 3)(x - 5), (2x - 1)^2
  if((m = /^(?:expand|multiply|simplify)\s+(.*\(.*x.*)$/.exec(q)) && !/\//.test(m[1])){
    const co = pcCoeffs(m[1].replace(/\)\s*\(/g, ")*(")); if(co) return out(pcPoly(co.map(c => +c.toFixed(9))));
  }
  // factor out the common factor first: 6x^2 + 9x is 3x(2x + 3), 2x^2 - 50 is 2(x - 5)(x + 5)
  if((m = /^factor\s+(?:completely\s+)?(?:y\s*=\s*)?(.+)$/.exec(q)) && /x/.test(m[1])){
    const co = pcCoeffs(m[1]);
    if(co && co.length > 1 && co.every(c => Number.isInteger(c))){
      let p = 0; while(p < co.length - 1 && co[co.length - 1 - p] === 0) p++;
      const rest = co.slice(0, co.length - p), g = rest.reduce(pcGcd) * Math.sign(rest[0]);
      if(Math.abs(g) > 1 || p > 0){
        const r = rest.map(c => c / g), lead = (g === 1 ? "" : g === -1 ? "-" : String(g)) + pcPow("x", p);
        if(r.length === 1) return out(lead || "1");
        const inner = r.length === 3 ? precalc("factor " + pcPoly(r)) : null;
        return out(lead + (inner && /^\(/.test(inner.body) ? inner.body : "(" + pcPoly(r) + ")"));
      }
    }
  }
  // area and volume
  const shape = (/\b(hemisphere|sphere|cylinder|cone|cube|rectangular prism|square pyramid|square-based pyramid|box)\b/.exec(q) || [])[1], what = (/\b(surface area|volume)\b/.exec(q) || [])[1];
  if(shape && what){
    const num = re => { const t = re.exec(q); return t ? +t[1] : null; };
    const d = num(/diameter (?:of |is |=\s*)?([\d.]+)/), r = num(/radius (?:of |is |=\s*)?([\d.]+)/) ?? (d === null ? null : d / 2), h = num(/height (?:of |is |=\s*)?([\d.]+)/);
    const s = num(/(?:side|edge)(?: length)? (?:of |is |=\s*)?([\d.]+)/) ?? num(/base (?:side )?(?:of |is |=\s*)?([\d.]+)/), box = /([\d.]+)\s*(?:by|x|×)\s*([\d.]+)\s*(?:by|x|×)\s*([\d.]+)/.exec(q);
    const vol = what === "volume", piAns = k => out((Number.isInteger(+k.toFixed(9)) || pcFrac(k).includes("/") ? pcFrac(+k.toFixed(9)) + "π ≈ " : "") + pcNum(+(k * Math.PI).toFixed(2)));
    if(shape === "sphere" && r !== null) return piAns(vol ? 4 / 3 * r ** 3 : 4 * r * r);
    if(shape === "hemisphere" && r !== null) return piAns(vol ? 2 / 3 * r ** 3 : 3 * r * r);
    if(shape === "cylinder" && r !== null && h !== null) return piAns(vol ? r * r * h : 2 * r * r + 2 * r * h);
    if(shape === "cone" && r !== null && h !== null) return vol ? piAns(r * r * h / 3) : out(pcNum(+(Math.PI * r * r + Math.PI * r * Math.hypot(r, h)).toFixed(2)));
    if(shape === "cube" && s !== null) return out(pcNum(vol ? s ** 3 : 6 * s * s));
    if(/pyramid/.test(shape) && s !== null && h !== null) return out(pcNum(+(vol ? s * s * h / 3 : s * s + 2 * s * Math.hypot(h, s / 2)).toFixed(2)));
    if(/prism|box/.test(shape) && box){ const [l, w, t] = box.slice(1, 4).map(Number); return out(pcNum(vol ? l * w * t : 2 * (l * w + l * t + w * t))); }
  }
  // right triangles: SOH CAH TOA, Pythagoras, ladders, elevation and depression
  if(/^soh ?cah ?toa$/.test(q)) return out("sin = opposite/hypotenuse, cos = adjacent/hypotenuse, tan = opposite/adjacent.");
  if((m = /^what (?:does|is) (sine|cosine|tangent)(?: mean)?(?: in a right triangle)?$/.exec(q))) return out({sine:"sin θ = opposite/hypotenuse.", cosine:"cos θ = adjacent/hypotenuse.", tangent:"tan θ = opposite/adjacent."}[m[1]]);
  if((m = /\bhypotenuse\b.*?\blegs? (?:of )?([\d.]+)\s*(?:and|,)\s*([\d.]+)/.exec(q))) return out(pcNum(+Math.hypot(+m[1], +m[2]).toFixed(4)));
  if((m = /\b(?:missing |other |third )?(?:leg|side)\b.*?\bhypotenuse (?:of |is )?([\d.]+)\s*(?:and|,)\s*(?:a |one )?(?:leg|side) (?:of |is )?([\d.]+)/.exec(q)) && +m[1] > +m[2]) return out(pcNum(+Math.sqrt(m[1] ** 2 - m[2] ** 2).toFixed(4)));
  if(/\bright triangle\b/.test(q) && /\bangle\b/.test(q)){
    const side = k => { const t = new RegExp("\\b" + k + "(?: side)? (?:is |of |=\\s*)?([\\d.]+)").exec(q); return t ? +t[1] : null; };
    const o = side("opposite"), a = side("adjacent"), h = side("hypotenuse"), deg = 180 / Math.PI;
    const t = o !== null && h !== null ? Math.asin(o / h) : a !== null && h !== null ? Math.acos(a / h) : o !== null && a !== null ? Math.atan(o / a) : NaN;
    if(isFinite(t)) return out(pcNum(+(t * deg).toFixed(2)) + "°");
  }
  if((m = /\bladder\s+([\d.]+)\s*[a-z]*\s*long\b.*?([\d.]+)\s*(?:degrees?|°)(?: angle)? with the (ground|floor|wall)/.exec(q))){
    const L = +m[1], t = +m[2] * Math.PI / 180, high = /\bhigh|height|up the wall\b/.test(q), up = m[3] === "wall" ? Math.cos(t) : Math.sin(t), across = m[3] === "wall" ? Math.sin(t) : Math.cos(t);
    return out(pcNum(+(L * (high ? up : across)).toFixed(2)) + " " + (/\b(\d+(?:\.\d+)?)\s*m\b/.test(q) ? "m" : "units"));
  }
  if(/\bangle of (elevation|depression)\b/.test(q) || /\b(rises|climbs)\b.*\bhorizontal\b/.test(q)){
    const n = (q.match(/\d+(?:\.\d+)?/g) || []).map(Number); if(n.length === 2) return out(pcNum(+(Math.atan(n[0] / n[1]) * 180 / Math.PI).toFixed(2)) + "°");
  }
  // lines: slope, equation, intercepts, parallel and perpendicular, midpoint, distance
  const pts = [...q.matchAll(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)].map(t => [+t[1], +t[2]]);
  if(pts.length === 2 && /^(?:the )?midpoint\b/.test(q)) return out("(" + pcFrac((pts[0][0] + pts[1][0]) / 2) + ", " + pcFrac((pts[0][1] + pts[1][1]) / 2) + ")");
  if(pts.length === 2 && /^(?:the )?(?:distance|length)\b/.test(q)){ const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]); return out(Number.isInteger(+d.toFixed(9)) ? pcNum(d) : "√" + pcFrac((pts[1][0] - pts[0][0]) ** 2 + (pts[1][1] - pts[0][1]) ** 2) + " ≈ " + pcNum(+d.toFixed(4))); }
  const yForm = (k, b) => "y = " + (k === 0 ? pcFrac(b) : (k === 1 ? "" : k === -1 ? "-" : pcFrac(k)) + "x" + (b === 0 ? "" : b > 0 ? " + " + pcFrac(b) : " - " + pcFrac(-b)));
  if(pts.length === 2 && /\bslope\b/.test(q) && !/\bequation\b/.test(q)){ const dx = pts[1][0] - pts[0][0]; return out(dx === 0 ? "Undefined: the line is vertical." : pcFrac((pts[1][1] - pts[0][1]) / dx)); }
  if(/\bequation of (?:the |a )?line\b/.test(q) && pts.length >= 1){
    const s = (/\bslope (?:of |is |=\s*)?(-?[\d./]+)/.exec(q) || [])[1], k = s !== undefined ? pcVal(s) : pts.length === 2 && pts[1][0] !== pts[0][0] ? (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) : null;
    if(k === null) return pts.length === 2 ? out("x = " + pcFrac(pts[0][0])) : null;
    return out(yForm(+k.toPrecision(12), +(pts[0][1] - k * pts[0][0]).toPrecision(12)));
  }
  if((m = /^(?:the )?slope of (?:a |the )?line (perpendicular|parallel) to (.+)$/.exec(q))){
    const L = pcLineOf(m[2]); if(!L || L[1] === 0) return null; const k = -L[0] / L[1];
    return out(m[1] === "parallel" ? pcFrac(k) : k === 0 ? "Undefined: the line is vertical." : pcFrac(-1 / k));
  }
  if((m = /^(?:the )?(slope|y-?intercept|x-?intercept) of (.+)$/.exec(q)) && /y/.test(m[2]) && /=/.test(m[2])){
    const L = pcLine(m[2]); if(!L) return null; const [a, b, c] = L;
    if(/^slope/.test(m[1])) return out(b === 0 ? "Undefined: the line is vertical." : pcFrac(-a / b));
    if(/^y/.test(m[1])) return out(b === 0 ? "None: the line is vertical." : "(0, " + pcFrac(c / b) + ")");
    return out(a === 0 ? "None: the line is horizontal." : "(" + pcFrac(c / a) + ", 0)");
  }
  if((m = /^(?:the )?(domain|range) of (?:y\s*=\s*|f\(x\)\s*=\s*)(.+)$/.exec(q))){
    const co = pcCoeffs(m[2]); if(!co) return null;
    if(m[1] === "domain" || co.length % 2 === 0) return out("All real numbers.");
    if(co.length === 3){ const [a, b, c] = co, k = +(c - b * b / (4 * a)).toPrecision(12); return out("y " + (a > 0 ? "≥ " : "≤ ") + pcFrac(k)); }
    return out(co.length === 1 ? "y = " + pcFrac(co[0]) : null);
  }
  // pay: hourly with overtime, net, commission
  if((m = /\b(?:pay|earn|earnings|wages?)\b.*?([\d.]+)\s*hours?\s*(?:at|of)\s*\$?\s*([\d.]+)/.exec(q)) || (m = /\b(time and a half|double time)\b.*?([\d.]+)\s*hours?\s*(?:at|of)\s*\$?\s*([\d.]+)/.exec(q)) && (m = [m[0], m[2], m[3]])){
    const k = /time and a half/.test(q) ? 1.5 : /double time/.test(q) ? 2 : 1; return out(money(+m[1] * +m[2] * k));
  }
  if((m = /\bnet pay\b.*?gross(?: pay)? (?:is |of |=\s*)?\$?\s*([\d,.]+)\b.*?deductions? (?:are |is |of |total |=\s*)?\$?\s*([\d,.]+)/.exec(q))) return out(money(+m[1].replace(/,/g, "") - +m[2].replace(/,/g, "")));
  if((m = /\bcommission\b.*?([\d.]+)\s*%.*?\$\s*([\d,.]+)/.exec(q))) return out(money(+m[1] / 100 * +m[2].replace(/,/g, "")));
  return null;
}
// --- Foundations of Mathematics 11, offline ---
// Statistics and the normal curve, polygons and angles, reasoning (counterexamples, next terms), scale, the rule of
// 72 and card interest, projectiles, and test points for inequalities. precalc() asks it after fm10(); null means
// "not mine". Graded by COURSE=fom11 node test/exam-course.js. Mirrored in kmp/shared/.../Foundations11.kt.
const POLYGON = {triangle:3, quadrilateral:4, pentagon:5, hexagon:6, heptagon:7, octagon:8, nonagon:9, decagon:10, hendecagon:11, dodecagon:12};
const SPELLED = {one:1, two:2, three:3, "1":1, "2":2, "3":3};
// The next term of a list: arithmetic, geometric, Fibonacci-like, then a polynomial by finite differences.
function pcNext(n){
  const d = n.slice(1).map((v, i) => v - n[i]);
  if(d.every(v => Math.abs(v - d[0]) < 1e-9)) return n[n.length - 1] + d[0];
  const r = n[1] / n[0];
  if(n[0] !== 0 && n.every((v, i) => i === 0 || Math.abs(v - n[i - 1] * r) < 1e-9)) return n[n.length - 1] * r;
  if(n.length >= 4 && n.every((v, i) => i < 2 || Math.abs(v - n[i - 1] - n[i - 2]) < 1e-9)) return n[n.length - 1] + n[n.length - 2];
  const rows = [n];
  while(rows[rows.length - 1].length > 2){
    const last = rows[rows.length - 1], next = last.slice(1).map((v, i) => v - last[i]); rows.push(next);
    if(next.length >= 2 && next.every(v => Math.abs(v - next[0]) < 1e-9)) return rows.reduce((s, row) => s + row[row.length - 1], 0);
  }
  return null;
}
function fom11(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"});
  const list = s => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  let m;
  // statistics
  if((m = /^(?:the )?(median|mode|range|standard deviation|variance|mean|average) of (?:the )?(?:data |numbers |values |set )?(-?[\d.]+(?:\s*(?:,|and)\s*-?[\d.]+)+)$/.exec(q))){
    const n = list(m[2]), N = n.length, mean = n.reduce((s, v) => s + v, 0) / N, s = [...n].sort((a, b) => a - b);
    if(/^(mean|average)/.test(m[1])) return out(pcNum(mean));
    if(m[1] === "median") return out(pcNum(N % 2 ? s[(N - 1) / 2] : (s[N / 2 - 1] + s[N / 2]) / 2));
    if(m[1] === "range") return out(pcNum(s[N - 1] - s[0]));
    if(m[1] === "mode"){
      const c = new Map(); n.forEach(v => c.set(v, (c.get(v) || 0) + 1)); const top = Math.max(...c.values());
      return out(top === 1 ? "None: every value appears once." : [...c].filter(([, k]) => k === top).map(([v]) => pcNum(v)).join(" and "));
    }
    const ss = n.reduce((t, v) => t + (v - mean) ** 2, 0);
    if(m[1] === "variance") return out("σ² = " + pcNum(+(ss / N).toFixed(4)) + " (population), s² = " + pcNum(+(ss / (N - 1)).toFixed(4)) + " (sample)");
    return out("σ = " + pcNum(+Math.sqrt(ss / N).toFixed(4)) + " (population), s = " + pcNum(+Math.sqrt(ss / (N - 1)).toFixed(4)) + " (sample)");
  }
  if((m = /\bz-?score\b.*?(-?[\d.]+)\b.*?\bmean (?:of |is |=\s*)?(-?[\d.]+).*?(?:standard deviation|sd|σ) (?:of |is |=\s*)?([\d.]+)/.exec(q))) return out("z = " + pcNum(+((+m[1] - +m[2]) / +m[3]).toFixed(4)));
  if(/\bnormal (?:distribution|curve)\b/.test(q) && (m = /\b(one|two|three|1|2|3) standard deviations?\b/.exec(q))){
    const k = SPELLED[m[1]];
    if(/\bwithin\b/.test(q)) return out(["68%", "95%", "99.7%"][k - 1] + " of the data.");
    if(/\b(above|more than|greater than|higher than|below|less than|lower than)\b/.test(q)) return out(["16%", "2.5%", "0.15%"][k - 1] + " of the data.");
  }
  if((m = /(\d+(?:\.\d+)?)\s*%.*?margin of error (?:of )?(?:±\s*)?(\d+(?:\.\d+)?)\s*(%|percent|percentage points?)?/.exec(q)) && /\b(confidence interval|interval|range)\b/.test(q)) return out(pcNum(+m[1] - +m[2]) + "% to " + pcNum(+m[1] + +m[2]) + "%");
  // polygons and angles
  const poly = (/\b(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|nonagon|decagon|hendecagon|dodecagon|(\d+)-(?:gon|sided polygon))\b/.exec(q) || []), sides = poly[2] ? +poly[2] : POLYGON[poly[1]];
  if(sides && /\b(?:sum of (?:the )?interior angles|interior angle sum|angle sum)\b/.test(q)) return out(pcNum((sides - 2) * 180) + "°");
  if(sides && /\b(?:each|one|an?) interior angle\b/.test(q)) return out(pcNum(+((sides - 2) * 180 / sides).toFixed(2)) + "°");
  if(sides && /\b(?:each|one|an?) exterior angle\b/.test(q)) return out(pcNum(+(360 / sides).toFixed(2)) + "°");
  if(/\bhow many sides\b/.test(q)){
    if((m = /\binterior angles? (?:summing to|sum(?:s| of)?|add(?:ing)? (?:up )?to|total(?:ling)?) (?:of )?([\d.]+)/.exec(q))) return out(pcNum(+m[1] / 180 + 2));
    if((m = /\binterior angles? (?:of |measuring |is |are )?([\d.]+)/.exec(q))) return out(pcNum(+(360 / (180 - +m[1])).toFixed(4)));
    if((m = /\bexterior angles? (?:of |measuring |is |are )?([\d.]+)/.exec(q))) return out(pcNum(+(360 / +m[1]).toFixed(4)));
  }
  if((m = /^(?:the )?(supplement|complement)(?: angle)? (?:of|to) (?:an angle of )?([\d.]+)\s*(?:°|degrees?)?$/.exec(q))) return out(pcNum((m[1] === "supplement" ? 180 : 90) - +m[2]) + "°");
  if((m = /\btwo angles of a triangle (?:are|measure) ([\d.]+)\s*(?:°|degrees?)? and ([\d.]+)/.exec(q))) return out(pcNum(180 - +m[1] - +m[2]) + "°");
  // reasoning
  if(/^(?:what is )?(?:a )?counter-?example$/.test(q)) return out("An example that shows a statement is false. One counterexample is enough to disprove a general claim.");
  if(/^(?:what is )?(?:a )?conjecture$/.test(q)) return out("A statement believed to be true, based on a pattern or evidence, but not yet proven.");
  if(/^(?:what is )?inductive reasoning$/.test(q)) return out("Reasoning from specific examples or observed patterns to a general conclusion (a conjecture), which may be false.");
  if(/^(?:what is )?deductive reasoning$/.test(q)) return out("Reasoning from general statements that are known to be true (premises) to a specific conclusion that must be true.");
  if((m = /\bcounter-?example (?:to|for) (?:the (?:statement|claim|conjecture) )?(?:that )?all ([a-z ]+?) (?:are|is) ([a-z0-9 ]+)$/.exec(q))){
    const subj = m[1].trim(), claim = m[2].trim(), isPrime = n => n > 1 && Number.isInteger(n) && [...Array(Math.floor(Math.sqrt(n)) + 1).keys()].slice(2).every(k => n % k);
    const square = /^squares? of (?:numbers|integers)|^square numbers|^numbers squared/.test(subj);
    const domain = (/^prime/.test(subj) ? [...Array(100).keys()].filter(isPrime) : /^odd/.test(subj) ? [...Array(50).keys()].map(k => 2 * k + 1) : /^even/.test(subj) ? [...Array(50).keys()].map(k => 2 * k) : /^(whole|natural|counting)/.test(subj) ? [...Array(101).keys()] : [-3, -2, -1, 0, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const f = x => square ? x * x : x, k = (/(\d+)/.exec(claim) || [])[1];
    const test = /^odd/.test(claim) ? v => Math.abs(v % 2) === 1 : /^even/.test(claim) ? v => v % 2 === 0 : /^prime/.test(claim) ? isPrime : /^positive/.test(claim) ? v => v > 0
      : /^(?:greater|bigger|larger) than (?:the )?(?:number|original)/.test(claim) ? (v, x) => v > x : /^(?:less|smaller) than (?:the )?(?:number|original)/.test(claim) ? (v, x) => v < x
      : /^divisible by/.test(claim) && k ? v => v % +k === 0 : /^(?:greater|bigger|more) than/.test(claim) && k ? v => v > +k : null;
    if(test){ const x = domain.find(x => !test(f(x), x)); if(x !== undefined) return out(pcNum(x) + (square ? ": " + pcNum(x) + "² = " + pcNum(x * x) + "." : " is a counterexample.")); }
  }
  if((m = /^(?:what (?:is|comes) )?(?:the )?next (?:term|number) (?:in|of|for) (?:the (?:sequence|pattern) )?(-?[\d.]+(?:\s*,\s*-?[\d.]+){2,})/.exec(q)) || (m = /^(-?[\d.]+(?:\s*,\s*-?[\d.]+){2,}),?\s*(?:\.\.\.|…)?,?\s*what comes next$/.exec(q))){
    const v = pcNext(list(m[1])); return v === null ? null : out(pcNum(v));
  }
  // scale
  const toCm = {mm:0.1, cm:1, m:100, km:100000};
  if((m = /\bscale factor\b.*?\b([\d.]+)\s*(mm|cm|m|km)\b.*?\b(?:represents?|is|stands for|equals?)\s*([\d.]+)\s*(mm|cm|m|km)\b/.exec(q))){
    const a = +m[1] * toCm[m[2]], b = +m[3] * toCm[m[4]], k = b / a;
    return out(k >= 1 ? "1:" + pcNum(+k.toFixed(4)) : pcNum(+(1 / k).toFixed(4)) + ":1");
  }
  if((m = /\bscale factor (?:is |of )?([\d./]+)\b.*?\b(area|volume|perimeter|length)\b/.exec(q)) || (m = /\b(area|volume|perimeter)\b.*?\bscale factor (?:is |of )?([\d./]+)/.exec(q)) && (m = [m[0], m[2], m[1]])){
    const k = pcVal(m[1]); if(k === null) return null; const p = m[2] === "area" ? 2 : m[2] === "volume" ? 3 : 1;
    return out("It is multiplied by " + pcFrac(+(k ** p).toPrecision(12)) + (p > 1 ? " (" + pcFrac(k) + (p === 2 ? "²" : "³") + ")." : "."));
  }
  if((m = /\bscale (?:is |of )?1\s*:\s*([\d,]+)\b.*?\b([\d.]+)\s*(mm|cm)\b/.exec(q))){
    const real = +m[2] * toCm[m[3]] * +m[1].replace(/,/g, ""), unit = (/\b(km|m|cm)\b(?=[^\d]*$)/.exec(q.replace(/\b[\d.]+\s*(mm|cm)\b/, "")) || [])[1] || (real >= 100000 ? "km" : "m");
    return out(pcNum(+(real / toCm[unit]).toFixed(4)) + " " + unit);
  }
  // money: the rule of 72, a month of card interest
  if(/\brule of 72\b/.test(q) && (m = /([\d.]+)\s*%/.exec(q))) return out(pcNum(+(72 / +m[1]).toFixed(2)) + " years");
  if((m = /\bbalance of \$?\s*([\d,.]+)\b.*?\b([\d.]+)\s*%.*?\b(?:one|1|a) month\b/.exec(q))) return out("$" + (+m[1].replace(/,/g, "") * +m[2] / 100 / 12).toFixed(2));
  // projectiles: h = -5t^2 + 20t + 2
  if((m = /\bh\s*(?:\(t\))?\s*=\s*([-+.\d\st^*()]+?t[-+.\d\st^*()]*?)(?:,|\s+(?:what|when|find|how|at|reach)\b|$)/.exec(q))){
    const co = pcQuad(m[1].replace(/t/g, "x")); if(co && co[0] < 0){
      const [a, b, c] = co, t = -b / (2 * a), top = c - b * b / (4 * a), unit = /\bm\b|\bmetres?\b|\bmeters?\b/.test(q) ? " m" : "";
      if(/\bwhen\b|\bwhat time\b|\bhow long\b.*\bmaximum\b/.test(q)) return out("t = " + pcNum(+t.toFixed(4)) + (unit ? " s" : ""));
      if(/\bmax(?:imum)?\b|\bhighest\b|\bhow high\b/.test(q)) return out(pcNum(+top.toFixed(4)) + unit);
    }
  }
  // test points and boundary lines for inequalities
  if((m = /^is \(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\) (?:a solution (?:of|to)|in the solution (?:set|region) of|on) (.+?)\s*(<=|>=|≤|≥|<|>)\s*(.+)$/.exec(q))){
    const [x, y] = [+m[1], +m[2]], val = e => pcAt(e.replace(/y/g, "(" + y + ")"), x), L = val(m[3]), R = val(m[5]); if(L === null || R === null) return null;
    const op = {"<=":"≤", ">=":"≥"}[m[4]] || m[4], ok = {"<":L < R, ">":L > R, "≤":L <= R + 1e-12, "≥":L >= R - 1e-12}[op];
    return out((ok ? "Yes: " : "No: ") + pcNum(L) + (ok ? " " + op + " " : " is not " + op + " ") + pcNum(R) + ".");
  }
  if(/\bsolid or (?:dashed|broken|dotted)\b|\b(?:dashed|broken|dotted) or solid\b/.test(q) && (m = /(<=|>=|≤|≥|<|>)/.exec(q))) return out(/[=≤≥]/.test(m[1]) ? "Solid: the points on the line are part of the solution." : "Dashed: the points on the line are not part of the solution.");
  return null;
}
// --- Foundations of Mathematics 12, offline ---
// Counting, probability with dice, cards and coins, sets, if-then logic, annuities and loan payments, growth or
// decay, circles, and fractals. precalc() asks it after fom11(); null means "not mine". Graded by
// COURSE=fom12 node test/exam-course.js. Mirrored in kmp/shared/.../Foundations12.kt.
const pcFact = n => n <= 1 ? 1 : n * pcFact(n - 1);
const pcPerm = (n, r) => r > n ? 0 : pcFact(n) / pcFact(n - r);
const pcChoose = (n, r) => r > n ? 0 : Math.round(pcFact(n) / (pcFact(r) * pcFact(n - r)));
// An exact fraction, reduced, with its decimal when it is not a simple one: "25/102 ≈ 0.2451".
const pcRatio = (n, d) => { const g = pcGcd(n, d) || 1, a = n / g, b = d / g; return b === 1 ? String(a) : a + "/" + b + (b > 12 ? " ≈ " + pcNum(+(a / b).toFixed(4)) : ""); };
const CARD_RANK = {ace:[1], king:[13], queen:[12], jack:[11], face:[11, 12, 13]}, CARD_SUIT = {heart:[0], diamond:[1], club:[2], spade:[3], red:[0, 1], black:[2, 3]};
// One event as the set of outcomes it covers: a die (1 to 6) or a card (0 to 51, rank 1 to 13 times suit).
function pcEvent(s){
  let m;
  if(/\b(?:die|dice)\b|\broll/.test(s) && !/\btwo dice\b|\bsum\b|\bdoubles\b/.test(s)){
    const all = [1, 2, 3, 4, 5, 6];
    if((m = /\b(?:a|an) ([1-6])\b/.exec(s))) return {all, hit: [+m[1]]};
    if(/\beven\b/.test(s)) return {all, hit: [2, 4, 6]};
    if(/\bodd\b/.test(s)) return {all, hit: [1, 3, 5]};
    if(/\bprime\b/.test(s)) return {all, hit: [2, 3, 5]};
    if((m = /\b(?:greater|more|higher) than ([0-6])\b/.exec(s))) return {all, hit: all.filter(v => v > +m[1])};
    if((m = /\b(?:less|lower|fewer) than ([1-7])\b/.exec(s))) return {all, hit: all.filter(v => v < +m[1])};
  }
  if(/\bcard|\bdeck\b|\bdraw/.test(s)){
    const all = [...Array(52).keys()], rank = c => c % 13 + 1, suit = c => Math.floor(c / 13);
    const r = (/\b(ace|king|queen|jack|face)s?\b/.exec(s) || [])[1], u = (/\b(heart|diamond|club|spade|red|black)s?\b/.exec(s) || [])[1];
    if(r || u) return {all, hit: all.filter(c => (!r || CARD_RANK[r].includes(rank(c))) && (!u || CARD_SUIT[u].includes(suit(c))))};
  }
  return null;
}
// Negate a simple clause: "it rains" is "it does not rain", "a shape is a square" is "a shape is not a square".
function pcNot(c){
  if(/\b(?:is|are|was|were|can|will)\b/.test(c)) return c.replace(/\b(is|are|was|were|can|will)\b/, "$1 not");
  if(/\bhas\b/.test(c)) return c.replace(/\bhas\b/, "does not have");
  if(/\bhave\b/.test(c)) return c.replace(/\bhave\b/, "do not have");
  const w = c.split(" "); if(w.length < 2) return "not " + c;
  const i = /^(a|an|the)$/.test(w[0]) ? 2 : 1, v = w[i]; if(!v) return "not " + c;
  w[i] = (/^(it|he|she)$/.test(w[0]) || i === 2 ? "does not " : "do not ") + v.replace(/ies$/, "y").replace(/(?<=[^s])s$/, "");
  return w.join(" ");
}
function fom12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"}), money = v => "$" + v.toFixed(2);
  let m;
  // counting
  if((m = /^(\d+)\s*p\s*(\d+)$|^(?:the number of )?permutations of (\d+) (?:things|items|objects|people)?\s*taken (\d+) at a time$|^p\((\d+),\s*(\d+)\)$/.exec(q))){ const [n, r] = (m[1] ? [m[1], m[2]] : m[3] ? [m[3], m[4]] : [m[5], m[6]]).map(Number); return out(String(pcPerm(n, r))); }
  if((m = /^(\d+)\s*c\s*(\d+)$|^(?:the number of )?combinations of (\d+) (?:things|items|objects|people)?\s*taken (\d+) at a time$|^(\d+) choose (\d+)$|^c\((\d+),\s*(\d+)\)$/.exec(q))){ const [n, r] = (m[1] ? [m[1], m[2]] : m[3] ? [m[3], m[4]] : m[5] ? [m[5], m[6]] : [m[7], m[8]]).map(Number); return out(String(pcChoose(n, r))); }
  if((m = /^how many ways can (?:a |an )?(?:committee|team|group|set|hand|panel|selection) of (\d+) be (?:chosen|selected|formed|picked|made) from (\d+)/.exec(q))) return out(String(pcChoose(+m[2], +m[1])));
  if((m = /^how many ways can (\d+) [a-z]+ (?:line up|be arranged|be ordered|sit in a row|stand in a line|finish a race)/.exec(q))) return out(String(pcFact(+m[1])));
  if((m = /\barrangements? of (?:all )?the letters (?:in|of) (?:the word )?([a-z]+)$/.exec(q))){
    const c = {}; for(const ch of m[1]) c[ch] = (c[ch] || 0) + 1;
    return out(String(Math.round(Object.values(c).reduce((s, k) => s / pcFact(k), pcFact(m[1].length)))));
  }
  if((m = /\b(\d+) letters?\b.*?\b(\d+) (?:digits?|numbers?)\b/.exec(q)) && /\bplates?\b|\bcodes?\b|\bpasswords?\b/.test(q)) return out(String(26 ** +m[1] * 10 ** +m[2]));
  if(/^how many (?:different )?(?:outfits|meals|combos|choices|options|sandwiches|combinations)\b/.test(q) && !/\btaken\b/.test(q)){ const n = (q.match(/\d+/g) || []).map(Number); if(n.length >= 2) return out(String(n.reduce((a, b) => a * b, 1))); }
  if((m = /^(?:the )?row (\d+) of pascal'?s triangle$/.exec(q)) && +m[1] <= 30) return out([...Array(+m[1] + 1).keys()].map(k => pcChoose(+m[1], k)).join(", "));
  // probability
  if((m = /\bp\(a\)\s*=\s*([\d.]+)\b.*?\bp\(b\)\s*=\s*([\d.]+)/.exec(q))){
    const a = +m[1], b = +m[2], both = (/\bp\(a (?:and|∩) b\)\s*=\s*([\d.]+)/.exec(q) || [])[1];
    if(/\bindependent\b/.test(q) && /\band b\b|\bboth\b/.test(q.replace(/p\(b\)/g, ""))) return out(pcNum(+(a * b).toFixed(6)));
    if(/\bmutually exclusive\b/.test(q) && /\bor\b/.test(q)) return out(pcNum(+(a + b).toFixed(6)));
    if(/\bor\b/.test(q) && both !== undefined) return out(pcNum(+(a + b - +both).toFixed(6)));
    if(/\bor\b/.test(q) && /\bindependent\b/.test(q)) return out(pcNum(+(a + b - a * b).toFixed(6)));
  }
  if((m = /^(?:if )?the probability (?:is|of an event is) ([\d.\/]+)\b.*\bodds (in favou?r|against)/.exec(q))){
    const p = pcVal(m[1]); if(p === null || p <= 0 || p >= 1) return null; const f = pcFrac(p).split("/").map(Number), [a, b] = f.length === 2 ? f : [p * 100, 100];
    return out(/^in/.test(m[2]) ? a + ":" + (b - a) : (b - a) + ":" + a);
  }
  if((m = /\bodds (in favou?r|against)(?: of an event)? (?:are|is) (\d+)\s*:\s*(\d+)\b.*\bprobability\b/.exec(q))){ const a = +m[2], b = +m[3]; return out(pcRatio(/^in/.test(m[1]) ? a : b, a + b)); }
  if((m = /^(?:are|is) (.+?) and (.+?) mutually exclusive$/.exec(q))){
    const a = pcEvent(m[1]) || pcEvent(m[1] + " " + q), b = pcEvent(m[2]) || pcEvent(m[2] + " " + q); if(!a || !b) return null;
    const shared = a.hit.filter(v => b.hit.includes(v));
    return out(shared.length ? "No. They can happen together (" + shared.length + " shared outcome" + (shared.length > 1 ? "s" : "") + ")." : "Yes. They cannot happen at the same time.");
  }
  if((m = /\bodds (in favou?r of|against) (.+)$/.exec(q))){ const e = pcEvent(m[2]); if(e){ const h = e.hit.length, n = e.all.length - h, g = pcGcd(h, n) || 1; return out(/^in/.test(m[1]) ? h / g + ":" + n / g : n / g + ":" + h / g); } }
  if(/^(?:the )?probability\b/.test(q)){
    if((m = /\bflipping (\d+|two|three|four) (heads|tails)(?: in a row)?\b/.exec(q))){ const k = {two:2, three:3, four:4}[m[1]] || +m[1]; return out(pcRatio(1, 2 ** k)); }
    if(/\btwo dice\b|\bpair of dice\b/.test(q)){
      if((m = /\bsum of (\d+)\b/.exec(q))){ let c = 0; for(let a = 1; a <= 6; a++) for(let b = 1; b <= 6; b++) if(a + b === +m[1]) c++; return out(pcRatio(c, 36)); }
      if(/\bdoubles\b/.test(q)) return out(pcRatio(6, 36));
    }
    const e = pcEvent(q); if(e){
      const h = e.hit.length, N = e.all.length;
      if((m = /\b(two|2|three|3) .*?\b(without|with) replacement\b/.exec(q))){ const k = /^(two|2)$/.test(m[1]) ? 2 : 3; let num = 1, den = 1; for(let i = 0; i < k; i++){ num *= m[2] === "with" ? h : h - i; den *= m[2] === "with" ? N : N - i; } return out(pcRatio(num, den)); }
      return out(pcRatio(h, N));
    }
  }
  // sets and logic
  if((m = /\bn\(a (∪|∩|union|intersection|or|and) b\) (?:if|when|given)\b/.exec(q))){
    const val = re => { const t = re.exec(q); return t ? +t[1] : null; }, a = val(/\bn\(a\)\s*=\s*(\d+)/), b = val(/\bn\(b\)\s*=\s*(\d+)/), u = val(/\bn\(a (?:∪|union|or) b\)\s*=\s*(\d+)/), i = val(/\bn\(a (?:∩|intersection|and) b\)\s*=\s*(\d+)/);
    const r = a === null || b === null ? null : /∪|union|or/.test(m[1]) ? (i === null ? null : a + b - i) : (u === null ? null : a + b - u);
    if(r !== null) return out(String(r));
  }
  if((m = /\b(\d+)\b\D*?\b(\d+)\b\D*?\b(\d+)\b\D*?\b(\d+)\b[^\d]*?\bboth\b.*\bneither\b/.exec(q)) && +m[1] >= +m[2]) return out(String(+m[1] - (+m[2] + +m[3] - +m[4])));
  const sets = [...q.matchAll(/\{([^{}]*)\}/g)].map(t => t[1].split(",").map(x => x.trim()).filter(Boolean));
  if(sets.length === 2 && (m = /^(?:the )?(union|intersection) of\b/.exec(q))){
    const [a, b] = sets, r = m[1] === "union" ? [...new Set([...a, ...b])] : a.filter(x => b.includes(x)); return out("{" + r.join(", ") + "}");
  }
  if(/^(?:what is )?(?:the )?complement of a set$/.test(q)) return out("Everything in the universal set that is not in the set. The complement of A is written A′.");
  if(/^(?:what is )?(?:the |an )?empty set$/.test(q)) return out("The set with no elements, written ∅ or { }.");
  if((m = /^(?:the |what is the )?(converse|inverse|contrapositive) of (?:the statement )?"?if (.+?),? then (.+?)"?$/.exec(q))){
    let p = m[2].trim(), c = m[3].trim();
    // A pronoun in the "then" part points back at the "if" part's noun; when the order flips, the noun goes first.
    const pn = /^(it|they)\b/.exec(c), noun = (/^((?:a|an|the) [a-z]+|[a-z]+)\b/.exec(p) || [])[1];
    const swap = s => pn && noun && /^(a|an|the) /.test(noun) ? s : null;
    const cFirst = swap(1) ? c.replace(/^(it|they)\b/, noun) : c, pLast = swap(1) ? p.replace(noun, pn[1]) : p;
    const cap = s => s[0].toUpperCase() + s.slice(1);
    if(m[1] === "converse") return out(cap("if " + cFirst + ", then " + pLast + "."));
    if(m[1] === "inverse") return out(cap("if " + pcNot(p) + ", then " + pcNot(c) + "."));
    return out(cap("if " + pcNot(cFirst) + ", then " + pcNot(pLast) + "."));
  }
  // annuities and loan payments, before the one-deposit compound-interest branch
  const per = {monthly:12, "each month":12, "every month":12, "per month":12, "a month":12, weekly:52, quarterly:4, annually:1, yearly:1, "each year":1, "per year":1, "every year":1};
  if((m = /\$\s*([\d,.]+) (?:is )?(?:deposited|invested|saved|contributed|put away|paid in) (monthly|weekly|quarterly|annually|yearly|each month|every month|per month|a month|each year|per year|every year) for (\d+) years? at ([\d.]+)\s*%/.exec(q))){
    const k = per[m[2]], i = +m[4] / 100 / k, N = k * +m[3], fv = +m[1].replace(/,/g, "") * ((1 + i) ** N - 1) / i; return out(money(fv));
  }
  if((m = /\bpayments?\b.*?\$\s*([\d,.]+)\s*(loan|mortgage|car loan)?\b.*?\bat ([\d.]+)\s*%.*?\b(?:for|over) (\d+) years?/.exec(q))){
    const pv = +m[1].replace(/,/g, ""), N = 12 * +m[4], pay = i => i * pv / (1 - (1 + i) ** -N), monthly = pay(+m[3] / 1200);
    if(/mortgage/.test(q)) return out(money(monthly) + " a month compounded monthly; " + money(pay((1 + +m[3] / 200) ** (1 / 6) - 1)) + " with the semi-annual compounding Canadian mortgages use.");
    return out(money(monthly) + " a month (" + money(monthly * N - pv) + " in interest over the loan).");
  }
  // functions, circles, fractals
  if((m = /\by\s*=\s*(-?[\d.]*)\s*\(?\s*([\d.]+)\s*\)?\s*\^\s*\(?\s*-?x\s*\)?/.exec(q)) && /\bgrowth or decay\b|\bdecay or growth\b/.test(q)){
    const b = +m[2], neg = /\^\s*\(?\s*-x/.test(q); if(b <= 0 || b === 1) return null;
    return out((b > 1) !== neg ? "Growth: the base " + pcNum(b) + " is greater than 1." : "Decay: the base " + pcNum(b) + " is between 0 and 1.");
  }
  if((m = /\bcircle\b.*?\bcent(?:er|re) (?:at |of )?\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\).*?\bradius (?:of |is )?([\d.]+)/.exec(q)) && /\bequation\b/.test(q)){
    const t = (v, n) => +n === 0 ? v + "²" : "(" + v + (+n > 0 ? " - " + n : " + " + -n) + ")²"; return out(t("x", m[1]) + " + " + t("y", m[2]) + " = " + pcNum(m[3] ** 2));
  }
  if((m = /^(?:the )?cent(?:er|re) and radius of (.+?)=\s*([\d.]+)$/.exec(q))){
    const term = v => { const t = new RegExp("\\(\\s*" + v + "\\s*([+-])\\s*([\\d.]+)\\s*\\)\\s*(?:\\^\\s*2|²)").exec(m[1]); return t ? (t[1] === "-" ? 1 : -1) * +t[2] : new RegExp("\\b" + v + "\\s*(?:\\^\\s*2|²)").test(m[1]) ? 0 : null; };
    const h = term("x"), k = term("y"); if(h === null || k === null) return null;
    return out("Center (" + pcNum(h) + ", " + pcNum(k) + "), radius " + (Number.isInteger(Math.sqrt(+m[2])) ? pcNum(Math.sqrt(+m[2])) : "√" + m[2] + " ≈ " + pcNum(+Math.sqrt(+m[2]).toFixed(4))) + ".");
  }
  const FRACTAL = {"koch curve":[4, 3, "segments"], "koch snowflake":[4, 3, "segments"], "sierpinski triangle":[3, 2, "triangles"], "sierpinski gasket":[3, 2, "triangles"], "sierpinski carpet":[8, 3, "squares"], "cantor set":[2, 3, "segments"]};
  const fr = Object.keys(FRACTAL).find(k => q.includes(k));
  if(fr){
    const [n, s, unit] = FRACTAL[fr];
    if(/\bdimension\b/.test(q)) return out("log " + n + "/log " + s + " ≈ " + pcNum(+(Math.log(n) / Math.log(s)).toFixed(4)));
    if((m = /\bstage (\d+)\b/.exec(q)) && /\bhow many\b/.test(q)) return out(String(n ** +m[1]) + " " + unit);
  }
  return null;
}
// --- Calculus 12, offline ---
// A small symbolic engine for expressions in x: parse, differentiate, simplify and print the way a textbook does.
// Integrals of the standard forms, definite integrals by Simpson's rule, limits from both sides, critical points,
// concavity, motion and related rates. precalc() asks it first; null means "not mine". Graded by
// COURSE=calc12 node test/exam-course.js. Mirrored in kmp/shared/.../Calculus12.kt.
const CN = v => ({t:"n", v}), CX = {t:"x"};
const C_NAMES = ["sqrt", "sin", "cos", "tan", "sec", "csc", "cot", "ln", "log", "exp", "abs", "pi", "e", "x"];
// Parse into nodes: n (number), x, + (ts), * (fs), / (a, b), ^ (a, b), f (f, a). Null when it is not an expression in x.
function cParse(src){
  const s = String(src).toLowerCase().replace(/\|([^|]+)\|/g, "abs($1)").replace(/π/g, "pi").replace(/√\s*\(/g, "sqrt(").replace(/√\s*([a-z0-9.]+)/g, "sqrt($1)").replace(/\s+/g, "");
  let i = 0;
  const atom = () => {
    const c = s[i]; if(c === undefined) throw 0;
    if(c === "("){ i++; const v = sum(); if(s[i++] !== ")") throw 0; return v; }
    const num = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if(num){ i += num[0].length; return CN(+num[0]); }
    const name = C_NAMES.find(n => s.startsWith(n, i)); if(!name) throw 0; i += name.length;
    if(name === "x") return CX;
    if(name === "pi") return CN(Math.PI);
    if(name === "e") return {t:"e"};
    let pw = null; if(s[i] === "^"){ i++; pw = atom(); }
    const f = {t:"f", f:name, a: s[i] === "(" ? atom() : power()};
    return pw ? {t:"^", a:f, b:pw} : f;
  };
  const power = () => { const b = atom(); if(s[i] === "^"){ i++; const e = unary(); return b.t === "e" ? {t:"f", f:"exp", a:e} : {t:"^", a:b, b:e}; } return b.t === "e" ? CN(Math.E) : b; };
  const unary = () => s[i] === "-" ? (i++, {t:"*", fs:[CN(-1), unary()]}) : s[i] === "+" ? (i++, unary()) : power();
  const prod = () => { let a = unary(); for(;;){ const c = s[i];
    if(c === "*"){ i++; a = {t:"*", fs:[a, unary()]}; } else if(c === "/"){ i++; a = {t:"/", a, b:unary()}; }
    else if(c !== undefined && /[\dx(a-z.]/.test(c)) a = {t:"*", fs:[a, power()]}; else return a; } };
  const sum = () => { const ts = [prod()]; while(s[i] === "+" || s[i] === "-"){ const neg = s[i++] === "-", b = prod(); ts.push(neg ? {t:"*", fs:[CN(-1), b]} : b); } return ts.length === 1 ? ts[0] : {t:"+", ts}; };
  try{ const v = sum(); return i === s.length ? v : null; } catch { return null; }
}
const cHasX = n => n.t === "x" || (n.ts || n.fs || []).some(cHasX) || (n.a && typeof n.a === "object" && cHasX(n.a)) || (n.b && cHasX(n.b));
const C_FN = {sin:Math.sin, cos:Math.cos, tan:Math.tan, sec:v => 1 / Math.cos(v), csc:v => 1 / Math.sin(v), cot:v => 1 / Math.tan(v), ln:Math.log, log:Math.log10, exp:Math.exp, sqrt:Math.sqrt, abs:Math.abs};
function cEval(n, x){
  switch(n.t){
    case "n": return n.v; case "x": return x;
    case "+": return n.ts.reduce((s, t) => s + cEval(t, x), 0);
    case "*": return n.fs.reduce((s, f) => s * cEval(f, x), 1);
    case "/": return cEval(n.a, x) / cEval(n.b, x);
    case "^": return cEval(n.a, x) ** cEval(n.b, x);
    default: return C_FN[n.f](cEval(n.a, x));
  }
}
const cPow = (a, b) => ({t:"^", a, b}), cMul = (...fs) => ({t:"*", fs}), cAdd = (...ts) => ({t:"+", ts}), cF = (f, a) => ({t:"f", f, a});
function cD(n){
  switch(n.t){
    case "n": return CN(0); case "x": return CN(1);
    case "+": return cAdd(...n.ts.map(cD));
    case "*": return cAdd(...n.fs.map((f, i) => cMul(...n.fs.map((g, j) => i === j ? cD(g) : g))));
    case "/": return {t:"/", a: cAdd(cMul(cD(n.a), n.b), cMul(CN(-1), n.a, cD(n.b))), b: cPow(n.b, CN(2))};
    case "^":
      if(!cHasX(n.b)) return cMul(n.b, cPow(n.a, cAdd(n.b, CN(-1))), cD(n.a));
      if(!cHasX(n.a)) return cMul(n, cF("ln", n.a), cD(n.b));
      return cMul(n, cD(cMul(n.b, cF("ln", n.a))));
    default: {
      const a = n.a, da = cD(a);
      switch(n.f){
        case "sin": return cMul(cF("cos", a), da); case "cos": return cMul(CN(-1), cF("sin", a), da);
        case "tan": return cMul(cPow(cF("sec", a), CN(2)), da); case "sec": return cMul(cF("sec", a), cF("tan", a), da);
        case "csc": return cMul(CN(-1), cF("csc", a), cF("cot", a), da); case "cot": return cMul(CN(-1), cPow(cF("csc", a), CN(2)), da);
        case "exp": return cMul(n, da); case "ln": return {t:"/", a: da, b: a}; case "log": return {t:"/", a: da, b: cMul(a, CN(Math.LN10))};
        case "sqrt": return {t:"/", a: da, b: cMul(CN(2), n)}; default: return cMul({t:"/", a, b: n}, da);
      }
    }
  }
}
// A term as [coefficient, factors]; like terms combine by their printed factors.
const cKey = n => JSON.stringify(n);
function cSplit(n){ if(n.t === "n") return [n.v, []]; if(n.t === "*"){ let c = 1; const fs = []; for(const f of n.fs) f.t === "n" ? c *= f.v : fs.push(f); return [c, fs]; } return [1, [n]]; }
const cBuild = (c, fs) => fs.length === 0 ? CN(c) : c === 1 && fs.length === 1 ? fs[0] : {t:"*", fs: c === 1 ? fs : [CN(c), ...fs]};
function cSimp(n){
  if(n.t === "n" || n.t === "x") return n;
  if(n.t === "f"){ const a = cSimp(n.a); if(a.t === "n") return CN(C_FN[n.f](a.v)); if(n.f === "exp" && a.t === "f" && a.f === "ln") return a.a; return cF(n.f, a); }
  if(n.t === "^"){
    const a = cSimp(n.a), b = cSimp(n.b);
    if(b.t === "n" && b.v === 0) return CN(1); if(b.t === "n" && b.v === 1) return a;
    if(a.t === "n" && b.t === "n") return CN(a.v ** b.v);
    if(a.t === "^" && a.b.t === "n" && b.t === "n") return cSimp(cPow(a.a, CN(a.b.v * b.v)));
    if(a.t === "*" && b.t === "n" && Number.isInteger(b.v)) return cSimp(cMul(...a.fs.map(f => cPow(f, b))));
    return cPow(a, b);
  }
  if(n.t === "/"){
    const a = cSimp(n.a), b = cSimp(n.b);
    if(b.t === "n") return cSimp(cMul(CN(1 / b.v), a));
    if(a.t === "n" && a.v === 0) return CN(0);
    // Cancel numbers and powers of x shared by top and bottom: 2/(2x) is 1/x.
    let [ca, fa] = cSplit(a), [cb, fb] = cSplit(b); const c = ca / cb;
    const xp = fs => fs.reduce((s, f) => s + (f.t === "x" ? 1 : f.t === "^" && f.a.t === "x" && f.b.t === "n" ? f.b.v : 0), 0), rest = fs => fs.filter(f => !(f.t === "x" || (f.t === "^" && f.a.t === "x" && f.b.t === "n")));
    const k = xp(fa) - xp(fb); fa = rest(fa); fb = rest(fb);
    if(k > 0) fa.push(k === 1 ? CX : cPow(CX, CN(k))); if(k < 0) fb.push(k === -1 ? CX : cPow(CX, CN(-k)));
    if(fb.length === 0) return cSimp(cBuild(c, fa));
    // A fractional number splits across the bar: 1/(2√x), not 1/2/√x.
    const [p, d = "1"] = pcFrac(c).split("/");
    return {t:"/", a: cBuild(+p, fa), b: cBuild(+d, fb)};
  }
  if(n.t === "*"){
    let c = 1; const pw = new Map(), order = [];
    const add = f => {
      if(f.t === "n"){ c *= f.v; return; }
      if(f.t === "*"){ f.fs.forEach(add); return; }
      // a/b inside a product is a times b^-1, so x · (1/x) cancels.
      if(f.t === "/"){ add(f.a); add(cSimp(cPow(f.b, CN(-1)))); return; }
      const [base, e] = f.t === "^" && f.b.t === "n" ? [f.a, f.b.v] : [f, 1], key = cKey(base);
      if(!pw.has(key)){ pw.set(key, [base, 0]); order.push(key); } pw.get(key)[1] += e;
    };
    n.fs.map(cSimp).forEach(add);
    if(c === 0) return CN(0);
    const fs = order.map(k => pw.get(k)).filter(([, e]) => e !== 0).map(([b, e]) => e === 1 ? b : cSimp(cPow(b, CN(e))));
    // A number times a sum spreads over the sum, so like terms can meet.
    if(fs.length === 1 && fs[0].t === "+" && c !== 1) return cSimp(cAdd(...fs[0].ts.map(t => cMul(CN(c), t))));
    // So does a power of x: 2x(x + 1) is 2x^2 + 2x.
    const mono = f => f.t === "x" || (f.t === "^" && f.a.t === "x" && f.b.t === "n"), sums = fs.filter(f => f.t === "+");
    if(sums.length === 1 && fs.length > 1 && fs.every(f => f.t === "+" || mono(f))) return cSimp(cAdd(...sums[0].ts.map(t => cMul(CN(c), ...fs.filter(mono), t))));
    // x powers first, then the rest: "2x sin(x)", "8x(x^2 + 1)^3".
    const isX = f => f.t === "x" || (f.t === "^" && f.a.t === "x");
    return cBuild(+c.toPrecision(12), [...fs.filter(isX), ...fs.filter(f => !isX(f))]);
  }
  // + : flatten, combine like terms, keep first-seen order
  const terms = new Map(), order = [];
  const add = t => { if(t.t === "+"){ t.ts.forEach(add); return; } const [c, fs] = cSplit(t), key = cKey(fs); if(!terms.has(key)){ terms.set(key, [0, fs]); order.push(key); } terms.get(key)[0] += c; };
  n.ts.map(cSimp).forEach(add);
  const ts = order.map(k => terms.get(k)).filter(([c]) => Math.abs(c) > 1e-12).map(([c, fs]) => cBuild(+c.toPrecision(12), fs));
  // Constants go last: "3x^2 + 4x - 5".
  const sorted = [...ts.filter(t => t.t !== "n"), ...ts.filter(t => t.t === "n")];
  return sorted.length === 0 ? CN(0) : sorted.length === 1 ? sorted[0] : {t:"+", ts: sorted};
}
const C_SUP = {2:"²", 3:"³"};
function cNum(v){ return Number.isInteger(+v.toFixed(9)) ? String(Math.round(v)) : Math.abs(v - Math.E) < 1e-12 ? "e" : Math.abs(v - Math.PI) < 1e-12 ? "π" : Math.abs(v - Math.LN10) < 1e-12 ? "ln 10" : pcFrac(v); }
function cStr(n){
  switch(n.t){
    case "n": return cNum(n.v);
    case "x": return "x";
    case "+": return n.ts.map((t, i) => { const [c, fs] = cSplit(t), s = cStr(c < 0 ? cBuild(-c, fs) : t); return i === 0 ? (c < 0 ? "-" : "") + s : (c < 0 ? " - " : " + ") + s; }).join("");
    case "/": { const top = cStr(n.a), bot = cStr(n.b); return (n.a.t === "+" ? "(" + top + ")" : top) + "/" + (n.b.t === "+" || (n.b.t === "*" && !(n.b.fs.length === 1)) ? "(" + bot + ")" : bot); }
    case "^": {
      const e = n.b.t === "n" ? n.b.v : null;
      if(n.a.t === "f" && C_SUP[e] && n.a.f !== "exp" && n.a.f !== "sqrt" && n.a.f !== "abs") return n.a.f + C_SUP[e] + "(" + cStr(n.a.a) + ")";
      const base = n.a.t === "x" || (n.a.t === "n" && n.a.v >= 0) || n.a.t === "f" ? cStr(n.a) : "(" + cStr(n.a) + ")";
      return base + "^" + (e !== null && Number.isInteger(e) && e >= 0 ? e : n.b.t === "x" ? "x" : "(" + cStr(n.b) + ")");
    }
    case "*": {
      const [c, fs] = cSplit(n), top = [], bot = [];
      for(const f of fs) f.t === "^" && f.b.t === "n" && f.b.v < 0 && Number.isInteger(f.b.v) ? bot.push(f.b.v === -1 ? f.a : cPow(f.a, CN(-f.b.v))) : top.push(f);
      const part = f => f.t === "+" ? "(" + cStr(f) + ")" : cStr(f);
      const body = top.map(part).reduce((s, p, i) => s + (i === 0 || p[0] === "(" ? "" : " ") + p, "");
      const coef = c === 1 ? "" : c === -1 ? "-" : Number.isInteger(+c.toFixed(9)) || !body ? cNum(c) : "(" + cNum(c) + ")";
      const num = body ? coef + body : (c === -1 ? "-1" : cNum(c));
      if(!bot.length) return num;
      const den = bot.map(part).join(" ");
      return (body ? num : (c === -1 ? "-1" : cNum(c))) + "/" + (bot.length > 1 ? "(" + den + ")" : den);
    }
    default:
      if(n.f === "exp") return "e^" + (n.a.t === "x" ? "x" : "(" + cStr(n.a) + ")");
      if(n.f === "sqrt") return "√" + (n.a.t === "x" ? "x" : "(" + cStr(n.a) + ")");
      if(n.f === "abs") return "|" + cStr(n.a) + "|";
      if(n.f === "ln" && n.a.t === "f" && n.a.f === "abs") return "ln" + cStr(n.a);
      return n.f + "(" + cStr(n.a) + ")";
  }
}
// An antiderivative of the standard forms, term by term, or null.
function cInt(n){
  const ts = n.t === "+" ? n.ts : [n], out = [];
  for(const t of ts){
    const [c, fs] = cSplit(t);
    if(fs.length === 0){ out.push(cMul(CN(c), CX)); continue; }
    if(fs.length !== 1) return null;
    const f = fs[0], k = f.t === "x" ? 1 : f.t === "^" && f.a.t === "x" && f.b.t === "n" ? f.b.v : null;
    if(k !== null){ out.push(k === -1 ? cMul(CN(c), cF("ln", cF("abs", CX))) : cMul(CN(c / (k + 1)), cPow(CX, CN(k + 1)))); continue; }
    const lin = a => { if(a.t === "x") return 1; const [ca, fa] = cSplit(a); return fa.length === 1 && fa[0].t === "x" ? ca : null; };
    if(f.t === "f" && ["sin", "cos", "exp"].includes(f.f) && lin(f.a) !== null){ const a = lin(f.a); out.push(cMul(CN((f.f === "sin" ? -c : c) / a), cF(f.f === "sin" ? "cos" : f.f === "cos" ? "sin" : "exp", f.a))); continue; }
    if(f.t === "^" && f.a.t === "f" && f.a.f === "sec" && f.b.t === "n" && f.b.v === 2 && lin(f.a.a) !== null){ out.push(cMul(CN(c / lin(f.a.a)), cF("tan", f.a.a))); continue; }
    if(f.t === "/" && f.a.t === "n" && f.b.t === "x"){ out.push(cMul(CN(c * f.a.v), cF("ln", cF("abs", CX)))); continue; }
    return null;
  }
  return cSimp(cAdd(...out));
}
// A value as a small fraction when it is one, else to four places.
const cSnap = v => { for(let d = 1; d <= 12; d++){ const k = Math.round(v * d); if(Math.abs(v * d - k) < 1e-7) return d === 1 ? String(k) : k + "/" + d; } return pcNum(+v.toFixed(4)); };
function cSimpson(f, a, b){ const n = 2000, h = (b - a) / n; let s = f(a) + f(b); for(let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
// The zeros of a function on [-50, 50]: sign changes found on a grid, then bisected.
function cZeros(f){
  const zs = [], push = z => { if(!zs.some(w => Math.abs(w - z) < 1e-6)) zs.push(z); };
  let px = -50, pv = f(px);
  for(let k = 1; k <= 2000; k++){
    const x = -50 + k * 0.05, v = f(x);
    if(Math.abs(pv) < 1e-12) push(px);
    if(isFinite(v) && isFinite(pv) && pv * v < 0){ let lo = px, hi = x; for(let j = 0; j < 80; j++){ const mid = (lo + hi) / 2; (f(lo) * f(mid) <= 0) ? hi = mid : lo = mid; } if(Math.abs(f((lo + hi) / 2)) < 1e-6) push((lo + hi) / 2); }
    px = x; pv = v;
  }
  return zs.map(z => { for(let d = 1; d <= 12; d++){ const k = Math.round(z * d); if(Math.abs(z * d - k) < 1e-6) return k / d; } return z; }).sort((a, b) => a - b);
}
// Where a function is positive (sign 1) or negative (-1), as inequalities between its zeros.
function cWhere(f, sign){
  const zs = cZeros(f), cuts = [-Infinity, ...zs, Infinity], parts = [];
  for(let i = 0; i < cuts.length - 1; i++){
    const lo = cuts[i], hi = cuts[i + 1], mid = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    if(Math.sign(f(mid)) === sign) parts.push(lo === -Infinity && hi === Infinity ? "all real x" : lo === -Infinity ? "x < " + cSnap(hi) : hi === Infinity ? "x > " + cSnap(lo) : cSnap(lo) + " < x < " + cSnap(hi));
  }
  return parts.length ? parts.join(" or ") : "nowhere";
}
function calc12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"});
  const fx = s => { const t = cParse(s); return t && cHasX(t) ? t : null; }, at = (t, v) => cEval(t, v);
  let m;
  // derivatives
  if((m = /^(?:the )?(second |2nd )?derivative of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$|^(?:differentiate|d\/dx)\s+(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$|^dy\/dx (?:if|for|of) y\s*=\s*(.+)$/.exec(q))){
    const t = fx(m[2] || m[3] || m[4]); if(!t) return null;
    let d = cSimp(cD(t)); if(m[1]) d = cSimp(cD(d));
    return out(cStr(d));
  }
  // f'(a), tangent slopes and tangent lines
  if((m = /\bf\(x\)\s*=\s*(.+?),?\s+(?:find|what is|evaluate)\s+f'\s*\(\s*(-?[\d./]+)\s*\)$/.exec(q)) || (m = /^f'\s*\(\s*(-?[\d./]+)\s*\) (?:if|for|when) f\(x\)\s*=\s*(.+)$/.exec(q)) && (m = [m[0], m[2], m[1]])){
    const t = fx(m[1]), a = pcVal(m[2]); if(!t || a === null) return null; return out(cSnap(at(cSimp(cD(t)), a)));
  }
  if((m = /\b(slope|equation)\b.*?\btangent(?: line)? (?:to|of|at)\s+(?:the curve |the graph of )?(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:at|where|when)\s+x\s*=\s*(-?[\d./]+)$/.exec(q))){
    const t = fx(m[2]), a = pcVal(m[3]); if(!t || a === null) return null;
    const k = at(cSimp(cD(t)), a), b = at(t, a) - k * a, ks = cSnap(k);
    if(m[1] === "slope") return out(ks);
    return out("y = " + (Math.abs(k) < 1e-12 ? cSnap(b) : (ks === "1" ? "" : ks === "-1" ? "-" : ks) + "x" + (Math.abs(b) < 1e-12 ? "" : b > 0 ? " + " + cSnap(b) : " - " + cSnap(-b))));
  }
  // critical points, extrema, concavity, inflection, increasing and decreasing
  if((m = /^(?:the )?(critical points?|critical numbers?|local (?:maximum|minimum|max|min|extrema)|relative (?:maximum|minimum)|inflection points?|points? of inflection) (?:of|for) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$/.exec(q))){
    const t = fx(m[2]); if(!t) return null;
    const d1 = cSimp(cD(t)), d2 = cSimp(cD(d1)), f1 = v => at(d1, v), f2 = v => at(d2, v), pt = v => "(" + cSnap(v) + ", " + cSnap(at(t, v)) + ")";
    if(/inflection/.test(m[1])){ const zs = cZeros(f2).filter(z => Math.sign(f2(z - 1e-3)) !== Math.sign(f2(z + 1e-3))); return out(zs.length ? zs.map(pt).join(", ") : "None."); }
    const cs = cZeros(f1);
    if(/^critical/.test(m[1])) return out(cs.length ? cs.map(z => "x = " + cSnap(z)).join(", ") : "None.");
    const kind = z => { const s = f2(z); return s < -1e-9 ? "max" : s > 1e-9 ? "min" : Math.sign(f1(z - 1e-3)) > Math.sign(f1(z + 1e-3)) ? "max" : Math.sign(f1(z - 1e-3)) < Math.sign(f1(z + 1e-3)) ? "min" : "neither"; };
    const want = /max/.test(m[1]) ? ["max"] : /min/.test(m[1]) ? ["min"] : ["max", "min"], hits = cs.filter(z => want.includes(kind(z)));
    return out(hits.length ? hits.map(z => (want.length > 1 ? "local " + kind(z) + " at " : "") + pt(z) + (want.length === 1 ? ", at x = " + cSnap(z) : "")).join("; ") : "None.");
  }
  if((m = /^(?:where|on what interval|for what (?:values of )?x) (?:is|are|does) (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (concave up|concave down|increasing|decreasing)$/.exec(q))){
    const t = fx(m[1]); if(!t) return null;
    const d1 = cSimp(cD(t)), g = /concave/.test(m[2]) ? cSimp(cD(d1)) : d1;
    return out(cWhere(v => at(g, v), /up|increasing/.test(m[2]) ? 1 : -1));
  }
  // limits
  if((m = /^(?:the )?(?:limit|lim) (?:of )?(.+?) as x (?:approaches|goes to|tends to|->|→)\s*(-?∞|-?infinity|[-\d./π\spi]+)$/.exec(q))){
    const t = fx(m[1]); if(!t) return null; const f = v => at(t, v), A = m[2].trim();
    if(/∞|infinity/.test(A)){ const s = A[0] === "-" ? -1 : 1, v1 = f(s * 1e6), v2 = f(s * 1e7);
      if(Math.abs(v2) > 1e5 && Math.abs(v2) > Math.abs(v1)) return out((v2 > 0 ? "∞" : "-∞") + ": it grows without bound, so the limit does not exist as a number.");
      return isFinite(v2) ? out(cSnap(+v2.toFixed(5))) : null; }
    const a = pcVal(A); if(a === null) return null; const L = f(a - 1e-7), R = f(a + 1e-7);
    if(Math.abs(L) > 1e5 || Math.abs(R) > 1e5) return out("Does not exist: it heads to " + (L > 0 ? "∞" : "-∞") + " from the left and " + (R > 0 ? "∞" : "-∞") + " from the right.");
    if(Math.abs(L - R) > 1e-4) return out("Does not exist: the left limit is " + cSnap(+L.toFixed(4)) + " and the right limit is " + cSnap(+R.toFixed(4)) + ".");
    return out(cSnap(+((L + R) / 2).toFixed(5)));
  }
  if((m = /^is (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?) (differentiable|continuous) at x\s*=\s*(-?[\d./]+)$/.exec(q))){
    const t = fx(m[1]), a = pcVal(m[3]); if(!t || a === null) return null; const f = v => at(t, v), h = 1e-6, fa = f(a), L = f(a - h), R = f(a + h);
    const cont = isFinite(fa) && Math.abs(L - fa) < 1e-4 && Math.abs(R - fa) < 1e-4;
    if(m[2] === "continuous") return out(cont ? "Yes: the limit as x approaches " + cSnap(a) + " equals f(" + cSnap(a) + ") = " + cSnap(fa) + "." : "No: the function breaks at x = " + cSnap(a) + ".");
    if(!cont) return out("No: it is not even continuous there.");
    const sl = (fa - L) / h, sr = (R - fa) / h;
    return out(Math.abs(sl - sr) < 1e-3 ? "Yes: the slope is " + cSnap(+((sl + sr) / 2).toFixed(4)) + " from both sides." : "No: the slope is " + cSnap(+sl.toFixed(3)) + " from the left and " + cSnap(+sr.toFixed(3)) + " from the right (a corner).");
  }
  // integrals and area
  const range = s => { const r = /\bfrom\s+(-?[\d./π\spi]+?)\s+to\s+(-?[\d./π\spi]+)$/.exec(s) || /\bon\s*\[\s*(-?[^,\]]+?)\s*,\s*(-?[^\]]+?)\s*\]$/.exec(s); return r ? [pcVal(r[1].trim()), pcVal(r[2].trim())] : null; };
  if((m = /^(?:the )?(?:definite )?(?:integral|antiderivative|anti-derivative) of (.+?)(?:\s+dx)?(\s+(?:from|on)\s+.+)?$/.exec(q))){
    const t = fx(m[1].replace(/\s+dx$/, "")) || (/^[\d.]+$/.test(m[1]) ? CN(+m[1]) : null); if(!t) return null;
    if(m[2]){ const r = range(m[2].trim()); if(!r || r.includes(null)) return null; return out(cSnap(cSimpson(v => at(t, v), r[0], r[1]))); }
    const F = cInt(cSimp(t)); return F ? out(cStr(F) + " + C") : null;
  }
  if((m = /^(?:the )?area (?:under|below|beneath) (?:the curve )?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$/.exec(q))){
    const t = fx(m[1]), r = range(m[2]); if(!t || !r || r.includes(null)) return null; return out(cSnap(cSimpson(v => Math.abs(at(t, v)), r[0], r[1])));
  }
  if((m = /^(?:the )?area between (?:y\s*=\s*)?(.+?) and (?:y\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$/.exec(q))){
    const a = fx(m[1]), b = fx(m[2]), r = range(m[3]); if(!a || !b || !r || r.includes(null)) return null; return out(cSnap(cSimpson(v => Math.abs(at(a, v) - at(b, v)), r[0], r[1])));
  }
  if((m = /^(?:the )?average value of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s+((?:from|on)\s+.+)$/.exec(q))){
    const t = fx(m[1]), r = range(m[2]); if(!t || !r || r.includes(null) || r[0] === r[1]) return null; return out(cSnap(cSimpson(v => at(t, v), r[0], r[1]) / (r[1] - r[0])));
  }
  // motion: s(t) to velocity and acceleration
  if((m = /\b(?:position|height|displacement)\b.*?\b[sh]\(t\)\s*=\s*(.+?),?\s+(?:what is |find )?(?:its |the )?(velocity|speed|acceleration)\b.*?\bt\s*=\s*([\d./]+)/.exec(q))){
    const t = fx(m[1].replace(/t/g, "x")); if(!t) return null; let d = cSimp(cD(t)); if(m[2] === "acceleration") d = cSimp(cD(d));
    const v = at(d, +m[3]); return out(cSnap(m[2] === "speed" ? Math.abs(v) : v));
  }
  // related rates for circles, squares, spheres and cubes
  if(/\bhow fast\b|\brate\b/.test(q) && (m = /\b(radius|side|edge)\b.*?\b(?:grows|increases|expands|is increasing|changes)\s+(?:at|by)\s+([\d.]+)\s*([a-z]+)?(?:\/|\s+per\s+)([a-z]+)/.exec(q))){
    const rate = +m[2], unit = m[3] || "units", tu = m[4], val = +((/\b(?:r|s)\s*=\s*([\d.]+)|\b(?:radius|side|edge) is ([\d.]+)/.exec(q) || []).slice(1).find(Boolean));
    if(!isFinite(val)) return null;
    const circle = /\bcircle\b/.test(q), sphere = /\bsphere\b|\bballoon\b/.test(q), cube = /\bcube\b/.test(q), square = /\bsquare\b/.test(q);
    if(circle && /\barea\b/.test(q)) return out(pcFrac(2 * val * rate) + "π ≈ " + pcNum(+(2 * Math.PI * val * rate).toFixed(2)) + " " + unit + "²/" + tu);
    if(circle && /\bcircumference\b/.test(q)) return out(pcFrac(2 * rate) + "π ≈ " + pcNum(+(2 * Math.PI * rate).toFixed(2)) + " " + unit + "/" + tu);
    if(sphere && /\bvolume\b/.test(q)) return out(pcFrac(4 * val * val * rate) + "π ≈ " + pcNum(+(4 * Math.PI * val * val * rate).toFixed(2)) + " " + unit + "³/" + tu);
    if(cube && /\bvolume\b/.test(q)) return out(pcNum(3 * val * val * rate) + " " + unit + "³/" + tu);
    if(square && /\barea\b/.test(q)) return out(pcNum(2 * val * rate) + " " + unit + "²/" + tu);
    if(square && /\bperimeter\b/.test(q)) return out(pcNum(4 * rate) + " " + unit + "/" + tu);
  }
  return null;
}
// --- Statistics 12, offline ---
// Quartiles and outliers, the normal model (z tables both ways), binomial probability, expected value, correlation
// and least squares, confidence intervals and sample size, conditional probability, and the words of inference and
// sampling. precalc() asks it after calc12(); null means "not mine". Graded by COURSE=stats12 node test/exam-course.js.
// Mirrored in kmp/shared/.../Statistics12.kt.
// The standard normal CDF (Abramowitz and Stegun 7.1.26, good to about 1e-7) and its inverse by bisection.
function sPhi(z){ const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2); return z >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
function sInv(p){ let lo = -10, hi = 10; for(let i = 0; i < 100; i++){ const mid = (lo + hi) / 2; sPhi(mid) < p ? lo = mid : hi = mid; } return (lo + hi) / 2; }
const sMedian = s => s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
// Q1 and Q3 as the medians of the lower and upper halves, leaving out the middle value when there is one.
const sQuart = s => { const h = Math.floor(s.length / 2); return [sMedian(s.slice(0, h)), sMedian(s.slice(s.length - h))]; };
const S_Z = {80:1.282, 90:1.645, 95:1.96, 98:2.326, 99:2.576};
const S_FACTS = [
  [/^(?:what is )?(?:a )?type (?:i|1) error$/, "Rejecting the null hypothesis when it is actually true (a false positive). Its chance is the significance level α."],
  [/^(?:what is )?(?:a )?type (?:ii|2) error$/, "Failing to reject the null hypothesis when it is actually false (a false negative). Its chance is β."],
  [/^(?:what is )?(?:a |the )?p-?value$/, "The probability, if the null hypothesis were true, of getting a result at least as extreme as the one observed. Small p-values are evidence against the null."],
  [/^(?:what is )?(?:the )?null hypothesis$/, "H₀, the claim of no effect or no difference (for example, the two means are equal). A test looks for evidence against it."],
  [/^(?:what is )?(?:the )?alternative hypothesis$/, "H₁ or Hₐ, the claim that there is an effect or a difference (not equal, greater or less). It is what the test hopes to support."],
  [/^(?:what is )?(?:a )?simple random sample$|^(?:what is )?simple random sampling$/, "Every group of n people in the population has the same chance of being the sample, as if names were drawn from a hat."],
  [/^(?:what is )?(?:a )?stratified (?:random )?sampl(?:e|ing)$/, "The population is split into groups (strata) that share a trait, and a random sample is taken from each group."],
  [/^(?:what is )?(?:a )?cluster sampl(?:e|ing)$/, "The population is split into groups (clusters), some clusters are chosen at random, and everyone in the chosen clusters is sampled."],
  [/^(?:what is )?(?:a )?systematic sampl(?:e|ing)$/, "Choose a random start, then take every kth member of the list (for example every 10th name)."],
  [/^(?:what is )?(?:a )?convenience sampl(?:e|ing)$/, "Sampling whoever is easiest to reach, such as people nearby. It is quick but rarely represents the population."],
  [/^(?:what is )?(?:a )?voluntary response (?:sample|bias)$/, "People choose themselves to respond, so those with strong opinions are overrepresented."],
  [/^(?:what is )?(?:sampling |selection )?bias$|^(?:what is )?sampling bias$/, "A sampling method that systematically favours some outcomes, so the sample does not represent the population."],
];
function stats12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"}), d4 = v => pcNum(+v.toFixed(4));
  const nums = s => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  for(const [re, body] of S_FACTS) if(re.test(q)) return out(body);
  let m;
  // summaries and outliers
  if((m = /^(?:the )?(five[- ]number summary|interquartile range|iqr|quartiles|first quartile|third quartile|q1|q3) (?:of|for) (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$/.exec(q))){
    const s = nums(m[2]).sort((a, b) => a - b), [q1, q3] = sQuart(s);
    if(/^five/.test(m[1])) return out("Minimum " + pcNum(s[0]) + ", Q1 " + pcNum(q1) + ", median " + pcNum(sMedian(s)) + ", Q3 " + pcNum(q3) + ", maximum " + pcNum(s[s.length - 1]) + ".");
    if(/^(interquartile|iqr)/.test(m[1])) return out(pcNum(q3 - q1));
    if(m[1] === "quartiles") return out("Q1 = " + pcNum(q1) + ", Q3 = " + pcNum(q3));
    return out(pcNum(/^(first|q1)/.test(m[1]) ? q1 : q3));
  }
  if((m = /^is (-?[\d.]+) an outlier in (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$/.exec(q))){
    const v = +m[1], s = nums(m[2]).sort((a, b) => a - b), [q1, q3] = sQuart(s), k = 1.5 * (q3 - q1), lo = q1 - k, hi = q3 + k;
    return out((v < lo || v > hi ? "Yes. " : "No. ") + "The fences are Q1 - 1.5·IQR = " + pcNum(lo) + " and Q3 + 1.5·IQR = " + pcNum(hi) + ".");
  }
  if((m = /^(?:the )?(sample|population) (standard deviation|variance) of (?:the data )?(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)$/.exec(q))){
    const n = nums(m[3]), mean = n.reduce((s, v) => s + v, 0) / n.length, ss = n.reduce((s, v) => s + (v - mean) ** 2, 0), v = ss / (n.length - (m[1] === "sample" ? 1 : 0));
    return out(d4(m[2] === "variance" ? v : Math.sqrt(v)));
  }
  // the normal model
  const zv = s => +s;
  if((m = /\bprobability (?:that )?z (?:is )?(less than|below|under|<|greater than|more than|above|over|>)\s*(-?[\d.]+)$/.exec(q))){ const p = sPhi(zv(m[2])); return out(d4(/less|below|under|</.test(m[1]) ? p : 1 - p)); }
  if((m = /\bprobability (?:that )?z (?:is )?between (-?[\d.]+) and (-?[\d.]+)$/.exec(q)) || (m = /\bprobability (?:that )?(-?[\d.]+)\s*<\s*z\s*<\s*(-?[\d.]+)$/.exec(q))) return out(d4(sPhi(+m[2]) - sPhi(+m[1])));
  if((m = /\bnormal\b.*?\bmean (?:of |is |=\s*)?(-?[\d.]+).*?\bstandard deviation (?:of |is |=\s*)?([\d.]+).*?\b(taller|greater|more|above|over|higher|heavier|longer|below|less|under|shorter|lower|lighter)(?: than)? ([\d.]+)/.exec(q))){
    const z = (+m[4] - +m[1]) / +m[2], p = /below|less|under|shorter|lower|lighter/.test(m[3]) ? sPhi(z) : 1 - sPhi(z);
    return out(pcNum(+(p * 100).toFixed(2)) + "% (z = " + pcNum(+z.toFixed(2)) + ")");
  }
  if((m = /\bz-?score\b.*?\b(\d+(?:\.\d+)?)(?:st|nd|rd|th) percentile\b|\b(\d+(?:\.\d+)?)(?:st|nd|rd|th) percentile\b.*?\bz-?score\b/.exec(q))) return out("z = " + d4(sInv(+(m[1] || m[2]) / 100)));
  if((m = /\bpercentile (?:rank )?(?:of |for )?(?:a score |a value )?(?:with )?z\s*=\s*(-?[\d.]+)/.exec(q))) return out(pcNum(+(sPhi(+m[1]) * 100).toFixed(2)) + "th percentile");
  // binomial, at least one, expected value
  if((m = /\bexactly (\d+) (successes|heads|tails|sixes|[a-z]+s?) in (\d+) (?:trials|(?:coin )?flips|tosses|rolls|tries)\b/.exec(q))){
    const k = +m[1], n = +m[3], coin = /heads|tails/.test(m[2]) || /\bcoin|flips?\b/.test(q), die = /sixes|\brolls?\b|\bdie\b/.test(q) && !coin;
    const p = (/\bp\s*=\s*([\d.]+)/.exec(q) || [])[1] !== undefined ? +/\bp\s*=\s*([\d.]+)/.exec(q)[1] : coin ? 0.5 : die ? 1 / 6 : null; if(p === null) return null;
    if(coin) return out(pcRatio(pcChoose(n, k), 2 ** n) + (2 ** n / pcGcd(pcChoose(n, k), 2 ** n) <= 12 ? " = " + d4(pcChoose(n, k) / 2 ** n) : ""));
    return out(d4(pcChoose(n, k) * p ** k * (1 - p) ** (n - k)));
  }
  if((m = /\bprobability of at least one (six|head|tail|[a-z]+) in (\d+) (?:coin |die )?(rolls|flips|tosses|tries|trials)\b/.exec(q))){
    const n = +m[2], coin = /head|tail/.test(m[1]) || /flips|tosses/.test(m[3]);
    return out(coin ? pcRatio(2 ** n - 1, 2 ** n) + " = " + d4(1 - 0.5 ** n) : d4(1 - (5 / 6) ** n));
  }
  if((m = /\b(mean|expected value|standard deviation|variance) of (?:a |the )?binomial(?: distribution| random variable)? with n\s*=\s*(\d+) and p\s*=\s*([\d.]+)/.exec(q))){
    const n = +m[2], p = +m[3]; return out(d4(m[1] === "standard deviation" ? Math.sqrt(n * p * (1 - p)) : m[1] === "variance" ? n * p * (1 - p) : n * p));
  }
  if((m = /\bexpected value\b.*?\bwin \$?([\d.]+) with (?:a )?probability (?:of )?([\d./]+)\b.*?\blose \$?([\d.]+) with (?:a )?probability (?:of )?([\d./]+)/.exec(q))){
    const v = +m[1] * pcVal(m[2]) - +m[3] * pcVal(m[4]); return out((v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2) + " per game");
  }
  // correlation and least squares
  if((m = /\bx\s*=\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)\s*,?\s*and\s*y\s*=\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)/.exec(q))){
    const x = nums(m[1]), y = nums(m[2]); if(x.length !== y.length || x.length < 2) return null;
    const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
    const sxy = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0), sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0), syy = y.reduce((s, v) => s + (v - my) ** 2, 0);
    if(/\bcorrelation\b|\br\b/.test(q)) return out("r = " + d4(sxy / Math.sqrt(sxx * syy)));
    if(/\b(best fit|regression|least squares|trend line)\b/.test(q)){ const k = sxy / sxx, b = my - k * mx, ks = d4(k);
      return out("y = " + (ks === "0" ? d4(b) : (ks === "1" ? "" : ks === "-1" ? "-" : ks) + "x" + (Math.abs(b) < 1e-9 ? "" : b > 0 ? " + " + d4(b) : " - " + d4(-b)))); }
  }
  if((m = /^what does (?:an? )?r(?: value)?(?: of)?\s*=?\s*(-?[\d.]+) (?:mean|tell you|show)$/.exec(q))){
    const r = +m[1], a = Math.abs(r), str = a >= 0.7 ? "strong" : a >= 0.3 ? "moderate" : a > 0 ? "weak" : null;
    return out(!str ? "No linear relationship." : "A " + str + " " + (r > 0 ? "positive" : "negative") + " linear relationship: as x increases, y tends to " + (r > 0 ? "increase" : "decrease") + ".");
  }
  if((m = /\bcoefficient of determination\b.*?\br\s*=\s*(-?[\d.]+)/.exec(q))) return out("r² = " + d4((+m[1]) ** 2));
  // intervals, margins and sample size
  const conf = +((/\b(80|90|95|98|99)\s*%/.exec(q) || [])[1] || 95), zs = S_Z[conf];
  if((m = /\bconfidence interval for (?:a |the )?proportion (?:of |p\s*=\s*)?([\d.]+)\b.*?\bn\s*=\s*(\d+)/.exec(q))){
    const p = +m[1], e = zs * Math.sqrt(p * (1 - p) / +m[2]); return out(pcNum(+(p - e).toFixed(3)) + " to " + pcNum(+(p + e).toFixed(3)) + " (" + pcNum(p) + " ± " + pcNum(+e.toFixed(3)) + ")");
  }
  if((m = /\bsample size\b.*?\bmargin of error (?:of )?([\d.]+)\b/.exec(q))){ const p = +((/\bp\s*=\s*([\d.]+)/.exec(q) || [])[1] || 0.5); return out(String(Math.ceil(+((zs / +m[1]) ** 2 * p * (1 - p)).toFixed(6)))); }
  if((m = /\bmargin of error\b.*?\bp\s*=\s*([\d.]+)\b.*?\bn\s*=\s*(\d+)/.exec(q))) return out(pcNum(+(zs * Math.sqrt(+m[1] * (1 - +m[1]) / +m[2])).toFixed(4)));
  if((m = /\bmean of (?:a |the )?sample is (-?[\d.]+) with (?:a )?standard error (?:of )?([\d.]+)/.exec(q)) && /\bconfidence interval\b/.test(q)){ const e = zs * +m[2]; return out(pcNum(+(+m[1] - e).toFixed(2)) + " to " + pcNum(+(+m[1] + e).toFixed(2))); }
  if((m = /\bstandard error\b.*?\bs\s*=\s*([\d.]+)\b.*?\bn\s*=\s*(\d+)/.exec(q))) return out(d4(+m[1] / Math.sqrt(+m[2])));
  // conditional probability and independence
  const P = re => { const t = re.exec(q); return t ? pcVal(t[1]) : null; };
  if(/\bgiven\b/.test(q) && /p\(a and b\)|p\(a ∩ b\)/.test(q)){ const ab = P(/p\(a (?:and|∩) b\)\s*=\s*([\d./]+)/), b = P(/p\(b\)\s*=\s*([\d./]+)/); if(ab !== null && b) return out(d4(ab / b)); }
  if(/^(?:are|is) (?:events )?a and b independent\b/.test(q)){
    const a = P(/p\(a\)\s*=\s*([\d./]+)/), b = P(/p\(b\)\s*=\s*([\d./]+)/), ab = P(/p\(a (?:and|∩) b\)\s*=\s*([\d./]+)/);
    if(a !== null && b !== null && ab !== null) return out((Math.abs(a * b - ab) < 1e-9 ? "Yes: " : "No: ") + "P(A)·P(B) = " + d4(a * b) + (Math.abs(a * b - ab) < 1e-9 ? ", which equals" : ", but") + " P(A and B) = " + d4(ab) + ".");
  }
  if((m = /^how many ways (?:are there )?to (?:choose|select|pick) (\d+) (?:\w+ )?(?:from|out of) (\d+)/.exec(q))) return out(String(pcChoose(+m[2], +m[1])));
  if(/\bmean is (greater|more|larger|bigger|less|smaller) than the median\b/.test(q)) return out(/greater|more|larger|bigger/.test(q) ? "Skewed right (positively skewed): a long tail of high values pulls the mean up." : "Skewed left (negatively skewed): a long tail of low values pulls the mean down.");
  if(/\bbias\b/.test(q) && /\bonly (?:the )?(?:people|those)\b.*\b(care|choose|want|volunteer)\b/.test(q)) return out("Voluntary response bias: people who choose to respond tend to hold strong opinions.");
  if((m = /^what does a p-?value of ([\d.]+) mean$/.exec(q))){ const p = +m[1]; return out("If the null hypothesis were true, there would be a " + pcNum(+(p * 100).toFixed(2)) + "% chance of a result at least this extreme. " + (p <= 0.01 ? "That is strong evidence against the null." : p <= 0.05 ? "That is evidence against the null at the 5% level." : "That is not strong evidence against the null.")); }
  return null;
}
// --- Workplace Mathematics 10, offline ---
// Perimeter, area and volume with units in the question, mixed units, sales tax, discounts and tips, unit price and
// the better buy, exchange rates, overtime and percent deductions, ratios, rates, and the rise over a run.
// precalc() asks it after stats12(); null means "not mine". Graded by COURSE=work10 node test/exam-course.js.
// Mirrored in kmp/shared/.../Workplace10.kt.
const W_U = "\\s*(?:mm|cm|m|km|in|inches|ft|feet|foot|yd|yards?)?\\s*";
// Two units that are often said together, and how many of the small one make the big one.
const W_MIXED = [["(?:feet|foot|ft)", "(?:inches|inch|in)", 12, "inches"], ["(?:yards?|yd)", "(?:feet|foot|ft)", 3, "feet"], ["(?:hours?|hrs?|h)", "(?:minutes?|mins?)", 60, "minutes"], ["(?:minutes?|mins?)", "(?:seconds?|secs?|s)", 60, "seconds"], ["(?:pounds?|lbs?)", "(?:ounces?|oz)", 16, "ounces"], ["(?:metres?|meters?|m)", "(?:centimetres?|centimeters?|cm)", 100, "cm"]];
function work10(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"}), money = v => "$" + v.toFixed(2), n = s => +String(s).replace(/,/g, "");
  let m;
  // shapes, with or without units after each number
  const two = new RegExp("([\\d.]+)" + W_U + "(?:by|x|×)\\s*([\\d.]+)" + W_U), three = new RegExp("([\\d.]+)" + W_U + "(?:by|x|×)\\s*([\\d.]+)" + W_U + "(?:by|x|×)\\s*([\\d.]+)");
  if((m = /^(?:the )?(perimeter|area) of (?:a |the )?(rectangle|rectangular [a-z]+|room|yard|garden|field|lot|square)\b(.*)$/.exec(q))){
    const d = two.exec(m[3]), side = /\bside (?:of |length )?([\d.]+)/.exec(m[3]) || (m[2] === "square" ? /([\d.]+)/.exec(m[3]) : null);
    const [l, w] = d ? [+d[1], +d[2]] : side ? [+side[1], +side[1]] : [null, null]; if(l === null) return null;
    return out(pcNum(m[1] === "area" ? l * w : 2 * (l + w)));
  }
  if((m = /^(?:the )?area of (?:a |the )?triangle\b.*?\bbase (?:of |is )?([\d.]+).*?\bheight (?:of |is )?([\d.]+)/.exec(q))) return out(pcNum(+m[1] * +m[2] / 2));
  if((m = /^(?:the )?area of (?:a |the )?trapezoid\b.*?\bbases? (?:of )?([\d.]+)\s*(?:and|,)\s*([\d.]+).*?\bheight (?:of |is )?([\d.]+)/.exec(q))) return out(pcNum((+m[1] + +m[2]) * +m[3] / 2));
  if((m = /^(?:the )?(circumference|perimeter|area) of (?:a |the )?circle\b.*?\b(radius|diameter) (?:of |is )?([\d.]+)/.exec(q))){
    const r = m[2] === "radius" ? +m[3] : +m[3] / 2, k = m[1] === "area" ? r * r : 2 * r;
    return out(pcFrac(k) + "π ≈ " + pcNum(+(k * Math.PI).toFixed(2)));
  }
  if((m = /^(?:the )?volume of (?:a |the )?(?:rectangular prism|box|room|tank|container)\b(.*)$/.exec(q)) && (m = three.exec(m[1]))) return out(pcNum(+m[1] * +m[2] * +m[3]));
  if((m = /^how many square (feet|metres|meters|yards|inches|cm|m|ft)\b.*?\b(?:in|is|for) (?:a |the )?[a-z ]*?([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)/.exec(q))) return out(pcNum(+m[2] * +m[3]) + " square " + m[1]);
  if((m = /^how many ([a-z]+)\b.*?\b([\d.]+) square [a-z]+ (?:per|each|a|for each) [a-z]+\b.*?\bcover ([\d.]+)/.exec(q))) return out(Math.ceil(+(+m[3] / +m[2]).toFixed(6)) + " " + m[1] + " (" + pcNum(+(+m[3] / +m[2]).toFixed(2)) + ", rounded up)");
  if((m = /\bcost to fence\b.*?([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)\s*[a-z]*\b.*?\$\s*([\d.]+) (?:per|a|for each) ([a-z]+)/.exec(q))){ const p = 2 * (+m[1] + +m[2]); return out(money(p * +m[3]) + " for " + pcNum(p) + " " + m[4] + "s of fence"); }
  // mixed units: 3 feet 6 inches, 2 hours 45 minutes
  for(const [big, small, k, name] of W_MIXED){
    if((m = new RegExp("^(?:convert )?([\\d.]+)\\s*" + big + "\\s*(?:and\\s*)?([\\d.]+)\\s*" + small + "\\s+(?:to|in|into)\\s+" + small + "$").exec(q))) return out(pcNum(+m[1] * k + +m[2]) + " " + name);
  }
  // money: taxes, discounts, tips, unit prices, exchange
  if((m = /\$\s*([\d,.]+)\b.*?\bwith\b(.*)$/.exec(q)) && /\b(gst|pst|hst|tax)\b/.test(q) && /\b(total|cost|price|pay)\b/.test(q)){
    const rates = [...m[2].matchAll(/([\d.]+)\s*%/g)].map(t => +t[1]); if(!rates.length) return null;
    const p = n(m[1]), tax = p * rates.reduce((s, r) => s + r, 0) / 100; return out(money(p + tax) + " (" + money(tax) + " in tax)");
  }
  if((m = /\b(?:price|cost)\b.*?\b([\d.]+)\s*% (?:discount|off)\b.*?\$\s*([\d,.]+)/.exec(q)) || (m = /\$\s*([\d,.]+)\b.*?\b([\d.]+)\s*% (?:discount|off)\b/.exec(q)) && (m = [m[0], m[2], m[1]])){
    const d = +m[1], p = n(m[2]); return out(money(p * (1 - d / 100)) + " (" + money(p * d / 100) + " off)");
  }
  if((m = /\b([\d.]+)\s*% tip (?:on|for) (?:a |the )?\$\s*([\d,.]+)/.exec(q))){ const t = n(m[2]) * +m[1] / 100; return out(money(t) + " tip, " + money(n(m[2]) + t) + " in all"); }
  if((m = /\bunit (?:price|cost|rate) (?:of|for) (\d+(?:\.\d+)?)\s*([a-z]+)? (?:for|at|cost(?:s|ing)?) \$\s*([\d,.]+)/.exec(q))){ const u = n(m[3]) / +m[1]; return out(money(u) + " per " + (m[2] ? m[2].replace(/(es|s)$/, "").replace(/^egg$/, "egg") : "item")); }
  if((m = /\bbetter (?:buy|deal|value)\b.*?([\d.]+)\s*([a-z]+) for \$\s*([\d.]+)\s*(?:,|or)\s*(?:or\s*)?([\d.]+)\s*([a-z]+) for \$\s*([\d.]+)/.exec(q))){
    const scale = u => ({kg:1000, g:1, l:1000, ml:1}[u] || 1), a = +m[3] / (+m[1] * scale(m[2])), b = +m[6] / (+m[4] * scale(m[5]));
    const pick = a <= b ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]], unit = /^(kg|g)$/.test(m[2]) ? "g" : /^(l|ml)$/.test(m[2]) ? "mL" : m[2];
    return out(pick[0] + " " + (pick[1] === "l" ? "L" : pick[1]) + " for $" + pick[2] + " is the better buy: $" + (Math.min(a, b)).toFixed(4) + " per " + unit + " against $" + (Math.max(a, b)).toFixed(4) + ".");
  }
  if((m = /^(?:convert )?\$?\s*([\d,.]+) ([a-z]+(?: [a-z]+)?) (?:dollars? )?(?:to|into) ([a-z]+(?: [a-z]+)?) (?:at|with a rate of|at a rate of) ([\d.]+)$/.exec(q))) return out((n(m[1]) * +m[4]).toFixed(2) + " " + m[3]);
  // pay: overtime said after the hours, deductions as a percent
  if((m = /\b([\d.]+)\s*hours?\b.*?\b(time and a half|double time)\b.*?\$\s*([\d.]+)/.exec(q))) return out(money(+m[1] * +m[3] * (/half/.test(m[2]) ? 1.5 : 2)));
  if((m = /\bnet pay\b.*?\bgross(?: pay)? (?:is |of |=\s*)?\$?\s*([\d,.]+)\b.*?\bdeductions? (?:are |is |of |total )?([\d.]+)\s*%/.exec(q))){ const g = n(m[1]); return out(money(g * (1 - +m[2] / 100)) + " (" + money(g * +m[2] / 100) + " deducted)"); }
  // ratios and rates
  if((m = /^(?:simplify|reduce) (?:the )?ratio ([\d.]+(?:\s*:\s*[\d.]+)+)$/.exec(q))){
    const p = m[1].split(/\s*:\s*/), k = 10 ** Math.max(...p.map(v => (v.split(".")[1] || "").length)), v = p.map(x => Math.round(+x * k)), g = v.reduce(pcGcd);
    return out(v.map(x => x / g).join(":"));
  }
  if((m = /\bif (\d+(?:\.\d+)?) [a-z ]+? cost(?:s)? \$\s*([\d,.]+),? (?:how much|what) (?:do|does|would|will) (\d+(?:\.\d+)?)\b/.exec(q))) return out(money(n(m[2]) / +m[1] * +m[3]));
  if((m = /\btravels? ([\d.]+)\s*(km|miles|m)\b.*?\bin ([\d.]+)\s*(hours?|h|minutes?|min)\b/.exec(q)) && /\b(speed|fast|rate|average)\b/.test(q)){ const t = /^min/.test(m[4]) ? +m[3] / 60 : +m[3]; return out(pcNum(+(+m[1] / t).toFixed(2)) + " " + (m[2] === "miles" ? "mph" : m[2] + "/h")); }
  if((m = /^how long (?:does it take )?to (?:drive|travel|go|ride|walk|fly|cycle) ([\d.]+)\s*(km|miles|m)\b.*?\bat ([\d.]+)\s*(?:km\/h|kph|mph|km per hour|miles per hour)/.exec(q))){
    const t = +m[1] / +m[3], h = Math.floor(t + 1e-9), min = Math.round((t - h) * 60);
    return out(pcNum(+t.toFixed(2)) + " hours" + (min ? " (" + h + " h " + min + " min)" : ""));
  }
  if((m = /\brises? ([\d.]+)\s*[a-z]*\s*(?:over|for|in) (?:a (?:run|horizontal distance|distance) of )?([\d.]+)/.exec(q))){
    const r = +m[1] / +m[2];
    if(/\bangle\b/.test(q)) return out(pcNum(+(Math.atan(r) * 180 / Math.PI).toFixed(2)) + "°");
    if(/\bgrade\b/.test(q)) return out(pcNum(+(r * 100).toFixed(2)) + "%");
    if(/\b(slope|pitch)\b/.test(q)) return out(pcFrac(r) + (pcFrac(r).includes("/") ? " ≈ " + pcNum(+r.toFixed(4)) : ""));
  }
  return null;
}
// --- Apprenticeship and Workplace Mathematics 12, offline ---
// Mixed numbers and inch fractions, tolerance and precision, board feet and concrete, squaring a corner, gears,
// Ohm's law, rates of change and linear cost models, composite areas, budgets, studs, roof pitch, paint, and marbles.
// precalc() asks it after stats12(); null means "not mine". Graded by COURSE=aw12 node test/exam-course.js.
// Mirrored in kmp/shared/.../Apprenticeship12.kt.
// A number as [numerator, denominator]: "2 1/4" is [9, 4], "5/16" is [5, 16], "3" is [3, 1].
function awFrac(s){
  let m = /^(-?)(\d+)\s+(\d+)\/(\d+)$/.exec(s.trim()); if(m) return [(m[1] ? -1 : 1) * (+m[2] * +m[4] + +m[3]), +m[4]];
  m = /^(-?\d+)\/(\d+)$/.exec(s.trim()); if(m) return [+m[1], +m[2]];
  m = /^-?\d+$/.exec(s.trim()); return m ? [+m[0], 1] : null;
}
// [n, d] as "3 7/8", or "7/8", or "3".
function awMixed([n, d]){
  const g = pcGcd(n, d) || 1; n /= g; d /= g; if(d < 0){ n = -n; d = -d; }
  if(d === 1) return String(n); const w = Math.trunc(n / d), r = Math.abs(n % d);
  return w === 0 ? n + "/" + d : w + " " + r + "/" + d;
}
function aw12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"}), money = v => "$" + v.toFixed(2), num = s => +String(s).replace(/,/g, "");
  const F = "(-?\\d+\\s+\\d+\\/\\d+|-?\\d+\\/\\d+|-?\\d+)";
  let m;
  // mixed numbers: 2 1/4 + 1 5/8
  if((m = new RegExp("^(?:what is |evaluate |simplify |add |subtract )?" + F + "\\s*([+\\-×*÷]|plus|minus|times|divided by)\\s*" + F + "$").exec(q)) && / \d+\/\d+|\d\/\d/.test(q) && !/^-?\d+\/\d+\s*[+\-*×÷]\s*-?\d+\/\d+$/.test(q.replace(/^(?:what is |evaluate |simplify )/, ""))){
    const a = awFrac(m[1]), b = awFrac(m[3]); if(!a || !b) return null; const op = m[2];
    const r = /^(\+|plus)$/.test(op) ? [a[0] * b[1] + b[0] * a[1], a[1] * b[1]] : /^(-|minus)$/.test(op) ? [a[0] * b[1] - b[0] * a[1], a[1] * b[1]] : /^(\*|×|times)$/.test(op) ? [a[0] * b[0], a[1] * b[1]] : [a[0] * b[1], a[1] * b[0]];
    const g = pcGcd(r[0], r[1]) || 1, n = r[0] / g, d = r[1] / g;
    return out(awMixed(r) + (Math.abs(n) > Math.abs(d) && d !== 1 ? " (" + n + "/" + d + ")" : "") + (d !== 1 ? " = " + pcNum(n / d) : ""));
  }
  if((m = /^(?:convert |write )?(\d*\.?\d+)\s*(?:inches|inch|in|")?\s+(?:to|as) a fraction(?: of an inch)?$/.exec(q))){
    const v = +m[1]; for(const d of [2, 4, 8, 16, 32, 64]){ const k = Math.round(v * d); if(Math.abs(k / d - v) < 1e-9) return out(awMixed([k, d])); }
    return out(pcFrac(v));
  }
  if((m = new RegExp("^(?:convert )?" + F + "\\s*(?:inches|inch|in|\")\\s+(?:to|in|into)\\s+(mm|millimetres?|millimeters?|cm|centimetres?|centimeters?)$").exec(q))){
    const f = awFrac(m[1]); if(!f) return null; const mm = f[0] / f[1] * 25.4; return out(/^c/.test(m[2]) ? pcNum(+(mm / 10).toFixed(4)) + " cm" : pcNum(+mm.toFixed(4)) + " mm");
  }
  // tolerance and precision
  if((m = /\btolerance\b.*?([\d.]+)\s*([a-z"]*)\s*(?:±|\+\/-|plus or minus)\s*([\d.]+)/.exec(q))){ const v = +m[1], t = +m[3], u = m[2] ? " " + m[2] : ""; return out(pcNum(+(v - t).toFixed(6)) + u + " to " + pcNum(+(v + t).toFixed(6)) + u); }
  if((m = /\bprecision of (?:a |the )?(?:measurement|reading|value) (?:of )?([\d.]+)\s*([a-z]*)/.exec(q))){ const d = (m[1].split(".")[1] || "").length; return out("±" + (d ? (10 ** -d).toFixed(d) : "1") + (m[2] ? " " + m[2] : "") + ": the smallest unit it was measured to."); }
  if(/^(?:what is )?(?:the difference between )?accuracy (?:vs\.?|versus|and) precision$|^(?:what is )?accuracy in measurement$|^(?:what is )?accuracy$/.test(q)) return out("Accuracy is how close a measurement is to the true value. Precision is how fine the measurement is, and how closely repeated measurements agree.");
  // lumber, concrete, corners, studs, roofs, paint
  if((m = /\bboard feet\b.*?([\d.]+)\s*(?:inches|inch|in|")?\s*(?:by|x|×)\s*([\d.]+)\s*(?:inches|inch|in|")?\s*(?:by|x|×)\s*([\d.]+)\s*(?:feet|foot|ft|')/.exec(q))) return out(pcNum(+(+m[1] * +m[2] * +m[3] / 12).toFixed(3)) + " board feet");
  if((m = /\bcubic yards\b.*?([\d.]+)\s*(?:ft|feet|')\s*(?:by|x|×)\s*([\d.]+)\s*(?:ft|feet|')\s*(?:by|x|×)\s*([\d.]+)\s*(inches|inch|in|"|ft|feet)/.exec(q))){
    const depth = /^(in|")/.test(m[4]) ? +m[3] / 12 : +m[3], v = +m[1] * +m[2] * depth / 27; return out(pcNum(+v.toFixed(2)) + " cubic yards");
  }
  if((m = /\bsquare\b.*?\bsides? (?:of )?([\d.]+)\s*[a-z']*\s*and\s*([\d.]+)\s*[a-z']*\s*and (?:a )?diagonal (?:of )?([\d.]+)/.exec(q))){
    const a = +m[1], b = +m[2], c = +m[3], want = Math.hypot(a, b);
    return out(Math.abs(want - c) < 0.005 * want ? "Yes: " + pcNum(a) + "² + " + pcNum(b) + "² = " + pcNum(c) + "²." : "No: the diagonal should be " + pcNum(+want.toFixed(3)) + ", not " + pcNum(c) + ".");
  }
  if((m = /^(?:the )?diagonal of (?:a |the )?([\d.]+)\s*[a-z']*\s*(?:by|x|×)\s*([\d.]+)/.exec(q))) return out(pcNum(+Math.hypot(+m[1], +m[2]).toFixed(3)));
  if((m = /\bstuds?\b.*?\b([\d.]+)\s*(?:ft|feet|foot|')\s*wall\b.*?\b([\d.]+)\s*(?:inch|in|")\s*(?:spacing|on cent(?:er|re)|apart|o\.?c\.?)/.exec(q))) return out(String(Math.floor(+m[1] * 12 / +m[2] + 1e-9) + 1) + " studs");
  if((m = /\b([\d.]+)\s*(?:in|:)\s*12 pitch\b/.exec(q)) && /\bangle\b/.test(q)) return out(pcNum(+(Math.atan(+m[1] / 12) * 180 / Math.PI).toFixed(2)) + "°");
  if((m = /\bhow many (litres|liters|gallons|cans)\b.*?\bfor ([\d.]+) square [a-z]+\b.*?\bcovers? ([\d.]+) square/.exec(q))){ const k = +m[2] / +m[3]; return out(Math.ceil(+k.toFixed(6)) + " " + m[1] + (Number.isInteger(+k.toFixed(6)) ? "" : " (" + pcNum(+k.toFixed(2)) + ", rounded up)")); }
  // gears and Ohm's law
  if((m = /\bgear ratio\b.*?\bdriv(?:er|ing gear) has (\d+) teeth\b.*?\bdriven gear has (\d+) teeth/.exec(q))){ const a = +m[1], b = +m[2], g = pcGcd(a, b); return out(b / g + ":" + a / g + " (the driver turns " + pcNum(b / a) + " times for each turn of the driven gear)"); }
  if((m = /\b(\d+)[- ]tooth gear turns at ([\d.]+)\s*rpm\b.*?\b(\d+)[- ]tooth gear\b/.exec(q))) return out(pcNum(+(+m[2] * +m[1] / +m[3]).toFixed(3)) + " rpm");
  if(/\b(ohm|ohms|Ω|volts?|amps?|current|resistance|voltage)\b/.test(q) && (/\bohm'?s law\b/.test(q) || /\b(voltage|current|resistance)\b.*\b(if|with|when)\b/.test(q))){
    const val = re => { const t = re.exec(q); return t ? +t[1] : null; };
    const V = val(/\b(?:voltage (?:is |of )?)?([\d.]+)\s*(?:v|volts?)\b/), I = val(/\b(?:current (?:is |of )?)?([\d.]+)\s*(?:a|amps?|amperes?)\b/), R = val(/\b(?:resistance (?:is |of )?)?([\d.]+)\s*(?:ohms?|Ω)/);
    const ask = (/^(?:ohm'?s law )?(?:the )?(voltage|current|resistance)\b/.exec(q) || [])[1] || (V === null ? "voltage" : I === null ? "current" : "resistance");
    if(ask === "voltage" && I !== null && R !== null) return out(pcNum(+(I * R).toFixed(4)) + " V (V = IR)");
    if(ask === "current" && V !== null && R !== null) return out(pcNum(+(V / R).toFixed(4)) + " A (I = V/R)");
    if(ask === "resistance" && V !== null && I !== null) return out(pcNum(+(V / I).toFixed(4)) + " Ω (R = V/I)");
  }
  // rates of change and linear cost models
  if(/\brate of change\b/.test(q)){
    const pts = [...q.matchAll(/\$?([\d.]+)\s*([a-z]*)\s+at\s+([\d.]+)\s*([a-z]+)/g)];
    if(pts.length === 2){ const [a, b] = pts, r = (+b[1] - +a[1]) / (+b[3] - +a[3]), unit = /\$/.test(q) ? "$" : "", per = b[4].replace(/s$/, "");
      return out((r < 0 ? "-" : "") + unit + pcNum(+Math.abs(r).toFixed(4)) + (a[2] && !unit ? " " + (a[2] === "l" ? "L" : a[2]) : "") + " per " + per); }
  }
  if((m = /\bcharges? \$\s*([\d.]+)\s*(?:plus|and|\+)\s*\$\s*([\d.]+) (?:per|an|a|each) ([a-z]+)\b.*?\bfor ([\d.]+) ([a-z]+)/.exec(q))) return out(money(+m[1] + +m[2] * +m[4]));
  if((m = /\bequation\b.*?\$\s*([\d.]+)\b[^$]*?\bplus \$\s*([\d.]+) (?:per|an|a|each) ([a-z]+)/.exec(q))){ const v = {hour:"h", hr:"h", km:"d", kilometre:"d", kilometer:"d", mile:"d", day:"t", item:"n", person:"n"}[m[3]] || m[3][0]; return out("C = " + pcNum(+m[2]) + v + " + " + pcNum(+m[1]) + ", where " + v + " is the number of " + m[3] + "s"); }
  // composite areas and semicircles
  if((m = /\bsemicircle\b.*?\b(radius|diameter) (?:of |is )?([\d.]+)/.exec(q)) && /\barea\b/.test(q)){
    const r = m[1] === "radius" ? +m[2] : +m[2] / 2, half = Math.PI * r * r / 2, rect = /\brectangle\b/.test(q) ? /([\d.]+)\s*[a-z]*\s*(?:by|x|×)\s*([\d.]+)/.exec(q) : null;
    if(rect){ const base = +rect[1] * +rect[2], minus = /\b(minus|remove|cut out|without)\b/.test(q); return out(pcNum(+(minus ? base - half : base + half).toFixed(2))); }
    return out(pcNum(r * r / 2) + "π ≈ " + pcNum(+half.toFixed(2)));
  }
  // budgets
  if((m = /\bincome (?:of |is )?\$\s*([\d,.]+)/.exec(q)) && /\b(left|remaining|remains|leftover|left over)\b/.test(q)){
    const spent = [...q.slice(m.index + m[0].length).matchAll(/\$\s*([\d,.]+)/g)].reduce((s, t) => s + num(t[1]), 0); return out(money(num(m[1]) - spent) + " left");
  }
  if((m = /^what percent(?:age)? of (?:a |the )?\$\s*([\d,.]+)\s*[a-z ]*? is \$\s*([\d,.]+)/.exec(q))) return out(pcNum(+(num(m[2]) / num(m[1]) * 100).toFixed(2)) + "%");
  if((m = /\bscale\b.*?\b1\s*(inch|in|cm|mm)\s*=\s*([\d.]+)\s*(feet|ft|m|metres?|meters?|km|yards?)\b.*?\b([\d.]+)\s*(?:inch|in|cm|mm)\b/.exec(q))) return out(pcNum(+(+m[4] * +m[2]).toFixed(4)) + " " + m[3]);
  // marbles, polygons, right triangles, unit prices with "of"
  if((m = /\b(probability|odds(?: in favou?r)?|odds against|chance) (?:of )?(?:drawing|picking|choosing|pulling) (?:a |an )?([a-z]+) (?:marble|ball|candy|card|chip|token|sock)s? (?:from|out of) (.+)$/.exec(q))){
    const groups = [...m[3].matchAll(/(\d+) ([a-z]+)/g)].map(t => [t[2], +t[1]]), total = groups.reduce((s, [, k]) => s + k, 0), hit = (groups.find(([c]) => c === m[2]) || [, null])[1];
    if(hit === null) return null; const g = pcGcd(hit, total - hit) || 1;
    if(/^odds against/.test(m[1])) return out((total - hit) / g + ":" + hit / g);
    if(/^odds/.test(m[1])) return out(hit / g + ":" + (total - hit) / g);
    return out(pcRatio(hit, total) + " = " + pcNum(+(hit / total).toFixed(4)));
  }
  if((m = /\bsum of (?:the )?(?:interior )?angles (?:in|of) (?:a |an )?(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|nonagon|decagon|dodecagon)\b/.exec(q))) return out(pcNum((POLYGON[m[1]] - 2) * 180) + "°");
  if((m = /^is (?:a )?triangle with sides ([\d.]+),\s*([\d.]+),?\s*and\s*([\d.]+) a right triangle$/.exec(q))){
    const s = [+m[1], +m[2], +m[3]].sort((a, b) => a - b), ok = Math.abs(s[0] ** 2 + s[1] ** 2 - s[2] ** 2) < 1e-9;
    return out((ok ? "Yes: " : "No: ") + pcNum(s[0]) + "² + " + pcNum(s[1]) + "² = " + pcNum(s[0] ** 2 + s[1] ** 2) + (ok ? " = " : ", not ") + pcNum(s[2]) + "² = " + pcNum(s[2] ** 2) + ".");
  }
  if((m = /\bunit (?:price|cost) (?:of|for) ([\d.]+)\s*([a-z]+) of [a-z ]+? (?:for|at|costing) \$\s*([\d,.]+)/.exec(q))) return out(money(num(m[3]) / +m[1]) + " per " + (m[2] === "l" ? "L" : m[2]));
  return null;
}
// --- Science 10, offline ---
// The periodic table (protons, neutrons, electrons, ions, molar mass), compound names both ways, balancing equations
// by search, reaction types, pH, energy, work and power, radiation, DNA and Punnett squares, and the universe.
// precalc() asks it first; null means "not mine". Graded by COURSE=sci10 node test/exam-course.js.
// Mirrored in kmp/shared/.../Science10.kt.
// Symbol, name, atomic mass; the atomic number is the position (H is 1). Then a few heavy elements with their own.
const SCI_EL = ("H,hydrogen,1.008;He,helium,4.003;Li,lithium,6.94;Be,beryllium,9.012;B,boron,10.81;C,carbon,12.011;N,nitrogen,14.007;O,oxygen,15.999;F,fluorine,18.998;Ne,neon,20.180;" +
  "Na,sodium,22.990;Mg,magnesium,24.305;Al,aluminum,26.982;Si,silicon,28.085;P,phosphorus,30.974;S,sulfur,32.06;Cl,chlorine,35.45;Ar,argon,39.948;K,potassium,39.098;Ca,calcium,40.078;" +
  "Sc,scandium,44.956;Ti,titanium,47.867;V,vanadium,50.942;Cr,chromium,51.996;Mn,manganese,54.938;Fe,iron,55.845;Co,cobalt,58.933;Ni,nickel,58.693;Cu,copper,63.546;Zn,zinc,65.38;" +
  "Ga,gallium,69.723;Ge,germanium,72.630;As,arsenic,74.922;Se,selenium,78.971;Br,bromine,79.904;Kr,krypton,83.798").split(";").map((r, i) => { const [s, n, m] = r.split(","); return {s, n, m:+m, z:i + 1}; })
  .concat([[37,"Rb","rubidium",85.468],[38,"Sr","strontium",87.62],[47,"Ag","silver",107.87],[50,"Sn","tin",118.71],[53,"I","iodine",126.90],[54,"Xe","xenon",131.29],[55,"Cs","cesium",132.91],[56,"Ba","barium",137.33],[78,"Pt","platinum",195.08],[79,"Au","gold",196.97],[80,"Hg","mercury",200.59],[82,"Pb","lead",207.2],[86,"Rn","radon",222],[88,"Ra","radium",226],[92,"U","uranium",238.03],[94,"Pu","plutonium",244]].map(([z, s, n, m]) => ({s, n, m, z})));
const sciBy = k => SCI_EL.find(e => e.s.toLowerCase() === String(k).toLowerCase() || e.n === String(k).toLowerCase() || (e.n === "aluminum" && /^aluminium$/i.test(k)) || (e.n === "sulfur" && /^sulphur$/i.test(k)) || (e.n === "cesium" && /^caesium$/i.test(k)));
const SCI_NONMETAL = new Set("H He C N O F Ne P S Cl Ar Se Br Kr I Xe Rn".split(" "));
// Ions: symbol or group to charge, and the -ide names of simple anions.
const SCI_CHARGE = {Li:1, Na:1, K:1, Rb:1, Cs:1, Ag:1, Be:2, Mg:2, Ca:2, Sr:2, Ba:2, Zn:2, Al:3, F:-1, Cl:-1, Br:-1, I:-1, O:-2, S:-2, Se:-2, N:-3, P:-3, H:1};
const SCI_IDE = {F:"fluoride", Cl:"chloride", Br:"bromide", I:"iodide", O:"oxide", S:"sulfide", Se:"selenide", N:"nitride", P:"phosphide", H:"hydride", C:"carbide"};
const SCI_POLY = [["NH4", "ammonium", 1], ["OH", "hydroxide", -1], ["NO3", "nitrate", -1], ["NO2", "nitrite", -1], ["SO4", "sulfate", -2], ["SO3", "sulfite", -2], ["CO3", "carbonate", -2], ["HCO3", "hydrogen carbonate", -1], ["PO4", "phosphate", -3], ["ClO3", "chlorate", -1], ["C2H3O2", "acetate", -1], ["MnO4", "permanganate", -1]];
const SCI_COMMON = [["water", "H2O"], ["table salt", "NaCl"], ["salt", "NaCl"], ["carbon dioxide", "CO2"], ["carbon monoxide", "CO"], ["ammonia", "NH3"], ["methane", "CH4"], ["ethane", "C2H6"], ["propane", "C3H8"], ["butane", "C4H10"], ["glucose", "C6H12O6"], ["sucrose", "C12H22O11"], ["table sugar", "C12H22O11"], ["ethanol", "C2H5OH"], ["hydrogen peroxide", "H2O2"], ["ozone", "O3"], ["oxygen gas", "O2"], ["hydrogen gas", "H2"], ["nitrogen gas", "N2"], ["sulfuric acid", "H2SO4"], ["hydrochloric acid", "HCl"], ["nitric acid", "HNO3"], ["acetic acid", "HC2H3O2"], ["vinegar", "HC2H3O2"], ["baking soda", "NaHCO3"], ["sodium hydroxide", "NaOH"], ["lye", "NaOH"], ["calcium carbonate", "CaCO3"], ["limestone", "CaCO3"], ["rust", "Fe2O3"]];
const SCI_PREFIX = ["", "mono", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"];
const sciSub = f => f.replace(/\d/g, d => "₀₁₂₃₄₅₆₇₈₉"[d]);
// A formula as element counts: Ca(OH)2 is {Ca:1, O:2, H:2}. Null when a symbol is not an element.
function sciParse(f){
  const s = String(f).replace(/[₀-₉]/g, c => "₀₁₂₃₄₅₆₇₈₉".indexOf(c)); let i = 0;
  const group = () => { const c = {};
    while(i < s.length && s[i] !== ")"){
      let part; if(s[i] === "("){ i++; part = group(); i++; } else { const m = /^[A-Z][a-z]?/.exec(s.slice(i)); if(!m || !sciBy(m[0])) throw 0; i += m[0].length; part = {[m[0]]: 1}; }
      const n = /^\d+/.exec(s.slice(i)); const k = n ? +n[0] : 1; if(n) i += n[0].length;
      for(const [e, v] of Object.entries(part)) c[e] = (c[e] || 0) + v * k;
    } return c; };
  try{ const c = group(); return i === s.length && Object.keys(c).length ? c : null; } catch { return null; }
}
const sciMass = c => Object.entries(c).reduce((s, [e, k]) => s + sciBy(e).m * k, 0);
// The name of a formula: polyatomic ions, metal plus nonmetal, or two nonmetals with prefixes.
function sciName(f){
  const common = SCI_COMMON.find(([, g]) => g === f); if(common && !/^(table salt|salt|vinegar|lye|limestone|rust|table sugar)$/.test(common[0])) return common[0];
  for(const [p, pn] of SCI_POLY){ const m = new RegExp("^([A-Z][a-z]?)(\\d*)\\(?" + p + "\\)?(\\d*)$").exec(f); if(m && sciBy(m[1])) return sciBy(m[1]).n + " " + pn; if(p === "NH4"){ const n = /^\(?NH4\)?(\d*)([A-Z][a-z]?)(\d*)$/.exec(f); if(n && SCI_IDE[n[2]]) return "ammonium " + SCI_IDE[n[2]]; } }
  const m = /^([A-Z][a-z]?)(\d*)([A-Z][a-z]?)(\d*)$/.exec(f); if(!m || !sciBy(m[1]) || !sciBy(m[3]) || !SCI_IDE[m[3]]) return null;
  const a = m[1], na = +(m[2] || 1), b = m[3], nb = +(m[4] || 1);
  if(!SCI_NONMETAL.has(a)){
    if(SCI_CHARGE[a] !== undefined) return sciBy(a).n + " " + SCI_IDE[b];
    const charge = nb * -SCI_CHARGE[b] / na; return sciBy(a).n + "(" + ["", "I", "II", "III", "IV", "V", "VI", "VII"][charge] + ") " + SCI_IDE[b];
  }
  return (na > 1 ? SCI_PREFIX[na] : "") + sciBy(a).n + " " + (SCI_PREFIX[nb] + SCI_IDE[b]).replace(/ao/, "o").replace(/oo/, "o");
}
// The formula of a name: common names, ionic names by charges, covalent names by prefixes.
function sciFormula(name){
  const n = name.trim().toLowerCase(), common = SCI_COMMON.find(([k]) => k === n); if(common) return common[1];
  const words = n.split(/\s+/); if(words.length !== 2 && !(words.length === 3 && /^hydrogen$/.test(words[1]))) return null;
  const [first, ...rest] = words, last = rest.join(" ");
  // A prefix may drop its last vowel before "oxide": tetroxide, monoxide.
  const pre = w => { for(const p of SCI_PREFIX.slice(1).sort((x, y) => y.length - x.length)){ if(w.startsWith(p) && w.length > p.length) return [SCI_PREFIX.indexOf(p), w.slice(p.length)]; if(/[ao]$/.test(p) && w.startsWith(p.slice(0, -1) + "o") && !w.startsWith(p)) return [SCI_PREFIX.indexOf(p), w.slice(p.length - 1)]; } return [1, w]; };
  const poly = SCI_POLY.find(([, pn]) => pn === last), ide = Object.entries(SCI_IDE).find(([, v]) => v === last.replace(/^(mono|di|tri|tetra|penta|hexa)/, "").replace(/^xide/, "oxide"));
  const cat = first === "ammonium" ? ["NH4", 1] : (() => { const m = /^([a-z]+)(?:\((i{1,3}|iv|v|vi)\))?$/.exec(first); const e = m && sciBy(m[1]); if(!e) return null; const r = m[2] ? {i:1, ii:2, iii:3, iv:4, v:5, vi:6}[m[2]] : SCI_CHARGE[e.s]; return r ? [e.s, r] : null; })();
  if(cat && !SCI_NONMETAL.has(cat[0]) && (poly || ide)){
    const [an, ac] = poly ? [poly[0], -poly[2]] : [ide[0], -SCI_CHARGE[ide[0]]], g = pcGcd(cat[1], ac), x = ac / g, y = cat[1] / g;
    const part = (s, k, multi) => k === 1 ? s : (multi ? "(" + s + ")" : s) + k;
    return part(cat[0], x, cat[0].length > 2) + part(an, y, !!poly);
  }
  // covalent: dinitrogen tetroxide is N2O4
  const [k1, w1] = pre(first), [k2, w2] = pre(last), e1 = sciBy(w1), an2 = Object.entries(SCI_IDE).find(([, v]) => v === w2 || v === "o" + w2 || v.replace(/^o/, "") === w2);
  if(e1 && an2 && SCI_NONMETAL.has(e1.s)) return e1.s + (k1 > 1 ? k1 : "") + an2[0] + (k2 > 1 ? k2 : "");
  return null;
}
// Balance by searching small whole-number coefficients; the first set that conserves every element wins.
function sciBalance(eq){
  const sides = eq.split(/\s*(?:->|→|=>|=)\s*/); if(sides.length !== 2) return null;
  const terms = sides.map(s => s.split(/\s*\+\s*/).map(t => t.trim().replace(/^\d+(?=[A-Z(])/, "")));
  const parsed = terms.map(side => side.map(sciParse)); if(parsed.flat().some(c => !c)) return null;
  const all = parsed.flat(), els = [...new Set(all.flatMap(c => Object.keys(c)))], n = all.length, k = new Array(n).fill(1);
  const ok = () => els.every(e => { let s = 0; all.forEach((c, i) => s += (i < parsed[0].length ? 1 : -1) * (c[e] || 0) * k[i]); return s === 0; });
  const rec = i => { if(i === n) return ok(); for(let v = 1; v <= 12; v++){ k[i] = v; if(rec(i + 1)) return true; } return false; };
  if(n > 6 || !rec(0)) return null;
  let j = 0; const show = side => side.map(t => (k[j] > 1 ? k[j] : "") + sciSub(t) + (j++, "")).join(" + ");
  return show(terms[0]) + " → " + show(terms[1]);
}
function sciType(eq){
  const sides = eq.split(/\s*(?:->|→|=>|=)\s*/); if(sides.length !== 2) return null;
  const [l, r] = sides.map(s => s.split(/\s*\+\s*/).map(t => t.trim().replace(/^\d+/, "")));
  const element = t => /^[A-Z][a-z]?\d*$/.test(t) && (sciBy(t.replace(/\d+$/, "")) || t.length === 1);
  if(l.includes("O2") && r.includes("CO2") && r.includes("H2O")) return "Combustion: a fuel burns in oxygen to make carbon dioxide and water.";
  if(/^(H[A-Z]|H\d)/.test(l[0] || "") && /OH$/.test(l[1] || "") || /OH$/.test(l[0] || "") && /^H/.test(l[1] || "")) return "Neutralization: an acid and a base make a salt and water.";
  if(l.length >= 2 && r.length === 1) return "Synthesis (combination): two or more reactants join into one product.";
  if(l.length === 1 && r.length >= 2) return "Decomposition: one compound breaks into simpler substances.";
  if(l.length === 2 && r.length === 2 && l.some(element) && r.some(element)) return "Single replacement (displacement): one element takes another's place in a compound.";
  if(l.length === 2 && r.length === 2) return "Double replacement (displacement): two compounds swap partners.";
  return null;
}
const SCI_FACTS = [
  [/\bcharge (?:of|on) (?:an? |the )?electron\b/, "-1 (−1.602 × 10⁻¹⁹ C). Electrons are negative."],
  [/\bcharge (?:of|on) (?:an? |the )?proton\b/, "+1 (+1.602 × 10⁻¹⁹ C). Protons are positive."],
  [/\bcharge (?:of|on) (?:an? |the )?neutron\b/, "0. Neutrons have no charge."],
  [/^(?:what is )?(?:an? )?isotope$/, "Atoms of the same element with different numbers of neutrons, such as carbon-12 and carbon-14."],
  [/^(?:what is )?(?:an? )?ion$/, "An atom or group of atoms with a charge, from gaining or losing electrons."],
  [/^(?:what is )?(?:the )?(?:law of )?conservation of energy$|^(?:what is )?the law of conservation of energy$/, "Energy cannot be created or destroyed, only changed from one form to another."],
  [/^(?:what is )?(?:the )?(?:law of )?conservation of mass$|^(?:what is )?the law of conservation of mass$/, "Mass is neither created nor destroyed in a chemical reaction: the products weigh the same as the reactants."],
  [/\b(?:si )?units? (?:of|for) energy\b/, "The joule (J)."], [/\b(?:si )?units? (?:of|for) power\b/, "The watt (W), one joule per second."],
  [/\b(?:si )?units? (?:of|for) force\b/, "The newton (N)."], [/\b(?:si )?units? (?:of|for) work\b/, "The joule (J)."],
  [/\bformula for kinetic energy\b/, "KE = ½mv² (half the mass times the speed squared)."],
  [/\bformula for (?:gravitational )?potential energy\b/, "PE = mgh (mass times g, 9.8 m/s², times height)."],
  [/\bformula for (?:work)\b/, "W = F·d (force times distance)."], [/\bformula for power\b/, "P = W/t (work divided by time)."],
  [/^(?:what is )?(?:the )?ph of (?:a |pure )?(?:neutral solution|pure water|water)$/, "7, which is neutral."],
  [/^(?:what is )?(?:the )?ph of (?:a )?strong acid$/, "Low, about 0 to 2: well below 7."], [/^(?:what is )?(?:the )?ph of (?:a )?strong base$/, "High, about 12 to 14: well above 7."],
  [/\bacid and (?:a )?base (?:produce|make|form)|\bproducts? of (?:a )?neutralization\b/, "A salt and water. That is a neutralization reaction."],
  [/^(?:what is )?(?:a )?neutralization(?: reaction)?$/, "An acid and a base react to make a salt and water, and the pH moves toward 7."],
  [/\bproducts? of (?:the )?combustion of (?:methane|propane|a hydrocarbon|gasoline|wood|natural gas)\b|\bcombustion of methane\b/, "Carbon dioxide and water (CO₂ and H₂O)."],
  [/\bproducts? of photosynthesis\b/, "Glucose and oxygen, from carbon dioxide, water and light energy."],
  [/\bproducts? of (?:cellular )?respiration\b/, "Carbon dioxide, water and energy (ATP), from glucose and oxygen."],
  [/^(?:what is )?(?:an? )?alpha (?:particle|radiation|decay)$/, "A helium nucleus: 2 protons and 2 neutrons. It is stopped by paper or skin."],
  [/^(?:what is )?(?:an? )?beta (?:particle|radiation|decay)$/, "A fast electron (or positron) given off by a nucleus. It is stopped by a few millimetres of aluminum."],
  [/^(?:what is )?(?:an? )?gamma (?:ray|rays|radiation)$/, "High-energy electromagnetic radiation from a nucleus. It is the most penetrating and needs thick lead or concrete to stop."],
  [/\b(?:most|strongest|highest) penetrat/, "Gamma radiation."], [/\b(?:least|weakest|lowest) penetrat/, "Alpha radiation."],
  [/^(?:what is )?(?:nuclear )?fission$/, "A heavy nucleus such as uranium-235 splits into smaller nuclei, releasing energy and neutrons. Nuclear power plants use it."],
  [/^(?:what is )?(?:nuclear )?fusion$/, "Light nuclei such as hydrogen join into a heavier one, releasing energy. It powers the Sun."],
  [/\bwhat powers (?:the sun|stars)\b|\benergy (?:source )?of the sun\b/, "Nuclear fusion of hydrogen into helium in the core."],
  [/^(?:what is )?radioactive decay$|^(?:what is )?radioactivity$/, "An unstable nucleus breaks down and gives off radiation (alpha, beta or gamma) to become more stable."],
  [/^(?:what is )?(?:a )?half-?life$/, "The time it takes for half of the nuclei in a radioactive sample to decay."],
  [/\bwhat does dna stand for\b/, "Deoxyribonucleic acid."], [/\bwhat does rna stand for\b/, "Ribonucleic acid."],
  [/\b(?:four |4 )?(?:dna )?(?:bases|nitrogen bases|nucleotides) (?:in|of) dna\b|\bfour dna bases\b/, "Adenine, thymine, cytosine and guanine (A, T, C, G)."],
  [/\bpairs? with adenine\b/, "Thymine in DNA (uracil in RNA)."], [/\bpairs? with thymine\b/, "Adenine."], [/\bpairs? with guanine\b/, "Cytosine."], [/\bpairs? with cytosine\b/, "Guanine."],
  [/^(?:what is )?(?:the )?shape of dna$/, "A double helix."], [/\bhow many chromosomes (?:do )?humans have\b|\bhuman chromosomes\b/, "46, in 23 pairs."],
  [/^(?:what is )?(?:a )?gene$/, "A section of DNA that codes for a protein, which shapes a trait."],
  [/^(?:what is )?(?:a )?chromosome$/, "A long, coiled molecule of DNA with many genes, packed with proteins."],
  [/^(?:what is )?(?:an? )?allele$/, "One version of a gene, such as the allele for brown eyes or for blue."],
  [/^(?:what is )?(?:a )?dominant (?:allele|trait|gene)$/, "An allele that shows in the trait even with one copy; it masks the recessive allele."],
  [/^(?:what is )?(?:a )?recessive (?:allele|trait|gene)$/, "An allele that is masked by a dominant one; it only shows when there are two copies."],
  [/^(?:what is )?(?:a )?genotype$/, "The alleles an organism carries, such as Aa."], [/^(?:what is )?(?:a )?phenotype$/, "The trait you can observe, such as eye colour."],
  [/^(?:what is )?homozygous$/, "Two identical alleles for a gene (AA or aa)."], [/^(?:what is )?heterozygous$/, "Two different alleles for a gene (Aa)."],
  [/^(?:what is )?(?:a )?mutation$/, "A change in the DNA sequence. It can be harmful, helpful or have no effect."],
  [/^(?:what is )?natural selection$/, "Organisms with traits that suit their environment survive and reproduce more, so those traits become more common over generations."],
  [/^(?:what is )?evolution$/, "The change in the inherited traits of a population over many generations."],
  [/\bhow old is the universe\b|\bage of the universe\b/, "About 13.8 billion years."], [/\bhow old is (?:the )?earth\b|\bage of (?:the )?earth\b/, "About 4.54 billion years."],
  [/^(?:what is )?(?:a )?light[- ]year$/, "The distance light travels in one year, about 9.46 trillion km."],
  [/\bevidence (?:for|supports?|of) (?:the )?big bang\b|\bbig bang evidence\b/, "Redshift of distant galaxies (the universe is expanding), the cosmic microwave background radiation, and the amounts of hydrogen and helium."],
  [/^(?:what is )?(?:the )?big bang(?: theory)?$/, "The universe began about 13.8 billion years ago from an extremely hot, dense state and has been expanding ever since."],
  [/^(?:what is )?(?:a )?red ?shift$/, "Light from an object moving away is stretched to longer, redder wavelengths. Distant galaxies are redshifted, so the universe is expanding."],
  [/^(?:what is )?(?:a )?galaxy$/, "A huge system of billions of stars, gas and dust held together by gravity, like the Milky Way."],
  [/^(?:what is )?(?:a )?nebula$/, "A cloud of gas and dust in space where stars form."],
  [/\bclosest star to (?:the )?earth\b|\bnearest star to (?:the )?earth\b/, "The Sun. After it, Proxima Centauri, about 4.2 light-years away."],
  [/\blargest planet\b/, "Jupiter."], [/\bsmallest planet\b/, "Mercury."], [/\bclosest planet to the sun\b/, "Mercury."], [/\bhottest planet\b/, "Venus."],
  [/\blife cycle of (?:a )?(?:star|sun-like star)\b/, "Nebula, main-sequence star, red giant, then a white dwarf. A massive star ends as a supernova, then a neutron star or black hole."],
  [/^(?:what is )?(?:a )?black hole$/, "A region where gravity is so strong that nothing, not even light, can escape."],
];
function sci10(q, raw){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"}), r = String(raw || q).trim().replace(/[?.!]+$/, "");
  for(const [re, body] of SCI_FACTS) if(re.test(q)) return out(body);
  let m;
  // atoms and ions
  if((m = /^(?:the )?atomic (number|mass) (?:of|for) ([a-z]+)$/.exec(q)) && sciBy(m[2])){ const e = sciBy(m[2]); return out(m[1] === "number" ? String(e.z) : pcNum(e.m) + " u (g/mol)"); }
  if((m = /^how many (protons|electrons|neutrons) (?:does|do|are in|in) (?:an? |the )?(?:atom of )?([a-z]+)(?:-(\d+))?(?: atom)?(?: have)?$/.exec(q)) && sciBy(m[2])){
    const e = sciBy(m[2]); if(m[1] === "neutrons"){ const a = m[3] ? +m[3] : Math.round(e.m); return out(String(a - e.z) + (m[3] ? "" : " (in the most common isotope, mass number " + a + ")")); } return out(String(e.z));
  }
  if((m = /\bhow many neutrons (?:does|do|are in|in) (?:an? |the )?([a-z]+)-(\d+)/.exec(q)) && sciBy(m[1])) return out(String(+m[2] - sciBy(m[1]).z));
  if((m = /\bhow many electrons (?:does|do|are in|in) (?:an? |the )?(?:[a-z]+ )?ion ([A-Z][a-z]?)(\d*)([+-])/.exec(r)) || (m = /\bhow many electrons (?:does|do|are in|in) (?:an? |the )?([A-Z][a-z]?)(\d*)([+-])/.exec(r))){
    const e = sciBy(m[1]); if(!e) return null; const c = (m[3] === "+" ? 1 : -1) * +(m[2] || 1); return out(String(e.z - c));
  }
  // compounds
  if((m = /^(?:the )?(?:chemical )?formula (?:for|of) ([a-z() ]+)$/.exec(q))){ const f = sciFormula(m[1].replace(/^the /, "")); if(f) return out(sciSub(f)); }
  // Case matters for formulas (Co is cobalt, CO is carbon monoxide), so these read the question as typed.
  const typed = r.replace(/^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?/i, "");
  if((m = /^(?:name|name of) (?:the )?(?:compound |molecule )?([A-Z][A-Za-z0-9()]*)$/i.exec(typed))){ const n = sciName(m[1]); if(n) return out(n[0].toUpperCase() + n.slice(1) + "."); }
  if((m = /^(?:molar|molecular|formula) mass (?:of|for) (.+)$/i.exec(typed))){
    const name = m[1].trim(), f = sciParse(name) ? name : sciFormula(name.toLowerCase()), c = f && sciParse(f); if(c) return out(pcNum(+sciMass(c).toFixed(2)) + " g/mol (" + sciSub(f) + ")");
  }
  // reactions
  if((m = /^balance (?:the equation )?(.+)$/i.exec(r))){ const b = sciBalance(m[1]); if(b) return out(b); }
  if((m = /^what (?:type|kind) of reaction is (.+)$/i.exec(r))){ const t = sciType(m[1]); if(t) return out(t); }
  if((m = /^is (?:a )?ph (?:of )?([\d.]+) (?:an? )?(?:acidic|basic|acid|base|neutral)/.exec(q))){ const p = +m[1]; return out(p < 7 ? "Acidic (below 7)." : p > 7 ? "Basic, or alkaline (above 7)." : "Neutral (exactly 7)."); }
  // energy, work and power
  const val = (re, s = q) => { const t = re.exec(s); return t ? +t[1] : null; };
  if(/\bkinetic energy\b/.test(q)){ const kg = val(/([\d.]+)\s*kg\b/), v = val(/([\d.]+)\s*m\/s\b/); if(kg !== null && v !== null) return out(pcNum(+(0.5 * kg * v * v).toFixed(3)) + " J (KE = ½mv²)"); }
  if(/\bpotential energy\b/.test(q)){ const kg = val(/([\d.]+)\s*kg\b/), h = val(/([\d.]+)\s*m\b(?!\/)/); if(kg !== null && h !== null) return out(pcNum(+(kg * 9.8 * h).toFixed(3)) + " J (PE = mgh, with g = 9.8 m/s²)"); }
  if(/\bwork\b/.test(q) && !/\bpower\b/.test(q)){ const F = val(/([\d.]+)\s*n\b/), d = val(/([\d.]+)\s*m\b(?!\/)/); if(F !== null && d !== null) return out(pcNum(+(F * d).toFixed(3)) + " J (W = Fd)"); }
  if(/\bpower\b/.test(q)){ const W = val(/([\d.]+)\s*(?:j|joules)\b/), t = val(/([\d.]+)\s*(?:s|seconds?)\b/); if(W !== null && t) return out(pcNum(+(W / t).toFixed(3)) + " W (P = W/t)"); }
  if((m = /\b(?:speed|velocity)\b.*?\btravels? ([\d.]+)\s*(m|km)\b.*?\bin ([\d.]+)\s*(s|seconds?|h|hours?|min|minutes?)\b/.exec(q))){ const t = +m[3], u = m[2] + "/" + (/^s/.test(m[4]) ? "s" : /^h/.test(m[4]) ? "h" : "min"); return out(pcNum(+(+m[1] / t).toFixed(3)) + " " + u); }
  // genetics: Punnett squares for one or two genes
  if((m = /\b([A-Za-z]{2}(?:[A-Za-z]{2})?)\s*(?:x|×|by|and)\s*([A-Za-z]{2}(?:[A-Za-z]{2})?)\b.*?\b(?:fraction|percent|probability|chance|proportion|ratio)\b.*?\b(?:are|is|be|of)\s+([A-Za-z]{2}(?:[A-Za-z]{2})?)\b/.exec(r)) && m[1].length === m[2].length && m[1].length === m[3].length){
    const gam = g => g.length === 2 ? [g[0], g[1]] : [g[0] + g[2], g[0] + g[3], g[1] + g[2], g[1] + g[3]];
    const norm = g => g.length === 2 ? [...g].sort().join("") : [...g.slice(0, 2)].sort().join("") + [...g.slice(2)].sort().join("");
    const kids = []; for(const a of gam(m[1])) for(const b of gam(m[2])) kids.push(m[1].length === 2 ? a + b : a[0] + b[0] + a[1] + b[1]);
    const want = norm(m[3]), hit = kids.filter(k => norm(k) === want).length;
    return out(pcRatio(hit, kids.length) + " (" + pcNum(+(hit / kids.length * 100).toFixed(2)) + "%) of the offspring are " + m[3] + ".");
  }
  return null;
}
// --- Chemistry 11, offline ---
// Significant figures, scientific notation, density, the mole, percent composition, empirical formulas, solutions,
// gases at STP, stoichiometry from a balanced equation, limiting reactants and yield, electron configurations,
// periodic trends, bonding, VSEPR shape and polarity, and simple organic names. Uses the sci10 tables.
// precalc() asks it after sci10(); null means "not mine". Graded by COURSE=chem11 node test/exam-course.js.
// Mirrored in kmp/shared/.../Chemistry11.kt.
const CH_NA = 6.02214076e23;
const CH_ORDER = ["1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d", "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p"];
const CH_SUP = n => String(n).replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
// Pauling electronegativity for the main groups and the first transition row.
const CH_EN = {H:2.20, Li:0.98, Be:1.57, B:2.04, C:2.55, N:3.04, O:3.44, F:3.98, Na:0.93, Mg:1.31, Al:1.61, Si:1.90, P:2.19, S:2.58, Cl:3.16, K:0.82, Ca:1.00, Sc:1.36, Ti:1.54, V:1.63, Cr:1.66, Mn:1.55, Fe:1.83, Co:1.88, Ni:1.91, Cu:1.90, Zn:1.65, Ga:1.81, Ge:2.01, As:2.18, Se:2.55, Br:2.96, Kr:3.00, Rb:0.82, Sr:0.95, Ag:1.93, Sn:1.96, I:2.66, Xe:2.60, Cs:0.79, Ba:0.89, Au:2.54, Pb:2.33};
const CH_ALK = ["", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec"];
const CH_SHAPE = {"2,0":"linear", "3,0":"trigonal planar", "3,1":"bent", "4,0":"tetrahedral", "4,1":"trigonal pyramidal", "4,2":"bent", "5,0":"trigonal bipyramidal", "5,1":"seesaw", "5,2":"T-shaped", "5,3":"linear", "6,0":"octahedral", "6,1":"square pyramidal", "6,2":"square planar"};
const CH_SYM = new Set(["2,0", "3,0", "4,0", "5,0", "6,0", "6,2", "5,3"]);
// Orbital filling in Aufbau order, with chromium and copper taking a half-filled or full d.
function chConfig(z){
  const cells = []; let left = z;
  for(const o of CH_ORDER){ if(left <= 0) break; const cap = {s:2, p:6, d:10, f:14}[o[1]], k = Math.min(cap, left); cells.push([o, k]); left -= k; }
  if(z === 24 || z === 29){ const s = cells.find(([o]) => o === "4s"), d = cells.find(([o]) => o === "3d"); s[1] = 1; d[1] += 1; }
  return cells;
}
const chValence = z => { const c = chConfig(z), n = Math.max(...c.map(([o]) => +o[0])); return c.filter(([o]) => +o[0] === n).reduce((s, [, k]) => s + k, 0); };
const chPeriod = z => Math.max(...chConfig(z).map(([o]) => +o[0]));
// Species named in a sentence, as formulas: "hydrogen gas" is H2, "methane" is CH4, "CO2" stays.
function chSpecies(s){ const t = s.trim().replace(/^(?:the |a |an )/i, "").replace(/\s+(?:gas|molecules?)$/i, ""); if(sciParse(t)) return t; const el = sciBy(t); if(el) return /^(H|N|O|F|Cl|Br|I)$/.test(el.s) ? el.s + "2" : el.s; return sciFormula(t); }
// Coefficients of a balanced equation, by the same small search as sciBalance.
function chCoef(left, right){
  const all = [...left, ...right].map(sciParse); if(all.some(c => !c)) return null;
  const els = [...new Set(all.flatMap(c => Object.keys(c)))], n = all.length, k = new Array(n).fill(1);
  const ok = () => els.every(e => all.reduce((s, c, i) => s + (i < left.length ? 1 : -1) * (c[e] || 0) * k[i], 0) === 0);
  const rec = i => { if(i === n) return ok(); for(let v = 1; v <= 12; v++){ k[i] = v; if(rec(i + 1)) return true; } return false; };
  return n <= 6 && rec(0) ? k : null;
}
function chem11(q, raw){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"}), r = String(raw || q).trim().replace(/[?!]+$/, "");
  const supE = e => (e < 0 ? "⁻" : "") + CH_SUP(Math.abs(e));
  const sciStr = v => { const e = Math.floor(Math.log10(Math.abs(v))), m = +(v / 10 ** e).toPrecision(4); return pcNum(m) + " × 10" + supE(e); };
  // Formulas are case-sensitive (Co is cobalt, CO is carbon monoxide), so those branches read the question as typed.
  const typed = r.replace(/^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?/i, "");
  let m;
  const facts = [
    [/^(?:what is )?avogadro'?s (?:number|constant)$|^how many (?:particles|atoms|molecules) (?:are )?in (?:one|1|a) mole$/, "6.022 × 10²³ particles per mole."],
    [/^(?:what is )?(?:a )?mole(?: in chemistry)?$/, "An amount of substance: 6.022 × 10²³ particles (Avogadro's number), just as a dozen is 12."],
    [/^(?:what is )?(?:the )?molar mass$/, "The mass of one mole of a substance, in grams per mole (g/mol). Water's is 18.02 g/mol."],
    [/^(?:what is )?(?:the )?molar volume(?: of (?:a |an ideal )?gas)?(?: at stp)?$/, "22.4 L per mole at STP."],
    [/^(?:what is )?stp$|^(?:what is )?standard temperature and pressure$/, "Standard temperature and pressure: 0 °C (273.15 K) and 101.3 kPa (1 atm)."],
    [/^(?:what is )?(?:an? )?ionic bond$/, "Electrons transfer from a metal to a nonmetal; the ions that form attract each other."],
    [/^(?:what is )?(?:a )?polar covalent bond$/, "A covalent bond with unequal sharing: the more electronegative atom pulls the electrons closer and carries a partial negative charge."],
    [/^(?:what is )?(?:a )?(?:nonpolar )?covalent bond$/, "Two nonmetal atoms share a pair of electrons."],
    [/^(?:what is )?(?:a )?metallic bond$/, "Metal cations held in a sea of delocalized electrons, which is why metals conduct."],
    [/\bmost electronegative element\b/, "Fluorine (3.98 on the Pauling scale)."], [/\bleast electronegative element\b/, "Francium, with cesium close behind (about 0.7 to 0.8)."],
    [/\bwhat group (?:are|is) (?:the )?noble gases\b|\bnoble gases (?:are )?in (?:which|what) group\b/, "Group 18."], [/\bwhat group (?:are|is) (?:the )?halogens\b/, "Group 17."],
    [/\bwhat group (?:are|is) (?:the )?alkali metals\b/, "Group 1."], [/\bwhat group (?:are|is) (?:the )?alkaline earth metals\b/, "Group 2."],
    [/\belements in group 1 called\b|\bgroup 1 elements\b/, "The alkali metals (hydrogen sits above them but is not one)."], [/\belements in group 2 called\b|\bgroup 2 elements\b/, "The alkaline earth metals."],
    [/\belements in group 17 called\b|\bgroup 17 elements\b/, "The halogens."], [/\belements in group 18 called\b|\bgroup 18 elements\b/, "The noble gases."],
  ];
  for(const [re, body] of facts) if(re.test(q)) return out(body);
  // significant figures and scientific notation
  if((m = /\bhow many sig(?:nificant)? (?:figures|figs|digits) (?:are )?(?:in|does) ([\d.,]+)/.exec(q))){
    const s = m[1].replace(/,/g, ""), digits = s.replace(".", "").replace(/^0+/, ""), dot = s.includes(".");
    const n = dot ? digits.length : digits.replace(/0+$/, "").length;
    return out(String(n) + (!dot && /0$/.test(s) ? " (trailing zeros with no decimal point are not counted; write " + s + ". to count them)" : ""));
  }
  if((m = /\b(?:write|express|convert|put) ([\d.,]+) (?:in|into|to|as) scientific notation\b/.exec(q))){
    const s = m[1].replace(/,/g, ""), v = +s; if(!v) return null;
    const sigs = s.replace(".", "").replace(/^0+/, "").replace(s.includes(".") ? /$^/ : /0+$/, "").length, e = Math.floor(Math.log10(v)), mant = (v / 10 ** e).toPrecision(Math.max(1, sigs));
    return out(mant + " × 10" + supE(e));
  }
  // density
  if(/\bdensity\b/.test(q) && (m = /\bmass (?:of )?([\d.]+)\s*(kg|g)\b.*?\bvolume (?:of )?([\d.]+)\s*(ml|cm3|cm³|l|m3)\b/.exec(q))) return out(pcNum(+(+m[1] / +m[3]).toFixed(4)) + " " + m[2] + "/" + m[4].replace("ml", "mL").replace("cm3", "cm³").replace(/^l$/, "L"));
  // the mole
  const mm = s => { const f = chSpecies(s), c = f && sciParse(f); return c ? [f, sciMass(c)] : null; };
  // Moles to three significant figures, the way a chemistry answer is written: 2.00 mol.
  if((m = /^how many moles (?:are )?(?:in|of) ([\d.]+)\s*(?:g|grams) (?:of )?(.+)$/i.exec(typed))){ const x = mm(m[2]); if(x) return out((+m[1] / x[1]).toPrecision(3) + " mol (" + sciSub(x[0]) + " is " + pcNum(+x[1].toFixed(2)) + " g/mol)"); }
  if((m = /^mass of ([\d.]+)\s*(?:mol|moles) (?:of )?(.+)$/i.exec(typed))){ const x = mm(m[2]); if(x) return out(pcNum(+(+m[1] * x[1]).toFixed(2)) + " g"); }
  if((m = /\bhow many (molecules|atoms|particles|ions|formula units) (?:are )?in ([\d.]+) (?:mol|moles)\b/.exec(q))) return out(sciStr(+m[2] * CH_NA) + " " + m[1]);
  if((m = /\b(?:percent|percentage|%) (?:composition |by mass )?of ([a-z]+) in ([A-Za-z0-9()]+)/i.exec(typed))){
    const e = sciBy(m[1]), f = chSpecies(m[2]), c = f && sciParse(f); if(e && c && c[e.s]) return out(pcNum(+(c[e.s] * e.m / sciMass(c) * 100).toFixed(2)) + "%");
  }
  if(/\bempirical formula\b/.test(q)){
    const parts = [...q.matchAll(/([\d.]+)\s*%\s*([a-z]+)/g)].map(t => [sciBy(t[2]), +t[1]]); if(parts.length >= 2 && parts.every(([e]) => e)){
      const mol = parts.map(([e, p]) => [e.s, p / e.m]), low = Math.min(...mol.map(([, v]) => v));
      for(let k = 1; k <= 6; k++){ const n = mol.map(([s, v]) => [s, v / low * k]); if(n.every(([, v]) => Math.abs(v - Math.round(v)) < 0.1)){
        const order = ["C", "H", ...n.map(([s]) => s).filter(s => s !== "C" && s !== "H").sort()];
        return out(sciSub(order.filter(s => n.some(([t]) => t === s)).map(s => { const v = Math.round(n.find(([t]) => t === s)[1]); return s + (v > 1 ? v : ""); }).join(""))); } }
    }
  }
  // solutions and gases
  if((m = /\bmolarity\b.*?([\d.]+)\s*(?:mol|moles)\b.*?\bin ([\d.]+)\s*(l|ml)\b/.exec(q))) return out(pcNum(+(+m[1] / (+m[2] / (m[3] === "ml" ? 1000 : 1))).toFixed(4)) + " M (mol/L)");
  if((m = /\bhow many grams of ([A-Za-z0-9()]+)\b.*?\bmake ([\d.]+)\s*(ml|l)\b.*?\b([\d.]+)\s*m\b/i.exec(typed))){ const x = mm(m[1]); if(x){ const n = +m[4] * +m[2] / (/^ml$/i.test(m[3]) ? 1000 : 1); return out(pcNum(+(n * x[1]).toFixed(2)) + " g (" + pcNum(+n.toFixed(4)) + " mol)"); } }
  if((m = /\bdilut\w*\b.*?([\d.]+)\s*(ml|l)\b.*?([\d.]+)\s*m\b.*?\bto ([\d.]+)\s*m\b/.exec(q))) return out(pcNum(+(+m[1] * +m[3] / +m[4]).toFixed(3)) + " " + (m[2] === "ml" ? "mL" : "L") + " (C₁V₁ = C₂V₂)");
  if(/\bstp\b/.test(q)){
    if((m = /\bvolume of ([\d.]+) (?:mol|moles)\b/.exec(q))) return out(pcNum(+(+m[1] * 22.4).toFixed(3)) + " L");
    if((m = /\b(?:moles|mol) (?:are )?in ([\d.]+)\s*l\b/.exec(q))) return out(pcNum(+(+m[1] / 22.4).toFixed(4)) + " mol");
  }
  // stoichiometry and the limiting reactant
  if((m = /\bhow many grams of (.+?) (?:are |is )?(?:made |produced |formed )?from ([\d.]+)\s*g (?:of )?(.+?)(?: (?:reacting|that reacts|reacts|burning|burns|burned|combusting) ?(?:with (.+?))?)?$/i.exec(typed))){
    const P = chSpecies(m[1]), R = chSpecies(m[3]), W = m[4] ? chSpecies(m[4]) : null, burn = /\b(burning|burns|burned|combusting)\b/.test(q);
    if(P && R){
      const left = [R, ...(W ? [W] : burn ? ["O2"] : [])], right = burn ? ["CO2", "H2O"] : [P];
      const k = chCoef(left, right.includes(P) ? right : [...right, P]); if(k){
        const all = [...left, ...(right.includes(P) ? right : [...right, P])], kr = k[0], kp = k[all.indexOf(P)], mol = +m[2] / sciMass(sciParse(R)) * kp / kr;
        return out(pcNum(+(mol * sciMass(sciParse(P))).toFixed(2)) + " g of " + sciSub(P) + " (" + pcNum(+mol.toFixed(3)) + " mol)");
      }
    }
  }
  if((m = /\blimiting (?:reactant|reagent)\b.*?([\d.]+)\s*mol(?:es)? (?:of )?([A-Za-z0-9]+)\b.*?([\d.]+)\s*mol(?:es)? (?:of )?([A-Za-z0-9]+)\b.*?\b(?:make|form|produce)s? (.+)$/i.exec(typed))){
    const A = chSpecies(m[2]), B = chSpecies(m[4]), P = chSpecies(m[5].toLowerCase()), k = A && B && P && chCoef([A, B], [P]);
    if(k){ const ra = +m[1] / k[0], rb = +m[3] / k[1], lim = ra <= rb ? A : B, other = ra <= rb ? B : A; return out(sciSub(lim) + " is the limiting reactant; " + sciSub(other) + " is in excess (the equation is " + [k[0] > 1 ? k[0] : "", sciSub(A), " + ", k[1] > 1 ? k[1] : "", sciSub(B), " → ", k[2] > 1 ? k[2] : "", sciSub(P)].join("") + ")."); }
  }
  if((m = /\bpercent yield\b.*?\btheoretical yield (?:is |of )?([\d.]+)\s*g\b.*?\bactual yield (?:is |of )?([\d.]+)/.exec(q)) || (m = /\bpercent yield\b.*?\bactual yield (?:is |of )?([\d.]+)\s*g\b.*?\btheoretical yield (?:is |of )?([\d.]+)/.exec(q)) && (m = [m[0], m[2], m[1]])) return out(pcNum(+(+m[2] / +m[1] * 100).toFixed(2)) + "%");
  // atoms: configurations, valence, trends, ion charges
  if((m = /^(?:the )?(?:electron )?configuration (?:of|for) ([a-z]+)$/.exec(q)) && sciBy(m[1])) return out(chConfig(sciBy(m[1]).z).map(([o, k]) => o + CH_SUP(k)).join(" "));
  if((m = /^how many valence electrons (?:does|do|are in|in) (?:an? )?(?:atom of )?([a-z]+)(?: atom)?(?: have)?$/.exec(q)) && sciBy(m[1])) return out(String(chValence(sciBy(m[1]).z)));
  if((m = /^which (?:has|is) (?:a )?(larger|bigger|smaller|more electronegative|less electronegative|higher ionization energy|lower ionization energy)(?: atomic radius| radius)?,? ([a-z]+) or ([a-z]+)$/.exec(q)) && sciBy(m[2]) && sciBy(m[3])){
    const a = sciBy(m[2]), b = sciBy(m[3]), size = e => chPeriod(e.z) * 100 - e.z, en = e => CH_EN[e.s] ?? 0;
    const pick = /larger|bigger|lower ionization/.test(m[1]) ? (size(a) >= size(b) ? a : b) : /smaller|higher ionization/.test(m[1]) ? (size(a) >= size(b) ? b : a) : /more/.test(m[1]) ? (en(a) >= en(b) ? a : b) : (en(a) >= en(b) ? b : a);
    return out(pick.n[0].toUpperCase() + pick.n.slice(1) + ".");
  }
  if((m = /\bwhich element has the (largest|smallest|highest|lowest) (atomic radius|electronegativity|ionization energy) in period (\d)\b/.exec(q))){
    const row = SCI_EL.filter(e => chPeriod(e.z) === +m[3] && e.z <= 36 && !/^(He|Ne|Ar|Kr)$/.test(e.s) || (chPeriod(e.z) === +m[3] && /radius|ionization/.test(m[2]) && /^(He|Ne|Ar|Kr)$/.test(e.s))).sort((x, y) => x.z - y.z);
    // Radius is largest at the start of a period; electronegativity and ionization energy are lowest there.
    const first = /radius/.test(m[2]) ? /largest|highest/.test(m[1]) : /smallest|lowest/.test(m[1]);
    const e = first ? row[0] : row[row.length - 1]; return out(e.n[0].toUpperCase() + e.n.slice(1) + " (" + e.s + ").");
  }
  if((m = /\bcharge (?:of|on) (?:an? |the )?([a-z]+) ion\b/.exec(q))){
    const word = m[1], e = sciBy(word) || sciBy(Object.entries(SCI_IDE).find(([, v]) => v === word)?.[0] || ""), c = e && SCI_CHARGE[e.s];
    if(c){ const ion = sciBy(word) ? e.n + " ion" : word + " ion"; return out((c > 0 ? "+" : "-") + Math.abs(c) + " (" + e.s + (Math.abs(c) > 1 ? CH_SUP(Math.abs(c)) : "") + (c > 0 ? "⁺" : "⁻") + "), for the " + ion + "."); }
  }
  // bonds, shape and polarity
  if((m = /^is ([A-Za-z0-9()]+) (ionic or covalent|covalent or ionic|polar or nonpolar|nonpolar or polar|polar or non-polar)$/i.exec(typed))){
    const f = chSpecies(m[1]), c = f && sciParse(f); if(!c) return null; const els = Object.keys(c);
    if(/ionic/.test(m[2])) return out(els.some(e => !SCI_NONMETAL.has(e)) && els.some(e => SCI_NONMETAL.has(e)) ? "Ionic: a metal and a nonmetal." : els.every(e => SCI_NONMETAL.has(e)) ? "Covalent: nonmetals share electrons." : "Metallic.");
    const shape = chShape(c); if(!shape) return null;
    return out(shape.polar ? "Polar: " + shape.why : "Nonpolar: " + shape.why);
  }
  if((m = /^(?:molecular )?(?:shape|geometry) of (?:an? )?(.+?)(?: molecule)?$/i.exec(typed))){
    const d = /(\d+) bonding (?:pairs|domains)\b.*?\b(no|\d+) lone pairs?/i.exec(m[1]);
    if(d){ const bp = +d[1], lp = d[2].toLowerCase() === "no" ? 0 : +d[2], s = CH_SHAPE[(bp + lp) + "," + lp]; return s ? out(s[0].toUpperCase() + s.slice(1) + ".") : null; }
    const f = sciParse(m[1]) ? m[1] : chSpecies(m[1].toLowerCase()), c = f && sciParse(f), shape = c && chShape(c);
    if(shape) return out(shape.name[0].toUpperCase() + shape.name.slice(1) + " (" + shape.why.replace(/\.$/, "") + ").");
  }
  // simple organic names
  if((m = /^name (?:the )?(?:alkane|alkene|alkyne|hydrocarbon|compound) (C\d*H\d+)$/i.exec(typed))){
    const c = sciParse(m[1]); if(c && c.C && c.H && Object.keys(c).length === 2 && c.C <= 10){ const n = c.C, h = c.H, end = h === 2 * n + 2 ? "ane" : h === 2 * n && n >= 2 ? "ene" : h === 2 * n - 2 && n >= 2 ? "yne" : null; if(end) return out(CH_ALK[n][0].toUpperCase() + CH_ALK[n].slice(1) + end + "."); }
  }
  if((m = /^(?:the )?(?:chemical |molecular )?formula (?:for|of) (meth|eth|prop|but|pent|hex|hept|oct|non|dec)(ane|ene|yne)$/.exec(q))){ const n = CH_ALK.indexOf(m[1]), h = m[2] === "ane" ? 2 * n + 2 : m[2] === "ene" ? 2 * n : 2 * n - 2; if(n && h > 0) return out(sciSub("C" + (n > 1 ? n : "") + "H" + h)); }
  return null;
}
// VSEPR from a formula: one central atom, single bonds to H and halogens, double bonds to O and S, then the shape and
// whether the bond dipoles cancel.
function chShape(c){
  const els = Object.keys(c), total = Object.values(c).reduce((s, v) => s + v, 0);
  if(total === 2){ const polar = els.length === 2 && Math.abs((CH_EN[els[0]] ?? 0) - (CH_EN[els[1]] ?? 0)) > 0.4; return {name:"linear", polar, why: polar ? "a diatomic molecule of two different atoms has one polar bond." : "two identical atoms share electrons equally."}; }
  const center = els.find(e => c[e] === 1 && e !== "H") || els.find(e => c[e] === 1); if(!center) return null;
  const ligands = els.filter(e => e !== center), n = ligands.reduce((s, e) => s + c[e], 0);
  const order = e => /^(O|S)$/.test(e) ? 2 : /^N$/.test(e) && ligands.length === 1 && n === 1 ? 3 : 1;
  let used = ligands.reduce((s, e) => s + order(e) * c[e], 0), v = chValence(sciBy(center).z);
  if(used > v) used = n; // ponytail: an oxygen that cannot take a double bond here takes a single one
  const lone = Math.max(0, Math.floor((v - used) / 2)), key = (n + lone) + "," + lone, name = CH_SHAPE[key]; if(!name) return null;
  const same = ligands.length === 1, dipole = ligands.some(e => Math.abs((CH_EN[e] ?? 0) - (CH_EN[center] ?? 0)) > 0.4);
  const polar = dipole && !(CH_SYM.has(key) && same);
  return {name, polar, why: n + " bonded atoms and " + lone + " lone pair" + (lone === 1 ? "" : "s") + " on " + center + (polar ? ", so the bond dipoles do not cancel." : dipole ? ", and the symmetric shape cancels the bond dipoles." : ", and the bonds are not polar.")};
}
// --- Chemistry 12, offline ---
// pH and pOH, strong and weak acids, conjugate pairs, Ka, titration, equilibrium expressions and Keq, Le Chatelier,
// Ksp and solubility, oxidation numbers, redox agents, cell potentials and half-reactions. Uses the sci10 tables.
// precalc() asks it after chem11(); null means "not mine". Graded by COURSE=chem12 node test/exam-course.js.
// Mirrored in kmp/shared/.../Chemistry12.kt.
const C12_STRONG_ACID = {HCl:1, HBr:1, HI:1, HNO3:1, HClO4:1, H2SO4:2}, C12_STRONG_BASE = {LiOH:1, NaOH:1, KOH:1, RbOH:1, CsOH:1, "Ca(OH)2":2, "Sr(OH)2":2, "Ba(OH)2":2};
const C12_ACID_NAMES = {"hydrochloric acid":"HCl", "hydrobromic acid":"HBr", "hydroiodic acid":"HI", "nitric acid":"HNO3", "perchloric acid":"HClO4", "sulfuric acid":"H2SO4", "acetic acid":"HC2H3O2", "ethanoic acid":"HC2H3O2", "hydrofluoric acid":"HF", "carbonic acid":"H2CO3", "phosphoric acid":"H3PO4", "hydrocyanic acid":"HCN", "formic acid":"HCOOH", "sodium hydroxide":"NaOH", "potassium hydroxide":"KOH", "lithium hydroxide":"LiOH", "calcium hydroxide":"Ca(OH)2", "barium hydroxide":"Ba(OH)2", "ammonia":"NH3"};
// Standard reduction potentials (V) at 25 °C, by the oxidized form.
const C12_E = {"Li+":-3.04, "K+":-2.93, "Ca2+":-2.87, "Na+":-2.71, "Mg2+":-2.37, "Al3+":-1.66, "Zn2+":-0.76, "Fe2+":-0.44, "Ni2+":-0.25, "Sn2+":-0.14, "Pb2+":-0.13, "H+":0, "Cu2+":0.34, "I2":0.54, "Ag+":0.80, "Br2":1.07, "Cl2":1.36, "Au3+":1.50, "F2":2.87};
const C12_SUP = s => String(s).replace(/[0-9+-]/g, c => "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻"["0123456789+-".indexOf(c)]);
// "Cu2+" as [formula, charge]: ["Cu", 2]; "SO4 2-" or "SO4^2-" as ["SO4", -2]; "Cl-" as ["Cl", -1].
// A number before the sign is the charge on a one-element ion (Cu2+) or after a space or ^ (CO3 2-, SO4^2-);
// otherwise it belongs to the formula (HCO3-, NH4+).
function c12Ion(s){
  const t = String(s).trim(), m = /^(.+?)(\s+|\^)?(\d*)([+-])$/.exec(t); if(!m || !/[A-Za-z]/.test(m[1])) return [t, 0];
  const sign = m[4] === "+" ? 1 : -1, one = /^[A-Z][a-z]?$/.test(m[1]);
  if(m[3] && !m[2] && !one) return [m[1] + m[3], sign];
  return [m[1], sign * +(m[3] || 1)];
}
const c12Show = (f, c) => sciSub(f) + (c ? C12_SUP((Math.abs(c) > 1 ? Math.abs(c) : "") + (c > 0 ? "+" : "-")) : "");
// Sci notation with a clean mantissa: 1 × 10⁻⁵, 1.34 × 10⁻⁵.
const c12Sci = v => { const e = Math.floor(Math.log10(Math.abs(v)) + 1e-12), m = +(v / 10 ** e).toPrecision(3); return pcNum(m) + " × 10" + C12_SUP(e); };
// A typed number: "1 x 10^-3", "1.8 × 10^-5", "1e-3", "0.001".
function c12Num(s){ const m = /^([\d.]+)\s*(?:[x×*]\s*10\s*\^\s*(-?\d+)|e(-?\d+))?$/i.exec(String(s).trim()); return m ? +m[1] * 10 ** +(m[2] || m[3] || 0) : null; }
const C12_N = "([\\d.]+(?:\\s*[x×*]\\s*10\\s*\\^\\s*-?\\d+|e-?\\d+)?)";
// Oxidation number of one element in a formula with a charge, by the usual rules for everything else.
function c12Ox(target, f, charge){
  const c = sciParse(f); if(!c || !c[target]) return null; if(Object.keys(c).length === 1) return charge / c[target];
  const peroxide = /^(H2O2|Na2O2|K2O2|BaO2|Li2O2)$/.test(f), metalHydride = c.H && Object.keys(c).some(e => /^(Li|Na|K|Rb|Cs|Mg|Ca|Sr|Ba)$/.test(e)) && !c.O;
  const rule = e => e === "F" ? -1 : /^(Li|Na|K|Rb|Cs)$/.test(e) ? 1 : /^(Be|Mg|Ca|Sr|Ba)$/.test(e) ? 2 : e === "Al" ? 3 : e === "H" ? (metalHydride ? -1 : 1) : e === "O" ? (peroxide ? -1 : c.F ? 2 : -2) : /^(Cl|Br|I)$/.test(e) && !c.O ? -1 : null;
  let sum = 0; for(const [e, k] of Object.entries(c)){ if(e === target) continue; const r = rule(e); if(r === null) return null; sum += r * k; }
  return (charge - sum) / c[target];
}
const c12Sign = v => (v > 0 ? "+" : v < 0 ? "-" : "") + pcNum(Math.abs(+v.toFixed(3)));
// One side of an equation as [[coefficient, formula, charge, state]].
function c12Side(s){ return s.split(/\s+\+\s+/).map(t => { const m = /^(\d*)\s*(.+?)(?:\s*\((s|l|g|aq)\))?$/.exec(t.trim()); const [f, ch] = c12Ion(m[2]); return [+(m[1] || 1), f, ch, m[3] || ""]; }); }
const C12_ARROW = /\s*(?:<->|<=>|⇌|↔|->|→|=)\s*/;
function chem12(q, raw){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"}), r = String(raw || q).trim().replace(/[?!]+$/, "");
  const typed = r.replace(/^(?:what(?:'s|’s| is)\s+)?(?:the\s+)?/i, "");
  const facts = [
    [/\bkw\b(?: at 25 ?°? ?c)?$|\bion product of water\b/, "Kw = [H⁺][OH⁻] = 1.0 × 10⁻¹⁴ at 25 °C."],
    [/^(?:what is )?(?:the )?ph of pure water/, "7.00 at 25 °C: [H⁺] = [OH⁻] = 1.0 × 10⁻⁷ M."],
    [/^(?:what is )?(?:a )?br[øo]nsted[- ]lowry acid$/, "A proton (H⁺) donor."], [/^(?:what is )?(?:a )?br[øo]nsted[- ]lowry base$/, "A proton (H⁺) acceptor."],
    [/^(?:what is )?(?:an? )?arrhenius acid$/, "A substance that makes H⁺ (H₃O⁺) in water."], [/^(?:what is )?(?:an? )?arrhenius base$/, "A substance that makes OH⁻ in water."],
    [/^(?:what is )?(?:an? )?amphoteric(?: substance)?$|^(?:what is )?amphiprotic$/, "A substance that can act as an acid or a base, such as water or HCO₃⁻."],
    [/^(?:what is )?(?:a )?buffer(?: solution)?$/, "A mix of a weak acid and its conjugate base (or a weak base and its conjugate acid) that resists changes in pH when small amounts of acid or base are added."],
    [/^(?:what is )?(?:the )?equivalence point$/, "The point in a titration where the moles of acid equal the moles of base added, so it is exactly neutralized."],
    [/^(?:what is )?(?:the )?end ?point(?: of a titration)?$/, "The point where the indicator changes colour; a good indicator puts it at the equivalence point."],
    [/\bindicator\b.*\bstrong acid\b.*\bstrong base\b|\bindicator\b.*\bstrong base\b.*\bstrong acid\b/, "Bromothymol blue (or phenolphthalein): the equivalence point is at pH 7."],
    [/\bindicator\b.*\bweak acid\b.*\bstrong base\b/, "Phenolphthalein: the equivalence point is above pH 7."], [/\bindicator\b.*\bstrong acid\b.*\bweak base\b/, "Methyl orange (or methyl red): the equivalence point is below pH 7."],
    [/^(?:what is )?activation energy$/, "The minimum energy colliding particles need to react: the energy needed to start a reaction. A catalyst (an enzyme in the body) lowers it."],
    [/\bhow does a catalyst\b|\bwhat does a catalyst do\b|^(?:what is )?a catalyst$/, "It speeds up a reaction by giving it a pathway with a lower activation energy, and it is not used up."],
    [/\bdoes a catalyst change (?:the )?(?:equilibrium|position|value of k|k\b|keq)/, "No. A catalyst speeds up the forward and reverse reactions equally, so equilibrium comes sooner but its position and K do not change."],
    [/\bfactors (?:that )?affect (?:the )?(?:reaction )?rate\b|\bwhat affects (?:the )?rate\b/, "Temperature, concentration (or pressure for gases), surface area, the nature of the reactants, and a catalyst."],
    [/^(?:what is )?collision theory$/, "Particles react only when they collide with enough energy (the activation energy) and the right orientation."],
    [/^(?:what is )?(?:the )?rate of (?:a )?reaction$|^(?:what is )?reaction rate$/, "The change in the amount or concentration of a reactant or product per unit of time."],
    [/\bwhy does (?:increasing |raising )?temperature increase (?:the )?(?:reaction )?rate\b/, "Particles move faster, so they collide more often and more of the collisions have enough energy to react."],
    [/\bhow does surface area affect (?:the )?(?:reaction )?rate\b/, "More surface area exposes more particles, so there are more collisions and the reaction goes faster."],
    [/^(?:what is )?(?:a )?reaction mechanism$/, "The series of elementary steps that make up the overall reaction. The slowest step sets the rate."],
    [/^(?:what is )?(?:the )?rate[- ]determining step$/, "The slowest step in a mechanism, which sets the overall rate."],
    [/\bprecipitate\b.*\bq\b.*\b(?:greater|more|larger|bigger) than ksp\b|\bq\s*>\s*ksp\b/, "Yes. When the trial ion product Q is greater than Ksp, the solution is supersaturated and a precipitate forms."],
    [/\bprecipitate\b.*\bq\b.*\b(?:less|smaller|lower) than ksp\b|\bq\s*<\s*ksp\b/, "No. When Q is less than Ksp, the solution is unsaturated and more can dissolve."],
    [/^(?:what is )?oxidation$/, "Loss of electrons (the oxidation number goes up). LEO the lion says GER."], [/^(?:what is )?reduction$/, "Gain of electrons (the oxidation number goes down)."],
    [/^(?:what is )?(?:an? )?oxidizing agent$/, "The substance that is reduced: it takes electrons from something else."], [/^(?:what is )?(?:a )?reducing agent$/, "The substance that is oxidized: it gives electrons to something else."],
    [/\b(?:happens )?at the anode\b|^(?:what is )?(?:the )?anode$/, "Oxidation. In a galvanic cell the anode is negative; in an electrolytic cell it is positive."],
    [/\b(?:happens )?at the cathode\b|^(?:what is )?(?:the )?cathode$/, "Reduction. In a galvanic cell the cathode is positive; in an electrolytic cell it is negative."],
    [/^(?:what is )?electrolysis$/, "Using electricity to drive a non-spontaneous redox reaction, such as splitting water or plating a metal."],
    [/^(?:what is )?(?:a )?(?:galvanic|voltaic) cell$/, "A cell where a spontaneous redox reaction turns chemical energy into electrical energy."],
    [/^(?:what is )?(?:an? )?electrolytic cell$/, "A cell where an outside power source drives a non-spontaneous redox reaction."],
    [/^(?:what is )?(?:a |the )?salt bridge$/, "It connects the two half-cells and lets ions move to keep each side neutral, so current keeps flowing."],
    [/\bexothermic\b.*\btemperature (?:increases|is increased|rises|goes up)|\bincrease (?:the )?temperature\b.*\bexothermic\b/, "It shifts left, toward the reactants: heat is a product, so adding heat favours the reverse reaction, and K gets smaller."],
    [/\bexothermic\b.*\btemperature (?:decreases|is decreased|falls|drops|goes down)/, "It shifts right, toward the products, and K gets larger."],
    [/\bendothermic\b.*\btemperature (?:increases|is increased|rises|goes up)|\bincrease (?:the )?temperature\b.*\bendothermic\b/, "It shifts right, toward the products: heat is a reactant, so adding heat favours the forward reaction, and K gets larger."],
    [/\bendothermic\b.*\btemperature (?:decreases|is decreased|falls|drops|goes down)/, "It shifts left, toward the reactants, and K gets smaller."],
  ];
  for(const [re, body] of facts) if(re.test(q)) return out(body);
  let m;
  // pH, pOH, [H+] and [OH-]
  if((m = new RegExp("\\bph\\b.*?\\[h\\+?\\]\\s*(?:=|of|is)?\\s*" + C12_N).exec(q))){ const h = c12Num(m[1]); if(h) return out("pH = " + pcNum(+(-Math.log10(h)).toFixed(2))); }
  if((m = new RegExp("\\bph\\b.*?\\[oh-?\\]\\s*(?:=|of|is)?\\s*" + C12_N).exec(q))){ const oh = c12Num(m[1]); if(oh) return out("pH = " + pcNum(+(14 + Math.log10(oh)).toFixed(2))); }
  if((m = /\bpoh\b.*?\bph (?:of |=\s*|is )?([\d.]+)/.exec(q))) return out("pOH = " + pcNum(+(14 - +m[1]).toFixed(2)));
  if((m = /^(?:the )?ph\b.*?\bpoh (?:of |=\s*|is )?([\d.]+)/.exec(q))) return out("pH = " + pcNum(+(14 - +m[1]).toFixed(2)));
  if((m = /^\[(h\+|h3o\+|oh-)\]\s*(?:of|in|for) (?:a )?(?:solution )?(?:with )?(?:a )?ph (?:of |=\s*)?([\d.]+)/.exec(q))){ const ph = +m[2], v = /oh/.test(m[1]) ? 10 ** -(14 - ph) : 10 ** -ph; return out("[" + (/oh/.test(m[1]) ? "OH⁻" : "H⁺") + "] = " + c12Sci(v) + " M"); }
  if((m = new RegExp("^(?:the )?ph of (?:a )?" + C12_N + "\\s*m\\s+(?:solution of )?(.+?)(?: solution)?(?:\\s+with ka\\s*=\\s*" + C12_N + ")?$", "i").exec(typed.replace(/^ph/i, "pH")))){
    const C = c12Num(m[1]), name = m[2].trim(), f = C12_ACID_NAMES[name.toLowerCase()] || (sciParse(name) ? name : null); if(!C || !f) return null;
    if(C12_STRONG_ACID[f] !== undefined) return out("pH = " + pcNum(+(-Math.log10(C)).toFixed(2)) + " (" + sciSub(f) + " is a strong acid, so [H⁺] = " + c12Sci(C) + " M)");
    if(C12_STRONG_BASE[f] !== undefined){ const oh = C * C12_STRONG_BASE[f]; return out("pH = " + pcNum(+(14 + Math.log10(oh)).toFixed(2)) + " ([OH⁻] = " + c12Sci(oh) + " M, pOH = " + pcNum(+(-Math.log10(oh)).toFixed(2)) + ")"); }
    // The square-root shortcut when it passes the 5% rule, as a textbook does; the quadratic when it does not.
    if(m[3]){ const Ka = c12Num(m[3]), approx = Math.sqrt(Ka * C), x = approx / C < 0.05 ? approx : (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * C)) / 2; return out("pH = " + pcNum(+(-Math.log10(x)).toFixed(2)) + " ([H⁺] = " + c12Sci(x) + " M" + (x === approx ? ", from x = √(Ka·C)" : ", from the quadratic, since x is more than 5% of C") + ")"); }
  }
  // strong or weak, conjugate pairs, Ka
  if((m = /^is (.+?) (?:a )?(strong or weak|weak or strong) (acid|base)$/i.exec(typed))){
    const n = m[1].trim(), f = C12_ACID_NAMES[n.toLowerCase()] || (sciParse(n) ? n : null); if(!f) return null;
    const strong = m[3].toLowerCase() === "acid" ? C12_STRONG_ACID[f] !== undefined : C12_STRONG_BASE[f] !== undefined;
    return out((strong ? "Strong: it ionizes completely in water." : "Weak: it only partly ionizes in water, so it sets up an equilibrium."));
  }
  if((m = /^conjugate (base|acid) (?:of|for) (.+)$/i.exec(typed))){
    let [f, c] = c12Ion(m[2].trim()); if(!sciParse(f)) return null;
    if(m[1].toLowerCase() === "base"){
      const lead = /^H(\d*)/.exec(f);
      if(lead) f = (+(lead[1] || 1) > 2 ? "H" + (+lead[1] - 1) : +(lead[1] || 1) === 2 ? "H" : "") + f.slice(lead[0].length);
      else { const t = /H(\d*)$/.exec(f); if(!t) return null; const k = +(t[1] || 1) - 1; f = f.slice(0, t.index) + (k ? "H" + (k > 1 ? k : "") : ""); }
      c -= 1;
    } else {
      const t = /H(\d*)(?=[^a-z]|$)/.exec(f.slice(1)) && /^[A-Z][a-z]?H/.test(f) ? /H(\d*)/.exec(f.slice(1)) : null;
      if(/^H/.test(f)){ const lead = /^H(\d*)/.exec(f); f = "H" + (+(lead[1] || 1) + 1) + f.slice(lead[0].length); }
      else if(t){ const k = +(t[1] || 1) + 1; f = f[0] + (f[1] && /[a-z]/.test(f[1]) ? f[1] : "") + "H" + k + f.slice(t.index + 1 + t[0].length); }
      else f = "H" + f;
      c += 1;
    }
    f = f.replace(/^H1(?=[A-Z])/, "H"); if(f === "OH2") f = "H2O"; // ponytail: OH⁻ gains H⁺ to make water, written H₂O
    return out(c12Show(f, c));
  }
  if((m = /^ka expression for (.+)$/i.exec(typed))){
    const f = m[1].trim(); if(!/^H/.test(f) || !sciParse(f)) return null;
    const lead = /^H(\d*)/.exec(f), base = (+(lead[1] || 1) > 2 ? "H" + (+lead[1] - 1) : +(lead[1] || 1) === 2 ? "H" : "") + f.slice(lead[0].length);
    return out("Ka = [H⁺][" + c12Show(base, -1) + "]/[" + sciSub(f) + "]");
  }
  // titration
  if((m = /\bhow many (ml|l) of ([\d.]+)\s*m (.+?) (?:to|will|are needed to|is needed to) neutrali[sz]e ([\d.]+)\s*(ml|l) of ([\d.]+)\s*m (.+)$/i.exec(typed))){
    const eq = f => C12_STRONG_ACID[f] ?? C12_STRONG_BASE[f] ?? 1, fa = m[3].trim(), fb = m[7].trim();
    const moles = +m[6] * +m[4] / (/^ml$/i.test(m[5]) ? 1000 : 1) * eq(fb), v = moles / (+m[2] * eq(fa)) * (/^ml$/i.test(m[1]) ? 1000 : 1);
    return out(pcNum(+v.toFixed(3)) + " " + (/^ml$/i.test(m[1]) ? "mL" : "L"));
  }
  // equilibrium: expressions, Keq, Le Chatelier
  const T = "\\d*[A-Z][A-Za-z0-9()]*(?:\\s*\\((?:s|l|g|aq)\\))?", S = T + "(?:\\s*\\+\\s*" + T + ")*";
  const eqm = new RegExp("(" + S + "\\s*(?:<->|<=>|⇌|↔)\\s*" + S + ")").exec(typed);
  const sides = eqm ? eqm[1].split(C12_ARROW).map(c12Side) : null;
  const term = ([k, f]) => "[" + sciSub(f) + "]" + (k > 1 ? C12_SUP(k).replace(/[⁺⁻]/g, "") : "");
  const gas = t => t[3] !== "s" && t[3] !== "l";
  if(sides && sides.length === 2 && /\b(?:equilibrium constant expression|keq expression|k expression|expression for k|expression for keq)\b/i.test(typed)){
    const top = sides[1].filter(gas).map(term).join(""), bot = sides[0].filter(gas).map(term);
    return out("Keq = " + top + "/" + (bot.length > 1 ? "(" + bot.join("") + ")" : bot.join("")));
  }
  if(sides && sides.length === 2 && /\bkeq\b|\bk\s*=|\bequilibrium constant\b/i.test(typed) && /\[[A-Za-z0-9]+\]\s*=/.test(typed)){
    const conc = {}; for(const t of typed.matchAll(/\[([A-Za-z0-9]+)\]\s*=\s*([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+)?)/g)) conc[t[1]] = c12Num(t[2]);
    const prod = side => side.filter(gas).reduce((s, [k, f]) => s * (conc[f] ?? NaN) ** k, 1), K = prod(sides[1]) / prod(sides[0]);
    if(isFinite(K)) return out("Keq = " + (K >= 1e4 || K < 1e-3 ? c12Sci(K) : pcNum(+K.toPrecision(4))));
  }
  if(sides && sides.length === 2 && /\bwhat happens\b|\bwhich way\b|\bshift\b/i.test(typed)){
    const where = f => sides[0].some(t => t[1].toLowerCase() === f.toLowerCase()) ? "left" : sides[1].some(t => t[1].toLowerCase() === f.toLowerCase()) ? "right" : null;
    const say = (dir, why) => out("It shifts " + dir + ", toward the " + (dir === "right" ? "products" : "reactants") + ", " + why + ".");
    if((m = /\b(?:more |extra )?([A-Z][A-Za-z0-9]*) is (added|increased|removed|decreased)\b|\b(add(?:ing)?|remov(?:e|ing)) (?:more |some )?([A-Z][A-Za-z0-9]*)\b|\bmore ([A-Z][A-Za-z0-9]*) is added\b/.exec(typed))){
      const f = m[1] || m[4] || m[5], add = /add|increas/.test(m[2] || m[3] || "added"), w = where(f); if(!w) return null;
      const dir = add ? (w === "left" ? "right" : "left") : w;
      return say(dir, (add ? "to use up the added " : "to replace the removed ") + sciSub(f));
    }
    if((m = /\b(pressure|volume) (increases|is increased|rises|goes up|decreases|is decreased|drops|goes down)\b/i.exec(typed))){
      const up = /increas|rises|up/.test(m[2]) === (m[1].toLowerCase() === "pressure"), count = side => side.filter(t => t[3] === "g" || !t[3] && !/aq|s|l/.test(t[3])).reduce((s, [k]) => s + k, 0), L = count(sides[0]), R = count(sides[1]);
      if(L === R) return out("No shift: both sides have " + L + " moles of gas, so pressure changes do not move the equilibrium.");
      const dir = up ? (L > R ? "right" : "left") : (L > R ? "left" : "right");
      return say(dir, (up ? "the side with fewer" : "the side with more") + " moles of gas (" + L + " on the left, " + R + " on the right)");
    }
    if(/\bcatalyst\b/i.test(typed)) return out("No shift: a catalyst speeds up both directions equally.");
  }
  // solubility: Ksp expressions, molar solubility, Ksp from solubility
  const salt = f => {
    const polys = [...SCI_POLY, ["CrO4", "chromate", -2], ["Cr2O7", "dichromate", -2]];
    const m2 = /^([A-Z][a-z]?)(\d*)(.+)$/.exec(f); if(!m2) return null; const cat = m2[1], x = +(m2[2] || 1), rest = m2[3];
    const cc = SCI_CHARGE[cat] > 0 ? SCI_CHARGE[cat] : {Pb:2, Fe:3, Cu:2, Ni:2, Co:2, Mn:2, Sn:2, Hg:2, Cr:3}[cat]; if(!cc) return null;
    let p = /^\((.+)\)(\d+)$/.exec(rest), an, y;
    if(p){ an = p[1]; y = +p[2]; } else { const s2 = /^([A-Z][a-z]?(?:\d*[A-Z][a-z]?\d*)*?)(\d*)$/.exec(rest); const poly = polys.find(([pp]) => pp === rest); if(poly){ an = rest; y = 1; } else if(/^[A-Z][a-z]?\d*$/.test(rest)){ const t = /^([A-Z][a-z]?)(\d*)$/.exec(rest); an = t[1]; y = +(t[2] || 1); } else if(s2){ an = rest; y = 1; } else return null; }
    const poly = polys.find(([pp]) => pp === an), ac = poly ? poly[2] : SCI_CHARGE[an]; if(!ac || ac >= 0) return null;
    if(cc * x + ac * y !== 0) return null;
    return {cat, x, cc, an, y, ac};
  };
  if((m = /^ksp expression for ([A-Za-z0-9()]+)$/i.exec(typed))){ const s = salt(m[1]); if(s) return out("Ksp = [" + c12Show(s.cat, s.cc) + "]" + (s.x > 1 ? C12_SUP(s.x).replace(/[⁺⁻]/g, "") : "") + "[" + c12Show(s.an, s.ac) + "]" + (s.y > 1 ? C12_SUP(s.y).replace(/[⁺⁻]/g, "") : "")); }
  if((m = new RegExp("\\bmolar solubility of ([A-Za-z0-9()]+)\\b.*?\\bksp\\s*(?:=|is|of)\\s*" + C12_N, "i").exec(typed))){
    const s = salt(m[1]), K = c12Num(m[2]); if(s && K){ const n = s.x + s.y, v = (K / (s.x ** s.x * s.y ** s.y)) ** (1 / n); return out(c12Sci(v) + " M (Ksp = " + (s.x ** s.x * s.y ** s.y > 1 ? s.x ** s.x * s.y ** s.y : "") + "s" + (n > 1 ? C12_SUP(n).replace(/[⁺⁻]/g, "") : "") + ")"); }
  }
  if((m = new RegExp("\\bksp of ([A-Za-z0-9()]+)\\b.*?\\bmolar solubility (?:is|of|=)\\s*" + C12_N, "i").exec(typed))){
    const s = salt(m[1]), v = c12Num(m[2]); if(s && v){ const K = s.x ** s.x * s.y ** s.y * v ** (s.x + s.y); return out("Ksp = " + c12Sci(K)); }
  }
  // redox: oxidation numbers, what is oxidized, agents, cells, half-reactions
  if((m = /^oxidation (?:number|state) of ([A-Z][a-z]?) in (.+)$/i.exec(typed))){ const [f, c] = c12Ion(m[2]); const v = c12Ox(m[1], f, c); if(v !== null && isFinite(v)) return out(c12Sign(v)); }
  if((m = /^(?:in )?(.+?(?:->|→).+?),?\s+(?:what|which) (?:is|species is|substance is|element is) (oxidized|reduced|the oxidizing agent|the reducing agent)$/i.exec(typed)) || (m = /^(?:(?:what|which) is )?(?:the )?(oxidized|reduced|oxidizing agent|reducing agent)(?: species)? in (.+?(?:->|→).+)$/i.exec(typed)) && (m = [m[0], m[2], m[1]])){
    const [L, R] = m[1].split(/\s*(?:->|→)\s*/).map(c12Side), want = m[2].toLowerCase().replace(/^the /, "");
    const ox = t => { const c = sciParse(t[1]); if(!c) return {}; const o = {}; for(const e of Object.keys(c)){ const v = c12Ox(e, t[1], t[2]); if(v !== null) o[e] = v; } return o; };
    for(const a of L){ const oa = ox(a); for(const [e, v] of Object.entries(oa)){ const b = R.find(t => ox(t)[e] !== undefined); if(!b) continue; const w = ox(b)[e]; if(w === v) continue;
      const up = w > v, name = sciBy(e).n, label = c12Show(a[1], a[2]);
      if((want === "oxidized" && up) || (want === "reduced" && !up)) return out(label + " (" + name + ") is " + (up ? "oxidized" : "reduced") + ": its oxidation number goes from " + c12Sign(v) + " to " + c12Sign(w) + ".");
      if((want === "reducing agent" && up) || (want === "oxidizing agent" && !up)) return out(label + " is the " + want + ": it is " + (up ? "oxidized" : "reduced") + " (" + c12Sign(v) + " to " + c12Sign(w) + ").");
    } }
  }
  if(/\b(?:standard )?(?:cell )?potential\b|\be°?\s*cell\b/i.test(typed)){
    const given = [...typed.matchAll(/\((-?[\d.]+)\s*v\)/gi)].map(t => +t[1]);
    if(given.length === 2) return out("E°cell = " + pcNum(+(Math.max(...given) - Math.min(...given)).toFixed(2)) + " V (cathode minus anode)");
    const named = Object.keys(C12_E).map(k => [k, sciBy(c12Ion(k)[0].replace(/2$/, ""))]).filter(([, e]) => e && new RegExp("\\b(" + e.n + "|" + e.s + ")\\b", "i").test(typed));
    if(named.length === 2){ const [a, b] = named.map(([k]) => C12_E[k]); return out("E°cell = " + pcNum(+(Math.max(a, b) - Math.min(a, b)).toFixed(2)) + " V (" + pcNum(Math.max(a, b)) + " V minus " + pcNum(Math.min(a, b)) + " V)"); }
  }
  if((m = /\bhalf[- ]reaction for the (oxidation|reduction) of (?:an? )?([a-z]+)(?:\s*\((i{1,3}|iv)\))?(?: ion| metal| atom| gas)?$/i.exec(typed))){
    const e = sciBy(m[2]); if(!e) return null;
    const ch = m[3] ? {i:1, ii:2, iii:3, iv:4}[m[3].toLowerCase()] : SCI_CHARGE[e.s] ?? Object.entries(C12_E).map(([k]) => c12Ion(k)).find(([f]) => f === e.s)?.[1];
    if(!ch) return null; const diatomic = /^(F|Cl|Br|I|O|N|H)$/.test(e.s) && ch < 0, n = Math.abs(ch) * (diatomic ? 2 : 1);
    const atom = diatomic ? sciSub(e.s + "2") : e.s, ion = (diatomic ? "2" : "") + c12Show(e.s, ch), el = n + "e⁻";
    if(ch > 0) return out(m[1].toLowerCase() === "oxidation" ? atom + " → " + ion + " + " + el : ion + " + " + el + " → " + atom);
    return out(m[1].toLowerCase() === "reduction" ? atom + " + " + el + " → " + ion : ion + " → " + atom + " + " + el);
  }
  return null;
}
// --- Physics 11, offline ---
// Kinematics by the four constant-acceleration equations, free fall, Newton's laws, weight, friction, net force,
// efficiency, waves, series and parallel resistors, electric power and energy, and km/h to m/s. g = 9.8 m/s².
// precalc() asks it after sci10(); null means "not mine". Graded by COURSE=phys11 node test/exam-course.js.
// Mirrored in kmp/shared/.../Physics11.kt.
const P11_G = 9.8;
const P11_VEC = {velocity:1, displacement:1, acceleration:1, force:1, momentum:1, weight:1, impulse:1, speed:0, distance:0, mass:0, time:0, energy:0, work:0, power:0, temperature:0, volume:0, density:0};
const P11_COUNT = {one:1, two:2, three:3, four:4, five:5};
function phys11(q){
  // Three significant figures, the way a physics answer is written.
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"}), n = v => pcNum(+(+v).toPrecision(3)), g = P11_G;
  const val = re => { const t = re.exec(q); return t ? +t[1] : null; };
  const facts = [
    [/\bdifference between distance and displacement\b/, "Distance is how far something travels along its path, a scalar. Displacement is the straight-line change in position with a direction, a vector."],
    [/\bdifference between speed and velocity\b/, "Speed is how fast, a scalar. Velocity is speed with a direction, a vector."],
    [/\bnewton'?s first law\b/, "An object stays at rest or keeps moving at a constant velocity unless a net force acts on it (the law of inertia)."],
    [/\bnewton'?s second law\b/, "F = ma: the net force equals mass times acceleration."],
    [/\bnewton'?s third law\b/, "For every action force there is an equal and opposite reaction force on the other object."],
    [/^(?:what is )?inertia$/, "An object's tendency to resist a change in its motion. More mass means more inertia."],
    [/\bspeed of sound(?: in air)?$/, "About 343 m/s in air at 20 °C (331 m/s at 0 °C)."],
    [/^(?:what is )?constructive interference$/, "Two waves meet in phase and add, making a larger wave."],
    [/^(?:what is )?destructive interference$/, "Two waves meet out of phase and cancel, making a smaller wave or none."],
    [/^(?:what is )?(?:a )?transverse wave$/, "A wave where the medium moves perpendicular to the direction the wave travels, like a wave on a rope or light."],
    [/^(?:what is )?(?:a )?longitudinal wave$/, "A wave where the medium moves parallel to the direction the wave travels, in compressions and rarefactions, like sound."],
    [/\bacceleration (?:due to|of) gravity\b|^(?:what is )?(?:the value of )?g on earth$/, "9.8 m/s² near Earth's surface."],
    [/\bwavelength\b.*\bfrequency (?:doubles|is doubled)\b|\bfrequency (?:doubles|is doubled)\b.*\bwavelength\b/, "The wavelength halves, since v = fλ and v stays the same."],
    [/\bwavelength\b.*\bfrequency (?:halves|is halved)\b|\bfrequency (?:halves|is halved)\b.*\bwavelength\b/, "The wavelength doubles, since v = fλ and v stays the same."],
  ];
  for(const [re, body] of facts) if(re.test(q)) return out(body);
  let m;
  if((m = /^is (?:a |an )?([a-z]+) (?:a )?(?:vector or (?:a )?scalar|scalar or (?:a )?vector)(?: quantity)?$/.exec(q)) && P11_VEC[m[1]] !== undefined) return out(P11_VEC[m[1]] ? "A vector: it has a size and a direction." : "A scalar: it has a size but no direction.");
  // free fall, then the four constant-acceleration equations
  if((m = /\bdropped from ([\d.]+)\s*m\b/.exec(q))){
    const h = +m[1];
    if(/\bhow long\b|\btime\b/.test(q)) return out(n(Math.sqrt(2 * h / g)) + " s (t = √(2h/g))");
    if(/\b(speed|velocity|how fast)\b/.test(q)) return out(n(Math.sqrt(2 * g * h)) + " m/s (v = √(2gh))");
  }
  if((m = /\bafter falling for ([\d.]+)\s*s\b/.exec(q)) && /\b(velocity|speed|how fast)\b/.test(q)) return out(n(g * +m[1]) + " m/s (v = gt)");
  if((m = /\bfalls? for ([\d.]+)\s*s\b/.exec(q)) && /\b(distance|how far)\b/.test(q)) return out(n(g * m[1] ** 2 / 2) + " m (d = ½gt²)");
  if((m = /\bthrown (?:straight )?up(?:ward)? at ([\d.]+)\s*m\/s\b/.exec(q))){
    const v = +m[1]; if(/\bhow high\b|\bmax(?:imum)? height\b/.test(q)) return out(n(v * v / (2 * g)) + " m (h = v²/2g)"); if(/\bhow long\b/.test(q)) return out(n(2 * v / g) + " s to come back down (" + n(v / g) + " s to the top)");
  }
  const ask = (/\b(acceleration|final velocity|final speed|initial velocity|displacement|distance|time|how long|how far)\b/.exec(q) || [])[1];
  if(ask && /\b(m\/s|accelerat|from rest)\b/.test(q) && !/\bkg\b|\bnet force\b/.test(q)){
    let vi = /\bfrom rest\b|\bstarts? at rest\b/.test(q) ? 0 : val(/\binitial (?:velocity|speed) (?:is |of )?(-?[\d.]+)/) ?? val(/\bfrom (-?[\d.]+)\s*m\/s\b/) ?? val(/\bgoes from (-?[\d.]+)\b/);
    let vf = val(/\bfinal (?:velocity|speed) (?:is |of )?(-?[\d.]+)/) ?? val(/\bto (-?[\d.]+)\s*m\/s\b/);
    // Acceleration is the number in m/s² wherever it sits; the others go by their words.
    let a = val(/(-?[\d.]+)\s*m\/s(?:2|²|\^2|\/s)/), t = val(/\b(?:in|for|time is|after|over)\s+([\d.]+)\s*(?:s|seconds?)\b/), d = val(/\b(?:over|for|displacement(?: is| of)?|distance(?: is| of)?)\s+([\d.]+)\s*m\b(?!\/)/);
    const want = /^accel/.test(ask) ? "a" : /^final/.test(ask) ? "vf" : /^initial/.test(ask) ? "vi" : /^(time|how long)/.test(ask) ? "t" : "d";
    const known = {vi, vf, a, t, d}; delete known[want];
    if(Object.values(known).filter(v => v !== null).length >= 3){
      let r = null;
      if(want === "a") r = vi !== null && vf !== null && t ? (vf - vi) / t : vi !== null && vf !== null && d ? (vf * vf - vi * vi) / (2 * d) : vi !== null && t && d !== null ? 2 * (d - vi * t) / (t * t) : null;
      if(want === "vf") r = vi !== null && a !== null && t !== null ? vi + a * t : vi !== null && a !== null && d !== null ? Math.sqrt(vi * vi + 2 * a * d) : null;
      if(want === "vi") r = vf !== null && a !== null && t !== null ? vf - a * t : null;
      if(want === "d") r = vi !== null && a !== null && t !== null ? vi * t + a * t * t / 2 : vi !== null && vf !== null && t !== null ? (vi + vf) / 2 * t : vi !== null && vf !== null && a ? (vf * vf - vi * vi) / (2 * a) : null;
      if(want === "t") r = vi !== null && vf !== null && a ? (vf - vi) / a : null;
      if(r !== null && isFinite(r)) return out(n(r) + " " + {a:"m/s²", vf:"m/s", vi:"m/s", d:"m", t:"s"}[want]);
    }
  }
  if((m = /\b(?:average )?speed\b.*?\b(?:goes|travels|runs|moves|covers) ([\d.]+)\s*(m|km)\b.*?\bin ([\d.]+)\s*(s|seconds?|h|hours?)\b/.exec(q))) return out(n(+m[1] / +m[3]) + " " + m[2] + "/" + (/^s/.test(m[4]) ? "s" : "h"));
  // forces
  if((m = /\bnet force\b.*?([\d.]+)\s*kg\b.*?\baccelerat\w* (?:at )?([\d.]+)\s*m\/s/.exec(q))) return out(n(+m[1] * +m[2]) + " N (F = ma)");
  if((m = /\baccelerat\w*\b.*?([\d.]+)\s*kg\b.*?\b(?:net )?force (?:of )?([\d.]+)\s*n\b/.exec(q))) return out(n(+m[2] / +m[1]) + " m/s² (a = F/m)");
  if((m = /\bweight of (?:a |an )?([\d.]+)\s*kg\b/.exec(q))) return out(n(+m[1] * g) + " N (W = mg)");
  if((m = /\bnormal force (?:on|of) (?:a |an )?([\d.]+)\s*kg\b.*?\b(?:flat|level|horizontal)\b/.exec(q))) return out(n(+m[1] * g) + " N (it balances the weight, mg)");
  if((m = /\bmass of (?:an? )?(?:object|thing|box|person)? ?that weighs ([\d.]+)\s*n\b/.exec(q))) return out(n(+m[1] / g) + " kg (m = W/g)");
  if((m = /\bfriction\b.*?\bcoefficient (?:of (?:kinetic |static )?friction )?(?:is |of )?([\d.]+)\b.*?\bnormal force (?:is |of )?([\d.]+)\s*n\b/.exec(q))) return out(n(+m[1] * +m[2]) + " N (F = μN)");
  if((m = /\bnet force\b.*?([\d.]+)\s*n (?:of [a-z]+ )?acts? (right|left|forward|backward|up|down|east|west|north|south)\b.*?([\d.]+)\s*n (?:of [a-z]+ )?acts? (right|left|forward|backward|up|down|east|west|north|south)\b/.exec(q))){
    const opp = {right:"left", left:"right", forward:"backward", backward:"forward", up:"down", down:"up", east:"west", west:"east", north:"south", south:"north"};
    const a = +m[1], b = +m[3]; if(opp[m[2]] !== m[4]) return out(n(a + b) + " N " + m[2]);
    return out(a === b ? "0 N: the forces balance." : n(Math.abs(a - b)) + " N " + (a > b ? m[2] : m[4]));
  }
  // energy, efficiency, waves
  if((m = /\befficiency\b.*?([\d.]+)\s*j\b.*?\binput\b.*?([\d.]+)\s*j\b|\befficiency\b.*?\binput (?:energy )?(?:of |is )?([\d.]+)\s*j\b.*?([\d.]+)\s*j\b/.exec(q))){ const inp = +(m[1] || m[3]), use = +(m[2] || m[4]); return out(n(use / inp * 100) + "% (useful output over input)"); }
  if((m = /\bwave ?speed\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b/.exec(q)) || (m = /\bwave ?speed\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b/.exec(q))) return out(n(+m[1] * +m[2]) + " m/s (v = fλ)");
  if((m = /\bwavelength\b.*?([\d.]+)\s*hz\b.*?\b(?:speed|velocity)[a-z ]*? (?:is |of )?([\d.]+)\s*m\/s\b/.exec(q))) return out(n(+m[2] / +m[1]) + " m (λ = v/f)");
  if((m = /\bfrequency\b.*?\b(?:speed|velocity)[a-z ]*? (?:is |of )?([\d.]+)\s*m\/s\b.*?\bwavelength (?:is |of )?([\d.]+)\s*m\b/.exec(q))) return out(n(+m[1] / +m[2]) + " Hz (f = v/λ)");
  if((m = /\bperiod\b.*?\bfrequency (?:is |of )?([\d.]+)\s*hz\b/.exec(q))) return out(n(1 / +m[1]) + " s (T = 1/f)");
  if((m = /\bfrequency\b.*?\bperiod (?:is |of )?([\d.]+)\s*s\b/.exec(q))) return out(n(1 / +m[1]) + " Hz (f = 1/T)");
  // circuits: series, parallel, power, energy
  if(/\btotal resistance\b|\bequivalent resistance\b/.test(q)){
    const rs = [...q.matchAll(/\b(one|two|three|four|five)?\s*([\d.]+)\s*(?:ohm|ω|Ω)s?\b/gi)].flatMap(t => Array(P11_COUNT[t[1]] || 1).fill(+t[2]));
    if(rs.length >= 2){ const par = /\bparallel\b/.test(q), r = par ? 1 / rs.reduce((s, v) => s + 1 / v, 0) : rs.reduce((s, v) => s + v, 0); return out(n(r) + " Ω" + (par ? " (1/R = 1/R₁ + 1/R₂ + ...)" : " (R = R₁ + R₂ + ...)")); }
  }
  if((m = /\bpower\b.*?([\d.]+)\s*v\b.*?([\d.]+)\s*a\b/.exec(q)) || (m = /\bpower\b.*?([\d.]+)\s*a\b.*?([\d.]+)\s*v\b/.exec(q)) && (m = [m[0], m[2], m[1]])) return out(n(+m[1] * +m[2]) + " W (P = VI)");
  if((m = /\b(?:energy|how much energy)\b.*?([\d.]+)\s*w\b.*?\bin ([\d.]+)\s*(hours?|h|minutes?|min|seconds?|s)\b/.exec(q))){
    const sec = +m[2] * (/^h/.test(m[3]) ? 3600 : /^m/.test(m[3]) ? 60 : 1), J = +m[1] * sec;
    return out(n(J) + " J (" + n(J / 3.6e6) + " kWh)");
  }
  // km/h and m/s
  if((m = /^(?:convert )?([\d.]+)\s*(km\/h|kph|m\/s)\s+(?:to|in|into)\s+(km\/h|kph|m\/s)$/.exec(q)) && m[2] !== m[3]) return out(n(/^m\/s$/.test(m[2]) ? +m[1] * 3.6 : +m[1] / 3.6) + " " + m[3]);
  return null;
}
// --- Physics 12, offline ---
// Vectors and relative motion, projectiles, circular motion, gravitation and orbits, momentum and collisions, torque
// and balance, inclines, electrostatics, and magnetic force. g = 9.8 m/s², G = 6.674 × 10⁻¹¹, k = 8.99 × 10⁹.
// precalc() asks it after sci10(), before phys11(); null means "not mine". Graded by COURSE=phys12 node
// test/exam-course.js. Mirrored in kmp/shared/.../Physics12.kt.
const P12_G = 6.674e-11, P12_K = 8.99e9, P12_ME = 5.972e24, P12_RE = 6371e3;
const P12_DIR = {east:[1, 0], west:[-1, 0], north:[0, 1], south:[0, -1], right:[1, 0], left:[-1, 0], up:[0, 1], down:[0, -1]};
const P12_FIELD = {earth:9.8, moon:1.62, mars:3.71, jupiter:24.8, venus:8.87, mercury:3.7, saturn:10.4, sun:274};
const P12_PREFIX = {micro:1e-6, μ:1e-6, u:1e-6, nano:1e-9, n:1e-9, milli:1e-3, m:1e-3, pico:1e-12, p:1e-12};
function phys12(q, raw){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"});
  const s3 = v => Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? c12Sci(v) : pcNum(+(+v).toPrecision(3)), rad = Math.PI / 180, g = 9.8;
  const N = "([\\d.]+(?:\\s*[x×*]\\s*10\\s*\\^\\s*-?\\d+)?)", num = s => c12Num(s);
  const charge = (v, p) => num(v) * (p ? P12_PREFIX[p.replace(/coulombs?|c$/, "").trim()] ?? 1 : 1);
  const facts = [
    // The constants table answers "the gravitational constant" with NIST's value; these are the wordings it does not take.
    [/^(?:what is )?(?:the )?(?:universal )?gravitational constant,? g$|^(?:the )?value of (?:big )?g$/, "G = 6.674 × 10⁻¹¹ N·m²/kg² (6.67430 × 10⁻¹¹ exactly, from NIST)."],
    [/\bspeed of light in (?:m\/s|metres per second|meters per second|km\/s)$/, "3.00 × 10⁸ m/s (299,792,458 m/s exactly)."],
    [/\bcoulomb'?s constant\b/, "k = 8.99 × 10⁹ N·m²/C²."],
    [/\bconserved in an elastic collision\b/, "Both momentum and kinetic energy."],
    [/\bconserved in an? (?:perfectly )?inelastic collision\b/, "Momentum. Some kinetic energy turns into heat, sound or deformation, so kinetic energy is not conserved."],
    [/\bconditions? for (?:static )?equilibrium\b/, "The net force is zero and the net torque is zero."],
    [/^(?:what is )?torque$/, "The turning effect of a force: τ = F·r·sinθ, the force times its perpendicular distance (lever arm) from the pivot."],
    [/^(?:what is )?(?:an? )?electric field$/, "The region around a charge where another charge feels a force; its strength is the force per unit charge, E = F/q."],
    [/^(?:what is )?electric potential$/, "The electric potential energy per unit charge at a point, V = E_p/q, measured in volts."],
    [/^(?:what is )?(?:electromagnetic )?induction$/, "A changing magnetic field through a conductor induces a voltage (emf), which drives a current if the circuit is closed."],
    [/\blenz'?s law\b/, "The induced current flows in the direction that opposes the change in magnetic flux that caused it."],
    [/^(?:what is )?(?:a )?transformer$/, "Two coils on an iron core. A changing current in one induces a voltage in the other, stepping the voltage up or down by the ratio of turns."],
    [/\bright[- ]hand rule\b/, "The direction of the magnetic field around a current, or of the magnetic force on a moving positive charge or a current in a field."],
  ];
  for(const [re, body] of facts) if(re.test(q)) return out(body);
  let m;
  // inverse-square scaling for gravity and electricity
  if((m = /\bwhat happens to (?:the )?(gravitational|electric|electrostatic|coulomb) force if (the distance|the separation|both (?:masses|charges)|one (?:mass|charge)|the mass|the charge) (doubles?|triples?|quadruples?|(?:is|are) (?:doubled|tripled|quadrupled|halved)|halves|halve)\b/.exec(q))){
    const k = /doubl/.test(m[3]) ? 2 : /tripl/.test(m[3]) ? 3 : /quadrupl/.test(m[3]) ? 4 : 0.5, f = /distance|separation/.test(m[2]) ? 1 / (k * k) : /both/.test(m[2]) ? k * k : k;
    return out(f >= 1 ? "It becomes " + pcNum(f) + " times larger." : "It becomes 1/" + pcNum(1 / f) + " as large" + (f === 0.25 ? " (a quarter)" : f === 1 / 9 ? " (a ninth)" : "") + ".");
  }
  // vectors
  if((m = /\bresultant\b.*?([\d.]+)\s*([a-z/]+)?\s*(east|west|north|south)\b.*?([\d.]+)\s*[a-z/]*\s*(east|west|north|south)\b/.exec(q))){
    const [ax, ay] = P12_DIR[m[3]].map(v => v * +m[1]), [bx, by] = P12_DIR[m[5]].map(v => v * +m[4]), x = ax + bx, y = ay + by, mag = Math.hypot(x, y), unit = m[2] && !/^(east|west|north|south)$/.test(m[2]) ? " " + m[2].replace(/^n$/, "N") : "";
    if(y === 0 || x === 0) return out(s3(mag) + unit + " " + (x > 0 ? "east" : x < 0 ? "west" : y > 0 ? "north" : "south"));
    const ang = Math.atan(Math.abs(y) / Math.abs(x)) / rad; return out(s3(mag) + unit + " at " + pcNum(+ang.toFixed(1)) + "° " + (y > 0 ? "north" : "south") + " of " + (x > 0 ? "east" : "west"));
  }
  if((m = /\b(horizontal|vertical|x|y)[- ]component of (?:a |an )?([\d.]+)\s*([a-z/]+)\b.*?\bat ([\d.]+)\s*(?:°|degrees?)/.exec(q))){
    const v = +m[2] * (/^(horizontal|x)$/.test(m[1]) ? Math.cos(+m[4] * rad) : Math.sin(+m[4] * rad)); return out(s3(v) + " " + m[3].replace(/^n$/, "N"));
  }
  if((m = /\b(?:flies|flying|travels|swims|moves|rows|paddles)\b.*?([\d.]+)\s*(km\/h|m\/s)\b.*?([\d.]+)\s*(?:km\/h|m\/s)\b/.exec(q)) && /\b(ground speed|resultant|actual speed|speed relative)\b/.test(q)){
    const a = +m[1], b = +m[3];
    if(/\bacross\b/.test(q)) return out(s3(Math.hypot(a, b)) + " " + m[2] + " (at " + pcNum(+(Math.atan(b / a) / rad).toFixed(1)) + "° downstream from straight across)");
    const head = /\bheadwind\b|\binto\b|\bagainst\b/.test(q) || ((m = /\b(north|south|east|west)\b.*\bwind from the (north|south|east|west)\b/.exec(q)) && m[1] === m[2]);
    return out(s3(head ? a - b : a + b) + " " + (/km\/h/.test(q) ? "km/h" : "m/s"));
  }
  // projectiles
  if((m = /\b(?:thrown|kicked|launched|rolls|fired|shot|driven)\b.*?\bhorizontally at ([\d.]+)\s*m\/s\b.*?\b([\d.]+)\s*m\b(?!\/)/.exec(q))){
    const v = +m[1], h = +m[2], t = Math.sqrt(2 * h / g);
    if(/\bhow long\b|\btime\b/.test(q)) return out(s3(t) + " s");
    if(/\b(speed|velocity|how fast)\b.*\b(land|ground|hit)/.test(q)) return out(s3(Math.hypot(v, g * t)) + " m/s");
    return out(s3(v * t) + " m from the base (it falls for " + s3(t) + " s)");
  }
  if((m = /\b(range|maximum height|max height|time of flight|how high|how far|how long)\b.*?\blaunched at ([\d.]+)\s*m\/s at ([\d.]+)\s*(?:°|degrees?)/.exec(q)) || (m = /\blaunched at ([\d.]+)\s*m\/s at ([\d.]+)\s*(?:°|degrees?)\b.*?\b(range|maximum height|max height|time of flight|how high|how far|how long)\b/.exec(q)) && (m = [m[0], m[3], m[1], m[2]])){
    const v = +m[2], th = +m[3] * rad, w = m[1];
    if(/range|how far/.test(w)) return out(s3(v * v * Math.sin(2 * th) / g) + " m (R = v² sin 2θ / g)");
    if(/height|how high/.test(w)) return out(s3((v * Math.sin(th)) ** 2 / (2 * g)) + " m");
    return out(s3(2 * v * Math.sin(th) / g) + " s");
  }
  // circular motion
  if((m = /\bcentripetal (acceleration|force)\b.*?(?:([\d.]+)\s*kg\b.*?)?\b([\d.]+)\s*m\/s\b.*?\bradius (?:of )?([\d.]+)\s*m\b/.exec(q))){
    const a = (+m[3]) ** 2 / +m[4]; if(m[1] === "force"){ if(!m[2]) return null; return out(s3(+m[2] * a) + " N (F = mv²/r)"); } return out(s3(a) + " m/s² (a = v²/r)");
  }
  if((m = /\bperiod\b.*?\bcircle of radius ([\d.]+)\s*m\b.*?\bat ([\d.]+)\s*m\/s\b/.exec(q)) || (m = /\bperiod\b.*?([\d.]+)\s*m\/s\b.*?\bradius (?:of )?([\d.]+)\s*m\b/.exec(q)) && (m = [m[0], m[2], m[1]])) return out(s3(2 * Math.PI * +m[1] / +m[2]) + " s (T = 2πr/v)");
  // gravitation
  if((m = /\bgravitational force between\b(.*)$/.exec(q))){
    const ms = [...m[1].matchAll(/([\d.]+(?:\s*[x×*]\s*10\s*\^\s*-?\d+)?)\s*kg\b/g)].map(t => num(t[1])), two = /\btwo ([\d.]+)\s*kg\b/.exec(m[1]), r = (/([\d.]+)\s*(m|km)\s*apart\b/.exec(m[1]) || []);
    const [a, b] = two ? [+two[1], +two[1]] : ms; if(a == null || b == null || !r[1]) return null; const d = +r[1] * (r[2] === "km" ? 1000 : 1);
    return out(c12Sci(P12_G * a * b / (d * d)) + " N (F = Gm₁m₂/r²)");
  }
  if((m = /\bgravitational field strength\b.*?\b(?:surface of|on) (?:the )?(earth|moon|mars|jupiter|venus|mercury|saturn|sun)\b/.exec(q))) return out(P12_FIELD[m[1]] + " N/kg (the same as " + P12_FIELD[m[1]] + " m/s²)");
  if((m = /\bgravitational field strength\b.*?\b([\d.]+) earth radii\b/.exec(q))) return out(s3(9.8 / (+m[1]) ** 2) + " N/kg (g falls with 1/r²)");
  if((m = /\borbital (?:speed|velocity)\b.*?([\d.,]+)\s*(km|m)\b\s*(from the cent(?:er|re)|above the surface|above earth|altitude)/.exec(q))){
    const r = +m[1].replace(/,/g, "") * (m[2] === "km" ? 1000 : 1) + (/above|altitude/.test(m[3]) ? P12_RE : 0), v = Math.sqrt(P12_G * P12_ME / r);
    return out(s3(v / 1000) + " km/s (" + Math.round(v) + " m/s, v = √(GM/r))");
  }
  // momentum, impulse, collisions
  if((m = /^(?:the )?momentum of (?:a |an )?([\d.]+)\s*kg\b.*?\b([\d.]+)\s*m\/s\b/.exec(q))) return out(s3(+m[1] * +m[2]) + " kg·m/s (p = mv)");
  if((m = /\bimpulse\b.*?\b([\d.]+)\s*n force acts? for ([\d.]+)\s*s\b/.exec(q))) return out(s3(+m[1] * +m[2]) + " N·s (J = FΔt)");
  if((m = /([\d.]+)\s*kg\b.*?\bchanges? (?:its )?velocity from (-?[\d.]+)\s*m\/s to (-?[\d.]+)\s*m\/s\b/.exec(q)) && /\bmomentum|impulse\b/.test(q)){ const dp = +m[1] * (+m[3] - +m[2]); return out(s3(dp) + " kg·m/s (a change of " + s3(Math.abs(dp)) + " in size)"); }
  if((m = /\b([\d.]+)\s*kg\b[^,]*?\bat ([\d.]+)\s*m\/s\b.*?\b([\d.]+)\s*kg\b[^,]*?\b(?:at rest|at ([\d.]+)\s*m\/s)\b/.exec(q))){
    const m1 = +m[1], v1 = +m[2], m2 = +m[3], v2 = m[4] ? +m[4] : 0;
    if(/\bstick\b|\binelastic\b|\bcouple\b|\btogether\b/.test(q)) return out(s3((m1 * v1 + m2 * v2) / (m1 + m2)) + " m/s (momentum is conserved)");
    if(/\belastic/.test(q)){ const u1 = ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2), u2 = ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2); return out((/\bsecond\b/.test(q) ? s3(u2) : s3(u1)) + " m/s (the " + (/\bsecond\b/.test(q) ? "second" : "first") + " ball; the other moves at " + s3(/\bsecond\b/.test(q) ? u1 : u2) + " m/s)"); }
  }
  // torque, balance, inclines
  if((m = /\btorque\b.*?([\d.]+)\s*n\b(?: force)?.*?([\d.]+)\s*m\b(?: from (?:the|a) pivot)?(?:.*?([\d.]+)\s*(?:°|degrees?))?/.exec(q))){ const th = m[3] ? +m[3] * rad : Math.PI / 2; return out(s3(+m[1] * +m[2] * Math.sin(th)) + " N·m (τ = Fr sinθ)"); }
  if((m = /\b([\d.]+)\s*kg\b.*?\b([\d.]+)\s*m from (?:the )?pivot\b.*?\b([\d.]+)\s*kg\b/.exec(q)) && /\bbalance\b/.test(q)) return out(s3(+m[1] * +m[2] / +m[3]) + " m from the pivot (m₁r₁ = m₂r₂)");
  if((m = /\b([\d.]+)\s*(?:degree|°)\s*(?:incline|ramp|slope|hill)\b/.exec(q)) || (m = /\b(?:incline|ramp|slope) (?:of |at )?([\d.]+)\s*(?:°|degrees?)/.exec(q))){
    const th = +m[1] * rad, kg = (/([\d.]+)\s*kg\b/.exec(q) || [])[1], mu = (/\bcoefficient (?:of (?:kinetic )?friction )?(?:is |of )?([\d.]+)/.exec(q) || [])[1];
    if(/\bnormal force\b/.test(q) && kg) return out(s3(+kg * g * Math.cos(th)) + " N (mg cos θ)");
    if(/\baccelerat/.test(q)) return out(s3(g * (Math.sin(th) - (mu ? +mu * Math.cos(th) : 0))) + " m/s² (g sin θ" + (mu ? " - μg cos θ" : "") + ")");
    if(/\b(force|push|pull)\b/.test(q) && kg) return out(s3(+kg * g * (Math.sin(th) + (mu ? +mu * Math.cos(th) : 0))) + " N (mg sin θ" + (mu ? " + μmg cos θ" : "") + ")");
  }
  // electrostatics and magnetism, read as typed so μC stays μC
  const r2 = String(raw || q).toLowerCase();
  if((m = new RegExp("\\belectric (?:force|attraction|repulsion) between\\b.*?\\btwo " + N + "\\s*(micro|nano|milli|pico|μ|n|m|p|u)?\\s*(?:coulombs?|c)\\b.*?\\b([\\d.]+)\\s*(m|cm)\\s*apart\\b").exec(r2))){
    const qv = charge(m[1], m[2]), d = +m[3] / (m[4] === "cm" ? 100 : 1); return out(s3(P12_K * qv * qv / (d * d)) + " N (F = kq₁q₂/r²)");
  }
  if((m = new RegExp("\\belectric field\\b.*?\\b([\\d.]+)\\s*(m|cm)\\s*from (?:a |an )?" + N + "\\s*(micro|nano|milli|pico|μ|n|m|p|u)?\\s*(?:coulombs?|c)\\b").exec(r2))){
    const d = +m[1] / (m[2] === "cm" ? 100 : 1), qv = charge(m[3], m[4]); return out(s3(P12_K * qv / (d * d)) + " N/C (E = kq/r²)");
  }
  if((m = /\bwork\b.*?\b([\d.]+)\s*c charge\b.*?\b([\d.]+)\s*v\b/.exec(q))) return out(s3(+m[1] * +m[2]) + " J (W = qV)");
  if((m = /\bmagnetic force on a wire ([\d.]+)\s*m long carrying ([\d.]+)\s*a in a ([\d.]+)\s*t field\b/.exec(q))) return out(s3(+m[1] * +m[2] * +m[3]) + " N (F = BIL)");
  if((m = new RegExp("\\bmagnetic force on (?:a |an )?" + N + "\\s*c charge moving at " + N + "\\s*m\\/s in a ([\\d.]+)\\s*t field\\b").exec(q))) return out(c12Sci(num(m[1]) * num(m[2]) * +m[3]) + " N (F = qvB)");
  return null;
}
// BC Life Sciences 11: characteristics of life, taxonomy, viruses, bacteria and archaea, protists, fungi, plants,
// evolution and animal body plans as plain facts, plus microscope and bacterial growth arithmetic. Phrase questions
// come first (LS_FACTS, unanchored), then single terms (LS_DEFS, matched as the whole question).
const LS_FACTS = [
  ["\\bcharacteristics of (?:all )?(?:living things|life|organisms)\\b", "Living things are made of cells, use energy (metabolism), grow and develop, reproduce, respond to their environment, keep a stable internal state (homeostasis), and adapt over generations."],
  ["\\b(?:levels|ranks|order|hierarchy) of (?:classification|taxonomy)\\b|\\btaxonomic (?:levels|ranks|hierarchy)\\b", "Domain, kingdom, phylum, class, order, family, genus, species, from broadest to most specific. A memory aid: Dear King Philip Came Over For Good Soup."],
  ["\\b(?:three |3 )?domains of life\\b|\\bthree domains\\b", "Bacteria, Archaea and Eukarya."],
  ["\\b(?:six|6|the) kingdoms\\b|\\bkingdoms of life\\b", "Animalia (animals), Plantae (plants), Fungi, Protista (protists), Archaebacteria (archaea) and Eubacteria (bacteria)."],
  ["\\bwho (?:developed|invented|created|came up with) (?:binomial nomenclature|the classification system)\\b|\\bfather of taxonomy\\b", "Carl Linnaeus, a Swedish botanist, in the 1750s."],
  ["\\b(?:levels|parts|ranks|names)\\b[a-z ]*\\b(?:scientific name|binomial name)\\b|\\bscientific name (?:is )?made (?:up )?of\\b", "The genus and the species, as in Homo sapiens."],
  ["\\bviruse?s? made (?:up )?of\\b|\\bstructure of a virus\\b|\\bparts of a virus\\b", "Genetic material (DNA or RNA) inside a protein coat called a capsid. Some also have a lipid envelope. No cytoplasm, ribosomes or metabolism."],
  ["\\b(?:are|is) (?:a )?virus(?:es)? (?:alive|living)\\b", "No. Most biologists class viruses as non-living: they have no cells, no metabolism, and cannot reproduce outside a host cell."],
  ["\\blytic\\b.*\\blysogenic\\b|\\blysogenic\\b.*\\blytic\\b", "In the lytic cycle a virus takes over the cell at once, makes copies and bursts (lyses) the cell. In the lysogenic cycle its DNA inserts into the host DNA as a prophage and lies dormant, copied with every cell division, until a trigger switches it to the lytic cycle."],
  ["\\bantibiotics?\\b.*\\bviru", "Antibiotics target parts of bacterial cells, such as the cell wall and ribosomes. Viruses have neither and are not living cells: they copy themselves inside host cells, so antibiotics cannot touch them. Vaccines and antivirals are used instead."],
  ["\\bhow (?:do|does) (?:bacteria|a bacterium|prokaryotes) reproduce\\b", "Asexually, by binary fission: the cell copies its DNA and splits into two identical cells. Bacteria can also swap DNA by conjugation."],
  ["\\bshapes? of bacteri", "Cocci (spheres), bacilli (rods) and spirilla (spirals)."],
  ["\\bconjugation (?:in|of|between) bacteri|\\bbacterial conjugation\\b", "Two bacteria join by a pilus and one passes a copy of DNA, usually a plasmid, to the other. It mixes genes but makes no new cells."],
  ["\\bprokaryot.*\\beukaryot|\\beukaryot.*\\bprokaryot", "Eukaryotic cells have a nucleus and membrane-bound organelles. Prokaryotic cells (bacteria and archaea) have no nucleus, their DNA sits in the cytoplasm, and they are much smaller."],
  ["\\bbacteria\\b.*\\barchaea|\\barchaea.*\\bbacteria\\b", "Both are prokaryotes. Bacterial cell walls contain peptidoglycan; archaea have none, have different membrane lipids, and many live in extreme places like hot springs and salt lakes."],
  ["\\bhow (?:do|does) (?:an? )?amoeba(?:s|e)? move\\b", "With pseudopods, extensions of cytoplasm (\"false feet\") that also engulf food."],
  ["\\bhow (?:do|does) (?:a )?parameci(?:a|um|ums) move\\b", "With cilia, short hairlike structures that beat together."],
  ["\\beuglena\\b.*\\b(?:energy|food|eat|nutrition|nutrients)\\b", "Both ways: in light it photosynthesizes with chloroplasts (an autotroph), and in the dark it absorbs food from its surroundings (a heterotroph). It swims with a flagellum."],
  ["\\bcauses? malaria\\b|\\bmalaria (?:is )?caused by\\b", "Plasmodium, a protist parasite spread by the bite of Anopheles mosquitoes."],
  ["\\bfung(?:al|i|us)\\b.*\\bcell walls?\\b", "Chitin, the same tough material in insect exoskeletons."],
  ["\\bhow (?:do|does) fung(?:i|us) (?:get|obtain) (?:food|nutrients|energy|nutrition)\\b|\\bhow (?:do|does) fung(?:i|us) (?:eat|feed)\\b", "They are heterotrophs that absorb nutrients: they release digestive enzymes onto food outside their bodies and absorb what breaks down, often as decomposers of dead matter."],
  ["\\bhow (?:do|does) fung(?:i|us) reproduce\\b", "By spores, made asexually or sexually. Yeasts also reproduce by budding, and hyphae can grow from broken pieces."],
  ["\\bwhat does (?:the )?xylem (?:transport|carry|do|move)\\b", "Water and dissolved minerals, up from the roots to the leaves."],
  ["\\bwhat does (?:the )?phloem (?:transport|carry|do|move)\\b", "Sugars (food) made in the leaves, to the rest of the plant."],
  ["\\b(?:four|4|main|major) (?:main |major )?(?:groups|types) of plants\\b|\\bplant groups\\b", "Mosses and other bryophytes (no vascular tissue, no seeds), ferns (vascular, spores), gymnosperms such as conifers (seeds in cones) and angiosperms (flowering plants, seeds in fruit)."],
  ["\\bmonocots?\\b.*\\bdicots?\\b|\\bdicots?\\b.*\\bmonocots?\\b", "Monocots have one cotyledon (seed leaf), parallel leaf veins, flower parts in threes and scattered vascular bundles, like grasses and lilies. Dicots have two cotyledons, net-like veins, flower parts in fours or fives and vascular bundles in a ring, like roses and oaks."],
  ["\\b(?:do|are) (?:mosses|bryophytes)\\b.*\\bvascular\\b", "No. Mosses are non-vascular: they lack xylem and phloem, so they stay small and live in damp places."],
  ["\\bwho (?:proposed|came up with|developed|discovered)\\b[a-z ]*\\b(?:evolution|natural selection)\\b|\\bfather of evolution\\b", "Charles Darwin, in On the Origin of Species (1859). Alfred Russel Wallace reached the same idea on his own."],
  ["\\bevidence (?:for|of) evolution\\b", "Fossils, homologous and vestigial structures, similar embryos, DNA and protein similarities, where species live, and evolution seen directly, such as antibiotic-resistant bacteria."],
  ["\\bfitness (?:in (?:evolution|biology)|evolution)\\b|^(?:biological|darwinian|evolutionary) fitness$", "An organism's ability to survive and reproduce in its environment, measured by how many offspring it leaves."],
  ["\\b(?:characteristics|traits|features) of (?:a )?mammals?\\b", "Hair or fur, mammary glands that make milk, warm-blooded (endothermic), a four-chambered heart, three middle-ear bones, and most give live birth."],
  ["\\b(?:characteristics|traits|features) of (?:a )?birds?\\b", "Feathers, a beak with no teeth, hollow bones, warm-blooded, a four-chambered heart, and hard-shelled eggs."],
  ["\\b(?:characteristics|traits|features) of (?:a )?reptiles?\\b", "Dry scaly skin, lungs, cold-blooded (ectothermic), and leathery eggs laid on land (amniotic eggs)."],
  ["\\b(?:characteristics|traits|features) of (?:an? )?amphibians?\\b", "Moist skin with no scales, cold-blooded, eggs laid in water, and a life cycle that starts in water with gills and moves to land with lungs."],
  ["\\b(?:characteristics|traits|features) of (?:a )?fish(?:es)?\\b", "Gills, fins, scales, cold-blooded, and they live in water."],
  ["\\bhow (?:is|are) (?:a )?scientific names? written\\b|\\brules? for (?:writing )?scientific names\\b", "In italics (underlined when handwritten), genus first with a capital letter, then the species in lowercase: Homo sapiens."],
  ["\\b(?:smallest|most specific|narrowest|lowest) (?:unit|level|rank|group|category) (?:of|in) (?:classification|taxonomy)\\b", "Species."],
  ["\\b(?:largest|broadest|biggest|highest) (?:unit|level|rank|group|category) (?:of|in) (?:classification|taxonomy)\\b", "Domain."],
  ["\\bviruse?s? need to (?:reproduce|replicate|multiply)\\b|\\bhow (?:do|does) (?:a )?viruse?s? (?:reproduce|replicate|multiply)\\b", "A host cell. A virus injects its genetic material and uses the host's ribosomes, enzymes and energy to copy itself, by the lytic or lysogenic cycle."],
  ["\\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a |an )?viruse?s?\\b|\\bviral (?:diseases?|infections?)\\b", "Influenza (the flu), the common cold, COVID-19, measles, chickenpox, HIV/AIDS and rabies."],
  ["\\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?bacteri(?:a|um)\\b|\\bbacterial (?:diseases?|infections?)\\b", "Strep throat, tuberculosis, cholera, tetanus, Lyme disease, salmonella food poisoning and bacterial pneumonia."],
  ["\\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?protists?\\b", "Malaria (Plasmodium), sleeping sickness (Trypanosoma), giardiasis (Giardia) and amoebic dysentery."],
  ["\\b(?:diseases?|illness(?:es)?|infections?) caused by (?:a )?fung(?:i|us)\\b|\\bfungal (?:diseases?|infections?)\\b", "Athlete's foot, ringworm, yeast infections (Candida) and Dutch elm disease in trees."],
  ["\\bfunctions? of (?:the |a )?roots?\\b|\\bwhat do roots do\\b", "Roots anchor the plant, absorb water and minerals from the soil, and often store food."],
  ["\\bfunctions? of (?:the |a )?stems?\\b|\\bwhat do stems do\\b", "Stems hold the plant up and carry water (xylem) and food (phloem) between the roots and leaves."],
  ["\\bfunctions? of (?:the |a )?leaf\\b|\\bfunctions? of (?:the )?leaves\\b|\\bwhat do leaves do\\b", "Leaves make food by photosynthesis and exchange gases through their stomata."],
  ["\\bfunctions? of (?:the |a )?flowers?\\b|\\bwhat do flowers do\\b", "Flowers are for sexual reproduction: they attract pollinators, make pollen and eggs, and become fruit with seeds."],
];
const LS_DEFS = [
  ["binomial nomenclature", "A two-part scientific name: the genus (capitalized) then the species (lowercase), written in italics, such as Homo sapiens. Carl Linnaeus introduced it."],
  ["taxonomy", "The science of naming, describing and classifying organisms into groups."],
  ["(?:a )?dichotomous key", "A tool for identifying an organism through a series of steps, each offering two choices (a pair of opposite statements), until one name is left."],
  ["cladograms?", "A branching diagram that shows evolutionary relationships: groups that share a more recent common ancestor sit on closer branches, and each branch point marks a shared derived trait."],
  ["phylogenetic trees?|phylogeny", "A branching diagram of evolutionary relationships among species, tracing them back to common ancestors, often drawn against time."],
  ["viruse?s?", "A tiny non-living particle of DNA or RNA in a protein coat (capsid) that can only reproduce inside a host cell."],
  ["capsids?", "The protein coat (shell) that surrounds a virus's DNA or RNA."],
  ["lytic cycle", "The virus attaches, injects its genetic material, takes over the cell to make new viruses, then bursts (lyses) the cell to release them, killing it."],
  ["lysogenic cycle", "The virus's DNA inserts into the host cell's DNA as a prophage and lies dormant, copied each time the cell divides. A trigger such as stress can switch it to the lytic cycle."],
  ["(?:bacterio)?phages?", "A virus that infects bacteria."],
  ["prophages?", "Viral DNA inserted into a bacterium's DNA during the lysogenic cycle."],
  ["vaccines?", "A weakened, killed or partial form of a pathogen (or instructions to make one of its proteins) that trains the immune system to recognize it, so a later infection is fought off quickly."],
  ["binary fission", "Asexual reproduction in which a prokaryote copies its single circular chromosome and divides into two identical cells."],
  ["cocc(?:i|us)", "Spherical (round) bacteria. In clusters they are staphylococci, in chains streptococci."],
  ["bacill(?:i|us)", "Rod-shaped bacteria."],
  ["spirill(?:a|um)", "Spiral-shaped bacteria."],
  ["plasmids?", "A small ring (circular loop) of DNA separate from the main chromosome in bacteria. Plasmids often carry genes such as antibiotic resistance and can be passed between cells."],
  ["endospores?", "A tough, dormant structure some bacteria form around their DNA to survive harsh conditions like heat, drying or chemicals, then grow again when conditions improve."],
  ["prokaryotes?", "A single-celled organism with no nucleus or membrane-bound organelles: bacteria and archaea."],
  ["eukaryotes?", "An organism whose cells have a nucleus and membrane-bound organelles: protists, fungi, plants and animals."],
  ["archaea|archaebacteria", "Prokaryotes with no peptidoglycan in their cell walls and unusual membranes, many living in extreme environments (extremophiles) such as hot springs and salt lakes."],
  ["protists?|protista", "Eukaryotes that are not plants, animals or fungi, mostly single-celled: animal-like (amoebas, paramecia), plant-like (algae, euglena) and fungus-like (slime molds)."],
  ["pseudopod(?:s|ia|ium)?", "A temporary extension of cytoplasm, a \"false foot\", that amoebas use to move and engulf food."],
  ["cilia|cilium", "Short hairlike structures that beat to move a cell or move fluid past it."],
  ["flagell(?:a|um)", "A long whiplike tail that spins or lashes to move a cell."],
  ["hyph(?:ae|a)", "The long, thin threads (filaments) that make up the body of a fungus."],
  ["mycelium|mycelia", "A network of hyphae, the main body of a fungus, usually hidden in soil or wood."],
  ["lichens?", "A partnership (mutualism) between a fungus and an alga or cyanobacterium: the alga makes food by photosynthesis and the fungus gives shelter and water."],
  ["decomposers?", "An organism, such as a fungus or bacterium, that breaks down dead matter and waste and returns nutrients to the soil."],
  ["autotrophs?", "An organism that makes its own food, usually by photosynthesis, like plants and algae."],
  ["heterotrophs?", "An organism that gets its food by eating or absorbing other organisms, like animals and fungi."],
  ["alternation of generations", "A plant life cycle that switches between a haploid gametophyte, which makes gametes, and a diploid sporophyte, which makes spores."],
  ["sporophytes?", "The diploid (2n) stage of a plant's life cycle that makes spores by meiosis. It is the main plant in ferns and seed plants."],
  ["gametophytes?", "The haploid (n) stage of a plant's life cycle that makes gametes (eggs and sperm). It is the main plant in mosses."],
  ["xylem", "Plant tissue that carries water and dissolved minerals up from the roots to the leaves."],
  ["phloem", "Plant tissue that carries sugars (food) made in the leaves to the rest of the plant."],
  ["gymnosperms?", "A seed plant whose seeds are not enclosed in fruit (\"naked seeds\"), usually borne on cones, like pines, firs and cedars."],
  ["angiosperms?", "A flowering plant: its seeds form inside an ovary that becomes a fruit."],
  ["stomat(?:a|e)|stomas?", "Tiny pores (openings) on a leaf, mostly underneath, opened and closed by guard cells to let carbon dioxide in and oxygen and water vapour out."],
  ["vascular plants?", "A plant with vascular tissue, xylem for water and phloem for food, so it can grow tall: ferns, gymnosperms and angiosperms."],
  ["bryophytes?", "A non-vascular plant such as a moss, liverwort or hornwort, which reproduces by spores and needs water for fertilization."],
  ["pollination", "The transfer of pollen from the male part of a flower (anther) to the female part (stigma), by wind, insects, birds or other animals."],
  ["genetic drift", "Random changes in allele frequencies from one generation to the next, by chance alone. Its effect is strongest in small populations."],
  ["gene flow", "The movement of alleles between populations when individuals migrate and breed. It makes populations more alike."],
  ["(?:the )?bottleneck effect", "Genetic drift after a disaster or event sharply reduces a population's size: the few survivors carry only some of the original alleles, so genetic variation drops."],
  ["(?:the )?founder effect", "Genetic drift when a small group leaves to start a new population in a new area: its allele frequencies reflect the few founders, not the original population."],
  ["speciation", "The formation of new species, usually when populations are separated (by geography or behaviour) and can no longer interbreed."],
  ["allopatric speciation", "Speciation after a population is split by a physical barrier such as a river or mountain range."],
  ["sympatric speciation", "Speciation without a physical barrier, for example through behaviour or a change in chromosome number."],
  ["homologous structures?", "A body part shared by different species because they inherited it from a common ancestor. The structure is similar but the function may differ, like a human arm, a bat wing and a whale flipper."],
  ["analogous structures?", "A body part with a similar function in species that did not get it from a common ancestor; it evolved separately, like bird wings and insect wings."],
  ["vestigial structures?|vestigial organs?", "A body part that is reduced and has little or no function now but was useful in ancestors, like the human tailbone or whale hip bones."],
  ["convergent evolution", "Unrelated species evolve similar traits independently because they live in similar environments, like sharks and dolphins."],
  ["divergent evolution", "Related species become more different over time as they adapt to different environments."],
  ["adaptive radiation", "One ancestral species rapidly diversifies into many new species, each adapted to a different niche, like Darwin's finches on the Galapagos."],
  ["coevolution", "Two species evolve in response to each other, like flowers and their pollinators."],
  ["(?:an )?adaptation", "An inherited trait that helps an organism survive and reproduce in its environment."],
  ["radial symmetry", "Body parts arranged around a central point or axis, like a sea star or jellyfish: any cut through the centre gives similar halves."],
  ["bilateral symmetry", "A body with left and right sides that are mirror images; only one cut down the middle gives two matching halves. Most animals, including humans."],
  ["asymmetry|asymmetrical", "No symmetry at all, like most sponges."],
  ["invertebrates?", "An animal without a backbone (spine), like insects, worms, molluscs and sea stars. About 95 percent of animal species."],
  ["vertebrates?", "An animal with a backbone: fish, amphibians, reptiles, birds and mammals."],
  ["species", "A group of organisms that can interbreed in nature and produce fertile offspring."],
  ["retroviruse?s?", "An RNA virus, such as HIV, that uses the enzyme reverse transcriptase to copy its RNA into DNA, which then inserts into the host's DNA."],
  ["pathogens?", "Anything that causes disease, such as a virus, bacterium, protist or fungus."],
  ["pil(?:i|us)", "A short hairlike thread on a bacterium's surface, used to attach to surfaces or to another cell during conjugation."],
  ["peptidoglycan", "The sugar and protein mesh that makes up bacterial cell walls. Archaea lack it, and penicillin attacks it."],
  ["extremophiles?", "An organism that lives in extreme conditions, such as heat, salt, acid or cold, like many archaea."],
  ["slime (?:molds?|moulds?)", "Fungus-like protists that live on decaying matter and, when food runs short, gather into a mass that makes spores."],
  ["yeasts?", "A single-celled fungus that reproduces by budding. It ferments sugar into alcohol and carbon dioxide, which raises bread."],
  ["budding", "Asexual reproduction in which a new organism grows as an outgrowth (bud) from the parent and breaks off, as in yeast and hydra."],
  ["spores?", "A single reproductive cell that can grow into a new organism without fertilization. Fungi, ferns and mosses make them."],
  ["cotyledons?", "A seed leaf: the first leaf or leaves of a plant embryo, often storing food. Monocots have one, dicots two."],
  ["algae|alga", "Simple plant-like protists (and the cyanobacteria) that photosynthesize, from single cells to giant kelp. They have no true roots, stems or leaves."],
  ["seeds?", "A plant embryo with a food supply inside a protective coat, made by gymnosperms and angiosperms."],
  ["(?:cellular )?respiration", "Cells break down glucose with oxygen to release energy (ATP), giving off carbon dioxide and water: C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O. It happens in mitochondria."],
  ["transpiration", "Water moving up through a plant and evaporating from its leaves as water vapour, mostly through the stomata."],
  ["conifers?", "A cone-bearing gymnosperm, usually an evergreen tree with needles, like pine, fir, spruce and cedar."],
  ["ferns?", "A seedless vascular plant that reproduces by spores, found on the undersides of its fronds."],
  ["fossils?", "The preserved remains or traces (such as bones, shells, footprints or imprints) of organisms from the distant past, usually in rock."],
  ["artificial selection|selective breeding", "Humans choose which plants or animals breed, to bring out traits they want, as in dog breeds and crops."],
  ["(?:an? )?(?:ecological )?niche", "An organism's role in its ecosystem: what it eats, where it lives, and how it interacts with other species."],
  ["reproductive isolation", "Barriers that stop two populations from interbreeding, such as different mating seasons, behaviours or body parts, or sterile offspring. It leads to speciation."],
  ["punctuated equilibrium", "The idea that species stay much the same for long periods, then change rapidly in short bursts, often after an environmental change."],
  ["gradualism", "The idea that species change slowly and steadily through many small changes over long periods."],
  ["(?:a )?coelom", "A fluid-filled body cavity lined with tissue from the mesoderm that holds the organs. Animals with one are coelomates."],
  ["germ layers?", "The three tissue layers of an early animal embryo: ectoderm (skin and nerves), mesoderm (muscle, bone, blood) and endoderm (gut lining)."],
];
const LS_FACTS_RE = LS_FACTS.map(([s, b]) => [new RegExp(s), b]);
const LS_DEFS_RE = LS_DEFS.map(([s, b]) => [new RegExp("^(?:what (?:is|are) |define |definition of )?(?:an? |the )?(?:" + s + ")$"), b]);
// Common name to genus and species, for "scientific name of the domestic dog".
const LS_NAMES = {"human":"Homo sapiens", "people":"Homo sapiens", "dog":"Canis familiaris (also written Canis lupus familiaris)", "cat":"Felis catus", "house cat":"Felis catus", "wolf":"Canis lupus", "gray wolf":"Canis lupus", "grey wolf":"Canis lupus", "lion":"Panthera leo", "tiger":"Panthera tigris", "house mouse":"Mus musculus", "mouse":"Mus musculus", "fruit fly":"Drosophila melanogaster", "e coli":"Escherichia coli", "corn":"Zea mays", "rice":"Oryza sativa", "chimpanzee":"Pan troglodytes", "horse":"Equus caballus", "cow":"Bos taurus", "honey bee":"Apis mellifera", "honeybee":"Apis mellifera", "grizzly bear":"Ursus arctos horribilis", "brown bear":"Ursus arctos", "black bear":"Ursus americanus", "bald eagle":"Haliaeetus leucocephalus", "orca":"Orcinus orca", "killer whale":"Orcinus orca", "western red cedar":"Thuja plicata", "douglas fir":"Pseudotsuga menziesii", "sockeye salmon":"Oncorhynchus nerka", "chicken":"Gallus gallus domesticus"};
// Kingdom and phylum of common organisms: [name pattern, kingdom, phylum or ""].
const LS_GROUPS = [
  ["mushrooms?|yeasts?|molds?|moulds?|fung(?:i|us)", "Fungi", ""],
  ["trees?|flowers?|grass(?:es)?|moss(?:es)?|ferns?|plants?|algae", "Plantae (algae are usually placed with the protists)", ""],
  ["amoebas?|amoebae|parameci(?:a|um)|euglenas?|protists?|slime molds?|diatoms?", "Protista", ""],
  ["e\\.? coli|bacteri(?:a|um)|streptococcus|salmonella", "Eubacteria (domain Bacteria)", ""],
  ["insects?|spiders?|crabs?|lobsters?|shrimps?|centipedes?|millipedes?|ants?|bees?|butterfl(?:y|ies)|beetles?", "Animalia", "Arthropoda"],
  ["snails?|slugs?|clams?|oysters?|mussels?|octop(?:us|i|uses)|squids?", "Animalia", "Mollusca"],
  ["earthworms?|leeches?|segmented worms?", "Animalia", "Annelida"],
  ["flatworms?|tapeworms?|planarians?", "Animalia", "Platyhelminthes"],
  ["roundworms?|nematodes?", "Animalia", "Nematoda"],
  ["sea stars?|starfish|sea urchins?|sand dollars?", "Animalia", "Echinodermata"],
  ["jellyfish|corals?|sea anemones?|hydras?", "Animalia", "Cnidaria"],
  ["sponges?", "Animalia", "Porifera"],
  ["humans?|people|dogs?|cats?|fish(?:es)?|birds?|frogs?|snakes?|mammals?|reptiles?|amphibians?|vertebrates?|whales?|sharks?|salmon", "Animalia", "Chordata"],
];
const LS_GROUPS_RE = LS_GROUPS.map(([s, k, p]) => [new RegExp("^(?:the |an? )?(?:" + s + ")$"), k, p]);
function ls11(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"});
  for(const [re, body] of LS_FACTS_RE) if(re.test(q)) return out(body);
  for(const [re, body] of LS_DEFS_RE) if(re.test(q)) return out(body);
  let m;
  if((m = /\b(scientific name|binomial name|genus|species name) (?:of|for) (?:an? |the )?(?:domestic |common )?([a-z. ]+?)s?$/.exec(q))){
    const n = LS_NAMES[m[2].replace(/\./g, "")]; if(n) return out(m[1] === "genus" ? n.split(" ")[0] + " (" + n.replace(/ \(.*/, "") + ")." : n + ".");
  }
  // what kingdom do mushrooms belong to, what phylum are insects in
  if((m = /\b(kingdom|phylum)\b (?:do|does|is|are) (?:an? |the )?([a-z. ]+?) (?:belong to|in|part of|classified (?:in|as|under))$/.exec(q)) || (m = /^(kingdom|phylum) (?:of|for) (?:an? |the )?([a-z. ]+)$/.exec(q))){
    const g = LS_GROUPS_RE.find(([re]) => re.test(m[2]));
    if(g) return out(m[1] === "kingdom" || !g[2] ? (m[1] === "phylum" ? "Kingdom " + g[1] + "." : g[1] + ".") : g[2] + " (kingdom Animalia).");
  }
  // microscopes: total magnification is eyepiece times objective
  if(/\bmagnification\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*[x×]\b.*?(\d+(?:\.\d+)?)\s*[x×]\b/.exec(q))) return out(pcNum(+m[1] * +m[2]) + "× (" + m[1] + "× eyepiece times " + m[2] + "× objective)");
  // field of view shrinks as magnification grows: fov2 = fov1 * mag1 / mag2
  if(/\bfield of view\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*(mm|µm|um|μm)\b(?: at| under| with)? (?:a |the )?(\d+)\s*[x×]/.exec(q))){
    const other = [...q.matchAll(/(\d+)\s*[x×]/g)].map(x => x[1]).find(x => x !== m[3]);
    if(other) return out(pcNum(+m[1] * +m[3] / +other) + " " + m[2].replace(/^u/, "µ") + " (field of view × magnification stays the same)");
  }
  // actual size = image size / magnification
  if(/\bactual (?:size|length)\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*(mm|µm|um|μm|cm)\b.*?(\d+(?:\.\d+)?)\s*[x×]/.exec(q))) return out(pcNum(+m[1] / +m[3]) + " " + m[2].replace(/^u/, "µ") + " (image size ÷ magnification)");
  // bacterial growth by doubling: N = N0 · 2^(t/d)
  if(/\bbacteri/.test(q) && (m = /\b(?:divides?|doubles?|splits?) every (\d+(?:\.\d+)?) (minute|hour|min|hr)s?\b/.exec(q))){
    const t = /\bafter (\d+(?:\.\d+)?) (minute|hour|min|hr)s?\b/.exec(q), n0 = /\bstarting (?:with|from) (\d+)\b/.exec(q);
    if(t){ const unit = u => /^h/.test(u) ? 60 : 1, n = (+t[1] * unit(t[2])) / (+m[1] * unit(m[2])), start = n0 ? +n0[1] : 1;
      if(Number.isInteger(n)) return out(pcNum(start * 2 ** n) + " bacteria (" + n + " doublings: " + start + " × 2^" + n + ")"); }
  }
  return null;
}
// Course terms, shared by the fact-heavy BC courses. Each course has a table of [regex for the whole term,
// description, pattern source] and a list of kinds [question noun, regex over pattern sources]. termAsk answers
// "what is X", "function of X", "what does X do", "how are X formed", "what happens at X", "what causes X" and
// "what is X made of" from the table, and "which organelle makes ATP" by the term of that kind whose description
// shares the most words with the question, a word counting less the more of those descriptions use it.
const TERM_ASKS = [
  /^(?:what (?:is|are) )?(?:the )?(?:main )?(?:functions?|roles?|jobs?|purposes?) of (?:the |a |an )?(.+)$/,
  /^what (?:does|do) (?:the |a |an )?(.+?) (?:do|carry|transport|make|produce|release|secrete|store|control|contain)$/,
  /^how (?:are|is|do|does) (?:the |a |an )?(.+?) (?:formed|form|made|created|forms)$/,
  /^what happens (?:at|in|during) (?:the |a |an )?(.+)$/,
  /^what causes (?:the |a |an )?(.+)$/,
  /^(?:what (?:is|are) )?(?:the |a |an )?(.+?) made (?:up )?of$/,
  /^(?:what (?:is|are|was|were) |define )?(?:the |a |an )?(.+)$/,
];
const TERM_STOP = new Set("the a an of in is are does do which what that and to from for it its with by on into".split(" "));
// A term's plain name from its pattern: optional parts dropped, the first choice of each group kept.
const termName = s => { const n = s.replace(/\(\?:[^()]*\)\?/g, "").replace(/\(\?:([^|()]*)[^()]*\)/g, "$1").split("|")[0].replace(/.\?/g, ""); return n[0].toUpperCase() + n.slice(1); };
function termAsk(q, terms, kinds){
  let m;
  for(const re of TERM_ASKS){
    if(!(m = re.exec(q))) continue;
    const t = m[1].replace(/ (?:in|of) (?:the )?(?:body|cell|human body)$/, "");
    for(const [tre, body] of terms) if(tre.test(t)) return body;
  }
  for(const [kind, names] of kinds){
    if(!(m = new RegExp("^(?:in |on |at )?(?:what|which) (?:" + kind + ") (.+)$").exec(q))) continue;
    const words = m[1].split(/[^a-z0-9]+/).filter(w => w.length > 2 && !TERM_STOP.has(w)).map(w => w.slice(0, 5)), nre = new RegExp(names);
    const pool = terms.filter(([, , src]) => nre.test(src)).map(([, body, src]) => [src, body, body.toLowerCase()]);
    const weight = w => { const n = pool.filter(t => t[2].includes(w)).length; return n ? 1 / n : 0; };
    let best = null, top = 0, tie = false;
    for(const t of pool){ const n = words.reduce((a, w) => a + (t[2].includes(w) ? weight(w) : 0), 0); if(n > top + 1e-9){ best = t; top = n; tie = false; } else if(Math.abs(n - top) < 1e-9 && n) tie = true; }
    if(best && !tie) return termName(best[0]) + ". " + best[1];
    break;
  }
  return null;
}
// BC Anatomy and Physiology 12: cell structures, membrane transport, biological molecules, enzymes, DNA replication,
// protein synthesis, homeostasis and the body systems, plus DNA and RNA sequence work and cardiac output. AP_FACTS are
// phrase questions; AP_TERMS answer "function of X", "what does X do" and "what is X" for each structure and idea.
const AP_FACTS = [
  ["\\b(?:four|4|main) (?:types|classes|groups|kinds) of (?:biological )?(?:macromolecules|biomolecules|organic molecules|molecules)\\b|\\b(?:biological )?macromolecules\\b.*\\b(?:types|four)\\b", "Carbohydrates, lipids, proteins and nucleic acids."],
  ["\\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?proteins?\\b|\\bproteins? (?:are )?made (?:up )?of\\b", "Amino acids, joined by peptide bonds. There are 20 kinds."],
  ["\\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:carbohydrates?|polysaccharides?|starch|glycogen|cellulose)\\b|\\bcarbohydrates? (?:are )?made (?:up )?of\\b", "Monosaccharides (simple sugars) such as glucose."],
  ["\\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:nucleic acids?|dna|rna)\\b|\\bnucleic acids? (?:are )?made (?:up )?of\\b", "Nucleotides, each a sugar, a phosphate group and a nitrogen base."],
  ["\\b(?:monomers?|building blocks?|subunits?) (?:of|for) (?:an? )?(?:lipids?|fats?|triglycerides?)\\b|\\b(?:lipids?|fats?|triglycerides?) (?:are )?made (?:up )?of\\b", "A triglyceride (fat) is one glycerol joined to three fatty acids. Lipids have no true repeating monomer."],
  ["\\b(?:hypotonic)\\b.*\\b(?:solution|cell)\\b|\\bcell\\b.*\\bhypotonic\\b", "Water moves into the cell by osmosis, so it swells. An animal cell such as a red blood cell can burst (lyse); a plant cell turns firm (turgid) against its wall."],
  ["\\b(?:hypertonic)\\b.*\\b(?:solution|cell)\\b|\\bcell\\b.*\\bhypertonic\\b", "Water moves out of the cell by osmosis, so it shrinks. A red blood cell shrivels (crenates); a plant cell's membrane pulls away from its wall (plasmolysis)."],
  ["\\b(?:isotonic)\\b.*\\b(?:solution|cell)\\b|\\bcell\\b.*\\bisotonic\\b|^isotonic$|^an isotonic solution$", "A solution with the same solute concentration as the cell, so water moves in and out equally: no net change in size."],
  ["\\b(?:how does|effect of) temperature\\b.*\\benzym|\\benzym.*\\btemperature\\b", "Activity rises with temperature up to an optimum (about 37 °C for human enzymes), because molecules collide more often. Past it the enzyme denatures, its active site loses its shape, and activity drops fast."],
  ["\\b(?:how does|effect of) ph\\b.*\\benzym|\\benzym.*\\bph\\b", "Each enzyme works best at an optimum pH (about 2 for pepsin in the stomach, about 8 for trypsin in the small intestine). Far from it the active site changes shape and the enzyme denatures."],
  ["\\b(?:how does|effect of) (?:substrate )?concentration\\b.*\\benzym|\\benzym.*\\bsubstrate concentration\\b", "More substrate speeds the reaction until every active site is busy (saturation); then the rate levels off. More enzyme raises the top rate."],
  ["\\bwhere (?:does|is) transcription\\b", "In the nucleus, where RNA polymerase copies a gene into mRNA."],
  ["\\bwhere (?:does|is) translation\\b", "On ribosomes in the cytoplasm (free or on the rough ER)."],
  ["\\bwhere (?:does|is) (?:dna )?replication\\b", "In the nucleus, during the S phase before a cell divides."],
  ["\\bwhat enzyme (?:unzips|unwinds|separates|opens)\\b|\\benzyme that (?:unzips|unwinds|separates)\\b", "Helicase, which breaks the hydrogen bonds between the base pairs."],
  ["\\b(?:three |3 )?stop codons\\b", "UAA, UAG and UGA."],
  ["\\bstart codon\\b", "AUG, which also codes for methionine."],
  ["\\bdna\\b.*\\brna\\b.*\\bdifferen|\\bdifferen.*\\bdna\\b.*\\brna\\b|\\bdna vs\\.? rna\\b", "DNA is double-stranded with the sugar deoxyribose and the base thymine, and stays in the nucleus. RNA is single-stranded with the sugar ribose and uracil in place of thymine, and works in the cytoplasm too."],
  ["\\barter(?:y|ies)\\b.*\\bveins?\\b|\\bveins?\\b.*\\barter(?:y|ies)\\b", "Arteries carry blood away from the heart under high pressure, with thick muscular walls. Veins carry blood back toward the heart under low pressure, with thinner walls and valves to stop backflow."],
  ["\\bpacemaker of the heart\\b|\\bheart'?s (?:natural )?pacemaker\\b", "The SA (sinoatrial) node in the wall of the right atrium."],
  ["\\bwhere (?:does|is) gas exchange\\b|\\bgas exchange (?:occur|happen|take place)", "In the alveoli of the lungs, across their thin walls into the surrounding capillaries. In the tissues it happens across capillary walls."],
  ["\\bfunctional unit of (?:the )?kidneys?\\b", "The nephron. Each kidney has about a million."],
  ["\\bfunctional unit of (?:the )?nervous system\\b", "The neuron."],
  ["\\bfunctional unit of (?:the )?lungs?\\b", "The alveolus, a tiny air sac where gases are exchanged."],
  ["\\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:starch|carbohydrates?)\\b", "Amylase, from the salivary glands and the pancreas, which breaks starch into maltose."],
  ["\\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) proteins? in the stomach\\b", "Pepsin."],
  ["\\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) proteins?\\b", "Pepsin in the stomach, then trypsin from the pancreas in the small intestine, and peptidases in the intestinal lining."],
  ["\\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:fats?|lipids?)\\b", "Lipase, mostly from the pancreas, after bile has emulsified the fat."],
  ["\\b(?:what )?enzyme (?:that )?(?:breaks? down|digests?) (?:dna|rna|nucleic acids?)\\b", "Nucleases from the pancreas."],
  ["\\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of (?:starch|carbohydrates?) (?:begin|start)\\b", "In the mouth, with salivary amylase."],
  ["\\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of proteins? (?:begin|start)\\b", "In the stomach, with pepsin."],
  ["\\bwhere (?:does|do) (?:the )?(?:chemical )?digestion of (?:fats?|lipids?) (?:begin|start)\\b", "Mostly in the small intestine, with bile and pancreatic lipase."],
  ["\\bwhere (?:are|is) (?:most )?nutrients? absorbed\\b", "In the small intestine, through its villi and microvilli."],
  ["\\b(?:example|examples) of negative feedback\\b", "Body temperature control (sweating when hot, shivering when cold), blood sugar control by insulin and glucagon, and water balance by ADH."],
  ["\\b(?:example|examples) of positive feedback\\b", "Contractions during childbirth (oxytocin), blood clotting, and the surge before ovulation."],
  ["\\b(?:which way|what direction|direction)\\b.*\\bwater\\b.*\\bosmosis\\b|\\bosmosis\\b.*\\b(?:which way|direction)\\b", "From the side with less solute (more water, hypotonic) to the side with more solute (less water, hypertonic)."],
  ["\\bexamples? of (?:an? )?polysaccharides?\\b", "Starch and cellulose in plants, glycogen in animals."],
  ["\\bexamples? of (?:an? )?monosaccharides?\\b", "Glucose, fructose and galactose."],
  ["\\bexamples? of (?:an? )?disaccharides?\\b", "Sucrose (table sugar), lactose (milk sugar) and maltose."],
  ["\\bexamples? of (?:an? )?lipids?\\b", "Fats and oils (triglycerides), phospholipids, steroids such as cholesterol and testosterone, and waxes."],
  ["\\bexamples? of (?:an? )?enzymes?\\b", "Amylase (starch), pepsin and trypsin (protein), lipase (fat), catalase (hydrogen peroxide), and DNA polymerase."],
  ["\\bsubstrate (?:of|for) amylase\\b", "Starch, which amylase breaks into maltose."],
  ["\\bsubstrate (?:of|for) (?:pepsin|trypsin)\\b", "Proteins, broken into shorter peptides."],
  ["\\bsubstrate (?:of|for) lipase\\b", "Fats (triglycerides), broken into fatty acids and glycerol."],
  ["\\bsubstrate (?:of|for) catalase\\b", "Hydrogen peroxide, broken into water and oxygen."],
  ["\\bsubstrate (?:of|for) (?:lactase|maltase|sucrase)\\b", "Its sugar: lactase splits lactose, maltase splits maltose, sucrase splits sucrose."],
  ["\\b(?:what happens to|is) (?:an |the )?enzyme\\b.*\\b(?:after|used up|end of)\\b", "Nothing: it comes out of the reaction unchanged and is reused again and again."],
  ["\\boptimum temperature\\b.*\\b(?:human|body)\\b|\\b(?:human|body) enzymes?\\b.*\\boptimum\\b", "About 37 °C, body temperature."],
  ["\\bbase[- ]pair(?:ing)? rules?\\b|\\bcomplementary base pair(?:ing|s)?\\b|\\bwhich bases pair\\b", "In DNA, adenine (A) pairs with thymine (T) and cytosine (C) pairs with guanine (G). In RNA, A pairs with uracil (U)."],
  ["\\bholds?\\b.*\\bstrands?\\b.*\\bdna\\b.*\\btogether\\b|\\bholds?\\b.*\\bdna strands?\\b|\\bbonds?\\b.*\\bbetween (?:the )?(?:dna )?bases\\b", "Hydrogen bonds between the paired bases: two between A and T, three between C and G."],
  ["\\b(?:how does the body|body'?s?)\\b.*\\b(?:respond|react|response|cool)\\b.*\\b(?:too hot|hot|overheat)|\\bwhen (?:it is |you are |the body is )?too hot\\b", "Sweat glands release sweat that cools the skin as it evaporates, and blood vessels near the skin widen (vasodilation) to lose heat. The hypothalamus runs it as a negative feedback loop."],
  ["\\b(?:how does the body|body'?s?)\\b.*\\b(?:respond|react|response|warm)\\b.*\\b(?:too cold|cold)|\\bwhen (?:it is |you are |the body is )?too cold\\b", "Muscles shiver to make heat, blood vessels near the skin narrow (vasoconstriction) to keep it in, and body hair stands up. The hypothalamus runs it as a negative feedback loop."],
  ["\\bwhere (?:is|does) bile (?:made|produced|come from)\\b", "In the liver."],
  ["\\bwhere (?:is|does) bile (?:stored|kept)\\b", "In the gallbladder, which releases it into the small intestine."],
  ["\\bwhere (?:is|are) (?:insulin|glucagon) (?:made|produced|released)\\b", "In the pancreas, by the islets of Langerhans."],
  ["\\bwhere (?:is|are) (?:adh|antidiuretic hormone) (?:made|produced|released)\\b", "Made in the hypothalamus and released by the posterior pituitary gland."],
  ["\\bwhere (?:is|are) urine (?:made|produced|formed)\\b", "In the nephrons of the kidneys."],
  ["\\bwhere (?:is|are) red blood cells (?:made|produced|formed)\\b", "In the red bone marrow."],
];
const AP_TERMS = [
  // organelles
  ["nucle(?:us|i)", "Holds the cell's DNA and controls its activities, including which proteins are made."],
  ["nucleol(?:us|i)", "A dense region in the nucleus that makes ribosomes."],
  ["mitochondri(?:a|on)", "Makes ATP, the cell's usable energy, by cellular respiration. It has its own DNA."],
  ["ribosomes?", "Builds proteins by joining amino acids in the order the mRNA spells out (translation)."],
  ["rough (?:endoplasmic reticulum|er)", "Membranes studded with ribosomes that make and fold proteins for export or for membranes, then send them to the Golgi in vesicles."],
  ["smooth (?:endoplasmic reticulum|er)", "Makes lipids such as phospholipids and steroid hormones, and detoxifies drugs and poisons, mostly in liver cells."],
  ["endoplasmic reticulum", "A network of membranes. Rough ER, covered in ribosomes, makes proteins; smooth ER makes lipids and detoxifies."],
  ["golgi(?: apparatus| body| complex)?", "Modifies, sorts and packages proteins and lipids from the ER into vesicles and ships them where they go, including out of the cell."],
  ["lysosomes?", "Sacs of digestive enzymes that break down worn-out organelles, food particles and invading bacteria."],
  ["vesicles?", "Small membrane sacs that transport and store materials inside the cell, and carry them to the membrane to leave."],
  ["vacuoles?", "Stores water, food and wastes. Plant cells have one large central vacuole that also keeps the cell firm."],
  ["(?:cell|plasma) membrane", "Controls what enters and leaves the cell (it is selectively permeable) and holds receptors for signals."],
  ["cytoskeleton", "A network of protein fibres (microtubules and microfilaments) that gives the cell its shape and support, and moves organelles and the cell."],
  ["centrioles?", "Organize the spindle fibres that pull chromosomes apart during cell division."],
  ["cytoplasm", "The fluid and everything in it between the membrane and the nucleus, where many reactions happen."],
  ["chloroplasts?", "Carries out photosynthesis in plant cells, turning light energy into sugar."],
  ["peroxisomes?", "Breaks down fatty acids and toxic hydrogen peroxide."],
  // transport and membranes
  ["(?:the )?fluid mosaic model", "The cell membrane is a fluid double layer of phospholipids with proteins, cholesterol and carbohydrate chains floating in it like tiles in a mosaic."],
  ["phospholipids?", "A lipid with a water-loving phosphate head and two water-fearing fatty acid tails. They form the double layer (bilayer) of cell membranes."],
  ["diffusion", "Particles spreading from an area of high concentration to low concentration, with no energy used."],
  ["osmosis", "The diffusion of water across a selectively permeable membrane, from where there is more water (less solute) to where there is less water (more solute)."],
  ["facilitated diffusion", "Passive transport through a membrane protein, a channel or a carrier, down the concentration gradient, with no energy used. Glucose enters cells this way."],
  ["active transport", "Moving substances across a membrane against their concentration gradient (low to high) using energy from ATP and carrier proteins, like the sodium-potassium pump."],
  ["passive transport", "Movement across a membrane down a concentration gradient with no energy used: diffusion, osmosis and facilitated diffusion."],
  ["endocytosis", "The cell takes in large particles or fluid by folding its membrane around them into a vesicle. Phagocytosis takes in solids, pinocytosis liquids."],
  ["exocytosis", "A vesicle fuses with the cell membrane and releases its contents out of the cell, as when hormones or enzymes are secreted."],
  ["phagocytosis", "Cell eating: the cell engulfs a large particle such as a bacterium into a vesicle."],
  ["pinocytosis", "Cell drinking: the cell takes in droplets of fluid in small vesicles."],
  ["(?:a |an )?hypotonic solution|hypotonic", "A solution with less solute than the cell, so water moves into the cell and it swells."],
  ["(?:a |an )?hypertonic solution|hypertonic", "A solution with more solute than the cell, so water moves out of the cell and it shrinks."],
  // molecules
  ["carbohydrates?", "Sugars and starches made of carbon, hydrogen and oxygen, used for quick energy and structure. Monomer: monosaccharides such as glucose."],
  ["lipids?", "Fats, oils, phospholipids and steroids: they store energy, form membranes and act as hormones. They do not dissolve in water."],
  ["proteins?", "Chains of amino acids folded into shapes that do most of the cell's work: enzymes, structure, transport, signals and defence."],
  ["nucleic acids?", "DNA and RNA, chains of nucleotides that store and carry genetic information."],
  ["nucleotides?", "The monomer of nucleic acids: a five-carbon sugar, a phosphate group and a nitrogen base."],
  ["amino acids?", "The monomer of proteins. Each has an amino group, a carboxyl group and a side chain (R group); there are 20."],
  ["monosaccharides?", "A simple sugar, the monomer of carbohydrates, such as glucose, fructose and galactose."],
  ["disaccharides?", "Two monosaccharides joined by dehydration synthesis, such as sucrose, lactose and maltose."],
  ["polysaccharides?", "A long chain of monosaccharides: starch and cellulose in plants, glycogen in animals."],
  ["glycogen", "The polysaccharide animals use to store glucose, mostly in the liver and muscles."],
  ["starch", "The polysaccharide plants use to store glucose."],
  ["cellulose", "The polysaccharide that makes plant cell walls. Humans cannot digest it; it is fibre."],
  ["triglycerides?", "A fat or oil: one glycerol joined to three fatty acids."],
  ["saturated fats?", "A fat whose fatty acids have only single bonds, so they pack tightly and are solid at room temperature, like butter."],
  ["unsaturated fats?", "A fat with one or more double bonds in its fatty acids, which bend them, so it is liquid at room temperature, like olive oil."],
  ["(?:a )?dehydration synthesis(?: reaction)?|condensation reaction", "Two monomers join into a larger molecule and a water molecule is removed (given off). It builds polymers."],
  ["hydrolysis(?: reaction)?", "Adding water to break a bond between monomers, splitting a polymer apart. Digestion is hydrolysis."],
  ["(?:a )?peptide bonds?", "The bond between two amino acids, formed by dehydration synthesis."],
  ["glycosidic bonds?", "The bond between two monosaccharides."],
  ["denaturation|denatured|denature", "A protein losing its three-dimensional shape (it unfolds) from heat, pH or chemicals, so it stops working."],
  ["atp|adenosine triphosphate", "Adenosine triphosphate, the molecule cells use for energy. Breaking off a phosphate (ATP to ADP) releases it."],
  // enzymes
  ["enzymes?", "A protein that speeds up (catalyzes) a reaction by lowering its activation energy, without being used up."],
  ["(?:the )?active site(?: of an enzyme)?", "The pocket on an enzyme where the substrate binds and the reaction happens. Its shape fits the substrate."],
  ["substrates?", "The molecule an enzyme acts on, which binds at its active site."],
  ["activation energy", "The energy needed to start a reaction. Enzymes lower it, so reactions happen faster at body temperature."],
  ["(?:a )?competitive inhibitors?|competitive inhibition", "A molecule shaped like the substrate that binds the active site and blocks it. More substrate can outcompete it."],
  ["(?:a )?non-?competitive inhibitors?|non-?competitive inhibition", "A molecule that binds an enzyme away from the active site and changes its shape, so the substrate no longer fits. More substrate does not help."],
  ["(?:a )?coenzymes?", "An organic helper molecule, often made from a vitamin, that an enzyme needs to work."],
  ["(?:a )?cofactors?", "A non-protein helper an enzyme needs, such as a metal ion like zinc or iron, or a coenzyme."],
  ["(?:the )?induced fit(?: model)?", "The active site changes shape slightly to grip the substrate as it binds."],
  ["(?:the )?lock and key(?: model)?", "The substrate fits the enzyme's active site exactly, like a key in a lock."],
  // DNA and protein synthesis
  ["semi-?conservative replication", "Each new DNA molecule keeps one original (parent) strand and one newly built strand."],
  ["dna replication|replication", "Copying DNA before cell division: helicase unzips the helix, DNA polymerase builds a new strand on each old one, and ligase joins the pieces."],
  ["helicase", "The enzyme that unzips DNA by breaking the hydrogen bonds between base pairs."],
  ["dna polymerase", "The enzyme that builds a new DNA strand by adding complementary nucleotides to the template, in the 5' to 3' direction, and proofreads it."],
  ["(?:dna )?ligase", "The enzyme that seals gaps in the sugar-phosphate backbone, joining Okazaki fragments on the lagging strand."],
  ["primase", "The enzyme that lays down a short RNA primer so DNA polymerase can start."],
  ["okazaki fragments?", "Short pieces of DNA built on the lagging strand during replication, later joined by ligase."],
  ["(?:the )?leading strand", "The new DNA strand built continuously toward the replication fork."],
  ["(?:the )?lagging strand", "The new DNA strand built in short Okazaki fragments away from the fork, then joined by ligase."],
  ["rna polymerase", "The enzyme that reads a gene's template strand and builds the matching mRNA (transcription)."],
  ["transcription", "Copying a gene's DNA into messenger RNA (mRNA) in the nucleus, by RNA polymerase."],
  ["translation", "Reading mRNA on a ribosome to build a protein: tRNA brings the amino acid for each codon."],
  ["protein synthesis", "Making a protein in two steps: transcription (DNA to mRNA in the nucleus) and translation (mRNA to protein on a ribosome)."],
  ["mrna|messenger rna", "Messenger RNA carries a gene's code from the DNA in the nucleus to a ribosome."],
  ["trna|transfer rna", "Transfer RNA carries a specific amino acid to the ribosome and matches its anticodon to the mRNA codon."],
  ["rrna|ribosomal rna", "Ribosomal RNA makes up ribosomes, with proteins, and joins amino acids together."],
  ["(?:a )?codons?", "A sequence of three (a triplet of) mRNA bases that codes for one amino acid or a stop signal."],
  ["(?:an )?anticodons?", "The three bases on a tRNA that pair with an mRNA codon."],
  ["(?:a )?(?:point|substitution) mutation", "One base swapped for another. It may change one amino acid, none, or create a stop codon."],
  ["(?:a )?frameshift mutation", "A base inserted or deleted, which shifts the reading frame so every codon after it changes."],
  // homeostasis
  ["homeostasis", "Keeping the body's internal conditions, such as temperature, blood sugar and water, stable and balanced despite changes outside."],
  ["negative feedback(?: loop)?", "A change triggers a response that reverses it, returning the body to its set point, as sweating cools you when you are hot."],
  ["positive feedback(?: loop)?", "A change triggers a response that amplifies it further until an end point, as contractions intensify during childbirth."],
  // digestive system
  ["mouth", "Breaks food up by chewing (mechanical digestion) and starts digesting starch with salivary amylase."],
  ["salivary glands?", "Make saliva, which moistens food and contains amylase to start digesting starch."],
  ["esophagus|oesophagus", "Moves food from the throat to the stomach by waves of muscle contraction (peristalsis)."],
  ["stomach", "Stores food and churns it with gastric juice: hydrochloric acid kills microbes and activates pepsin, which starts digesting protein."],
  ["small intestine", "Finishes digestion with enzymes from the pancreas and its own lining, plus bile from the liver, and absorbs nutrients into the blood through its villi."],
  ["large intestine|colon", "Absorbs water and salts, holds bacteria that make vitamin K, and forms and stores feces."],
  ["liver", "Makes bile, stores glycogen, processes nutrients, detoxifies the blood and makes urea."],
  ["gall ?bladder", "Stores bile from the liver and releases it into the small intestine."],
  ["pancreas", "Releases digestive enzymes (amylase, trypsin, lipase) and bicarbonate into the small intestine, and the hormones insulin and glucagon that control blood sugar."],
  ["bile", "Made by the liver and stored in the gallbladder, it emulsifies fats, breaking them into small droplets so lipase can digest them."],
  ["vill(?:i|us)", "Finger-like folds lining the small intestine that greatly increase the surface area for absorbing nutrients."],
  ["peristalsis", "Waves of muscle contraction that push food along the digestive tract."],
  ["amylase", "The enzyme that breaks starch into sugars, made by the salivary glands and the pancreas."],
  ["pepsin", "The enzyme in the stomach that starts digesting proteins. It works best in acid."],
  ["trypsin", "A pancreatic enzyme that digests proteins in the small intestine."],
  ["lipase", "The enzyme that digests fats into fatty acids and glycerol."],
  // circulatory system
  ["heart", "Pumps blood: the right side sends it to the lungs, the left side to the rest of the body."],
  ["right atrium", "Receives deoxygenated blood from the body through the venae cavae."],
  ["left atrium", "Receives oxygenated blood from the lungs through the pulmonary veins."],
  ["right ventricle", "Pumps deoxygenated blood to the lungs through the pulmonary artery."],
  ["left ventricle", "Pumps oxygenated blood to the whole body through the aorta (systemic circulation). Its wall is the thickest."],
  ["aorta", "The largest artery, carrying oxygenated blood from the left ventricle to the body."],
  ["pulmonary arter(?:y|ies)", "Carries deoxygenated blood from the right ventricle to the lungs."],
  ["pulmonary veins?", "Carry oxygenated blood from the lungs to the left atrium."],
  ["venae? cavae?|vena cava", "The large veins that bring deoxygenated blood from the body into the right atrium."],
  ["(?:heart )?valves?", "Flaps that keep blood flowing one way through the heart and stop backflow."],
  ["sa node|sinoatrial node", "The heart's pacemaker in the right atrium, which starts each heartbeat."],
  ["av node|atrioventricular node", "Delays the signal from the SA node, then passes it to the ventricles so they contract after the atria."],
  ["arter(?:y|ies)", "Blood vessels that carry blood away from the heart, with thick, muscular, elastic walls."],
  ["veins?", "Blood vessels that carry blood back toward the heart, with thin walls and valves."],
  ["capillar(?:y|ies)", "Tiny vessels one cell thick where oxygen, nutrients and wastes pass between blood and tissues."],
  ["red blood cells?|erythrocytes?", "Carry oxygen from the lungs to the tissues using hemoglobin. They have no nucleus."],
  ["white blood cells?|leukocytes?", "Defend the body against infection."],
  ["platelets?", "Cell fragments that help blood clot."],
  ["plasma", "The liquid part of blood, mostly water, carrying nutrients, hormones, proteins and wastes."],
  ["hemoglobin|haemoglobin", "The iron-containing protein in red blood cells that carries oxygen (and some carbon dioxide)."],
  ["blood pressure", "The force of blood against artery walls, given as systolic over diastolic, about 120/80 mmHg."],
  ["systole", "The phase of the heartbeat when the ventricles contract."],
  ["diastole", "The phase of the heartbeat when the heart relaxes and fills."],
  ["cardiac output", "The volume of blood the heart pumps per minute: heart rate times stroke volume, about 5 L/min at rest."],
  ["stroke volume", "The volume of blood one ventricle pumps per beat, about 70 mL at rest."],
  // respiratory system
  ["lungs?", "Exchange gases: oxygen moves into the blood and carbon dioxide moves out, in the alveoli."],
  ["alveol(?:i|us)", "Tiny air sacs in the lungs where oxygen diffuses into the capillaries and carbon dioxide diffuses out."],
  ["trachea", "The windpipe, a tube held open by rings of cartilage that carries air to the bronchi."],
  ["bronch(?:i|us)", "The two airways that branch from the trachea into the lungs."],
  ["bronchioles?", "Small branching airways in the lungs that end in alveoli."],
  ["diaphragm", "The main muscle of breathing: it contracts and flattens to pull air in (inhalation) and relaxes to let air out."],
  ["epiglottis", "A flap that covers the trachea when you swallow so food goes down the esophagus."],
  // urinary system
  ["kidneys?", "Filter the blood to remove urea and other wastes as urine, and balance the body's water, salts and pH."],
  ["nephrons?", "The functional unit of the kidney, which filters blood and forms urine."],
  ["glomerul(?:us|i)", "A knot of capillaries in the nephron where blood is filtered under pressure into Bowman's capsule."],
  ["(?:the )?loop of henle", "The part of the nephron that reabsorbs water and salt, letting the kidney make concentrated urine."],
  ["(?:urinary )?bladder", "Stores urine until it leaves the body."],
  ["ureters?", "Tubes that carry urine from each kidney to the bladder."],
  ["urethra", "The tube that carries urine from the bladder out of the body."],
  ["antidiuretic hormone|adh", "Makes the kidney's collecting ducts reabsorb more water, so less, more concentrated urine is made. The posterior pituitary releases it when the body is short of water."],
  ["aldosterone", "A hormone from the adrenal glands that makes the kidneys reabsorb more sodium (and water)."],
  ["insulin", "A hormone from the pancreas that lowers blood sugar by helping cells take up glucose and the liver store it as glycogen."],
  ["glucagon", "A hormone from the pancreas that raises blood sugar by making the liver break glycogen into glucose."],
  // nervous system
  ["neurons?", "A nerve cell that carries electrical signals (impulses): dendrites receive them, the axon sends them on."],
  ["dendrites?", "Branches of a neuron that receive signals and carry them toward the cell body."],
  ["axons?", "The long fibre of a neuron that carries impulses away from the cell body."],
  ["(?:the )?myelin(?: sheath)?", "A fatty layer that insulates an axon and speeds up the impulse, which jumps between the gaps (nodes of Ranvier)."],
  ["synapses?", "The gap (junction) between a neuron and the next cell, where neurotransmitters carry the signal across."],
  ["neurotransmitters?", "A chemical messenger, such as acetylcholine, released at a synapse to pass a signal to the next cell."],
  ["(?:a )?reflex arc", "The nerve pathway of a reflex: sensory neuron to interneuron in the spinal cord to motor neuron, skipping the brain for speed."],
  ["cerebrum", "The largest part of the brain: thinking, memory, the senses and voluntary movement."],
  ["cerebellum", "Coordinates movement, balance and posture."],
  ["medulla(?: oblongata)?", "Controls automatic functions: breathing, heart rate and blood pressure."],
  ["hypothalamus", "Links the nervous and endocrine systems and controls homeostasis: body temperature, thirst, hunger, and the pituitary gland."],
  ["selectively permeable(?: membrane)?|semi-?permeable(?: membrane)?", "A membrane that lets some substances cross but not others, as the cell membrane does."],
  ["(?:the )?sodium[- ]potassium pump", "A carrier protein that uses ATP (active transport) to pump three sodium ions out of the cell and two potassium ions in, against their gradients. It keeps nerve cells ready to fire."],
  ["(?:a )?concentration gradient", "A difference in concentration between two areas. Substances diffuse down it, from high to low."],
  ["(?:the )?primary structure(?: of (?:a )?proteins?)?", "The sequence (order) of amino acids in the chain."],
  ["(?:the )?secondary structure(?: of (?:a )?proteins?)?", "Folding of the chain into alpha helices and beta pleated sheets, held by hydrogen bonds."],
  ["(?:the )?tertiary structure(?: of (?:a )?proteins?)?", "The overall three-dimensional shape of one folded chain, held by bonds between side chains."],
  ["(?:the )?quaternary structure(?: of (?:a )?proteins?)?", "Two or more folded chains joined into one protein, like the four chains of hemoglobin."],
  ["catalase", "An enzyme in liver and other cells that breaks toxic hydrogen peroxide into water and oxygen."],
  ["(?:a )?genes?", "A section of DNA that codes for one protein (or RNA)."],
  ["pituitary(?: gland)?", "The master gland under the brain. Its posterior lobe releases ADH and oxytocin; its anterior lobe releases growth hormone, TSH, FSH, LH and others."],
  ["thyroid(?: gland)?", "A gland in the neck that releases thyroxine, which sets the body's metabolic rate."],
  ["adrenal glands?", "Glands on top of the kidneys that release adrenaline (fight or flight) and aldosterone."],
];
const AP_TERMS_RE = AP_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
// Which terms count as an organelle, a part of the brain, a gland and so on, for "which organelle makes ATP".
const AP_KINDS = [
  ["organelles?|parts? of (?:the |a )?cell|cell parts?|cell structures?", "^(?:nucle|mitoch|ribos|rough|smooth|endopl|golgi|lysos|vesic|vacuol|cytosk|centri|chlorop|perox)"],
  ["parts? of (?:the )?brain|brain (?:parts?|regions?|structures?)|regions? of (?:the )?brain", "^(?:cerebr|cerebel|medulla|hypoth)"],
  ["glands?", "^(?:pancreas|liver|salivary|pituitary|thyroid|adrenal|hypoth)"],
  ["organs?", "^(?:mouth|esoph|stomach|small|large|liver|gall|pancreas|heart|lungs|kidney|\\(\\?:urinary|pituitary|thyroid|adrenal)"],
  ["enzymes?", "^(?:amylase|pepsin|trypsin|lipase|catalase|helicase|dna polymerase|\\(\\?:dna \\)\\?ligase|primase|rna polymerase)"],
  ["hormones?", "^(?:antidiuretic|aldosterone|insulin|glucagon)"],
  ["(?:blood )?vessels?", "^(?:aorta|pulmonary|venae|arter|veins|capillar)"],
  ["(?:blood )?cells?", "^(?:red blood|white blood|platelets|neurons)"],
  ["heart chambers?|chambers? of the heart", "^(?:right|left) (?:atrium|ventricle)"],
];
// The standard genetic code, mRNA bases in UCAG order: first base, then second, then third.
const AP_CODE = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const AP_AA = {F:"Phe phenylalanine", L:"Leu leucine", S:"Ser serine", Y:"Tyr tyrosine", C:"Cys cysteine", W:"Trp tryptophan", P:"Pro proline", H:"His histidine", Q:"Gln glutamine", R:"Arg arginine", I:"Ile isoleucine", M:"Met methionine", T:"Thr threonine", N:"Asn asparagine", K:"Lys lysine", V:"Val valine", A:"Ala alanine", D:"Asp aspartic acid", E:"Glu glutamic acid", G:"Gly glycine"};
const apCodon = c => AP_CODE["UCAG".indexOf(c[0]) * 16 + "UCAG".indexOf(c[1]) * 4 + "UCAG".indexOf(c[2])];
function ap12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"});
  for(const [s, body] of AP_FACTS) if(new RegExp(s).test(q)) return out(body);
  let m;
  const tb = termAsk(q, AP_TERMS_RE, AP_KINDS); if(tb) return out(tb);
  // complementary DNA strand
  if((m = /\bcomplement(?:ary)?\b.*?\b([acgt]{3,})$/.exec(q)) && !/\b(?:rna|mrna)\b/.test(q)) return out(m[1].toUpperCase().replace(/[ACGT]/g, b => ({A:"T", T:"A", C:"G", G:"C"})[b]));
  // transcription: a template strand pairs (A to U); a coding strand only swaps T for U
  if((m = /\b(?:transcribe|mrna (?:from|for|of|made from|transcribed from))\b.*?\b([acgt]{3,})\b/.exec(q))){
    const s = m[1].toUpperCase();
    if(/\bcoding strand\b/.test(q)) return out(s.replace(/T/g, "U") + " (the coding strand with U for T)");
    return out(s.replace(/[ACGT]/g, b => ({A:"U", T:"A", C:"G", G:"C"})[b]) + " (read as the template strand: A pairs with U, T with A, C with G)");
  }
  // one codon
  if((m = /\b(?:codon )?([acgu]{3})\b (?:codes?|code for|stands? for|encodes?|specif(?:y|ies))\b/.exec(q)) || (m = /\bcodon ([acgu]{3})\b/.exec(q))){
    const a = apCodon(m[1].toUpperCase()); if(!a) return null;
    if(a === "*") return out("Stop: " + m[1].toUpperCase() + " is a stop codon and codes for no amino acid.");
    const [ab, name] = AP_AA[a].split(/ (.+)/); return out(name[0].toUpperCase() + name.slice(1) + " (" + ab + ")" + (a === "M" ? ", also the start codon." : "."));
  }
  // translate mRNA in triplets, stopping at a stop codon
  if((m = /\btranslate\b.*?\b([acgu]{3,})\b/.exec(q)) && /u/.test(m[1])){
    const s = m[1].toUpperCase(), aa = []; let stop = false;
    for(let i = 0; i + 3 <= s.length; i += 3){ const a = apCodon(s.slice(i, i + 3)); if(a === "*"){ stop = true; break; } aa.push(a); }
    return out(aa.map(a => AP_AA[a].split(" ")[0]).join("-") + (stop ? "-Stop" : "") + " (" + aa.map(a => AP_AA[a].split(/ (.+)/)[1]).join(", ") + (stop ? ", then stop" : "") + ")");
  }
  // codons and amino acids: three bases per codon
  if((m = /\bhow many amino acids\b.*?\b(\d+) (?:nucleotides|bases)\b/.exec(q))){ const n = Math.floor(+m[1] / 3); return out(n + " codons, so " + n + " amino acids if every codon codes for one (" + (n - 1) + " if the last is a stop codon).");}
  if((m = /\bhow many (?:nucleotides|bases)\b.*?\b(\d+) amino acids\b/.exec(q))) return out(pcNum(+m[1] * 3) + " nucleotides (3 per amino acid), plus 3 more for a stop codon.");
  // cardiac output = heart rate x stroke volume
  if(/\bcardiac output\b/.test(q) && (m = /\bheart rate (?:is |of )?(\d+(?:\.\d+)?)/.exec(q))){
    const sv = /\bstroke volume (?:is |of )?(\d+(?:\.\d+)?)\s*ml\b/.exec(q);
    if(sv){ const co = +m[1] * +sv[1]; return out(pcNum(co) + " mL/min (" + pcNum(co / 1000) + " L/min; cardiac output = heart rate × stroke volume)"); }
  }
  return null;
}
// BC Earth Sciences 11: minerals and rocks, Earth's layers, plate tectonics, earthquakes and volcanoes, geologic time,
// weathering and erosion, the atmosphere, oceans and climate, plus radiometric dating, earthquake magnitude and
// epicentre distance. ES_FACTS are phrase questions; ES_TERMS go through termAsk.
const ES_FACTS = [
  ["\\b(?:three |3 |main )?(?:types|kinds|classes) of rocks?\\b", "Igneous, sedimentary and metamorphic."],
  ["\\bhardest (?:natural )?mineral\\b", "Diamond, 10 on the Mohs scale."],
  ["\\bsoftest mineral\\b", "Talc, 1 on the Mohs scale."],
  ["\\bmost (?:common|abundant) minerals?\\b.*\\bcrust\\b|\\bcrust'?s? most (?:common|abundant) mineral\\b", "Feldspar, about half of the crust. Quartz is next."],
  ["\\bintrusive\\b.*\\bextrusive\\b|\\bextrusive\\b.*\\bintrusive\\b", "Intrusive (plutonic) igneous rock cools slowly inside the Earth, below the surface, so it has large crystals, like granite. Extrusive (volcanic) rock cools fast on the surface, so its crystals are small or absent, like basalt and obsidian."],
  ["\\bmagma\\b.*\\blava\\b|\\blava\\b.*\\bmagma\\b", "Magma is molten rock underground, below the surface. Once it erupts onto the surface it is called lava."],
  ["\\bweathering\\b.*\\berosion\\b|\\berosion\\b.*\\bweathering\\b", "Weathering breaks rock down into smaller pieces where it sits. Erosion then moves (transports) those pieces away by water, wind, ice or gravity."],
  ["\\bweather\\b.*\\bclimate\\b|\\bclimate\\b.*\\bweather\\b", "Weather is the short-term state of the atmosphere, over hours or days. Climate is the long-term average weather of a region, usually over 30 years or more."],
  ["\\blayers of (?:the )?earth\\b|\\bearth'?s (?:layers|structure|interior)\\b", "Crust, mantle, outer core and inner core, from the surface in. By strength, the rigid lithosphere sits on the soft asthenosphere."],
  ["\\blayers of (?:the )?atmosphere\\b|\\batmospher(?:e|ic) layers\\b", "Troposphere, stratosphere, mesosphere, thermosphere and exosphere, from the ground up."],
  ["\\bwho (?:proposed|came up with|developed|suggested)\\b.*\\bcontinental drift\\b|\\bfather of continental drift\\b", "Alfred Wegener, a German scientist, in 1912."],
  ["\\bevidence (?:for|of|supporting) (?:continental drift|plate tectonics|pangaea)\\b", "The continents fit together like puzzle pieces, matching fossils (Mesosaurus, Glossopteris) and rock types and mountain ranges line up across oceans, and glacial scratches and coal sit in places now far too warm or cold for them. Later: sea floor spreading and magnetic stripes."],
  ["\\bwhat (?:drives|causes|moves) (?:the )?(?:plates?|plate motion|plate movement|tectonic plates)\\b", "Convection currents in the mantle, along with slab pull (sinking plates dragging the rest) and ridge push at mid-ocean ridges."],
  ["\\bs[- ]waves?\\b.*\\b(?:outer core|liquid)\\b", "S waves are shear waves and travel only through solids. The outer core is liquid, so they stop there, which is how we know it is liquid."],
  ["\\bcontinental[- ]continental\\b|\\btwo continental plates\\b", "Huge folded mountain ranges, like the Himalayas: neither plate is dense enough to subduct, so the crust crumples."],
  ["\\boceanic[- ]oceanic\\b|\\btwo oceanic plates\\b", "A deep ocean trench and a curved chain of volcanic islands (an island arc), like Japan or the Aleutians, as one plate subducts."],
  ["\\boceanic[- ]continental\\b|\\bcontinental[- ]oceanic\\b", "The oceanic plate subducts, making a trench offshore and a range of volcanic mountains on land, like the Cascades and the Andes."],
  ["\\bexamples? of (?:a )?transform (?:boundary|fault|plate boundary)\\b", "The San Andreas Fault in California. In BC, the Queen Charlotte Fault off Haida Gwaii."],
  ["\\bexamples? of (?:a )?divergent (?:boundary|plate boundary)\\b", "The Mid-Atlantic Ridge, and the East African Rift on land."],
  ["\\bexamples? of (?:a )?convergent (?:boundary|plate boundary)\\b", "The Cascadia subduction zone off BC, the Andes, and the Himalayas."],
  ["\\bhow many (?:seismograph|seismic|recording) stations\\b|\\bstations\\b.*\\b(?:locate|find|needed)\\b.*\\bepicent", "Three. Each station's S minus P time gap gives its distance, and the three circles meet at the epicentre (triangulation)."],
  ["\\bwhat (?:geologic(?:al)? )?era\\b.*\\b(?:we|now|today|current)\\b|\\bcurrent (?:geologic(?:al)? )?era\\b", "The Cenozoic Era, in the Quaternary Period and the Holocene Epoch."],
  ["\\b(?:geologic(?:al)? )?eras\\b|\\bfour eras\\b", "Precambrian time, then the Paleozoic, Mesozoic (the age of dinosaurs) and Cenozoic eras."],
  ["\\bthinnest layer of (?:the )?earth\\b", "The crust, about 7 km thick under the oceans and 35 km under the continents."],
  ["\\bthickest layer of (?:the )?earth\\b", "The mantle, about 2900 km thick."],
  ["\\bhow hot is (?:the )?(?:earth'?s )?(?:inner )?core\\b|\\btemperature of (?:the )?(?:earth'?s )?(?:inner )?core\\b", "About 5400 °C at the inner core, about as hot as the surface of the Sun."],
  ["\\bwhy is (?:the )?inner core solid\\b", "The enormous pressure at the centre of the Earth keeps the iron solid even at about 5400 °C."],
  ["\\bplate\\b.*\\b(?:off|near|under|beneath) (?:the )?(?:coast of )?(?:bc|british columbia|vancouver island)\\b", "The Juan de Fuca Plate, which subducts under the North American Plate at the Cascadia subduction zone."],
  ["\\bolder\\b.*\\bfault\\b|\\bfault\\b.*\\bolder\\b|\\bcuts? (?:through|across)\\b.*\\b(?:older|younger)\\b", "The rock layer is older; the fault that cuts through it is younger (cross-cutting relationships)."],
  ["\\bdinosaurs?\\b.*\\b(?:extinct|die|died|disappear)", "About 66 million years ago, at the end of the Cretaceous, most likely after an asteroid hit near Chicxulub, Mexico."],
  ["\\bglaciers?\\b.*\\bvalleys?\\b|\\bvalleys?\\b.*\\bglaciers?\\b", "U-shaped valleys. Rivers carve V-shaped ones."],
  ["\\b(?:gas(?:es)?|composition|percent(?:age)?)\\b.*\\batmosphere\\b|\\batmosphere\\b.*\\b(?:made of|composition|gases)\\b", "Nitrogen about 78 percent, oxygen about 21 percent, argon about 0.9 percent, and carbon dioxide about 0.04 percent, plus water vapour."],
  ["\\bhigh[- ]pressure\\b.*\\blow[- ]pressure\\b|\\blow[- ]pressure\\b.*\\bhigh[- ]pressure\\b", "In a high pressure system air sinks and warms, so skies are clear and the weather fair. In a low pressure system air rises and cools, so clouds, rain and storms form."],
];
const ES_TERMS = [
  ["igneous(?: rocks?)?", "Rock formed when magma or lava cools and hardens. Intrusive rock cools slowly underground and has large crystals, like granite; extrusive rock cools fast at the surface and has small or no crystals, like basalt and obsidian."],
  ["sedimentary(?: rocks?)?", "Rock formed from sediments (bits of rock, shells or minerals) deposited in layers, then compacted and cemented together, like sandstone, shale and limestone. It is the only rock type with fossils."],
  ["metamorphic(?: rocks?)?", "Rock changed by heat and pressure deep underground without melting, like marble (from limestone), slate (from shale) and gneiss (from granite)."],
  ["metamorphism", "The change of existing rock into metamorphic rock by heat, pressure and hot fluids, without melting."],
  ["(?:the )?rock cycle", "The slow cycle by which rocks change type: igneous, sedimentary and metamorphic rock are weathered, buried, heated, squeezed, melted and cooled into one another over millions of years."],
  ["minerals?", "A naturally occurring, inorganic solid with a definite chemical composition and an orderly crystal structure, like quartz or feldspar."],
  ["(?:the )?mohs(?: hardness)?(?: scale)?", "A 1 to 10 scale of mineral hardness by scratch test: talc 1, gypsum 2, calcite 3, fluorite 4, apatite 5, feldspar 6, quartz 7, topaz 8, corundum 9, diamond 10."],
  ["streak", "The colour of a mineral's powder, seen by rubbing it on an unglazed porcelain streak plate. It is more reliable than surface colour."],
  ["lust(?:er|re)", "How a mineral's surface shines in reflected light: metallic, like pyrite, or non-metallic, such as glassy, pearly, silky or dull."],
  ["cleavage(?: in minerals)?", "The way a mineral breaks cleanly along flat planes of weakness, like mica splitting into sheets."],
  ["fracture(?: in minerals)?", "Breaking along rough or curved surfaces instead of flat planes, like the shell-shaped (conchoidal) fracture of quartz."],
  ["hardness(?: of a mineral)?", "A mineral's resistance to being scratched, measured on the Mohs scale."],
  ["magma", "Molten (melted) rock below the Earth's surface. Once it erupts it is called lava."],
  ["lava", "Molten rock that has reached the Earth's surface."],
  ["(?:the )?crust", "Earth's thin, rocky outer layer: continental crust (mostly granite, about 35 km thick) and oceanic crust (basalt, about 7 km thick)."],
  ["(?:the )?mantle", "The thick layer of hot rock between the crust and the core, about 2900 km deep. It is solid but flows slowly, and its convection currents move the plates."],
  ["(?:the )?outer core", "A liquid layer of molten iron and nickel about 2300 km thick. Its flow makes Earth's magnetic field."],
  ["(?:the )?inner core", "A solid ball of iron and nickel at the centre, about 5400 °C, kept solid by enormous pressure."],
  ["(?:the )?core", "Earth's centre, mostly iron and nickel: a liquid outer core around a solid inner core."],
  ["(?:the )?lithosphere", "The rigid outer shell of crust and uppermost mantle, broken into tectonic plates."],
  ["(?:the )?asthenosphere", "The soft, partly molten (plastic) layer of upper mantle beneath the lithosphere, on which the plates slide."],
  ["(?:the )?(?:theory of )?plate tectonics", "The theory that Earth's lithosphere is broken into plates that move slowly over the asthenosphere, driven by mantle convection, causing earthquakes, volcanoes and mountains at their boundaries."],
  ["(?:tectonic )?plates?", "A large slab of lithosphere that moves a few centimetres a year."],
  ["continental drift", "Alfred Wegener's 1912 idea that the continents were once joined in Pangaea and have slowly drifted apart."],
  ["pangaea|pangea", "The supercontinent that held all the continents about 300 to 200 million years ago, before it broke apart."],
  ["divergent (?:plate )?boundar(?:y|ies)", "Plates move apart. Magma rises to make new crust, forming mid-ocean ridges like the Mid-Atlantic Ridge, or rift valleys on land like the East African Rift."],
  ["convergent (?:plate )?boundar(?:y|ies)", "Plates move together and collide. Oceanic crust subducts beneath the other plate, making trenches and volcanoes; two continents crumple into mountains like the Himalayas."],
  ["transform (?:plate )?boundar(?:y|ies)|transform faults?", "Plates slide past each other sideways, causing earthquakes but making or destroying no crust, like the San Andreas Fault."],
  ["subduction(?: zones?)?", "One plate, the denser oceanic one, sinks beneath another into the mantle, forming a deep trench and volcanoes."],
  ["sea ?floor spreading|seafloor spreading", "New oceanic crust forms at mid-ocean ridges as magma rises and the plates move apart, so the sea floor is youngest at the ridge. Harry Hess proposed it in the 1960s."],
  ["mid-?ocean ridges?", "An underwater mountain chain at a divergent boundary, where new oceanic crust forms."],
  ["(?:ocean(?:ic)? )?trench(?:es)?", "A deep, narrow valley in the ocean floor where one plate subducts beneath another."],
  ["hot ?spots?", "A plume of hot mantle rising under a plate, making a chain of volcanoes as the plate moves over it, like Hawaii."],
  ["(?:mantle )?convection currents?", "Circulation in the mantle: hot rock rises, cools and sinks, dragging the plates along."],
  ["earthquakes?", "Sudden shaking when rock breaks and slips along a fault, releasing stored energy as seismic waves."],
  ["faults?", "A break in the crust where rocks move past each other."],
  ["(?:the )?(?:focus|hypocent(?:er|re))(?: of an earthquake)?", "The point inside the Earth where an earthquake starts, where the rock first breaks."],
  ["(?:the )?epicent(?:er|re)(?: of an earthquake)?", "The point on the surface directly above an earthquake's focus."],
  ["p[- ]waves?|primary waves?", "Primary waves, the fastest seismic waves (about 6 km/s in the crust). They compress and stretch rock in the direction they travel and pass through solids, liquids and gases."],
  ["s[- ]waves?|secondary waves?", "Secondary waves, slower than P waves (about 3.5 km/s). They shake rock side to side (shear) and travel only through solids, so they cannot cross the liquid outer core."],
  ["surface waves?", "Seismic waves that travel along the surface, the slowest and most damaging."],
  ["seismic waves?", "Waves of energy from an earthquake: P waves, S waves and surface waves."],
  ["seismographs?|seismometers?", "An instrument that records ground shaking from seismic waves."],
  ["(?:the )?(?:richter|moment magnitude) scale|magnitude", "A scale of earthquake size: each whole number up is 10 times the wave amplitude and about 32 times the energy."],
  ["tsunamis?", "A series of huge ocean waves caused by an undersea earthquake, landslide or eruption that shoves a large volume of water."],
  ["volcano(?:es)?", "An opening in the crust where magma, gas and ash erupt."],
  ["shield volcano(?:es)?", "A broad volcano with gentle slopes built from runny, low-viscosity basalt lava, like Mauna Loa in Hawaii. Its eruptions are mostly quiet."],
  ["(?:composite|strato) ?volcano(?:es)?|stratovolcano(?:es)?", "A tall, steep cone (a stratovolcano) built of layers of lava and ash, with thick, gassy magma that erupts explosively, like Mount St. Helens and Mount Fuji."],
  ["cinder cones?(?: volcano(?:es)?)?", "A small, steep volcano built from loose cinders thrown out in one eruption."],
  ["(?:the )?ring of fire", "The chain of volcanoes and earthquakes around the Pacific Ocean along its subduction zones. It holds about 75 percent of the world's volcanoes."],
  ["(?:the )?(?:law |principle )?(?:of )?superposition", "In undisturbed layers of sedimentary rock, the bottom layers are the oldest and each layer above is younger."],
  ["(?:the )?(?:law |principle )?(?:of )?cross-?cutting(?: relationships)?", "A rock body or fault that cuts across other layers is younger than the layers it cuts."],
  ["(?:the )?(?:law |principle )?(?:of )?original horizontality", "Sediments are laid down in flat, horizontal layers, so tilted or folded layers were disturbed later."],
  ["relative dating|relative age", "Putting rocks and events in order, older or younger, without exact ages, using superposition, cross-cutting and fossils."],
  ["(?:absolute|radiometric|radioactive) dating|absolute age", "Finding a rock's age in years from the decay of radioactive isotopes, such as uranium-238 or carbon-14, at their known half-lives."],
  ["index fossils?", "A fossil of an organism that lived for a short time but spread widely, so it dates the rock layers it is found in."],
  ["(?:the )?geologic(?:al)? time(?: scale)?", "The calendar of Earth's 4.6 billion year history, divided into eons, eras, periods and epochs, marked by big changes in life and rock."],
  ["unconformit(?:y|ies)", "A gap in the rock record where layers were eroded away or never laid down."],
  ["weathering", "The breaking down of rock into smaller pieces where it sits, by physical (mechanical) or chemical processes."],
  ["mechanical weathering|physical weathering", "Breaking rock into smaller pieces without changing what it is made of, by frost wedging, plant roots, abrasion or heating and cooling."],
  ["chemical weathering", "Breaking down rock by chemical reactions that change its minerals: acid rain dissolving limestone, oxidation (rusting) of iron, feldspar turning to clay."],
  ["(?:frost|ice) wedging", "Water seeps into cracks, freezes and expands by about 9 percent, prying the rock apart over many cycles."],
  ["erosion", "The moving (transport) of weathered rock and soil by water, wind, ice or gravity."],
  ["deposition", "Sediment being dropped (laid down) when the water, wind or ice carrying it slows down."],
  ["glaciers?", "A huge, slow-moving mass of ice that erodes valleys into U shapes and leaves deposits of rock (till) when it melts."],
  ["(?:the )?troposphere", "The lowest layer of the atmosphere, from the ground to about 12 km, where weather happens and temperature falls with height."],
  ["(?:the )?stratosphere", "The layer from about 12 to 50 km up that holds the ozone layer; temperature rises with height."],
  ["(?:the )?mesosphere", "The layer from about 50 to 85 km up, the coldest, where meteors burn up."],
  ["(?:the )?thermosphere", "The layer from about 85 to 600 km up, very thin and very hot, where auroras happen and the space station orbits."],
  ["(?:the )?exosphere", "The outermost layer of the atmosphere, fading into space."],
  ["(?:the )?ozone(?: layer)?", "A layer of ozone (O₃) in the stratosphere, about 15 to 35 km up, that absorbs most of the Sun's harmful ultraviolet (UV) radiation."],
  ["(?:the )?coriolis(?: effect| force)?", "Earth's rotation deflects moving air and water, to the right in the Northern Hemisphere and to the left in the Southern, curving winds and ocean currents."],
  ["(?:the )?greenhouse effect", "Gases such as carbon dioxide, water vapour and methane let sunlight in but trap the heat Earth gives off, keeping the planet warm. Adding more of them causes global warming."],
  ["greenhouse gas(?:es)?", "A gas that traps heat in the atmosphere: carbon dioxide, methane, water vapour and nitrous oxide."],
  ["weather", "The state of the atmosphere at a place and time (temperature, wind, clouds, precipitation) over hours to days."],
  ["climate", "The average weather of a region over a long time, usually 30 years or more."],
  ["(?:weather )?fronts?(?: in weather)?", "The boundary between two air masses of different temperature and humidity, where clouds and storms often form. Cold fronts bring short, heavy rain; warm fronts bring longer, gentle rain."],
  ["air mass(?:es)?", "A huge body of air with about the same temperature and humidity throughout."],
  ["relative humidity", "How much water vapour the air holds compared with the most it could hold at that temperature, as a percent."],
  ["(?:the )?water cycle|hydrologic cycle", "Water evaporates from oceans and lakes, transpires from plants, condenses into clouds, falls as precipitation, and flows back as runoff and groundwater, powered by the Sun."],
  ["tides?", "The regular rise and fall of sea level, about twice a day, caused mainly by the Moon's gravity pulling on the oceans, with help from the Sun."],
  ["ocean currents?|currents", "Large flows of ocean water driven by wind at the surface and by differences in temperature and salinity (density) in the deep ocean, and turned by the Coriolis effect."],
  ["el ni(?:n|ñ)o", "A warming of the eastern tropical Pacific every few years that shifts weather worldwide; BC gets a milder, drier winter."],
  ["groundwater", "Water held underground in the cracks and pores of soil and rock."],
  ["aquifers?", "An underground layer of porous rock or sediment that holds and lets through groundwater."],
  ["rift valleys?", "A long valley where the crust is pulling apart at a divergent boundary on land, like the East African Rift."],
  ["(?:the )?cascadia subduction zone", "The boundary off the coast of BC, Washington and Oregon where the Juan de Fuca Plate subducts under the North American Plate. It can make magnitude 9 earthquakes; the last was in 1700."],
  ["calderas?", "A large basin that forms when a volcano's summit collapses into the emptied magma chamber after an eruption, like Crater Lake."],
  ["pyroclastic flows?", "A fast, ground-hugging avalanche of hot gas, ash and rock from an explosive eruption, hundreds of degrees hot and deadly."],
  ["uniformitarianism", "The idea that the same slow processes we see today shaped Earth in the past: the present is the key to the past. James Hutton proposed it."],
  ["oxidation(?: in weathering)?", "Chemical weathering where oxygen reacts with iron in minerals, making rust-coloured iron oxides that crumble."],
  ["deltas?", "A fan of sediment deposited at the mouth of a river where it slows into a lake or ocean, like the Fraser River delta."],
  ["hurricanes?|typhoons?|tropical cyclones?", "A huge rotating tropical storm with a low pressure centre (the eye) and winds over 119 km/h, powered by warm ocean water."],
  ["global warming|climate change", "The rise in Earth's average temperature since the 1800s, mainly from greenhouse gases released by burning fossil fuels, which strengthen the greenhouse effect."],
  ["(?:the )?jet streams?", "Fast, narrow bands of wind high in the troposphere, about 10 km up, that steer weather systems from west to east."],
  ["soils?", "A mix of weathered rock particles (sand, silt, clay), organic matter (humus), water and air, built up in layers called horizons."],
  ["thermohaline circulation|(?:the )?(?:global )?ocean conveyor belt", "The slow, deep circulation of the world's oceans driven by differences in temperature and salinity, which change water density: cold, salty water sinks near the poles and spreads along the ocean floor."],
  ["fossil fuels?", "Coal, oil and natural gas, formed over millions of years from the buried remains of ancient plants and sea life."],
  ["crystals?", "A solid whose atoms are arranged in an orderly, repeating pattern, giving it flat faces."],
];
const ES_TERMS_RE = ES_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
const ES_KINDS = [
  ["layers? of (?:the )?atmosphere|atmospher(?:e|ic) layers?|layers? in the atmosphere", "troposphere|stratosphere|mesosphere|thermosphere|exosphere"],
  ["layers? of (?:the )?earth|layers? inside the earth", "crust|mantle|outer core|inner core|lithosphere|asthenosphere"],
  ["(?:type of |kind of )?(?:plate )?boundar(?:y|ies)", "^(?:divergent|convergent|transform)"],
  ["(?:type of |kind of )?(?:seismic |earthquake )?waves?", "p\\[- \\]waves|s\\[- \\]waves|surface waves"],
  ["(?:type of |kind of )?volcano(?:es)?", "shield|composite|cinder"],
  ["(?:type of |kind of )?rocks?", "^(?:igneous|sedimentary|metamorphic)\\("],
  ["(?:type of |kind of )?weathering", "weathering"],
];
// Common rocks: type, then how it forms.
const ES_ROCKS = {granite:"Igneous (intrusive): coarse crystals from magma that cooled slowly underground.", basalt:"Igneous (extrusive): fine-grained, from lava that cooled quickly. It makes up the ocean floor.", obsidian:"Igneous (extrusive): volcanic glass from lava that cooled almost instantly.", pumice:"Igneous (extrusive): frothy volcanic rock full of gas holes, light enough to float.", rhyolite:"Igneous (extrusive): fine-grained, the volcanic match of granite.", andesite:"Igneous (extrusive): from the volcanoes of subduction zones.", gabbro:"Igneous (intrusive): the coarse-grained match of basalt.", diorite:"Igneous (intrusive): coarse, speckled black and white.", sandstone:"Sedimentary: cemented sand grains.", shale:"Sedimentary: compacted mud and clay in thin layers.", limestone:"Sedimentary: calcite, often from shells and coral.", conglomerate:"Sedimentary: rounded pebbles cemented together.", breccia:"Sedimentary: sharp, angular pieces cemented together.", siltstone:"Sedimentary: cemented silt.", coal:"Sedimentary (organic): compressed plant remains.", chalk:"Sedimentary: tiny marine shells.", marble:"Metamorphic: from limestone.", slate:"Metamorphic: from shale, splitting into flat sheets.", schist:"Metamorphic: shiny and flaky with mica, from shale or slate under more heat.", gneiss:"Metamorphic: banded light and dark, from granite or schist.", quartzite:"Metamorphic: from sandstone.", phyllite:"Metamorphic: between slate and schist, with a silky sheen."};
// Mohs hardness of common minerals and test objects.
const ES_HARD = {talc:"1", gypsum:"2", calcite:"3", fluorite:"4", apatite:"5", feldspar:"6", orthoclase:"6", "orthoclase feldspar":"6", quartz:"7", topaz:"8", corundum:"9", diamond:"10", fingernail:"about 2.5", "a fingernail":"about 2.5", "copper penny":"about 3.5", "a copper penny":"about 3.5", glass:"about 5.5", "steel nail":"about 6.5", "a steel nail":"about 6.5"};
function es11(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"});
  for(const [s, body] of ES_FACTS) if(new RegExp(s).test(q)) return out(body);
  let m;
  // what type of rock is granite
  if((m = /\b(?:type|kind|class) of rock (?:is|are) (?:an? )?([a-z]+)$/.exec(q)) || (m = /^is ([a-z]+) (?:an? )?(?:igneous|sedimentary|metamorphic)\b/.exec(q)) || (m = /^(?:what (?:type|kind) of rock is )?([a-z]+) rock type$/.exec(q))){ const r = ES_ROCKS[m[1]]; if(r) return out(r); }
  if((m = /\bhardness of (?:a |an )?([a-z ]+)$/.exec(q)) && ES_HARD[m[1]]) return out(ES_HARD[m[1]] + " on the Mohs scale.");
  const tb = termAsk(q, ES_TERMS_RE, ES_KINDS); if(tb) return out(tb);
  // radiometric dating: age = half-lives elapsed × half-life, half-lives = log2(original / left)
  const hl = /\bhalf[- ]life (?:of (?:[a-z]+-\d+ )?)?(?:is |=)?\s*(\d+(?:\.\d+)?)\s*(billion years|million years|years?|days?|hours?|minutes?|seconds?)\b/.exec(q);
  if(hl && /\b(?:old|age)\b/.test(q)){
    const pct = /(\d+(?:\.\d+)?)\s*%/.exec(q), frac = /\b(\d+)\/(\d+)\b/.exec(q);
    const left = pct ? +pct[1] / 100 : frac ? +frac[1] / +frac[2] : null;
    if(left > 0 && left < 1){
      const n = Math.log2(1 / left), age = n * +hl[1], u = hl[2].replace(/^(year|day|hour|minute|second)$/, "$1s");
      return out(pcNum(+age.toPrecision(6)) + " " + u + " (" + pcNum(+n.toPrecision(4)) + (n === 1 ? " half-life of " : " half-lives of ") + hl[1] + " " + u + ")");
    }
  }
  // earthquake magnitude: each step is 10 times the amplitude and 10^1.5 (about 32) times the energy
  if((m = /\bmagnitude (\d+(?:\.\d+)?)\b.*?\b(?:magnitude |an? )(\d+(?:\.\d+)?)\b/.exec(q))){
    const d = Math.abs(+m[1] - +m[2]), amp = 10 ** d, en = 10 ** (1.5 * d);
    const a = "Amplitude: " + pcNum(+amp.toPrecision(3)) + " times (10 per magnitude step).", e = "Energy: about " + pcNum(+en.toPrecision(3)) + " times (about 32 per step).";
    return out(/\benerg/.test(q) ? e + " " + a : a + " " + e);
  }
  // epicentre distance from the S minus P gap, with P at 6 km/s and S at 3.5 km/s in the crust
  if(/\bepicent|\bhow far\b|\bdistance\b/.test(q) && /\b(?:s[- ]p|p[- ]s|s minus p|lag|gap|difference|arrive)\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)\b/.exec(q))){
    return out("About " + pcNum(+(+m[1] * 8.4).toPrecision(3)) + " km (gap × 8.4 km/s, with P waves at 6 km/s and S waves at 3.5 km/s; a travel-time chart gives a closer value).");
  }
  return null;
}
// BC Environmental Science 11: ecosystems and energy flow, biogeochemical cycles, biodiversity, succession, population
// dynamics, species interactions, ecosystem services, human impacts, sustainability and conservation, plus the 10 percent
// rule, population density, mark and recapture, growth rate and doubling time. ENV_FACTS are phrase questions;
// ENV_TERMS go through termAsk.
const ENV_FACTS = [
  ["\\bbiotic\\b.*\\babiotic\\b|\\babiotic\\b.*\\bbiotic\\b", "Biotic factors are the living parts of an ecosystem: plants, animals, fungi and bacteria. Abiotic factors are the non-living parts: sunlight, temperature, water, soil, air and nutrients."],
  ["\\b(?:10|ten) ?(?:percent|%) (?:rule|law)\\b|\\brule of (?:10|ten)\\b", "Only about 10 percent of the energy at one trophic level passes on to the next; the other 90 percent is used for life processes or lost as heat. That is why food chains rarely have more than four or five links."],
  ["\\b(?:three |3 |main )?(?:levels|types|kinds|components) of biodiversity\\b", "Genetic diversity (the variety of genes within a species), species diversity (the variety of species in an area) and ecosystem diversity (the variety of habitats and ecosystems)."],
  ["\\bdensity[- ]dependent\\b.*\\bdensity[- ]independent\\b|\\bdensity[- ]independent\\b.*\\bdensity[- ]dependent\\b", "Density-dependent factors grow stronger as a population gets more crowded: competition, disease, predation and parasites. Density-independent factors hit a population the same way whatever its size: weather, fire, floods, drought and other natural disasters."],
  ["\\brenewable\\b.*\\bnon-?renewable\\b|\\bnon-?renewable\\b.*\\brenewable\\b", "Renewable resources are replaced (replenished) naturally within a human lifetime, like sunlight, wind, water, and forests and fish if harvested sustainably. Non-renewable resources take millions of years to form, so their supply is finite and they can run out: coal, oil, natural gas and minerals."],
  ["\\bwhy (?:are|do) food chains\\b|\\bfood chains?\\b.*\\b(?:short|few links|so few)\\b", "Only about 10 percent of the energy passes from one trophic level to the next; the rest is used or lost as heat, so after four or five levels too little energy is left to support another."],
  ["\\bphotosynthesis\\b.*\\bcarbon cycle\\b|\\bcarbon cycle\\b.*\\bphotosynthesis\\b", "Photosynthesis removes carbon dioxide from the air and stores the carbon in sugars and plant tissue. Respiration, decomposition and burning return it to the air."],
  ["\\bhumans?\\b.*\\bcarbon cycle\\b|\\bhuman (?:impacts?|activit(?:y|ies))\\b.*\\bcarbon\\b", "Burning fossil fuels and deforestation release carbon dioxide faster than plants and the oceans can absorb it, so CO₂ builds up in the atmosphere and warms the climate."],
  ["\\bwhy do (?:plants|organisms|living things|animals) need nitrogen\\b|\\bnitrogen\\b.*\\b(?:needed|important) (?:for|to)\\b", "To build proteins (from amino acids), DNA and RNA, and the chlorophyll in plants."],
  ["\\bwhy is biodiversity important\\b|\\bimportance of biodiversity\\b|\\bwhy (?:does|should) biodiversity matter\\b", "More diverse ecosystems are more stable and resilient: they recover better from disturbance. Biodiversity also gives us ecosystem services and resources such as food, medicine, clean water, pollination and timber."],
  ["\\bkeystone species\\b.*\\b(?:bc|british columbia|examples?)\\b|\\bexamples? of (?:a )?keystone species\\b", "Pacific salmon (their bodies feed bears, eagles and the forest itself), sea otters (they keep sea urchins from wiping out kelp forests), beavers and grey wolves."],
  ["\\binvasive species\\b.*\\b(?:bc|british columbia|examples?)\\b|\\bexamples? of (?:an )?invasive species\\b", "Scotch broom, Himalayan blackberry, Japanese knotweed, purple loosestrife, European green crab, American bullfrog and European starling. Zebra and quagga mussels are kept out so far by boat inspections."],
  ["\\b(?:after|following) a (?:forest |wild)?fire\\b|\\b(?:forest |wild)fire\\b.*\\b(?:after|happens|recover)", "Secondary succession: the soil survives, so fireweed, grasses and shrubs regrow within months, then fast-growing trees like lodgepole pine and aspen, and over decades a mature forest again. The ash also returns nutrients to the soil."],
  ["\\bsource of (?:all )?(?:the )?energy\\b.*\\b(?:ecosystems?|food chains?|food webs?|life|living things|earth)\\b", "The Sun. Producers capture its light energy by photosynthesis and pass it up the food chain. A few deep-sea vent ecosystems run on chemical energy instead (chemosynthesis)."],
  ["\\b(?:percent(?:age)?|%|fraction|how much)\\b.*\\benergy\\b.*\\blost\\b|\\benergy\\b.*\\blost\\b.*\\btrophic\\b", "About 90 percent, used for life processes or given off as heat. Only about 10 percent passes to the next trophic level."],
  ["\\beggshells?\\b|\\bpesticide\\b.*\\b(?:eagles?|birds?|falcons?|ospreys?)\\b", "DDT. It biomagnified up the food chain and made the eggshells of bald eagles, peregrine falcons and ospreys too thin to survive, until Canada banned it in the 1970s."],
  ["\\b(?:top|apex) predators?\\b.*\\b(?:mercury|toxins?|pcbs?|ddt|pesticides?|chemicals?|pollutants?)\\b|\\b(?:mercury|toxins?|pcbs?|pollutants?)\\b.*\\b(?:top|apex) predators?\\b", "Biomagnification: a persistent toxin like mercury is stored in the body and not broken down, and each predator eats many contaminated prey, so the concentration rises at every step up the food chain and is highest in top predators."],
  ["\\b(?:returns?|releases?|adds?|puts?|gives? off)\\b.*\\b(?:carbon dioxide|co2|co₂|carbon)\\b.*\\b(?:atmosphere|air)\\b", "Cellular respiration by nearly every living thing, plus decomposition and combustion (burning fossil fuels and wood). Volcanoes add a little."],
  ["\\b(?:removes?|takes?|absorbs?)\\b.*\\b(?:carbon dioxide|co2|co₂|carbon)\\b.*\\b(?:atmosphere|air)\\b", "Photosynthesis by plants, algae and phytoplankton. The oceans also dissolve carbon dioxide directly."],
  ["\\bbacteria\\b.*\\b(?:nitrogen gas|n2|atmospheric nitrogen|nitrogen from the air)\\b.*\\b(?:ammonia|usable|nitrates?)\\b|\\bwhat (?:bacteria|organisms?)\\b.*\\bfix(?:es)? nitrogen\\b", "Nitrogen-fixing bacteria, such as Rhizobium in the root nodules of legumes, plus some free-living soil bacteria and cyanobacteria."],
  ["\\bbacteria\\b.*\\bammonia\\b.*\\bnitr(?:ates?|ites?)\\b", "Nitrifying bacteria: Nitrosomonas turns ammonia into nitrites, then Nitrobacter turns nitrites into nitrates."],
  ["\\bbacteria\\b.*\\bnitrates?\\b.*\\bnitrogen gas\\b", "Denitrifying bacteria, in waterlogged, low-oxygen soil."],
  ["\\bsalmon\\b.*\\b(?:forests?|trees|ecosystems?|important|bears?)\\b", "Bears and eagles carry spawned-out salmon into the forest, and the bodies fertilize it with ocean nitrogen and other nutrients, so trees near salmon streams grow faster. Salmon are a keystone species and central to First Peoples' food and culture."],
  ["\\bcosewic\\b", "The Committee on the Status of Endangered Wildlife in Canada, the expert panel that assesses which species are at risk. The government then lists them under the Species at Risk Act (SARA)."],
  ["\\b(?:first|earliest)\\b.*\\b(?:organisms?|species|plants|life|to (?:arrive|grow|colonize))\\b.*\\bsuccession\\b|\\bsuccession\\b.*\\b(?:first|earliest)\\b", "Pioneer species: lichens and mosses on bare rock in primary succession, or fast-growing grasses, weeds and fireweed on disturbed soil in secondary succession."],
  ["\\bj[- ]shaped?\\b", "Exponential growth, while resources are unlimited."],
  ["\\bs[- ]shaped?\\b", "Logistic growth, which levels off at the carrying capacity."],
  ["\\b(?:shape|curve|graph)\\b.*\\blogistic\\b|\\blogistic\\b.*\\b(?:shape|curve|graph)\\b", "An S-shaped (sigmoid) curve: slow, then fast, then levelling off at the carrying capacity."],
  ["\\b(?:shape|curve|graph)\\b.*\\bexponential\\b|\\bexponential\\b.*\\b(?:shape|curve|graph)\\b", "A J-shaped curve that climbs faster and faster."],
  ["\\b(?:exceeds?|overshoots?|goes (?:above|over|past)|above|beyond|passes)\\b.*\\bcarrying capacity\\b", "It overshoots: food and other resources run short, so deaths rise and births fall, and the population declines (sometimes crashes) back below the carrying capacity, then often swings around it."],
  ["\\b(?:bees?|pollinators?|hummingbirds?)\\b.*\\b(?:flowers?|plants)\\b.*\\b(?:relationship|symbiosis|interaction)\\b|\\b(?:relationship|symbiosis|interaction)\\b.*\\b(?:bees?|pollinators?)\\b.*\\b(?:flowers?|plants)\\b", "Mutualism: the bee gets nectar and pollen as food, and the flower gets pollinated."],
  ["\\bexamples? of commensalism\\b", "Barnacles riding on a whale, an epiphyte such as a moss or fern growing on a tree branch, or a remora riding on a shark."],
  ["\\bexamples? of mutualism\\b", "Bees and flowers, mycorrhizal fungi on tree roots, clownfish and sea anemones, or a lichen (a fungus and an alga living together)."],
  ["\\bexamples? of parasitism\\b", "Ticks or fleas on a deer, a tapeworm in a gut, or mistletoe on a tree."],
  ["\\bexamples? of predation\\b", "A wolf hunting deer, an orca eating seals, or an owl catching mice. The lynx and the snowshoe hare are the classic predator and prey cycle."],
  ["\\b(?:four |4 |main )?(?:types|kinds|categories) of ecosystem services\\b", "Provisioning (food, water, timber), regulating (climate, floods, water purification, pollination), supporting (nutrient cycling, soil formation) and cultural (recreation, spiritual and educational value)."],
  ["\\b(?:main|biggest|greatest|leading|number one|top) (?:cause|threat|reason)s?\\b.*\\b(?:biodiversity|extinctions?|species)\\b|\\b(?:causes?|threats?) (?:of|to) (?:biodiversity|extinction)\\b", "Habitat loss and change, followed by invasive species, pollution, human population growth and overharvesting (HIPPO), with climate change growing fast."],
  ["\\bconservation\\b.*\\bpreservation\\b|\\bpreservation\\b.*\\bconservation\\b", "Conservation means managing and using a resource wisely so it lasts, such as logging a forest sustainably. Preservation means protecting nature from use altogether and leaving it untouched, such as an ecological reserve."],
];
const ENV_TERMS = [
  ["producers?", "An organism, such as a plant, alga or some bacteria, that makes its own food from sunlight by photosynthesis (an autotroph). Producers form the first trophic level of every food chain."],
  ["consumers?", "An organism that cannot make its own food and gets energy by eating other organisms (a heterotroph): herbivores, carnivores and omnivores."],
  ["primary consumers?", "A herbivore that eats producers (plants or algae), the second trophic level, like a deer, a rabbit or zooplankton."],
  ["secondary consumers?", "An animal that eats primary consumers (herbivores), the third trophic level, like a fox that eats rabbits."],
  ["tertiary consumers?", "An animal that eats secondary consumers, the fourth trophic level, often a top carnivore like an orca, an eagle or a wolf."],
  ["quaternary consumers?", "An animal that eats tertiary consumers, a fifth trophic level found only in a few long food chains."],
  ["herbivores?", "An animal that eats only plants or algae, a primary consumer."],
  ["carnivores?", "An animal that eats other animals, a secondary or higher consumer."],
  ["omnivores?", "An animal that eats both plants and animals, like a bear or a human."],
  ["detritivores?", "An organism that eats dead matter (detritus), like earthworms, millipedes and woodlice, helping decomposers recycle nutrients."],
  ["scavengers?", "An animal that feeds on the bodies of dead animals, like a vulture or a raven."],
  ["trophic levels?", "An organism's feeding level, its position in a food chain: producers first, then primary, secondary and tertiary consumers. About 10 percent of the energy passes from one level to the next."],
  ["food chains?", "A single path showing who eats whom and how energy moves from a producer through a series of consumers, like grass to rabbit to fox."],
  ["food webs?", "All the interconnected food chains in an ecosystem, showing the many feeding links between organisms. It is more realistic, and a web with many links is more stable than a single chain."],
  ["(?:energy|ecological) pyramids?|pyramids? of energy", "A diagram of the energy at each trophic level, widest at the producers and narrowing upward because only about 10 percent passes to the next level."],
  ["pyramids? of numbers", "A diagram of how many organisms are at each trophic level. It can be upside down, as when many insects feed on one tree."],
  ["pyramids? of biomass", "A diagram of the total mass of living matter at each trophic level."],
  ["biomass", "The total mass of living (or recently living) matter in an area or at a trophic level."],
  ["biomagnification|biological magnification", "The increase in concentration of a persistent toxin, such as mercury, DDT or PCBs, at each higher trophic level up the food chain, because each predator eats many contaminated prey. Top predators like orcas and eagles carry the most."],
  ["bioaccumulation", "The build-up of a toxin, such as mercury or a pesticide, in an organism's tissues over its lifetime, because it takes the toxin in faster than it can break it down or get rid of it."],
  ["(?:the )?carbon cycle", "The movement of carbon through living things, the air, oceans and rock. Photosynthesis takes carbon dioxide from the air; respiration, decomposition and combustion (burning fossil fuels) return it. Oceans, forests and rock store it."],
  ["(?:the )?nitrogen cycle", "The movement of nitrogen between the air, soil and living things. Bacteria fix nitrogen gas into ammonia, other bacteria turn that into nitrates for plants (nitrification), animals eat the plants, decomposers return ammonia, and denitrifying bacteria release nitrogen gas back to the air."],
  ["nitrogen fixation", "Turning nitrogen gas (N₂) from the air into ammonia or nitrates that plants can use. Bacteria in the soil and in the root nodules of legumes do it, and so does lightning."],
  ["nitrification", "Soil bacteria turning ammonia into nitrites and then nitrates, the form most plants absorb."],
  ["denitrification", "Bacteria in waterlogged, low-oxygen soil turning nitrates back into nitrogen gas (N₂), which returns to the atmosphere."],
  ["ammonification", "Decomposers breaking down dead organisms and wastes and releasing their nitrogen as ammonia."],
  ["(?:the )?phosphorus cycle", "The slow movement of phosphorus from rock into soil and water by weathering, into plants and animals, and back into sediment. It has no gas stage in the atmosphere. Runoff of phosphate fertilizer causes eutrophication."],
  ["carbon sinks?", "Something that absorbs and stores more carbon than it releases, like the oceans, forests, soil and peat bogs."],
  ["carbon sources?", "Something that releases more carbon than it absorbs, like burning fossil fuels, a volcano or a forest fire."],
  ["biogeochemical cycles?|nutrient cycles?|matter cycles?", "The paths that matter such as carbon, nitrogen, phosphorus and water follows through living things and the air, water and rock. Matter is recycled, while energy flows through and is lost as heat."],
  ["biodiversity|biological diversity", "The variety of life in an area, at three levels: genetic diversity, species diversity and ecosystem diversity. More diverse ecosystems are more stable."],
  ["genetic diversity", "The variety of genes (genetic variation) within a species or population. It helps a species adapt to disease and change."],
  ["species diversity", "The number of different species in an area (richness) and how evenly their numbers are spread (evenness)."],
  ["ecosystem diversity", "The variety of habitats and ecosystems in a region, such as forests, wetlands, grasslands and estuaries."],
  ["species richness", "The number of different species in an area."],
  ["keystone species", "A species that has a large effect on its ecosystem compared with its numbers; without it the ecosystem changes drastically or collapses. Sea otters are one: they eat the sea urchins that would otherwise wipe out kelp forests."],
  ["indicator species", "A species whose presence, absence or health shows the condition of an environment, such as pollution or water quality, like lichens for air quality or frogs and mayfly larvae for water."],
  ["endemic species", "A species found naturally in only one place in the world."],
  ["native species", "A species that lives naturally in an area, without people bringing it there."],
  ["introduced species|non-?native species|exotic species|alien species", "A species brought by people into an area where it did not live before."],
  ["extirpated species|extirpation|extirpated", "A species no longer found in one area (in the wild in Canada, for example) but still alive elsewhere."],
  ["threatened species", "A species likely to become endangered if nothing is done about the threats to it."],
  ["species at risk", "In Canada, a species listed as extirpated, endangered, threatened or of special concern under the Species at Risk Act (SARA)."],
  ["(?:ecological )?succession", "The gradual change in the species of a community over time, from pioneer species to a stable climax community. Primary succession starts on bare rock; secondary succession starts after a disturbance that leaves the soil."],
  ["primary succession", "Succession on bare rock or new land with no soil, such as after a lava flow or a retreating glacier. Pioneer species such as lichens and mosses arrive first and slowly build soil."],
  ["secondary succession", "Succession after a disturbance such as a fire, flood or logging removes a community but leaves the soil, so grasses and shrubs regrow quickly, then trees. It is faster than primary succession."],
  ["pioneer species", "The first species to colonize bare or disturbed land, such as lichens and mosses on rock or fireweed after a fire. They break down rock and build soil for those that follow."],
  ["climax communit(?:y|ies)", "The stable, mature community at the final stage of succession, which lasts until a disturbance, like an old-growth forest."],
  ["carrying capacity", "The maximum population of a species that an environment can support over the long term with its food, water, space and other resources."],
  ["limiting factors?", "Anything that limits or restricts a population's growth, such as food, water, space, predators, disease or temperature."],
  ["density[- ]dependent factors?", "A limiting factor whose effect grows as a population gets more crowded: competition, predation, disease and parasites."],
  ["density[- ]independent factors?", "A limiting factor that affects a population the same way whatever its size: weather, fire, floods and drought."],
  ["exponential growth", "Growth by a constant percentage, so the population doubles again and again, faster and faster, making a J-shaped curve. It happens while resources are unlimited."],
  ["logistic growth", "Growth that is fast at first, then slows and levels off at the carrying capacity, making an S-shaped curve."],
  ["r-?selected species|r-?strategists?|r-?selection", "A species that has many offspring, matures fast and gives little or no parental care, so few survive, like insects, mice and dandelions. It does well in unstable environments."],
  ["k-?selected species|k-?strategists?|k-?selection", "A species that has few offspring, matures slowly and gives them a lot of parental care, with a population near the carrying capacity, like elephants, whales and humans."],
  ["populations?", "All the members of one species living in the same area at the same time."],
  ["(?:ecological )?communit(?:y|ies)", "All the populations of different species living and interacting together in the same area."],
  ["habitats?", "The place where an organism lives and finds what it needs: its natural home or environment."],
  ["(?:ecological )?niches?", "The role a species plays in its ecosystem: what it eats, where it lives and how it interacts with others, its whole way of life."],
  ["predation", "One organism (the predator) hunting, killing and eating another (the prey)."],
  ["competition", "Organisms struggling for the same limited resources, like food, water, light or space, within a species or between species."],
  ["symbiosis|symbiotic relationships?", "A close, long-term relationship between two species: mutualism, commensalism or parasitism."],
  ["mutualism", "A symbiosis where both species benefit, like bees pollinating flowers or fungi living on tree roots (mycorrhizae)."],
  ["commensalism", "A symbiosis where one species benefits and the other is neither helped nor harmed, like barnacles riding on a whale."],
  ["parasitism", "A symbiosis where one species (the parasite) benefits by living on or in another (the host) and harming it, like ticks on a deer."],
  ["ecosystem services", "The benefits that ecosystems give humans for free: clean water and air, pollination of crops, food, timber, flood control, climate regulation, soil formation, and cultural and spiritual value."],
  ["sustainability|sustainable development", "Meeting the needs of people today without compromising the ability of future generations to meet their own needs, keeping ecosystems and resources healthy for the long term."],
  ["renewable resources?", "A natural resource that is replaced (replenished) naturally within a human lifetime, like sunlight, wind, water, and forests and fish if harvested sustainably."],
  ["non-?renewable resources?", "A resource that takes millions of years to form, so its supply is finite and it can run out, like coal, oil, natural gas and minerals."],
  ["habitat fragmentation", "Breaking a large habitat into smaller, isolated pieces, divided by roads, farms, logging or cities, which cuts populations apart."],
  ["habitat loss|habitat destruction", "The destruction or change of a habitat so it can no longer support its species, the biggest cause of species loss."],
  ["deforestation", "Clearing or cutting down forests for farming, logging or building without replanting. It destroys habitat and releases carbon."],
  ["eutrophication", "Excess nutrients, mostly nitrogen and phosphorus from fertilizer runoff and sewage, make algae bloom in a lake; when the algae die, decomposers use up the oxygen in the water, and fish die."],
  ["acid rain|acid precipitation|acid deposition", "Rain made acidic when sulfur dioxide and nitrogen oxides from burning fossil fuels, smelters and vehicles react with water in the air to form sulfuric and nitric acid. It harms lakes, forests and buildings."],
  ["ocean acidification", "The ocean's pH dropping as it absorbs extra carbon dioxide (CO₂) from the air, forming carbonic acid that makes it harder for shellfish and coral to build their shells."],
  ["overexploitation|overharvesting|overfishing", "Taking a resource, such as fish or trees, faster than it can replace itself, so its population crashes."],
  ["traditional ecological knowledge|traditional knowledge|tek|indigenous knowledge", "The knowledge, practices and beliefs about the land and living things that Indigenous (First Peoples) communities have built up and passed down over many generations of living on and observing the land."],
  ["ecological restoration|restoration ecology|habitat restoration", "Helping a damaged, degraded or destroyed ecosystem recover, by replanting native species, removing invasive species, or restoring streams and wetlands."],
  ["conservation", "Protecting and managing natural resources and species so they are used wisely and last."],
  ["protected areas?", "Land or water set aside to conserve nature, such as national and provincial parks, ecological reserves and marine protected areas."],
  ["(?:environmental )?stewardship", "Taking responsibility for caring for and managing the environment so it stays healthy for future generations."],
  ["(?:the )?precautionary principle", "When an action might cause serious harm to people or the environment, take caution and act to prevent it before the science is certain."],
  ["ecological footprints?", "The area of land and water needed to supply the resources a person or population uses and absorb its wastes. The average Canadian's is about 8 hectares."],
  ["(?:the )?tragedy of the commons", "When a shared resource that everyone can use, like a fishery or the air, is overused and ruined because each individual acts in their own interest. Garrett Hardin described it in 1968."],
  ["watersheds?|drainage basins?", "An area of land where all the water drains to the same river, lake or ocean, like the Fraser River watershed."],
  ["riparian (?:zones?|areas?)", "The strip of land and plants along a stream, river or lake. It filters runoff, shades the water and holds the banks together."],
  ["wetlands?", "Land soaked with water for much of the year, such as marshes, swamps and bogs. Wetlands filter water, control floods and hold many species."],
  ["estuar(?:y|ies)", "Where a river meets the sea and fresh water mixes with salt water, one of the most productive ecosystems, like the Fraser River estuary."],
  ["(?:the )?biosphere", "All the parts of Earth where life exists: land, water and air."],
  ["ecology", "The study of how organisms interact with each other and with their environment."],
  ["abiotic(?: factors?)?", "A non-living part of an ecosystem, such as sunlight, temperature, water, soil, air and nutrients."],
  ["biotic(?: factors?)?", "A living part of an ecosystem, such as plants, animals, fungi and bacteria, or their remains."],
  ["decomposers?", "An organism, mostly bacteria and fungi, that breaks down dead organisms and wastes and recycles their nutrients back into the soil, water and air for producers to use again."],
  ["legumes?", "Plants of the pea family, like peas, beans, clover, alfalfa and lupines, whose root nodules hold nitrogen-fixing bacteria, so they enrich the soil with nitrogen."],
  ["old[- ]growth(?: forests?)?", "A forest that has grown for centuries without major disturbance, with huge old trees (some over 500 years in BC), standing dead snags and fallen logs: a climax community. Coastal BC old growth includes western red cedar and Douglas fir."],
  ["interspecific competition", "Competition between different species for the same limited resource, like wolves and cougars hunting the same deer."],
  ["intraspecific competition", "Competition among members of the same species for food, space or mates. It grows as the population gets more crowded."],
  ["predator[- ]prey (?:relationships?|cycles?|interactions?)", "One species (the predator) hunts and eats the other (the prey), so their numbers rise and fall in linked cycles: more prey feeds more predators, which then eat the prey down, like the lynx and the snowshoe hare."],
  ["provisioning (?:ecosystem )?services?", "The products people take from ecosystems: food, fresh water, timber, fibre, fuel and medicines."],
  ["regulating (?:ecosystem )?services?", "The ways ecosystems keep conditions in check: climate regulation, flood control, water purification, pollination and pest control."],
  ["supporting (?:ecosystem )?services?", "The basic processes the other services depend on: nutrient cycling, soil formation, photosynthesis and habitat."],
  ["cultural (?:ecosystem )?services?", "The non-material benefits of nature: recreation, tourism, spiritual and cultural value, and education."],
  ["clear-?cutting|clear-?cuts?", "Logging that cuts down all (or nearly all) the trees in an area at once. It is cheap but removes habitat, causes erosion and can silt up streams."],
  ["selective (?:logging|cutting|harvesting)", "Logging that cuts only some trees, chosen by size, species or health, and leaves the rest of the forest standing."],
  ["(?:the )?(?:mountain )?pine beetles?", "A native bark beetle, the size of a grain of rice, that kills pine trees by boring under the bark. Warm winters let it explode in BC from the late 1990s, killing over half the province's lodgepole pine."],
  ["(?:the )?great bear rainforest", "A huge temperate rainforest on the central and north coast of British Columbia, about 6.4 million hectares, home to the white Spirit (Kermode) bear. Most of it was protected in 2016 in an agreement with First Nations."],
  ["reforestation", "Planting trees (replanting) on land where a forest was cut or burned, to grow it back."],
  ["afforestation", "Planting trees on land that has not been forest for a long time."],
  ["ecosystems?", "All the living things (biotic factors) in an area interacting with each other and with their non-living environment (abiotic factors), such as a forest, a lake or an estuary."],
  ["invasive species", "An introduced, non-native species that spreads quickly and harms its new ecosystem, often outcompeting native species because its natural predators and diseases were left behind."],
  ["biomes?", "A large region of the world with a similar climate and similar plants and animals, such as tundra, boreal forest, temperate rainforest, grassland or desert."],
  ["endangered species", "A species at risk of becoming extinct (or extirpated) soon if nothing changes."],
  ["extinction", "The permanent loss of a species when its last member dies, so it no longer exists anywhere."],
  ["(?:maximum )?sustainable yield","The largest amount of a renewable resource, such as fish or timber, that can be harvested year after year without shrinking the population, because it is no more than what grows back."],
];
const ENV_TERMS_RE = ENV_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
const ENV_KINDS = [
  ["(?:type of |kind of )?succession", "succession"],
  ["(?:type of |kind of )?(?:symbiotic )?(?:relationship|symbiosis|interaction)s?", "^(?:mutualism|commensalism|parasitism|predation|competition)$"],
  ["(?:type of |kind of )?(?:organisms?|consumers?)", "producer|consumer|herbivore|carnivore|omnivore|detritivore|scavenger"],
  ["(?:type of |kind of )?(?:population )?growth", "growth"],
  ["(?:type of |kind of )?species", "species"],
  ["(?:type of |kind of )?(?:nutrient )?cycles?", "cycle"],
];
// Trophic level of each word: producers are level 0.
const ENV_LEVEL = {producer:0, producers:0, first:0, primary:1, second:1, secondary:2, third:2, tertiary:3, fourth:3, quaternary:4, fifth:4};
const ENV_TROPHIC = {producer:"The first trophic level: producers make their own food.", plant:"The first trophic level: plants are producers.", herbivore:"The second trophic level: herbivores are primary consumers that eat producers.", carnivore:"The third trophic level or higher: carnivores are secondary or tertiary consumers.", omnivore:"The second, third or higher trophic level, since omnivores eat both producers and consumers.", decomposer:"Decomposers feed on dead matter from every trophic level, so they sit outside the chain and recycle its nutrients."};
function env11(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble science", source:"Nimble science"});
  for(const [s, body] of ENV_FACTS) if(new RegExp(s).test(q)) return out(body);
  let t = /\btrophic level\b.*\b(producer|plant|herbivore|carnivore|omnivore|decomposer)s?\b|\b(producer|plant|herbivore|carnivore|omnivore|decomposer)s?\b.*\btrophic level\b/.exec(q);
  if(t) return out(ENV_TROPHIC[t[1] || t[2]]);
  const tb = termAsk(q.replace(/ in (?:ecology|an ecosystem|environmental science)$/, ""), ENV_TERMS_RE, ENV_KINDS); if(tb) return out(tb);
  let m;
  // 10 percent rule: energy × 0.1 for each trophic level climbed
  const lv = [...q.matchAll(/\b(producers?|first|primary|second|secondary|third|tertiary|fourth|quaternary|fifth)\b/g)].map(x => ENV_LEVEL[x[1]]);
  if(lv.length >= 2 && /\b(?:consumers?|producers?|trophic)\b/.test(q) && /\bhow much\b|\bavailable\b|\breach/.test(q) && (m = /(\d[\d,]*(?:\.\d+)?)\s*(kj|j|kcal|calories|cal|units?)?\b/.exec(q))){
    const e = +m[1].replace(/,/g, ""), n = lv[lv.length - 1] - lv[0], u = m[2] ? " " + m[2].replace(/^kj$/, "kJ").replace(/^j$/, "J") : "";
    if(n > 0) return out(pcNum(+(e * 0.1 ** n).toPrecision(6)) + u + ": about 10 percent of the energy passes up each trophic level, so " + pcNum(e) + " × 0.1" + (n > 1 ? "^" + n : "") + ".");
  }
  // population density = individuals ÷ area
  if(/\bdensity\b/.test(q) && (m = /(\d[\d,]*)\b.*?\b(\d+(?:\.\d+)?)\s*(square kilomet(?:re|er)s?|km2|km²|square met(?:re|er)s?|m2|m²|hectares?|ha|square miles?)\b/.exec(q))){
    const n = +m[1].replace(/,/g, ""), a = +m[2];
    return out(pcNum(+(n / a).toPrecision(6)) + " per " + m[3].replace(/s$/, "") + " (" + pcNum(n) + " ÷ " + pcNum(a) + ").");
  }
  // mark and recapture (Lincoln-Petersen): population = marked × caught ÷ marked in the catch
  if(/\b(?:mark|tag|band)(?:ed|s|ing)?\b/.test(q) && /\b(?:recapture\w*|caught|captured|later|second)\b/.test(q) && /\b(?:estimate|population|how many)\b/.test(q)){
    const n = (q.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if(n.length === 3 && n[2] > 0) return out("About " + pcNum(Math.round(n[0] * n[1] / n[2])) + " (marked × caught ÷ marked recaptures = " + n[0] + " × " + n[1] + " ÷ " + n[2] + ").");
  }
  // growth rate from one population size to the next
  if(/\bgrowth rate\b|\brate of growth\b|\bpercent(?:age)? (?:growth|increase|change)\b/.test(q) && (m = /\bfrom (\d[\d,]*) to (\d[\d,]*)\b/.exec(q))){
    const a = +m[1].replace(/,/g, ""), b = +m[2].replace(/,/g, ""), r = (b - a) / a, t = /\bin (\d+) years\b/.exec(q);
    return out(pcNum(+(r * 100).toPrecision(6)) + "% (" + pcNum(+r.toPrecision(6)) + ")" + (t && +t[1] > 1 ? " over " + t[1] + " years" : "") + ": (" + pcNum(b) + " - " + pcNum(a) + ") ÷ " + pcNum(a) + ".");
  }
  // doubling time of a population by the rule of 70
  if(/\bdoubl/.test(q) && /\bpopulation\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*(?:%|percent)/.exec(q))) return out("About " + pcNum(+(70 / +m[1]).toPrecision(4)) + " years (rule of 70: 70 ÷ " + m[1] + ").");
  return null;
}
// BC Social Studies 10, Canada and the World 1914 to the present: government and elections, the Constitution and the
// Charter, autonomy, discriminatory policies, Indigenous peoples and reconciliation, the world wars, the Depression,
// the Cold War, Quebec and the political spectrum. SS_FACTS are phrase questions; SS_TERMS go through termAsk.
const SS_FACTS = [
  ["\\b(?:three |3 )?(?:levels|orders) of government\\b", "Federal (Parliament in Ottawa and the prime minister), provincial or territorial (for BC, the legislature in Victoria and the premier), and municipal or local (city councils, mayors and regional districts). First Nations governments are a further order of government."],
  ["\\b(?:three |3 )?branches of (?:the )?government\\b", "Executive (the Crown, the prime minister and cabinet, who carry out laws), legislative (Parliament: the House of Commons and the Senate, which make laws) and judicial (the courts, which interpret laws)."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*\\bhead of state\\b", "The monarch, King Charles III, represented in Canada by the governor general and in each province by a lieutenant governor. The prime minister is the head of government."],
  ["^(?!.*\\b(?:uk|britain|british|england|united kingdom)\\b).*(?:\\bhow many (?:seats|mps|members(?: of parliament)?)\\b.*\\b(?:house of commons|parliament of canada|canada)\\b|\\bnumber of seats\\b.*\\bhouse of commons\\b)", "343, one for each riding, since the 2025 election (up from 338)."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*\\b(?:electoral|voting) system\\b", "First past the post (single-member plurality): each riding elects one member, and the candidate with the most votes wins, even without a majority."],
  ["\\bconstitution\\b.*\\bpatriat|\\bpatriat\\w*\\b.*\\bconstitution\\b", "1982. The Constitution Act, 1982 brought the constitution home from Britain and added the Charter of Rights and Freedoms. Queen Elizabeth II proclaimed it in Ottawa on April 17, 1982."],
  ["\\bjapanese canadians?\\b", "After Pearl Harbor in 1941, about 22,000 Japanese Canadians, most of them Canadian citizens, were forced from the BC coast and interned in camps in the interior, and their homes, boats and businesses were seized and sold. Canada apologized and paid redress in 1988."],
  ["\\blast residential school\\b|\\bresidential schools?\\b.*\\b(?:close|closed|closing|end|ended)\\b", "1996: Gordon's Indian Residential School in Saskatchewan was the last federally run one to close. About 150,000 First Nations, Métis and Inuit children attended residential schools from the 1880s on."],
  ["\\bcaused? (?:of )?the (?:great )?depression\\b|\\bcauses of the (?:great )?depression\\b", "The stock market crash of October 1929, overproduction and buying on credit, falling wheat prices and drought on the Prairies, high tariffs that choked world trade (like the American Smoot-Hawley tariff), and Canada's heavy dependence on exports of raw materials."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*(?:\\bwomen\\b.*\\b(?:vote|voting|suffrage)\\b|\\b(?:vote|suffrage)\\b.*\\bwomen\\b)", "Most women won the federal vote in 1918 (nurses serving overseas and soldiers' female relatives in 1917). Manitoba was first provincially, in 1916, and BC followed in 1917. Asian Canadians won the vote in 1947 to 1949, and First Nations people without giving up status in 1960."],
  ["\\bcanada\\b.*\\bdeclared? war\\b|\\bdeclared? war\\b.*\\bcanada\\b", "On September 10, 1939, a week after Britain, by its own vote in Parliament, a sign of its independence after the Statute of Westminster. In 1914 Canada was at war automatically when Britain declared war."],
  ["\\bquebec\\b.*\\breferend|\\breferend\\w*\\b.*\\bquebec\\b", "Quebec held two sovereignty referendums: in 1980, 59.6 percent voted No; in 1995 the No side won by a hair, 50.6 percent to 49.4."],
  ["\\bwho\\b.*\\bmulticulturalism\\b|\\b(?:official )?multiculturalism (?:policy|act)\\b|\\bofficial multiculturalism\\b", "Prime Minister Pierre Elliott Trudeau announced official multiculturalism in 1971, a world first, and Brian Mulroney's government passed the Canadian Multiculturalism Act in 1988."],
  ["\\bfather of medicare\\b|\\bwho (?:created|started|introduced|brought in)\\b.*\\b(?:medicare|universal health care|public health care)\\b", "Tommy Douglas, premier of Saskatchewan, whose government brought in public medical insurance there in 1962; it went national under Lester Pearson in 1966. In 2004 Canadians voted him the Greatest Canadian."],
  ["\\bwhat (?:does|do) (?:the )?federal government\\b|\\bfederal (?:responsibilities|powers|jurisdiction)\\b", "National matters: defence and the military, foreign affairs, currency and banking, criminal law, citizenship and immigration, Indigenous relations, the post office, fisheries and the census."],
  ["\\bwhat (?:does|do) (?:the |a )?provincial governments?\\b|\\bprovincial (?:responsibilities|powers|jurisdiction)\\b", "Education, health care and hospitals, highways, natural resources, property and civil rights, driver's licences, and the municipalities themselves."],
  ["\\bwhat (?:does|do) (?:the |a )?(?:municipal|local|city) governments?\\b|\\b(?:municipal|local) (?:government )?(?:responsibilities|powers)\\b", "Local services: garbage and recycling, water and sewers, local roads and transit, police and fire protection, parks, libraries, and zoning and building permits."],
  ["\\bhead of (?:the )?government\\b", "The prime minister, the leader of the party that holds the confidence of the House of Commons. In a province, it is the premier. The King is the head of state."],
  ["\\bhow (?:is|are) (?:the |a )?prime ministers? (?:chosen|selected|elected|picked)\\b|\\bhow (?:do|does) (?:you|someone|canada|canadians) (?:become|choose|pick|elect) (?:the |a )?prime minister\\b", "Canadians do not vote for the prime minister directly. They elect an MP in each riding; the leader of the party that wins the most seats, and can keep the confidence of the House of Commons, is asked by the governor general to form a government and becomes prime minister."],
  ["\\bhow (?:does|do|is) (?:a )?bills? (?:become|made into|passed into) (?:a )?laws?\\b|\\bhow (?:are|is) (?:a )?laws? (?:made|passed)\\b", "A bill gets first reading (introduced), second reading (debated in principle), committee study, report stage and third reading in the House of Commons, then the same steps in the Senate, then royal assent from the governor general, when it becomes law."],
  ["\\bhow many (?:judges|justices)\\b.*\\bsupreme court\\b", "Nine: the chief justice and eight other justices, three of whom must come from Quebec. They serve until age 75."],
  ["\\brights\\b.*\\bcharter\\b.*\\b(?:protect|guarantee|include)|\\bcharter\\b.*\\b(?:protects?|guarantees?)\\b", "Fundamental freedoms (conscience and religion, thought and expression, peaceful assembly, association), democratic rights (to vote and run for office), mobility rights, legal rights (life, liberty, a fair trial), equality rights, and official language and minority language education rights."],
  ["\\bstatute of westminster\\b", "1931. The British law made Canada and the other dominions equal to Britain and independent in making their own laws and foreign policy. Amending the constitution still needed Britain until 1982."],
  ["\\bflag\\b.*\\b(?:adopted|introduced|created|chosen|raised)\\b|\\bwhen\\b.*\\b(?:maple leaf|canad\\w*) flag\\b", "February 15, 1965, under Lester Pearson, after the Great Flag Debate of 1964. It replaced the Red Ensign."],
  ["\\bjuno beach\\b", "On D-Day, June 6, 1944, about 14,000 Canadian troops landed at Juno Beach in Normandy, one of five Allied beaches, and pushed farther inland than any other Allied force that day; 359 were killed."],
  ["\\blester (?:b\\.? )?pearson\\b", "Canada's 14th prime minister (1963 to 1968). As foreign minister he won the 1957 Nobel Peace Prize for proposing the first UN peacekeeping force, in the Suez Crisis. His government brought in the maple leaf flag, national medicare and the Canada Pension Plan."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*\\bprime minister\\b.*\\b(?:world war (?:ii|2|two)|second world war|ww ?2|wwii)\\b", "William Lyon Mackenzie King, prime minister from 1935 to 1948 (and 1921 to 1930), Canada's longest-serving prime minister."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*\\bprime minister\\b.*\\b(?:world war (?:i|1|one)|first world war|ww ?1|wwi)\\b", "Sir Robert Borden, prime minister from 1911 to 1920."],
  ["^(?!.*\\b(?:us|usa|united states|america|american|uk|britain|british|england|australia|india|france|germany|mexico)\\b).*(?:\\bhow (?:long|often)\\b.*\\belections?\\b|\\bmaximum (?:term|length)\\b.*\\b(?:government|parliament)\\b)", "Five years at most, under section 4 of the Charter, except in war or emergency with two-thirds support. Fixed-date laws set federal and BC elections every four years, but a government can fall or call one sooner."],
  ["^(?=.*\\b(?:canad|bc\\b|british columbia)).*(?:\\bvoting age\\b|\\bage (?:to|you can|can you) vote\\b|\\bhow old\\b.*\\bvote\\b)", "18, in federal elections and in every province and territory. Voters must also be Canadian citizens."],
  ["\\b(?:first nations|status indians?|indigenous peoples?|aboriginal peoples?)\\b.*\\b(?:vote|voting|franchise)\\b", "1960, under John Diefenbaker: First Nations people won the federal vote without having to give up their status. Inuit had won it in 1950."],
  ["\\b(?:who|what) (?:are|were|is) (?:the )?m[eé]tis\\b", "One of the three Aboriginal peoples named in the Constitution: a distinct nation descended from First Nations women and European, mostly French and Scottish, fur traders, centred on the Red River and the Prairies, with their own language, Michif. Louis Riel led them in 1869 to 1870 and in 1885."],
  ["\\blouis riel\\b", "The Métis leader of the Red River Resistance of 1869 to 1870, which brought Manitoba into Confederation, and of the North-West Resistance of 1885 in Saskatchewan. He was hanged for treason in Regina in 1885 and is now honoured as a founder of Manitoba."],
  ["\\bren[eé] l[eé]vesque\\b","The founder of the Parti Québécois and premier of Quebec from 1976 to 1985. He led the Yes side in the 1980 sovereignty referendum, and his government passed Bill 101."],
];
const SS_TERMS = [
  ["ridings?|electoral districts?|constituenc(?:y|ies)", "An electoral district (constituency): the area whose voters elect one member of Parliament or of the legislature. Canada has 343 federal ridings; BC has 93 provincial ones."],
  ["(?:the )?official opposition", "The party with the second most seats. It questions and criticizes the government, above all in Question Period, proposes alternatives and holds the government accountable, ready to govern itself."],
  ["responsible government", "Government in which the cabinet must keep the confidence (majority support) of the elected assembly or else resign or call an election, so it stays accountable to the people's representatives. Nova Scotia won it first, in 1848."],
  ["majority governments?", "A government whose party holds more than half the seats (172 of 343 in the House of Commons), so it can pass bills on its own votes."],
  ["proportional representation", "An electoral system where each party's share of seats matches its share of the vote. BC voted on changing to a form of it in 2005, 2009 and 2018 and kept first past the post each time."],
  ["(?:the )?supreme court of canada", "Canada's highest court and final court of appeal, in Ottawa: nine judges who decide constitutional and Charter cases and the most important legal questions. Its rulings bind every other court."],
  ["section 35(?: of the constitution act,? 1982)?", "The section of the Constitution Act, 1982 that recognizes and affirms the existing Aboriginal and treaty rights of the Aboriginal peoples of Canada: First Nations, Inuit and Métis."],
  ["(?:the )?winnipeg general strike", "From May 15 to June 25, 1919, about 30,000 workers in Winnipeg walked off the job for better wages and the right to collective bargaining. On Bloody Saturday, June 21, the RCMP charged a crowd and two strikers were killed."],
  ["(?:the )?chinese exclusion act|(?:the )?chinese immigration act(?:,? 1923)?", "The Chinese Immigration Act of 1923, which banned almost all Chinese immigration to Canada from July 1, 1923, a day Chinese Canadians called Humiliation Day, until it was repealed in 1947."],
  ["(?:the )?sixties scoop", "From the 1950s to the 1980s, child welfare agencies took about 20,000 First Nations, Métis and Inuit children from their families and placed them for adoption or in foster care, mostly with non-Indigenous families, cutting them off from their cultures."],
  ["(?:the )?war measures act", "A 1914 federal law that gave cabinet sweeping emergency powers, overriding civil liberties. It was used in both world wars (to intern Ukrainian and Japanese Canadians) and in the 1970 October Crisis, and was replaced by the Emergencies Act in 1988."],
  ["(?:the )?(?:battle of )?passchendaele", "A First World War battle in the mud of Belgium in October and November 1917. Canadian troops took the village of Passchendaele on November 6 at a cost of about 16,000 casualties, more than 4,000 of them killed."],
  ["(?:the )?dieppe raid|(?:the )?raid on dieppe", "A failed Allied raid on the German-held port of Dieppe, France, on August 19, 1942. Of about 5,000 Canadians, 916 were killed and nearly 2,000 captured. Its lessons helped plan D-Day."],
  ["(?:the )?avro arrow|(?:the )?avro cf-105(?: arrow)?|(?:the )?cf-105(?: arrow)?", "The Avro CF-105 Arrow, a supersonic interceptor jet built by Avro Canada that first flew in 1958. Prime Minister John Diefenbaker cancelled it on February 20, 1959, and about 30,000 jobs were lost."],
  ["peacekeeping", "Using neutral, lightly armed forces, usually under the United Nations, to keep the peace between sides in a conflict, watch ceasefires and protect civilians. Lester Pearson proposed the first UN force in 1956."],
  ["bill 101|(?:the )?charter of the french language", "Quebec's Charter of the French Language, passed in 1977 by René Lévesque's Parti Québécois. It made French the official language of Quebec, of work and of signs, and sent most immigrant children to French schools."],
  ["(?:the )?official languages act", "The 1969 federal law, under Pierre Trudeau, that made English and French equal official languages of the government of Canada, so federal services are offered in both."],
  ["(?:the )?oka crisis", "A 78-day standoff in 1990 between Mohawk protesters of Kanesatake and Quebec police, then the Canadian army, over a plan to expand a golf course onto pines and a burial ground at Oka. A police officer was killed."],
  ["(?:the )?nisga'?a (?:final agreement|treaty)", "The first modern treaty in BC, signed in 1998 and in effect in 2000. It gave the Nisga'a Nation about 2,000 square kilometres of the Nass Valley and self-government."],
  ["(?:the )?calder (?:case|decision)|calder v\\.? (?:british columbia|bc)", "A 1973 Supreme Court of Canada case brought by Frank Calder and the Nisga'a. The court agreed that Aboriginal title existed in law before colonization, which led Canada to start negotiating land claims."],
  ["(?:the )?delgamuukw(?: decision| case| v\\.? british columbia)?", "A 1997 Supreme Court of Canada ruling in a case brought by Gitxsan and Wet'suwet'en hereditary chiefs. It held that Aboriginal title is a right to the land itself and that oral histories count as evidence."],
  ["right[- ]wing(?: ideology| politics)?|(?:the )?political right", "The side of the political spectrum that favours tradition, individual freedom and a free market, with less government, lower taxes and fewer regulations. In Canada the Conservative Party sits on the right."],
  ["nafta|(?:the )?north american free trade agreement", "The North American Free Trade Agreement among Canada, the United States and Mexico, in force from 1994. It was replaced by CUSMA (the USMCA) in 2020."],
  ["(?:the )?great depression", "The worldwide economic collapse from the stock market crash of 1929 through the 1930s. In Canada close to 30 percent of workers were unemployed by 1933, and the Prairies were hit hardest by drought and falling wheat prices (the Dirty Thirties)."],
  ["(?:the )?cold war", "The rivalry from 1947 to 1991 between the United States and its allies and the Soviet Union (USSR) and its communist allies, fought with an arms race, spying and proxy wars rather than direct war. Canada joined NATO and NORAD. It ended when the Soviet Union collapsed in 1991."],
  ["nato|(?:the )?north atlantic treaty organi[sz]ation", "The North Atlantic Treaty Organization, a defence alliance formed in 1949 by Canada, the United States and Western European countries against the Soviet threat: an attack on one is an attack on all. It has 32 members."],
  ["globali[sz]ation", "The growing connection and interdependence of the world's economies, cultures and peoples through trade, investment, travel, migration and communication technology."],
  ["(?:the )?halifax explosion", "On December 6, 1917, the French munitions ship Mont-Blanc collided with another ship in Halifax Harbour and exploded, the largest human-made explosion before the atomic bomb. About 2,000 people were killed and 9,000 injured."],
  ["(?:the )?holocaust", "The genocide by Nazi Germany and its collaborators of about six million Jews, along with millions of others, including Roma and disabled people, during the Second World War. In 1939 Canada turned away the St. Louis, a ship carrying more than 900 Jewish refugees."],
  ["(?:the )?cuban missile crisis", "In October 1962 the United States found Soviet nuclear missiles in Cuba, and for 13 days the world came close to nuclear war, until the Soviets agreed to remove them. John Diefenbaker hesitated to put Canada's forces on alert."],
  ["(?:the )?korean war", "From 1950 to 1953 North Korea, backed by China and the Soviet Union, fought South Korea, backed by a United Nations force led by the United States. About 26,000 Canadians served and 516 died. It ended in an armistice, not a peace treaty."],
  ["(?:the )?united nations", "The international organization founded in 1945, after the Second World War, to keep world peace and security and promote human rights and cooperation among countries. It has 193 member countries; Canada was a founding member."],
  ["(?:a )?political part(?:y|ies)", "A group of people who share ideas about government and run candidates in elections to win power and carry out their policies, such as the Liberals, Conservatives, NDP, Bloc Québécois and Greens."],
  ["(?:the )?battle of the atlantic", "The longest campaign of the Second World War, from 1939 to 1945: Allied navies and air forces, with Canada's navy a large part, escorted convoys of merchant ships carrying supplies to Britain against German U-boats."],
  ["(?:the )?iron curtain", "The political and physical line dividing communist Eastern Europe, under Soviet control, from the democratic West during the Cold War, a phrase Winston Churchill made famous in 1946. It fell in 1989."],
  ["(?:the )?vietnam war", "From 1955 to 1975 communist North Vietnam and the Viet Cong fought South Vietnam and the United States. Canada stayed out officially, but tens of thousands of Americans avoiding the draft came to Canada. It ended when the North took Saigon in 1975."],
  ["question period","The daily 45-minute session in the House of Commons when opposition MPs question the prime minister and cabinet ministers, a key way to hold the government to account."],
  ["royal assent", "The final step in making a law: the governor general (or a lieutenant governor in a province) approves a bill in the King's name after both houses pass it, and it becomes law."],
  ["backbenchers?", "An MP who is not a cabinet minister or a party's front-bench critic, so sits behind the front benches and has less say in party policy."],
  ["(?:the )?emergencies act", "The 1988 law that replaced the War Measures Act. It gives the federal government limited emergency powers that must respect the Charter and be reviewed by Parliament. It was first used in February 2022 against the convoy blockades."],
  ["(?:the )?canada pension plan", "A public pension passed in 1965 and started in 1966 under Lester Pearson. Workers and employers pay in, and it pays retirement, disability and survivor pensions. Quebec runs its own Quebec Pension Plan."],
  ["(?:the )?regina riot", "On July 1, 1935, RCMP and city police broke up a rally of On-to-Ottawa trekkers in Regina. A police detective was killed and many were hurt, ending the trek."],
  ["(?:the )?relief camps?", "Federal camps from 1932 to 1936, under R. B. Bennett and run by the Department of National Defence, where single unemployed men did hard labour building roads and clearing land for food, a bunk and 20 cents a day."],
  ["(?:the )?battle of hong kong", "In December 1941 nearly 2,000 Canadian soldiers helped defend the British colony of Hong Kong against Japan; it fell on Christmas Day. More than 550 of the Canadians never came home, many dying in brutal prison camps."],
  ["(?:the )?liberation of (?:the )?netherlands|(?:the )?liberation of holland", "From September 1944 to May 1945 the First Canadian Army drove the Germans out of much of the Netherlands, bringing food to starving Dutch people. More than 7,600 Canadians died. The Dutch still send Ottawa tulips every year in thanks."],
  ["(?:the )?chanak (?:crisis|affair)", "In 1922 Britain asked the dominions for troops to face Turkey at Chanak. Mackenzie King answered that Canada's Parliament would decide, in effect refusing, a step toward an independent foreign policy."],
  ["(?:the )?balfour (?:report|declaration of 1926)", "The 1926 Imperial Conference report that declared Britain and the dominions to be autonomous communities within the British Empire, equal in status. It led to the Statute of Westminster in 1931."],
  ["(?:the )?king[- ]byng (?:affair|crisis)", "In 1926 Governor General Lord Byng refused Prime Minister Mackenzie King's request to dissolve Parliament and asked Arthur Meighen to govern instead. Meighen's government soon fell, and King won the election on the issue, settling that a governor general follows the prime minister's advice."],
  ["(?:the )?internment of ukrainian canadians|ukrainian (?:canadian )?internment", "From 1914 to 1920, under the War Measures Act, about 8,500 people labelled enemy aliens, most of them Ukrainians from the Austro-Hungarian Empire, were held in 24 camps, and about 80,000 more had to register with police."],
  ["(?:the )?continuous journey (?:regulation|rule|law)", "A 1908 rule that immigrants had to arrive by a continuous journey from their home country on a through ticket, which was impossible from India, so it kept out South Asians. It led to the Komagata Maru incident in 1914."],
  ["(?:the )?1969 white paper|(?:the )?white paper of 1969|(?:the )?white paper on indian policy", "The 1969 federal policy, from Pierre Trudeau's government and Indian Affairs minister Jean Chrétien, to abolish the Indian Act, Indian status and treaties and assimilate First Nations. First Nations rejected it in the Red Paper (Citizens Plus), and it was withdrawn in 1971."],
  ["(?:the )?(?:94 )?calls to action", "The 94 recommendations of the Truth and Reconciliation Commission in 2015 to repair the harm of residential schools, covering child welfare, education, language and culture, health, justice and reconciliation."],
  ["aboriginal title", "The inherent right of Indigenous peoples to their traditional lands, from occupying them before European sovereignty. Courts recognized it in Calder (1973), defined it in Delgamuukw (1997) and first declared it over a specific area in Tsilhqot'in (2014)."],
  ["(?:the )?meech lake accord", "A 1987 deal between Brian Mulroney and the premiers to recognize Quebec as a distinct society so it would sign the constitution. It failed in June 1990 when Manitoba, where Elijah Harper blocked it, and Newfoundland did not ratify it."],
  ["(?:the )?charlottetown accord", "A broader 1992 constitutional package (distinct society for Quebec, Senate reform, Indigenous self-government) that Canadians rejected in a national referendum on October 26, 1992, about 54 percent voting No."],
  ["(?:the )?parti qu[eé]b[eé]cois", "A Quebec provincial party founded in 1968 by René Lévesque to make Quebec a sovereign country. It held the 1980 and 1995 referendums."],
  ["(?:the )?bloc qu[eé]b[eé]cois", "A federal party founded in 1991 by Lucien Bouchard that runs candidates only in Quebec and supports Quebec sovereignty. It was the Official Opposition from 1993 to 1997."],
  ["(?:the )?marshall plan", "The American program from 1948 to 1952 that gave about $13 billion in aid to rebuild Western Europe after the Second World War and hold back communism."],
  ["norad|(?:the )?north american aerospace defen[cs]e command", "The North American Aerospace Defense Command, set up by Canada and the United States in 1958 to watch and defend North American airspace together."],
  ["(?:the )?canada health act", "The 1984 federal law that sets the rules provinces must meet to get federal health money: health insurance must be publicly administered, comprehensive, universal, portable and accessible, with no extra billing."],
  ["free trade", "Trade between countries without tariffs, quotas or other barriers. Canada signed free trade with the United States in 1988, then NAFTA in 1994 and CUSMA in 2020."],
  ["conservative(?: ideology)?|conservatism", "The ideology that values tradition, stability and gradual change over sudden change, with individual responsibility, free markets and limited government. It sits on the right of the political spectrum."],
  ["(?:the )?g-?7(?: countries)?", "The Group of Seven: Canada, France, Germany, Italy, Japan, the United Kingdom and the United States, plus the European Union, whose leaders meet every year on the world economy and security. Canada joined in 1976."],
  ["(?:the )?governor general(?: of canada)?", "The King's representative in Canada, appointed on the prime minister's advice for about five years. The governor general gives royal assent to bills, opens Parliament with the Speech from the Throne, swears in the prime minister and cabinet, and is commander-in-chief. The role is mostly ceremonial."],
  ["(?:the )?lieutenant governors?", "The King's representative in a province, appointed by the governor general on the prime minister's advice. Like the governor general, the role is mostly ceremonial: royal assent, the Throne Speech, swearing in the premier."],
  ["(?:the )?house of commons", "The elected lower house of Parliament: 343 members of Parliament (MPs), one per riding, elected at least every five years. Most bills start there, and the government must keep its confidence."],
  ["(?:the )?senate(?: of canada)?", "The appointed upper house of Parliament: 105 senators appointed by the governor general on the prime minister's advice, serving until age 75. It gives bills a sober second thought and can amend or reject them."],
  ["(?:the )?parliament of canada|(?:the )?canadian parliament", "Canada's federal legislature: the King (through the governor general), the Senate and the House of Commons."],
  ["(?:the )?prime minister of canada|(?:the )?canadian prime minister", "The head of government, usually the leader of the party with the most seats in the House of Commons. The prime minister picks the cabinet and sets the government's direction."],
  ["minority governments?", "A government whose party has the most seats but fewer than half of them, not a majority, so it needs support from other parties to pass bills and survive confidence votes."],
  ["coalition governments?", "A government formed by two or more parties that share cabinet seats to hold a majority together."],
  ["first[- ]past[- ]the[- ]post|fptp|single[- ]member plurality", "An electoral system where each riding elects one member and the candidate with the most votes wins, even without a majority. Canada uses it federally and in every province."],
  ["(?:the )?(?:canadian )?charter of rights(?: and freedoms)?|(?:the )?canadian charter", "The Canadian Charter of Rights and Freedoms, part of the Constitution Act, 1982. It protects fundamental freedoms (expression, religion, assembly), democratic, mobility, legal, equality and language rights, and lets courts strike down laws that break them, within reasonable limits (section 1)."],
  ["(?:the )?notwithstanding clause|section 33(?: of the charter)?", "Section 33 of the Charter, which lets Parliament or a provincial legislature override some Charter rights (sections 2 and 7 to 15) by passing a law notwithstanding them, for five years at a time. Quebec, Saskatchewan and Ontario have used it."],
  ["(?:the )?constitution of canada|(?:the )?canadian constitution|(?:the )?constitution act,? 1982", "Canada's supreme law: the Constitution Act, 1867 (once the BNA Act), which created Confederation and divided federal and provincial powers, and the Constitution Act, 1982, which patriated it from Britain and added the Charter and Aboriginal rights."],
  ["(?:the )?statute of westminster(?:,? 1931)?", "The 1931 British law that made Canada and the other dominions equal to Britain and independent in making their own laws and foreign policy. Amending the constitution still needed Britain until 1982."],
  ["(?:the )?chinese head tax|(?:the )?head tax", "A fee charged only to Chinese immigrants entering Canada from 1885: $50, raised to $100 in 1900 and $500 in 1903, meant to keep them out after they had helped build the Canadian Pacific Railway. Canada apologized in 2006."],
  ["(?:the )?komagata maru(?: incident)?", "In 1914 the ship Komagata Maru brought 376 passengers from British India, mostly Sikhs from Punjab, to Vancouver. Under the continuous journey rule almost all were denied entry and turned away after two months in the harbour; back in India, 19 were killed at Budge Budge. Canada apologized in 2016."],
  ["(?:indian )?residential schools?(?: system)?", "Boarding schools funded by the federal government and run by churches, from the 1880s to 1996, which about 150,000 First Nations, Métis and Inuit children were forced to attend to assimilate them. Children were cut off from their families, languages and cultures, many were abused, and thousands died. The Truth and Reconciliation Commission called it cultural genocide."],
  ["(?:the )?truth and reconciliation commission(?: of canada)?|(?:the )?trc", "The Truth and Reconciliation Commission of Canada (2008 to 2015), set up by the residential schools settlement. It gathered the stories of more than 6,500 survivors and issued 94 Calls to Action for reconciliation."],
  ["(?:the )?indian act", "The federal law, first passed in 1876, that governs First Nations status, reserves and band governments. It was used to control First Nations life: it banned the potlatch from 1884 to 1951 and made residential schools compulsory. It is still in force, amended many times."],
  ["(?:the )?on[- ]to[- ]ottawa trek", "In 1935 more than 1,000 unemployed men left the federal relief camps in BC and rode freight trains east to protest to Prime Minister R. B. Bennett. The RCMP stopped them in Regina, where the Regina Riot on July 1 left a police officer dead."],
  ["(?:the )?persons case", "In 1929 the Famous Five (Emily Murphy, Nellie McClung, Irene Parlby, Louise McKinney and Henrietta Muir Edwards) won a ruling from Britain's Privy Council that women are persons under the law, so they could be appointed to the Senate. Canada's Supreme Court had said no in 1928."],
  ["(?:the )?conscription crisis(?: of 19(?:17|44))?", "Clashes over forcing men into military service (conscription). In 1917 Robert Borden's Military Service Act split the country, with French Canadians in Quebec strongly against it. In 1944 Mackenzie King, who had promised conscription if necessary but not necessarily conscription, sent conscripts overseas, causing a second, smaller crisis."],
  ["(?:the )?(?:battle of )?vimy(?: ridge)?", "A battle in April 1917, in the First World War, where all four divisions of the Canadian Corps fought together for the first time and took the ridge in northern France from the Germans. About 3,600 Canadians were killed. It became a symbol of Canadian nationhood."],
  ["d-?day|d day", "June 6, 1944, when Allied forces landed on the beaches of Normandy in German-occupied France in the Second World War. Canadian troops landed at Juno Beach."],
  ["(?:the )?quiet revolution", "The rapid change in Quebec in the 1960s under Premier Jean Lesage: the province took over education and health care from the Catholic Church, nationalized hydro power (Hydro-Québec) and built a strong French-speaking Quebec identity, feeding the sovereignty movement."],
  ["(?:the )?october crisis", "In October 1970 the Front de libération du Québec (FLQ) kidnapped British diplomat James Cross and Quebec cabinet minister Pierre Laporte, who was killed. Pierre Trudeau invoked the War Measures Act, its only use in peacetime, sending in troops and arresting about 450 people without charge."],
  ["(?:the )?political spectrum", "A way of placing political ideas on a line from left to right. The left favours change, equality and more government action; the centre is moderate; the right favours tradition, individual freedom and less government. Radicals and reactionaries sit at the far ends."],
  ["left[- ]wing(?: ideology| politics)?|(?:the )?political left", "The side of the political spectrum that favours change and social equality, with more government action such as public health care, social programs and regulation of business. In Canada the NDP sits on the left."],
  ["multiculturalism", "A policy and ideal of welcoming many cultures and letting people keep their heritage while taking part fully in Canadian life. Pierre Trudeau made it official policy in 1971, and the Canadian Multiculturalism Act followed in 1988."],
  ["undrip|(?:the )?united nations declaration on the rights of indigenous peoples", "The United Nations Declaration on the Rights of Indigenous Peoples, adopted in 2007. It sets out Indigenous peoples' rights to self-determination, land, culture and free, prior and informed consent. BC made it law in 2019 and Canada in 2021."],
];
const SS_TERMS_RE = SS_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
function ss10(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble social studies", source:"Nimble social studies"});
  for(const [s, body] of SS_FACTS) if(new RegExp(s).test(q)) return out(body);
  const tb = termAsk(q.replace(/ in canada$/, ""), SS_TERMS_RE, []); return tb ? out(tb) : null;
}
// BC Physical Geography 12: maps and time zones, Earth-sun relations, weather and climate, water, landforms, rivers,
// glaciers, coasts, soils and biomes. Facts and terms come from form A and the curriculum; form B stays held out.
const GEO_FACTS = [
  ["\\bcontour lines? (?:are |that are )?(?:very )?close(?: together)?\\b|\\bclosely spaced contour", "The slope is steep: the land rises or falls a lot over a short distance, because each line marks one more step of elevation."],
  ["\\bcontour lines? (?:are |that are )?(?:very |widely |spread )?(?:far apart|wide apart|widely spaced|spread out)\\b", "The slope is gentle or the land is nearly flat: the elevation changes only a little over a long distance."],
  ["\\bdegrees of longitude\\b.*\\bhour\\b|\\bhour\\b.*\\bdegrees of longitude\\b", "15 degrees. Earth turns 360 degrees in 24 hours, so each hour of time is 360 ÷ 24 = 15 degrees of longitude."],
  ["^(?:what causes |why (?:do|does) (?:we|earth) have |the cause of |what is the cause of )(?:the )?seasons\\b|\\bseasons (?:caused|happen)\\b", "The tilt of Earth's axis, about 23.5 degrees. As Earth orbits the Sun, each hemisphere leans toward the Sun for part of the year (summer: higher sun, longer days, more direct energy) and away from it for the rest (winter). Distance from the Sun is not the cause."],
];
const GEO_TERMS = [
  ["contour lines?", "A line on a topographic map that joins points of equal elevation. Close lines mean a steep slope, a closed loop marks a hill or a hollow, and the contour interval is the height between lines."],
  ["contour interval", "The difference in elevation between two neighbouring contour lines on a map, such as 10 metres."],
  ["(?:summer|june) solstice", "The day the Sun is overhead at the Tropic of Cancer (23.5 degrees north), around June 21: the longest day of the year in the Northern Hemisphere and the start of its summer."],
  ["(?:sea|ocean|lake) breeze", "A cool daytime wind that blows from the sea onto the land. Land heats faster than water, so warm air rises over the land and cooler air from over the water flows in to replace it."],
  ["orographic (?:precipitation|rain(?:fall)?|lifting|uplift)", "Rain or snow made when moist air is forced up the windward side of mountains: it cools as it rises, its water vapour condenses, and it falls as precipitation. BC's Coast Mountains get it from Pacific air."],
  ["rain ?shadows?(?: effect)?", "The dry area on the leeward (downwind) side of a mountain range. Air drops its moisture on the windward side, then sinks and warms as it descends, so little rain falls beyond, like the Okanagan behind the Coast and Cascade Mountains."],
  ["(?:river |stream )?discharge(?: of (?:a )?(?:river|stream))?", "The volume of water flowing past a point in a river each second, in cubic metres per second (m³/s). Discharge = cross-sectional area × velocity."],
  ["ox-?bow lakes?", "A U-shaped lake left beside a river when the neck of a meander is cut off, often in a flood, and the river takes the shorter path."],
  ["meanders?", "A broad loop or bend in a river. Water flows fastest on the outside of the bend and erodes it, and slowest on the inside, where it deposits sediment, so the loop grows over time."],
  ["u-?shaped valleys?|glacial troughs?", "A wide valley with a flat floor and steep sides, carved when a glacier filled and eroded an older V-shaped river valley."],
  ["v-?shaped valleys?", "A narrow valley with steep sides cut by a river eroding downward, typical of a river's upper course."],
  ["hanging valleys?", "A smaller side valley left high above a main valley that a larger glacier deepened, often with a waterfall where it joins."],
  ["aretes?|arêtes?", "A sharp, narrow ridge between two cirques or glacial valleys, carved by glaciers eroding on both sides."],
  ["fjords?|fiords?", "A long, narrow, deep sea inlet with steep sides, a glacial valley later flooded by the sea, like Howe Sound in BC."],
  ["mass (?:movement|wasting)", "The downslope movement of rock, soil and debris under gravity, such as rockfalls, landslides, mudflows and slow soil creep. Water, steep slopes and weak rock make it more likely."],
  ["soil creep", "The very slow downhill movement of soil under gravity, shown by tilted fences, poles and tree trunks."],
  ["spits?", "A long, narrow ridge of sand or shingle that sticks out from the coast into the sea, built by longshore drift where the coastline changes direction."],
  ["longshore drift|littoral drift", "The movement of sand and shingle along a coast. Waves wash up the beach at an angle (swash) and drain straight back (backwash), so material zigzags along the shore."],
  ["soil horizons?|soil layers?|soil profiles?", "A soil horizon is one layer of soil running parallel to the surface. A soil profile from top to bottom: O (organic litter), A (topsoil, with humus), B (subsoil, where minerals collect), C (weathered parent rock) and bedrock."],
  ["(?:the )?tundra(?: biome)?", "A cold, treeless biome in the far north and on high mountains with permafrost, a short summer growing season, little precipitation, and plants like mosses, lichens, grasses and dwarf shrubs."],
  ["permafrost", "Ground that stays frozen for at least two years in a row, found under tundra and in much of northern Canada."],
  ["(?:the )?taiga|boreal forests?", "The biome of cold coniferous forest (spruce, fir, pine) across northern Canada and Russia, with long cold winters and short summers."],
  ["alluvial fans?", "A fan-shaped deposit of sediment where a steep stream flows out onto flatter land and slows down."],
  ["isobars?", "A line on a weather map that joins places with the same air pressure. Close isobars mean strong winds."],
  ["air mass(?:es)?", "A large body of air with about the same temperature and humidity throughout, taking on the character of the region it formed over, such as maritime polar air from the north Pacific."],
  ["topographic(?:al)? maps?|topo maps?", "A detailed map that shows the shape and height of the land with contour lines, along with rivers, roads, buildings and vegetation. In Canada the federal series is at 1:50,000 and 1:250,000."],
  ["(?:winter|december) solstice", "The day the Sun is overhead at the Tropic of Capricorn (23.5 degrees south), around December 21: the shortest day of the year in the Northern Hemisphere and the start of its winter."],
  ["(?:an )?equinox(?:es)?|(?:spring|vernal|fall|autumn(?:al)?|march|september) equinox", "One of the two days, around March 20 and September 22, when the Sun is overhead at the equator and day and night are about 12 hours each everywhere on Earth."],
  ["insolation|incoming solar radiation", "Incoming solar radiation: the Sun's energy reaching Earth's surface. It is strongest where the Sun is high in the sky, near the equator and in summer."],
  ["land breeze", "A cool night-time wind that blows from the land out to sea. Land cools faster than water at night, so air rises over the warmer sea and cooler air from the land flows out to replace it."],
  ["convection(?:al)? (?:precipitation|rain(?:fall)?)", "Rain made when the ground heats the air above it, the warm air rises, cools and its water vapour condenses, often giving afternoon thunderstorms in hot places."],
  ["frontal (?:precipitation|rain(?:fall)?)|cyclonic (?:precipitation|rain(?:fall)?)", "Rain made where a warm air mass meets a cold one: the lighter warm air is pushed up over the cold air along the front, cools, and its water vapour condenses."],
  ["high(?:-| )pressure (?:system|area|zone|cell)s?|anticyclones?", "An area where air sinks toward the ground, so pressure is high. Sinking air warms and dries, giving clear skies and calm, fair weather. Winds spiral out of it, clockwise in the Northern Hemisphere."],
  ["low(?:-| )pressure (?:system|area|zone|cell)s?|mid-latitude cyclones?", "An area where air rises, so pressure is low. Rising air cools and its water vapour condenses, giving clouds, rain and wind. Winds spiral into it, counterclockwise in the Northern Hemisphere."],
  ["dew ?points?(?: temperature)?", "The temperature at which air becomes saturated, so its water vapour starts to condense into dew, fog or cloud. The closer the air temperature is to the dew point, the higher the relative humidity."],
  ["infiltration", "The soaking of water from the surface down into the soil. It is slow on clay, frozen or paved ground, which makes more runoff."],
  ["(?:the )?water tables?", "The top of the saturated zone underground, below which every gap in the soil and rock is full of groundwater. It rises after wet seasons and falls in droughts."],
  ["(?:storm |flood )?hydrographs?", "A graph of a river's discharge over time, often with rainfall as bars. The lag time is the gap between peak rainfall and peak discharge."],
  ["drumlins?", "A smooth, elongated hill of glacial till shaped like an upturned spoon, its long axis lined up with the direction the ice moved."],
  ["cirques?|corries?|cwms?", "A bowl-shaped hollow on a mountainside carved by the head of a glacier, often holding a small lake (a tarn) after the ice melts."],
  ["eskers?", "A long, winding ridge of sand and gravel laid down by a meltwater stream flowing under a glacier."],
  ["sea stacks?", "A tall pillar of rock standing in the sea off a headland, left when waves erode a cave into an arch and the arch roof collapses."],
  ["sea arch(?:es)?", "A natural arch through a headland, made when waves erode caves on both sides until they meet."],
  ["headlands?", "A point of hard rock that juts out into the sea because it erodes more slowly than the softer rock beside it, which wears back into bays."],
  ["(?:a )?beach(?:es)?", "A strip of sand, pebbles or shingle along a coast between low and high tide, deposited by waves where they lose energy."],
  ["humus", "The dark, crumbly organic matter in soil made from decayed plants and animals. It holds water and nutrients and makes soil fertile."],
  ["(?:tropical )?rain ?forests?(?: biome)?", "A hot, wet biome near the equator with rain all year (often over 2,000 mm), tall dense forest in layers and more species than any other biome."],
  ["(?:the )?tropic of capricorn", "The line of latitude about 23.4 degrees south, the farthest south the Sun is ever directly overhead, on the December solstice."],
  ["(?:the )?tropic of cancer", "The line of latitude about 23.4 degrees north, the farthest north the Sun is ever directly overhead, on the June solstice."],
  ["(?:earth'?s )?axial tilt|(?:the )?tilt of (?:the )?earth(?:'s axis)?|obliquity", "The angle between Earth's axis and a line straight up from its orbit, about 23.4 degrees. It causes the seasons."],
  ["(?:the )?(?:prevailing )?westerlies", "The prevailing winds of the mid-latitudes, between about 30 and 60 degrees, blowing from the west toward the east. They carry Pacific weather onto BC."],
  ["cold fronts?", "The boundary where a cold air mass pushes under a warm one and lifts it sharply, bringing a sudden temperature drop, cumulonimbus cloud, heavy showers or thunderstorms, then clearer, cooler air."],
  ["warm fronts?", "The boundary where a warm air mass slides up and over a retreating cold one, bringing a long spell of light, steady rain or drizzle and layered cloud, then warmer air."],
  ["(?:the )?(?:environmental |normal )?lapse rates?", "The rate at which air temperature falls with height in the troposphere, about 6.5 °C for every 1,000 metres on average."],
  ["(?:hot |cold )?deserts?(?: biome)?", "A biome with very little precipitation, under about 250 mm a year, so plants and animals are adapted to save water. Deserts can be hot, like the Sahara, or cold, like the Gobi."],
  ["evapotranspiration", "The total water returned to the air from land: evaporation from soil and water plus transpiration from plants' leaves."],
  ["(?:surface )?run-?off|overland flow", "Water from rain or snowmelt that flows over the land surface into streams instead of soaking in, greatest on steep, saturated, frozen or paved ground."],
  ["tributar(?:y|ies)", "A smaller river or stream that flows into a larger one. The point where they meet is the confluence."],
  ["confluences?", "The place where two rivers or streams meet and join."],
  ["(?:the )?mouth of (?:a |the )?river|river mouths?", "Where a river ends by flowing into a sea, ocean, lake or larger river, often with a delta or estuary."],
  ["(?:the )?source of (?:a |the )?river|river sources?", "Where a river begins, such as a spring, a lake, a glacier or rain-fed upland, usually high in its drainage basin."],
  ["estuar(?:y|ies)", "The wide tidal mouth of a river where fresh water mixes with salt water from the sea, like the Fraser River estuary."],
  ["river terraces?", "A flat step along a valley side, a piece of an old floodplain left high when the river cut down to a lower level."],
  ["(?:glacial )?erratics?", "A boulder carried by a glacier and dropped far from where it came from, so it is a different rock from the ground it rests on."],
  ["(?:glacial )?till|boulder clay", "Unsorted sediment, from clay to boulders, dropped straight from glacier ice without being sorted by water."],
  ["oxidation(?: weathering)?", "Chemical weathering where oxygen reacts with minerals, especially iron, turning rock rusty red and making it crumble."],
  ["wave[- ]?cut platforms?|wave[- ]?cut notch(?:es)?", "A flat, rocky shelf at the foot of a cliff, exposed at low tide, left as waves undercut the cliff and it retreats inland."],
  ["coastal erosion", "The wearing away of the coast by waves, through hydraulic action, abrasion, attrition and solution. It makes cliffs, caves, arches and stacks."],
  ["soil texture", "How much sand, silt and clay a soil holds. Sandy soil drains fast, clay holds water, and loam, a mix, is best for farming."],
  ["loam", "Soil with a balanced mix of sand, silt and clay plus humus, which drains well and holds water and nutrients, ideal for farming."],
  ["(?:temperate )?grasslands?(?: biome)?|prairies?|steppes?", "A biome of grasses with few trees, where rain is too light for forest but enough to stop desert, like the Canadian Prairies. Tropical grassland is savanna."],
  ["(?:a )?natural hazards?", "A natural event, such as an earthquake, flood, wildfire, landslide or storm, that threatens people and property. It becomes a disaster when it causes major harm."],
  ["latitude|lines? of latitude|parallels? of latitude", "How far a place is north or south of the equator, in degrees from 0 at the equator to 90 at the poles. Lines of latitude (parallels) run east to west."],
  ["longitude|lines? of longitude", "How far a place is east or west of the prime meridian, in degrees from 0 to 180 east or west. Lines of longitude (meridians) run from pole to pole."],
  ["(?:the )?prime meridian|greenwich meridian", "The line of 0 degrees longitude, running from pole to pole through Greenwich, England. Longitude is measured east and west from it."],
  ["(?:the )?equator", "The line of 0 degrees latitude, halfway between the North and South Poles, dividing Earth into the Northern and Southern Hemispheres."],
  ["(?:the )?arctic circle", "The line of latitude about 66.5 degrees north. North of it the Sun stays up for 24 hours on the June solstice and stays down for 24 hours on the December solstice."],
  ["(?:the )?international date ?line", "An imaginary line, mostly along 180 degrees longitude in the Pacific, where the calendar date changes: crossing it westward you add a day, eastward you subtract one."],
  ["(?:a )?map projections?", "A way of drawing the curved surface of Earth on a flat map. Every projection distorts something: area, shape, distance or direction."],
  ["(?:the )?mercator(?: projection| map)?", "A cylindrical map projection from 1569 that keeps directions and shapes true, so it is used for navigation, but stretches areas toward the poles: Greenland looks as big as Africa."],
  ["(?:the )?k(?:o|ö)ppen(?: climate)?(?: classification| system)?(?: of climates?)?", "A system that sorts the world's climates by temperature, precipitation and the vegetation they support into five main groups: A tropical, B dry, C temperate, D continental and E polar."],
  ["albedo", "How much sunlight a surface reflects, from 0 (absorbs all) to 1 (reflects all). Fresh snow and ice have a high albedo; oceans, forests and asphalt have a low one."],
  ["(?:the )?trade winds", "Steady winds that blow from the east toward the equator in the tropics, from about 30 degrees north and south, from the northeast in the Northern Hemisphere and the southeast in the Southern."],
  ["monsoons?", "A seasonal shift in wind direction that brings a very wet season and a dry season, as in South Asia, where summer winds blow in from the Indian Ocean."],
  ["moraines?", "A ridge or mound of till (rock debris) carried and deposited by a glacier: lateral moraines along its sides, medial where two glaciers meet, and terminal at its farthest point."],
  ["fold mountains?", "Mountains made where two plates collide at a convergent boundary and squeeze layers of rock into folds, like the Rockies, the Himalayas and the Alps."],
  ["flood ?plains?", "The wide, flat land beside a river that floods when the river overflows, built up from layers of fertile silt (alluvium) the floodwater leaves behind."],
  ["levees?", "A raised bank along a river. Natural levees build up as floodwater drops its coarsest sediment next to the channel; people also build them to hold floods back, as along the Fraser."],
  ["waterfalls?", "A place where a river drops over a steep step, often where hard rock lies over softer rock that erodes faster, so the fall slowly retreats upstream as a gorge."],
  ["(?:an )?ice ages?|glacial periods?", "A long cold period when ice sheets and glaciers spread over large parts of Earth. In the last one, which ended about 11,700 years ago, ice covered almost all of Canada."],
  ["karst(?: topography| landscape)?", "A landscape formed where rain and groundwater dissolve limestone, leaving sinkholes, caves, underground rivers and springs, as on northern Vancouver Island."],
  ["landslides?", "A sudden, fast movement of rock, soil and debris down a slope under gravity, often set off by heavy rain, earthquakes, or cutting into the slope."],
  ["temperate rain ?forests?(?: biome)?", "A cool, very wet forest biome on mid-latitude coasts, like BC's coast, with mild winters, heavy rain and huge, long-lived trees such as western red cedar, Douglas fir and Sitka spruce."],
  ["(?:snow )?avalanches?", "A mass of snow, ice and debris sliding fast down a mountain slope, often set off by new snow, warming, wind loading or people, a major hazard in BC's mountains."],
  ["el ni(?:n|ñ)o", "A warming of the surface water of the eastern tropical Pacific every few years that shifts weather worldwide, often giving BC a milder, drier winter."],
  ["la ni(?:n|ñ)a", "A cooling of the surface water of the eastern tropical Pacific, the opposite of El Niño, often giving BC a colder, snowier winter."],
];
const GEO_TERMS_RE = GEO_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
function geo12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble geography", source:"Nimble geography"});
  for(const [s, body] of GEO_FACTS) if(new RegExp(s).test(q)) return out(body);
  const tb = termAsk(q.replace(/ in (?:physical )?geography$/, ""), GEO_TERMS_RE, []); if(tb) return out(tb);
  let m;
  // map scale 1:N: real distance = map distance × N ("scale is 1:N" stays with Foundations 12)
  if((m = /\b1\s*:\s*(\d[\d,]*)\b/.exec(q)) && /\bmaps?\b|\bscale\b/.test(q) && !/\bscale (?:is |of )?1\s*:/.test(q)){
    const n = +m[1].replace(/,/g, ""), d = /(\d+(?:\.\d+)?)\s*(cm|centimet(?:re|er)s?|mm|millimet(?:re|er)s?)\b/.exec(q);
    if(d && n > 1){
      const cm = +d[1] * (/^m/.test(d[2]) ? 0.1 : 1), real = cm * n / 100, inM = /\bmet(?:re|er)s?\b/.test(q) && !/\bkilomet/.test(q);
      return out((inM ? pcNum(+real.toPrecision(6)) + " m" : pcNum(+(real / 1000).toPrecision(6)) + " km") + " (" + d[1] + " " + d[2].replace(/s$/, "") + " × " + pcNum(n) + " = " + pcNum(+(cm * n).toPrecision(6)) + " cm on the ground).");
    }
  }
  // time at another longitude: 15 degrees an hour, later to the east
  if((m = /\b(noon|midnight|\d{1,2}(?::\d\d)?\s*(?:am|pm)?)\b.*?\b(\d+(?:\.\d+)?) degrees?(?: of)?(?: longitude)?(?: (east|west|e|w))?\b.*?\b(\d+(?:\.\d+)?) degrees?(?: of)?(?: longitude)?(?: (east|west|e|w))?\b/.exec(q)) && /\btime\b/.test(q)){
    const t0 = m[1] === "noon" ? 12 : m[1] === "midnight" ? 0 : (([h, mm]) => (+h % 12) + (/pm/.test(m[1]) ? 12 : 0) + (+mm || 0) / 60)(m[1].replace(/\s*[ap]m/, "").split(":"));
    const lon = (d, s) => +d * (s && s[0] === "w" ? -1 : 1), dh = (lon(m[4], m[5]) - lon(m[2], m[3])) / 15;
    const t = ((t0 + dh) % 24 + 24) % 24, h = Math.floor(t), mi = Math.round((t - h) * 60), lab = (h % 12 || 12) + (mi ? ":" + String(mi).padStart(2, "0") : "") + (h < 12 ? " am" : " pm");
    return out(lab + " (" + pcNum(Math.abs(dh)) + " hour" + (Math.abs(dh) === 1 ? "" : "s") + (dh < 0 ? " earlier" : " later") + ": every 15 degrees of longitude is one hour, later to the east, earlier to the west).");
  }
  // river discharge Q = cross-sectional area × velocity
  if(/\bdischarge\b/.test(q) && (m = /(\d+(?:\.\d+)?)\s*(?:square met(?:re|er)s?|m2|m²|sq m)\b/.exec(q))){
    const v = /(\d+(?:\.\d+)?)\s*(?:m\/s|met(?:re|er)s? (?:per|a|each) second)\b/.exec(q);
    if(v) return out(pcNum(+(+m[1] * +v[1]).toPrecision(6)) + " m³/s (discharge = area × velocity = " + m[1] + " m² × " + v[1] + " m/s).");
  }
  return null;
}
// BC 20th Century World History 12: the world wars and the peace, revolutions in Russia and China, authoritarian
// states, the Cold War, decolonization, human rights and genocide. Facts and terms come from form A and the curriculum;
// form B stays held out.
const HIST_FACTS = [
  ["\\b(?:when|what year) did the berlin wall (?:fall|come down|open)\\b|\\bwhen was the berlin wall (?:torn down|opened|destroyed)\\b", "November 9, 1989, when East Germany opened its border crossings and crowds began tearing the wall down. Germany reunified on October 3, 1990."],
  ["\\bwhen did india (?:gain|get|win|become) (?:its )?independen", "August 15, 1947, when British rule ended and the subcontinent was partitioned into India and Pakistan."],
  ["\\b(?:main |long[- ]term |underlying )?causes? of (?:the )?(?:world war (?:1|one|i)|first world war|great war|ww1|wwi)\\b", "Historians sum them up as MAIN: militarism (an arms race, above all Britain and Germany's navies), alliances (the Triple Entente against the Triple Alliance), imperialism (rivalry for colonies) and nationalism (in the Balkans above all). The spark was the assassination of Archduke Franz Ferdinand in Sarajevo on June 28, 1914."],
  ["\\b(?:when|what year) did (?:the )?(?:soviet union|ussr) (?:collapse|fall|end|break up|dissolve)\\b|\\b(?:collapse|fall|end|breakup|dissolution) of the (?:soviet union|ussr)\\b", "December 1991. Gorbachev resigned on December 25, 1991 and the Soviet Union broke into 15 independent republics, ending the Cold War."],
  ["\\b(?:when|what year) did (?:the )?russian revolution\\b|\\bwhen was (?:the )?russian revolution\\b", "1917: the February Revolution ended the tsar's rule in March 1917 (February in the old calendar), and the Bolsheviks seized power in the October Revolution (November 1917)."],
];
const HIST_TERMS = [
  ["(?:the )?assassination of (?:archduke )?franz ferdinand|(?:archduke )?franz ferdinand(?:'s)? assassination|(?:archduke )?franz ferdinand", "The heir to the throne of Austria-Hungary. His assassination in Sarajevo on June 28, 1914 by Gavrilo Princip, a Bosnian Serb nationalist, set off the chain of declarations that began the First World War."],
  ["(?:the )?schlieffen plan", "Germany's plan to avoid a long two-front war: knock France out fast by sweeping through neutral Belgium, then turn east to fight Russia. It stalled at the Marne in 1914, and the invasion of Belgium brought Britain into the war."],
  ["(?:woodrow )?wilson'?s fourteen points|(?:the )?fourteen points|(?:the )?14 points", "US President Woodrow Wilson's 1918 plan for peace: open diplomacy, freedom of the seas, free trade, arms reduction, self-determination for the peoples of Europe's empires, and a League of Nations to keep the peace. Few points survived the Treaty of Versailles."],
  ["(?:the )?triple entente", "The alliance of Britain, France and Russia before and during the First World War, built from treaties in 1894, 1904 and 1907 to balance Germany."],
  ["(?:the )?triple alliance", "The 1882 alliance of Germany, Austria-Hungary and Italy. When war came in 1914 Italy stayed out, then joined the other side in 1915."],
  ["(?:the )?(?:first )?battle of the somme", "The British and French offensive on the Western Front from July to November 1916. Britain lost about 57,000 men on the first day alone, over a million soldiers on all sides were killed or wounded, and the line moved only about 10 km. Newfoundland's regiment was nearly wiped out at Beaumont-Hamel."],
  ["total war", "A war in which a country throws its whole society into the fight: the economy is turned to war production, civilians are rationed, conscripted and targeted, and propaganda shapes opinion, as in both world wars."],
  ["(?:the )?war guilt clause|article 231", "Article 231 of the Treaty of Versailles, which made Germany accept responsibility for causing the First World War and so for paying reparations. Germans bitterly resented it."],
  ["(?:the )?paris peace conference(?: of 1919)?", "The 1919 meeting of the war's winners in Paris, led by the Big Four (Wilson, Lloyd George, Clemenceau and Orlando), that wrote the peace treaties, above all the Treaty of Versailles with Germany, and founded the League of Nations. The losers were not invited to negotiate."],
  ["(?:the )?february revolution", "The March 1917 uprising in Petrograd (February in Russia's old calendar) of striking workers and mutinous soldiers that forced Tsar Nicholas II to abdicate and set up a Provisional Government, which the Bolsheviks overthrew in October."],
  ["(?:leon )?trotsky", "A Bolshevik leader who organized the October Revolution and built the Red Army in the civil war. He lost the power struggle to Stalin after Lenin's death, was exiled in 1929, and was murdered on Stalin's orders in Mexico in 1940."],
  ["war communism", "The Bolsheviks' economic policy during the Russian Civil War, 1918 to 1921: industry was nationalized, private trade banned and grain seized from peasants to feed the Red Army and cities. It caused famine and revolt and was replaced by the New Economic Policy."],
  ["(?:forced )?collectivi[sz]ation(?: of agriculture)?", "Stalin's policy from 1929 of forcing peasants to give up their land and animals and join large state-run collective farms. Resisting kulaks were shot or deported, and the chaos led to famines that killed millions, including the Holodomor in Ukraine."],
  ["(?:the )?march on rome", "The October 1922 march of Mussolini's Blackshirts on Rome, after which King Victor Emmanuel III made Mussolini prime minister, bringing the Fascists to power in Italy."],
  ["(?:the )?(?:beer hall|munich) putsch", "Hitler's failed attempt to seize power in Munich in November 1923. He was jailed for it and wrote Mein Kampf in prison."],
  ["(?:the )?enabling act(?: of 1933)?", "The March 1933 law that let Hitler's cabinet make laws without the Reichstag for four years, turning his government into a legal dictatorship."],
  ["(?:the )?(?:remilitari[sz]ation of the rhineland|rhineland remilitari[sz]ation|reoccupation of the rhineland)", "In March 1936 Hitler sent troops into the Rhineland, the German land by the French border that the Treaty of Versailles had made a demilitarized zone. Britain and France did nothing."],
  ["(?:the )?anschluss", "Nazi Germany's annexation of Austria in March 1938, which the Treaty of Versailles had forbidden."],
  ["(?:the )?(?:german )?invasion of poland", "Germany invaded Poland on September 1, 1939, and the Soviet Union from the east on September 17. Britain and France declared war on Germany on September 3, beginning the Second World War in Europe."],
  ["(?:the )?battle of britain", "The air battle over Britain from July to October 1940, when the Royal Air Force beat off the Luftwaffe, so Hitler called off his planned invasion. Churchill: \"Never was so much owed by so many to so few.\""],
  ["(?:the )?battle of midway", "The June 1942 naval battle in the Pacific in which the United States sank four Japanese aircraft carriers, the turning point of the Pacific war."],
  ["(?:the )?potsdam conference", "The July and August 1945 meeting of Truman, Stalin and Churchill (then Attlee) near Berlin that split Germany into four occupation zones, set its new borders and demanded Japan's unconditional surrender."],
  ["(?:the )?(?:us |american )?(?:policy of containment|containment policy)|containment (?:in|during) the cold war", "The US Cold War policy, set out by George Kennan in 1947, of stopping communism from spreading to new countries, through the Truman Doctrine, the Marshall Plan, NATO and the Korean and Vietnam wars."],
  ["(?:the )?long march", "The 1934 to 1935 retreat of China's Communists from the Nationalists, about 10,000 km across China. Only about a tenth of the marchers survived, and Mao Zedong emerged as their leader."],
  ["(?:the )?tiananmen square (?:protests?|massacre)(?: of 1989)?|(?:the )?1989 tiananmen square protests?", "The spring 1989 protests in Beijing, led by students, calling for democracy and free speech, crushed by the army on June 3 and 4, 1989, killing hundreds or more."],
  ["(?:the )?khmer rouge", "The communist movement led by Pol Pot that ruled Cambodia from 1975 to 1979, emptied the cities into forced labour camps and killed about 1.5 to 2 million people, about a quarter of the population, in the Cambodian genocide."],
  ["perestroika", "\"Restructuring\": Mikhail Gorbachev's reforms from 1986 to revive the Soviet economy by loosening central planning and allowing some private business."],
  ["(?:the )?bolsheviks?", "The radical wing of Russia's Marxist party, led by Vladimir Lenin, which seized power in the October Revolution of 1917, won the civil war and became the Communist Party of the Soviet Union."],
  ["(?:the )?mensheviks?", "The moderate wing of Russia's Marxist party, which split from the Bolsheviks in 1903 and lost out to them after 1917."],
  ["(?:the )?new economic policy|(?:the )?nep", "Lenin's 1921 retreat from full state control after the civil war: peasants could sell surplus grain and small businesses could trade privately for profit, while the state kept heavy industry, banks and foreign trade. Stalin ended it in 1928."],
  ["(?:stalin'?s )?five[- ]year plans?", "Stalin's state plans, starting in 1928, to industrialize the Soviet Union fast, with targets for coal, steel, oil and electricity, paired with the forced collectivization of farms. Output rose sharply at a huge human cost."],
  ["(?:the )?weimar republic", "Germany's democratic republic from 1919 to 1933, named for the town where its constitution was written. It was weakened by the Treaty of Versailles, hyperinflation in 1923 and the Depression, and ended when Hitler took power."],
  ["(?:german )?hyperinflation(?: in germany)?|(?:the )?(?:german )?hyperinflation of 1923", "In 1923 German money became nearly worthless: the government printed money to pay reparations and striking workers after France occupied the Ruhr, and prices doubled every few days, until a loaf of bread cost billions of marks. Savings were wiped out."],
  ["(?:the )?munich (?:agreement|pact|conference)", "The September 1938 deal in which Britain (Chamberlain) and France let Hitler take the Sudetenland from Czechoslovakia in exchange for a promise of no more demands. It is the classic example of appeasement; Germany took the rest of Czechoslovakia in March 1939."],
  ["appeasement", "The 1930s policy, led by British Prime Minister Neville Chamberlain, of giving in to Hitler's demands to avoid another war, culminating in the Munich Agreement of 1938. It ended when Germany invaded Poland in 1939."],
  ["(?:the )?(?:nazi[- ]soviet|molotov[- ]ribbentrop|german[- ]soviet) (?:non[- ]aggression )?pact", "The August 1939 non-aggression pact between Hitler's Germany and Stalin's Soviet Union, with a secret deal to divide Poland and Eastern Europe. It freed Hitler to invade Poland a week later."],
  ["blitzkrieg", "\"Lightning war\": Germany's way of fighting early in the Second World War, using fast tanks, motorized infantry and dive-bombers together to break through and encircle the enemy before it could react."],
  ["(?:operation )?barbarossa", "Germany's invasion of the Soviet Union on June 22, 1941, the largest invasion in history. It stalled outside Moscow in the winter of 1941 and opened the war's deadliest front."],
  ["(?:the )?(?:attack on |bombing of )?pearl harbou?r(?: attack)?", "Japan's surprise attack on the US naval base at Pearl Harbor, Hawaii, on December 7, 1941, which brought the United States into the Second World War."],
  ["(?:the )?truman doctrine", "President Truman's 1947 promise of US support for free peoples resisting communism, starting with aid to Greece and Turkey. It began the policy of containment."],
  ["(?:the )?berlin (?:airlift|blockade)", "When the Soviets blockaded West Berlin's roads and railways in June 1948, the Western Allies flew in food and fuel for almost a year, over 275,000 flights, until Stalin lifted the blockade in May 1949."],
  ["glasnost", "\"Openness\": Mikhail Gorbachev's policy from 1986 of allowing more free speech, a freer press and open criticism of the Soviet past and government."],
  ["(?:the )?july crisis(?: of 1914)?", "The weeks after Franz Ferdinand's assassination in 1914: Austria-Hungary, backed by Germany's \"blank cheque\", sent Serbia an ultimatum and declared war on July 28; Russia mobilized, Germany declared war on Russia and France and invaded Belgium, and Britain joined on August 4."],
  ["(?:the )?battle of verdun", "The longest battle of the First World War, February to December 1916, a German attack meant to \"bleed France white\" at the fortress city of Verdun. France held, but about 700,000 men on both sides were killed or wounded."],
  ["(?:the )?(?:battle of )?passchendaele|(?:the )?third battle of ypres", "The British offensive near Ypres, Belgium, from July to November 1917, fought in deep mud. Canadian troops under Arthur Currie took the ridge and village of Passchendaele in November, with about 16,000 Canadian casualties."],
  ["(?:the )?(?:gallipoli|dardanelles) campaign|(?:the )?battle of gallipoli|gallipoli", "The failed 1915 Allied attempt, pushed by Churchill, to force the Dardanelles and knock the Ottoman Empire out of the war. Landings by British, French, Australian and New Zealand (ANZAC) troops stalled, and they withdrew in January 1916."],
  ["(?:german )?unrestricted submarine warfare", "Germany's policy of sinking any ship, even neutral merchant ships, in the waters around Britain without warning, using U-boats. The sinking of the Lusitania in 1915 and its return in 1917 helped bring the United States into the First World War."],
  ["(?:the )?zimmermann (?:telegram|note)", "A secret January 1917 German message, intercepted by Britain, proposing that Mexico join Germany against the United States in return for Texas, New Mexico and Arizona. It helped push the US into the war in April 1917."],
  ["(?:the )?armistice(?: of (?:1918|compi(?:e|è)gne))?", "The ceasefire that ended the fighting of the First World War at 11 am on November 11, 1918, signed by Germany and the Allies in a railway carriage at Compiègne, France. It is marked as Remembrance Day."],
  ["(?:war )?reparations", "Payments a defeated country makes for war damage. The Treaty of Versailles made Germany pay them, set in 1921 at 132 billion gold marks, which fed German resentment and the economic crisis of 1923."],
  ["(?:the )?october revolution|(?:the )?bolshevik revolution", "The Bolshevik seizure of power in Petrograd led by Lenin and Trotsky on October 25, 1917 (November 7 in the modern calendar), overthrowing the Provisional Government."],
  ["(?:tsar )?nicholas ii", "The last tsar of Russia, from 1894 to 1917. Defeats in the First World War and shortages at home led to his abdication in the February Revolution, and the Bolsheviks shot him and his family in 1918."],
  ["(?:the )?kulaks?", "Better-off peasants in Russia who owned land and hired labour. Stalin called them class enemies during collectivization, and millions were shot, deported to the gulag or left to starve."],
  ["(?:the )?gulags?", "The Soviet system of forced-labour camps, mostly in Siberia and the far north, where millions of prisoners, many of them political, worked in brutal conditions under Stalin."],
  ["(?:the )?reichstag fire", "The burning of the German parliament building in February 1933, blamed on a Dutch communist. Hitler used it to suspend civil rights by emergency decree and arrest communists, weeks before the Enabling Act."],
  ["(?:the )?night of the long knives", "The June 30, 1934 purge in which Hitler had the SS kill Ernst Röhm and other leaders of the SA (stormtroopers) along with political rivals, securing the army's support."],
  ["(?:the )?abyssinian crisis|(?:the )?(?:italian )?invasion of (?:abyssinia|ethiopia)", "Mussolini's 1935 invasion of Abyssinia (Ethiopia). The League of Nations' weak sanctions failed to stop it, showing the League could not stop aggression by a major power."],
  ["(?:the )?(?:rape of nanking|nanjing massacre|nanking massacre)", "The mass killing and rape of Chinese civilians and prisoners by Japanese troops after they took Nanjing (Nanking) in December 1937; estimates of the dead run up to 300,000."],
  ["(?:the )?(?:evacuation of )?dunkirk(?: evacuation)?|operation dynamo", "The May and June 1940 rescue of about 338,000 trapped British and French soldiers from the beaches of Dunkirk, France, by warships and hundreds of small civilian boats."],
  ["vichy (?:france|regime|government)", "The French government from 1940 to 1944, based in Vichy and led by Marshal Pétain, which collaborated with Nazi Germany after France's defeat, including in deporting Jews."],
  ["(?:the )?final solution", "The Nazi plan, set out at the Wannsee Conference in January 1942, to murder all the Jews of Europe, carried out in death camps such as Auschwitz and Treblinka."],
  ["auschwitz(?:-birkenau)?", "The largest Nazi concentration and extermination camp, in occupied Poland, where about 1.1 million people, about a million of them Jews, were murdered. Soviet troops freed it on January 27, 1945."],
  ["(?:the )?battle of the bulge|(?:the )?ardennes offensive", "Germany's last major offensive on the Western Front, a surprise attack through the Ardennes in December 1944 that made a \"bulge\" in the American lines before it was pushed back by January 1945."],
  ["(?:the )?domino theory", "The Cold War belief, stated by Eisenhower in 1954, that if one country fell to communism its neighbours would fall one after another like dominoes. It was used to justify the Vietnam War."],
  ["mutually? assured destruction", "The Cold War idea that neither superpower would start a nuclear war because both would be destroyed: each side kept enough weapons to strike back after an attack."],
  ["d(?:e|é)tente", "The easing of Cold War tensions between the superpowers in the late 1960s and 1970s, with arms control (SALT I in 1972), trade and the Helsinki Accords of 1975. It ended with the Soviet invasion of Afghanistan in 1979."],
  ["(?:the )?tet offensive", "The surprise attack by North Vietnamese and Viet Cong forces on cities across South Vietnam in January 1968. It failed militarily but turned American opinion against the Vietnam War."],
  ["(?:the )?soviet(?:-afghan war| invasion of afghanistan| war in afghanistan)", "The Soviet Union invaded Afghanistan in December 1979 to prop up its communist government and fought US-backed mujahideen guerrillas until it withdrew in 1989, a costly defeat that helped weaken the USSR."],
  ["(?:the )?solidarity (?:movement|trade union|union)(?: in poland)?|(?:the )?solidarity in poland|(?:the )?polish solidarity(?: movement)?|solidarno(?:s|ś)(?:c|ć)", "The independent trade union founded in 1980 at the Gdańsk shipyard in Poland, led by Lech Wałęsa. It grew into a mass movement against communist rule and won Poland's 1989 election."],
  ["(?:the )?people'?s republic of china|(?:the )?prc", "The communist state founded by Mao Zedong on October 1, 1949, after the Communists won the Chinese Civil War and the Nationalists fled to Taiwan."],
  ["(?:the )?hundred flowers (?:campaign|movement)", "Mao's 1956 to 1957 invitation for intellectuals to criticize the Communist Party (\"let a hundred flowers bloom\"). When criticism poured in, it was followed by the Anti-Rightist Campaign, which punished hundreds of thousands of critics."],
  ["(?:the )?salt march|(?:the )?dandi march|(?:the )?salt satyagraha", "Gandhi's 1930 walk of about 390 km to the sea at Dandi to make salt in defiance of the British salt tax, a famous act of non-violent civil disobedience against British rule."],
  ["(?:the )?(?:fall|collapse) of communism(?: in eastern europe)?|(?:the )?revolutions of 1989", "In 1989 communist governments across Eastern Europe fell, mostly peacefully: Poland's Solidarity won elections, Hungary opened its border, the Berlin Wall fell on November 9, and Czechoslovakia's Velvet Revolution and Romania's revolt followed. Gorbachev did not send in troops."],
  ["trench warfare", "Fighting from long lines of dug-in trenches, protected by barbed wire and machine guns, that marked the Western Front of the First World War from late 1914 to 1918. Attacks across no man's land cost huge numbers of lives for little ground."],
  ["(?:the )?treaty of versailles", "The 1919 peace treaty between the Allies and Germany that ended the First World War. Germany lost territory and its colonies, had its army cut to 100,000 men, had to accept blame for the war (the war guilt clause) and pay reparations. Its harsh terms fed German resentment that Hitler exploited."],
  ["(?:the )?league of nations", "The international organization set up in 1920 by the Paris Peace Conference, Woodrow Wilson's idea, to keep the peace through collective security. The United States never joined, and it failed to stop Japan, Italy and Germany in the 1930s. The United Nations replaced it in 1945."],
  ["(?:vladimir )?lenin", "The leader of the Bolsheviks, who led the October Revolution of 1917, founded the Soviet state, won the civil war and brought in the New Economic Policy. He died in 1924."],
  ["(?:joseph )?stalin", "The dictator of the Soviet Union from the late 1920s until his death in 1953. He forced through five-year plans and collectivization, killed or imprisoned millions in the purges and the gulag, led the USSR to victory in the Second World War, and took control of Eastern Europe."],
  ["(?:the )?holodomor", "The man-made famine in Soviet Ukraine in 1932 and 1933, caused by Stalin's collectivization and grain seizures, that killed about 3.5 to 5 million Ukrainians. Canada recognizes it as a genocide."],
  ["fascism", "A far-right, authoritarian movement of extreme nationalism under a single all-powerful leader, with one party, no free press or opposition, and glorification of the state and war. Mussolini founded it in Italy in 1919; Nazism was the German form."],
  ["(?:benito )?mussolini", "The founder of fascism, who ruled Italy as dictator (Il Duce) from 1922, invaded Ethiopia in 1935 and allied with Hitler. He was overthrown in 1943 and shot by Italian partisans in 1945."],
  ["(?:the )?battle of stalingrad", "The battle for the Soviet city of Stalingrad from August 1942 to February 1943, which ended with a German army of about 300,000 surrounded and destroyed. It was the turning point on the Eastern Front, with nearly two million casualties."],
  ["(?:the )?manhattan project", "The secret American project, with British and Canadian help, that built the first atomic bombs, led by J. Robert Oppenheimer at Los Alamos. The first test was in July 1945, and the bombs were dropped on Hiroshima and Nagasaki."],
  ["(?:the )?yalta conference", "The February 1945 meeting of Roosevelt, Churchill and Stalin in Crimea that planned the defeat and division of Germany, agreed on free elections in Eastern Europe (which Stalin did not keep) and on founding the United Nations."],
  ["(?:the )?warsaw pact", "The military alliance of the Soviet Union and its Eastern European satellite states, formed in 1955 as an answer to NATO. It was used to crush the Prague Spring in 1968 and dissolved in 1991."],
  ["mao(?: zedong| tse-tung)?|chairman mao", "The leader of the Chinese Communist Party who won the civil war and founded the People's Republic of China in 1949, then ruled it until his death in 1976. His Great Leap Forward and Cultural Revolution caused tens of millions of deaths."],
  ["(?:the )?great leap forward", "Mao's 1958 to 1962 campaign to industrialize China fast through huge communes and backyard steel furnaces. Farming collapsed and the famine that followed killed an estimated 15 to 45 million people."],
  ["(?:the )?(?:great proletarian )?cultural revolution", "Mao's 1966 to 1976 campaign to purge China of \"capitalist\" and traditional elements. Young Red Guards attacked teachers, officials and temples, millions were persecuted and between hundreds of thousands and millions died."],
  ["(?:mahatma |mohandas )?gandhi", "The leader of India's independence movement against British rule, who used non-violent civil disobedience such as the Salt March of 1930. India won independence in 1947, and he was assassinated in 1948."],
  ["decoloni[sz]ation", "The process by which colonies won independence from European empires, above all after 1945: India and Pakistan in 1947, most of Africa from the late 1950s to the 1970s, some peacefully and some through wars such as in Algeria and Vietnam."],
  ["apartheid", "South Africa's system of legal racial segregation and white minority rule from 1948 to the early 1990s. Black South Africans were denied the vote and forced into separate areas. It ended with the 1994 election that made Nelson Mandela president."],
  ["(?:nelson )?mandela", "The anti-apartheid leader of the African National Congress who spent 27 years in prison, was freed in 1990, shared the Nobel Peace Prize in 1993 and became South Africa's first Black president in 1994."],
  ["(?:the )?(?:rwandan|rwanda) genocide|(?:the )?genocide in rwanda|(?:the )?genocide against the tutsi", "The 1994 mass killing in Rwanda in which Hutu extremists murdered about 800,000 Tutsi and moderate Hutu in about 100 days. Canadian general Roméo Dallaire led the small UN force that the world refused to reinforce."],
  ["(?:the )?russian civil war", "The 1917 to 1922 war after the October Revolution between the Bolsheviks' Red Army, led by Trotsky, and the anti-communist Whites, who had foreign help. The Reds won and founded the Soviet Union in 1922."],
  ["(?:the )?great (?:purge|terror)|(?:stalin'?s )?purges", "Stalin's campaign of terror from 1936 to 1938: show trials of old Bolsheviks, purges of the army and party, and about 700,000 executions, with more sent to the gulag."],
  ["totalitarianism", "A system in which one party and leader control every part of life, the government, economy, media, education and even private thought, through propaganda, secret police and terror, as in Stalin's Soviet Union and Hitler's Germany."],
  ["(?:the )?(?:atomic )?bombings? of hiroshima(?: and nagasaki)?|hiroshima", "The Japanese city destroyed by the first atomic bomb used in war, dropped by the United States on August 6, 1945, killing about 70,000 to 140,000 people. A second bomb hit Nagasaki on August 9, and Japan surrendered on August 15."],
  ["(?:the )?berlin wall", "The wall East Germany built in 1961 to stop its people fleeing to West Berlin, the symbol of the Cold War's divided Europe. It fell on November 9, 1989."],
  ["(?:the )?chinese civil war", "The war between Chiang Kai-shek's Nationalists (the Kuomintang) and Mao Zedong's Communists, from 1927 to 1949 with a pause to fight Japan. The Communists won in 1949, and the Nationalists fled to Taiwan."],
  ["chiang kai[- ]shek", "The leader of China's Nationalists (the Kuomintang) who fought the Communists and Japan, lost the civil war in 1949 and ruled the Republic of China on Taiwan until his death in 1975."],
  ["(?:the )?partition of india", "The 1947 division of British India into Hindu-majority India and Muslim-majority Pakistan (with East Pakistan, later Bangladesh). About 15 million people were uprooted and up to a million or more died in the violence."],
  ["(?:the )?universal declaration of human rights|(?:the )?udhr", "The statement of basic rights and freedoms for everyone, adopted by the United Nations on December 10, 1948. Canadian John Humphrey wrote its first draft, and Eleanor Roosevelt led the committee."],
  ["(?:dr\.? )?martin luther king(?: jr\.?)?|mlk", "The American Baptist minister who led the civil rights movement with non-violent protest, from the Montgomery bus boycott in 1955 to the March on Washington in 1963 and his \"I Have a Dream\" speech. He won the Nobel Peace Prize in 1964 and was assassinated in 1968."],
  ["(?:mikhail )?gorbachev", "The last leader of the Soviet Union, from 1985 to 1991, whose reforms of glasnost and perestroika, and refusal to use force in Eastern Europe in 1989, helped end the Cold War. He won the Nobel Peace Prize in 1990."],
  ["(?:the )?algerian war(?: of independence)?", "Algeria's 1954 to 1962 war of independence against France, fought by the National Liberation Front (FLN), with brutality and torture on both sides. Algeria became independent in 1962."],
  ["(?:the )?scramble for africa", "The rush by European powers to seize and divide almost all of Africa between about 1881 and 1914, with rules set at the Berlin Conference of 1884 to 1885. By 1914 only Ethiopia and Liberia were independent."],
  ["(?:the )?treaty of brest[- ]litovsk", "The March 1918 treaty in which Lenin's Russia left the First World War, giving up Poland, the Baltic states, Ukraine and Finland to Germany and its allies."],
  ["(?:the )?spanish flu|(?:the )?1918 (?:flu|influenza)(?: pandemic)?", "The influenza pandemic of 1918 to 1920, which killed about 50 million people worldwide, more than the First World War."],
  ["(?:the )?armenian genocide", "The killing of about 1.5 million Armenians by the Ottoman government from 1915, through massacres and death marches into the Syrian desert."],
  ["(?:the )?spanish civil war", "The 1936 to 1939 war between Spain's elected Republican government and Franco's Nationalists, who were backed by Hitler and Mussolini. Franco won and ruled as dictator until 1975."],
  ["(?:the )?nuremberg laws", "The 1935 Nazi laws that stripped German Jews of citizenship and banned marriage between Jews and other Germans."],
  ["kristallnacht|(?:the )?night of broken glass", "The pogrom of November 9 and 10, 1938, when Nazis burned synagogues, smashed Jewish shops and homes, killed about 90 Jews and sent 30,000 Jewish men to concentration camps."],
  ["(?:the )?nuremberg trials", "The 1945 to 1946 trials of leading Nazis by the Allies for war crimes, crimes against peace and crimes against humanity, which set the principle that following orders is no defence."],
  ["(?:the )?suez crisis", "In 1956 Britain, France and Israel invaded Egypt after Nasser nationalized the Suez Canal; US and Soviet pressure forced them out. Canada's Lester Pearson won the Nobel Peace Prize for proposing the first UN peacekeeping force to end it."],
  ["(?:the )?cuban revolution", "The 1953 to 1959 revolt in which Fidel Castro and Che Guevara overthrew the dictator Batista and set up a communist state allied with the Soviet Union."],
  ["(?:the )?bay of pigs(?: invasion)?", "The failed April 1961 invasion of Cuba by CIA-trained Cuban exiles trying to overthrow Castro, which pushed Cuba closer to the Soviet Union."],
  ["(?:the )?space race", "The Cold War contest between the Soviet Union and the United States in spaceflight, from Sputnik in 1957 and Gagarin in 1961 to the American Moon landing in 1969."],
  ["sputnik(?: 1)?", "The first artificial satellite, launched by the Soviet Union on October 4, 1957, which started the space race."],
  ["(?:the )?hungarian revolution(?: of 1956)?", "The 1956 uprising in Hungary against Soviet control, crushed by Soviet tanks within weeks."],
  ["(?:the )?prague spring", "Czechoslovakia's 1968 reforms under Alexander Dubček toward \"socialism with a human face\", ended by a Warsaw Pact invasion in August 1968."],
  ["(?:the )?iranian revolution|(?:the )?(?:1979 )?islamic revolution", "The 1979 revolution in which the Shah of Iran was overthrown and Ayatollah Khomeini set up an Islamic republic."],
  ["(?:the )?srebrenica (?:massacre|genocide)", "The July 1995 killing of about 8,000 Bosniak Muslim men and boys by Bosnian Serb forces at Srebrenica, during the Bosnian War."],
  ["ho chi minh", "The Vietnamese communist leader who led the fight for independence from France, declared Vietnam independent in 1945 and led North Vietnam until his death in 1969."],
];
const HIST_TERMS_RE = HIST_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
function hist12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble history", source:"Nimble history"});
  for(const [s, body] of HIST_FACTS) if(new RegExp(s).test(q)) return out(body);
  const tb = termAsk(q.replace(/^(?:who|what) (?:was|were|is|are) /, "").replace(/ in (?:history|world history)$/, ""), HIST_TERMS_RE, []); return tb ? out(tb) : null;
}
// BC Law Studies 12: foundations of law, the Charter, criminal law and procedure, youth justice, torts, contracts and
// Indigenous rights. Facts and terms come from form A and the curriculum; form B stays held out.
const LAW_FACTS = [
  ["\\bequality rights\\b", "Section 15 of the Charter: every individual is equal before and under the law and has the right to equal protection and benefit of the law without discrimination, in particular based on race, national or ethnic origin, colour, religion, sex, age or mental or physical disability. Courts have added grounds such as sexual orientation. Section 15(2) allows affirmative action programs."],
  ["\\bmobility rights\\b", "Section 6 of the Charter: every citizen has the right to enter, remain in and leave Canada, and every citizen and permanent resident can move to and take up residence and work in any province."],
  ["\\bdemocratic rights\\b", "Sections 3 to 5 of the Charter: every citizen has the right to vote and run in federal and provincial elections, no government can sit more than five years without an election except in war or emergency, and Parliament and legislatures must sit at least once a year."],
  ["\\bage of (?:sexual )?consent\\b", "16 in Canada, under the Criminal Code. There are close-in-age exceptions (a 14 or 15 year old with a partner less than five years older; a 12 or 13 year old with a partner less than two years older), and it is 18 where there is a relationship of trust, authority or dependency."],
  ["\\bdisclosure\\b.*\\b(?:criminal|crown|trial|case|accused)\\b", "The Crown's duty to give the defence all relevant evidence it has, whether it helps or hurts the accused, so the accused can make full answer and defence. The Supreme Court set this out in R v Stinchcombe (1991)."],
  ["\\bbattery\\b.*\\b(?:tort|law|legal|civil)\\b", "An intentional tort of harmful or offensive physical contact with another person without their consent, such as a punch or an unwanted touch. Assault, in tort, is the threat that makes someone expect it."],
  ["\\btreat(?:y|ies)\\b.*\\b(?:canadian law|in canada|first nations|indigenous|aboriginal|the crown)\\b", "A formal agreement between the Crown and Indigenous nations setting out rights to land, resources and self-government. Historic treaties include the Numbered Treaties (1871 to 1921) and the Douglas Treaties on Vancouver Island; modern treaties include the Nisga'a Final Agreement (2000). Section 35 of the Constitution protects treaty rights."],
  ["\\bcommon[- ]law (?:relationship|partners?|spouses?|marriage|couples?)\\b", "In BC, two people who have lived together in a marriage-like relationship for at least two years are spouses under the Family Law Act, with the same rights to divide property and claim spousal support as married couples (less than two years with a child counts for support)."],
  ["^a (?:last )?will(?: and testament)?$|^(?:a |the )?last will(?: and testament)?$", "A legal document in which a person (the will-maker or testator) says who gets their property and who manages their estate after they die. In BC it must be in writing, signed by the will-maker and two witnesses at the same time, under the Wills, Estates and Succession Act."],
  ["\\bfundamental freedoms\\b", "Section 2 of the Charter: freedom of conscience and religion; freedom of thought, belief, opinion and expression, including freedom of the press; freedom of peaceful assembly; and freedom of association."],
  ["\\blegal rights\\b.*\\bcharter\\b|\\bcharter\\b.*\\blegal rights\\b", "Sections 7 to 14 of the Charter: the right to life, liberty and security of the person (7), to be secure against unreasonable search or seizure (8), not to be arbitrarily detained (9), to be told the reason for arrest and to get a lawyer (10), to a fair and public trial within a reasonable time and the presumption of innocence (11), against cruel and unusual punishment (12), against self-incrimination (13) and to an interpreter (14)."],
  ["\\bmurder\\b.*\\bmanslaughter\\b|\\bmanslaughter\\b.*\\bmurder\\b", "Both are unlawful killings. Murder needs intent: the accused meant to kill, or meant to cause harm they knew was likely to kill. Manslaughter is an unlawful killing without that intent, such as from an unlawful act or criminal negligence, or murder reduced by provocation. Murder carries a mandatory life sentence; manslaughter has no minimum, except with a firearm."],
  ["\\bminors?\\b.*\\bcontracts?\\b|\\bcontracts?\\b.*\\bminors?\\b", "In BC a minor is anyone under 19. Under the Infants Act most contracts with a minor cannot be enforced against them, though the minor can enforce them, and contracts for necessaries such as food, clothing and shelter must be paid at a reasonable price."],
  ["\\bsmall claims\\b", "BC's Provincial Court Small Claims handles civil claims from $5,001 to $35,000, with simpler rules so people can act without a lawyer. Claims of $5,000 or less go to the online Civil Resolution Tribunal."],
  ["\\b(?:minimum |youngest )?age\\b.*\\b(?:charged|criminally responsible|criminal responsibility|prosecuted)\\b|\\bage of criminal responsibility\\b", "12. Under the Criminal Code no one under 12 can be convicted of an offence, and 12 to 17 year olds are dealt with under the Youth Criminal Justice Act."],
  ["\\bhow many (?:people|jurors|members|persons)\\b.*\\bjury\\b|\\bjury\\b.*\\bhow many (?:people|jurors|members)\\b", "12 on a criminal jury in Canada, and the verdict must be unanimous. A civil jury in BC has 8 jurors."],
  ["\\bage of majority\\b", "19 in British Columbia (and in Nova Scotia, New Brunswick, Newfoundland and Labrador and the territories); 18 in Alberta, Saskatchewan, Manitoba, Ontario, Quebec and PEI. At that age you can sign binding contracts and are an adult in law."],
  ["\\bpublic (?:and|vs\\.?|versus) private law\\b|\\bprivate (?:and|vs\\.?|versus) public law\\b", "Public law governs the relationship between people and the government, and between parts of government: constitutional, criminal and administrative law. Private (civil) law governs relationships between individuals and organizations: contracts, torts, property and family law."],
  ["\\b(?:elements|requirements|parts|essentials) of (?:a |an )?(?:valid |legal |binding )?contract\\b", "Offer, acceptance, consideration (something of value given by each side), capacity (both parties are legally able, such as adults of sound mind), legality of purpose, and intention to create legal relations."],
  ["\\bconsideration\\b.*\\bcontract\\b|\\bcontract\\b.*\\bconsideration\\b", "Something of value each party gives or promises in exchange for the other's promise, such as money, goods, services or a promise to do or not do something. Without it, a promise is a gift, not a contract."],
  ["\\bsection 1 of (?:the )?charter\\b|\\bcharter section 1\\b|\\breasonable limits clause\\b", "The reasonable limits clause: the Charter's rights and freedoms are guaranteed subject only to \"such reasonable limits prescribed by law as can be demonstrably justified in a free and democratic society.\" Courts test limits with the Oakes test."],
  ["\\bsection 35\\b.*\\bconstitution\\b|\\bconstitution\\b.*\\bsection 35\\b", "Section 35 of the Constitution Act, 1982 recognizes and affirms the existing Aboriginal and treaty rights of the Aboriginal peoples of Canada, the First Nations, Inuit and Métis."],
  ["\\b(?:defen[cs]e of )?self[- ]defen[cs]e\\b.*\\b(?:criminal|law|code)\\b|\\bdefen[cs]e of self[- ]defen[cs]e\\b", "Section 34 of the Criminal Code: a person is not guilty if they reasonably believed force or a threat of force was being used against them or someone else, acted to defend or protect themselves, and what they did was reasonable in the circumstances."],
];
const LAW_TERMS = [
  ["(?:the )?rule of law", "The principle that everyone, including the government and its officials, is subject to the law and equal before it, and that laws must be public, clear and applied fairly by independent courts."],
  ["common law", "Law made by judges through their decisions in court cases, which become precedents later courts follow (stare decisis). Canada outside Quebec uses common law, inherited from England."],
  ["statute law|statutes?|statutory law", "Written law passed by Parliament or a provincial legislature, such as the Criminal Code or the BC Motor Vehicle Act. Where a statute and common law conflict, the statute wins."],
  ["stare decisis", "Latin for \"to stand by things decided\": courts follow precedent, the earlier decisions of higher courts on the same legal question, so the law is predictable."],
  ["actus reus", "The \"guilty act\": the physical part of a crime, the act or failure to act (omission) that the law forbids. With mens rea, it must be proven for most crimes."],
  ["mens rea", "The \"guilty mind\": the mental part of a crime, such as intent, knowledge or recklessness. The Crown must prove it along with the actus reus for most crimes."],
  ["(?:a )?summary(?: conviction)? offen[cs]es?", "A less serious crime, such as causing a disturbance, tried quickly in provincial court without a jury or preliminary inquiry. The usual maximum is two years less a day and a $5,000 fine."],
  ["(?:an )?indictable offen[cs]es?", "A serious crime, such as murder, robbery or sexual assault, with heavier penalties up to life in prison. The accused may get a preliminary inquiry and, for many offences, a choice of judge alone or judge and jury."],
  ["(?:the )?presumption of innocence", "The rule, in section 11(d) of the Charter, that an accused person is innocent until proven guilty beyond a reasonable doubt by the Crown."],
  ["(?:proof )?beyond (?:a )?reasonable doubt", "The standard of proof in a criminal trial: the judge or jury must be sure the accused committed the offence, more than just probably guilty, though absolute certainty is not needed. The Crown carries this burden."],
  ["(?:the )?burden of proof|onus of proof", "The duty to prove the case. In a criminal trial it is on the Crown, beyond a reasonable doubt; in a civil case it is on the plaintiff, on a balance of probabilities."],
  ["(?:the )?(?:crown|crown prosecutor|crown counsel|prosecutor|prosecution)", "The lawyer who prosecutes criminal cases on behalf of the state (the Crown), presenting the evidence against the accused. In BC it is the BC Prosecution Service."],
  ["bail|(?:a )?judicial interim release", "Release of an accused person from custody while they await trial, sometimes with conditions or a cash deposit. Under the Charter (section 11(e)) an accused has the right not to be denied reasonable bail without just cause."],
  ["(?:a )?plea (?:bargain|bargaining|agreement|deal)", "A deal between the Crown and the defence in which the accused pleads guilty, usually in return for a lesser charge or a lighter recommended sentence, saving the cost of a trial."],
  ["(?:the )?youth criminal justice act|(?:the )?ycja", "The 2003 federal law for young people aged 12 to 17 who break the law. It stresses rehabilitation and reintegration, uses police warnings and community programs instead of court where it can, protects the youth's identity, and keeps custody for violent and repeat offences."],
  ["(?:the )?defen[cs]e of duress|duress", "A defence for someone who committed an offence because they were threatened with death or serious harm and had no safe way out. It does not cover murder and some other serious crimes."],
  ["(?:the )?defen[cs]e of necessity", "A defence for breaking the law in an urgent emergency, to avoid imminent danger, when there was no reasonable legal alternative and the harm done was less than the harm avoided."],
  ["(?:a )?jury|juries", "A group of citizens chosen at random who hear the evidence in a trial and decide the facts and the verdict. A criminal jury in Canada has 12 members and must be unanimous."],
  ["(?:a )?torts?", "A civil wrong, other than a breached contract, that causes harm to a person or their property, for which the victim can sue for damages. Examples: negligence, trespass, defamation, assault and battery."],
  ["negligence", "A tort in which someone fails to take the care a reasonable person would, causing foreseeable harm. The plaintiff must prove a duty of care, a breach of the standard of care, causation and actual damage."],
  ["(?:a )?duty of care", "A legal obligation to take reasonable care not to cause foreseeable harm to others, such as a driver's duty to other road users. It is the first thing to prove in negligence, tested since Donoghue v Stevenson by the neighbour principle."],
  ["defamation|libel|slander", "A tort of making a false statement that harms someone's reputation. Written or broadcast defamation is libel; spoken defamation is slander. Truth (justification) and fair comment are defences."],
  ["(?:a )?contracts?", "A legally binding agreement between two or more parties that the courts will enforce, made up of an offer, acceptance and consideration between parties with capacity, for a legal purpose."],
  ["(?:the )?balance of probabilities", "The standard of proof in civil cases: the plaintiff wins if their version is more likely than not true (over 50 percent), a lower bar than beyond a reasonable doubt."],
  ["(?:a )?plaintiffs?|(?:a )?claimants?", "The person or organization who starts a civil lawsuit, suing the defendant for a remedy such as damages."],
  ["(?:the )?(?:bc |british columbia )?human rights code", "BC's law against discrimination in employment, housing, services and membership, on grounds such as race, sex, religion, disability, sexual orientation, gender identity and age. Complaints go to the BC Human Rights Tribunal."],
  ["aboriginal title|indigenous title", "The inherent right of Indigenous peoples to their ancestral lands, including the right to use and control them. The Supreme Court first declared title to specific land in Tsilhqot'in Nation v British Columbia in 2014."],
  ["(?:an )?appeals?", "Asking a higher court to review a lower court's decision for an error of law or, sometimes, fact. In BC appeals go to the BC Court of Appeal and then, with permission, to the Supreme Court of Canada."],
  ["(?:the )?supreme court of canada", "Canada's highest court and final court of appeal, in Ottawa, with nine judges, three of them from Quebec. It hears about 40 to 80 cases a year, chosen for national importance."],
  ["(?:the )?notwithstanding clause|section 33(?: of the charter)?", "Section 33 of the Charter, which lets Parliament or a provincial legislature pass a law that overrides certain Charter rights (sections 2 and 7 to 15) for five years at a time, renewable."],
  ["(?:the )?(?:canadian )?charter(?: of rights and freedoms)?", "The part of the Constitution Act, 1982 that guarantees rights and freedoms, including fundamental freedoms, democratic, mobility, legal and equality rights and language rights, subject to reasonable limits (section 1) and the notwithstanding clause (section 33)."],
  ["civil law", "The law of private disputes between people and organizations, such as contracts, torts, property and family law, where the remedy is usually money damages. It also names Quebec's code-based legal system, from French law."],
  ["criminal law", "Public law that defines crimes against society and sets their punishments, mainly in the federal Criminal Code. The Crown prosecutes, and guilt must be proven beyond a reasonable doubt."],
  ["(?:the )?criminal code(?: of canada)?", "The federal statute that defines most crimes in Canada, their procedures and their penalties, first passed in 1892. Criminal law is a federal power under the Constitution Act, 1867, so it applies everywhere in Canada."],
  ["case law|judge[- ]made law", "Law made by the decisions of judges in past cases, which serve as precedents for later cases. Another name for common law."],
  ["(?:a )?(?:legal )?precedents?", "An earlier court decision that is followed when a later case raises the same legal question. Lower courts must follow the precedents of higher courts in their system (stare decisis)."],
  ["(?:the )?constitution act,? 1867|(?:the )?british north america act|(?:the )?bna act", "The act of the British Parliament that created Canada at Confederation on July 1, 1867. It sets up Parliament and the provinces and divides their powers: section 91 lists federal powers, such as criminal law and defence, and section 92 provincial ones, such as education and health."],
  ["habeas corpus", "Latin for \"you have the body\": the right of a detained person to go before a judge, who decides whether the detention is lawful and orders release if it is not. Section 10(c) of the Charter protects it."],
  ["(?:the )?right to (?:counsel|a lawyer)", "Section 10(b) of the Charter: on arrest or detention, everyone has the right to retain and instruct a lawyer without delay and to be told of that right. Police must give a chance to call one, including free legal aid."],
  ["(?:an )?unreasonable search and seizure|search and seizure|section 8(?: of the charter)?", "Section 8 of the Charter protects everyone against unreasonable search or seizure. A search is usually reasonable only with a warrant or under a clear legal power, and evidence found in an unreasonable search can be excluded under section 24(2)."],
  ["(?:a )?hybrid offen[cs]es?|(?:a )?dual procedure offen[cs]es?", "An offence the Crown can choose to prosecute either as a summary conviction offence or as an indictable offence, depending on how serious the case is, such as impaired driving or assault. Most offences in the Criminal Code are hybrid."],
  ["first[- ]degree murder", "Murder that is planned and deliberate, or the murder of a police officer or prison guard, or committed during certain crimes like sexual assault or kidnapping. The sentence is life in prison with no parole for 25 years."],
  ["second[- ]degree murder", "Intentional murder that is not planned and deliberate. The sentence is life in prison, with no parole for 10 to 25 years, as the judge sets."],
  ["manslaughter", "An unlawful killing without the intent needed for murder, such as a death caused by an unlawful act or criminal negligence. The maximum is life, with no minimum unless a firearm was used."],
  ["(?:a )?preliminary (?:inquiry|hearing)", "A hearing before a judge for some serious indictable offences to decide if the Crown has enough evidence to send the accused to trial. Since 2019 it is limited to offences with a maximum of life in prison."],
  ["(?:a )?(?:search |arrest )?warrants?", "A document signed by a judge or justice of the peace that authorizes the police to arrest a named person or to search a named place for evidence."],
  ["(?:an )?acquittals?|(?:an )?acquitted", "A finding by the judge or jury that the accused is not guilty, because the Crown did not prove the charge beyond a reasonable doubt. The accused is released and cannot be tried again for the same offence (double jeopardy), unless the Crown wins an appeal."],
  ["(?:a )?conditional sentences?", "A prison sentence of under two years that the offender serves in the community under strict conditions, often house arrest, instead of in jail. Breaking the conditions can send them to jail."],
  ["restorative justice", "An approach to crime that focuses on repairing the harm done: the offender, the victim and the community meet, often in a circle, and agree on how the offender will make amends. It draws on Indigenous justice traditions."],
  ["(?:a )?youth sentences?", "A sentence under the Youth Criminal Justice Act for 12 to 17 year olds, focused on rehabilitation: reprimands, fines, community service, probation, intensive support, and custody only for violent or repeat offences, with shorter maximums than adults. A youth can get an adult sentence for the most serious crimes."],
  ["(?:the )?defen[cs]e of intoxication|(?:the )?intoxication defen[cs]e", "Being drunk or high is a partial defence only for specific intent offences, such as murder, which can be reduced to manslaughter. Under section 33.1 of the Criminal Code it is not a defence to violent general intent offences unless the intoxication was extreme and not foreseeable."],
  ["(?:the )?(?:insanity|mental disorder) defen[cs]e|not criminally responsible(?: on account of mental disorder)?|ncrmd", "Under section 16 of the Criminal Code, a person is not criminally responsible if a mental disorder made them unable to appreciate the nature of their act or to know it was wrong. They are not convicted, and a review board decides on hospital or release."],
  ["(?:an )?alibi", "A defence that the accused was somewhere else when the crime took place, so could not have done it. It should be disclosed to the Crown early so it can be checked."],
  ["entrapment", "A defence where police offered someone the chance to commit a crime without a reasonable suspicion they were already involved, or pushed them into it. If proven, the court stays the charges."],
  ["(?:a )?hung jur(?:y|ies)", "A jury that cannot reach a unanimous verdict after long deliberation. The judge declares a mistrial, and the Crown can try the accused again."],
  ["(?:an )?intentional torts?", "A tort done on purpose, such as assault (a threat of harm), battery (harmful contact), false imprisonment, trespass and defamation, as opposed to negligence."],
  ["vicarious liability", "Responsibility for someone else's wrong, most often an employer for the torts its employees commit while doing their jobs, even if the employer did nothing wrong itself."],
  ["contributory negligence", "When the plaintiff's own carelessness helped cause their injury, such as not wearing a seatbelt. In BC the damages are reduced by the plaintiff's share of fault under the Negligence Act."],
  ["occupiers'? liability|occupier'?s liability", "The duty of whoever controls a property to keep it reasonably safe for people who come onto it. In BC the Occupiers Liability Act sets this duty, with a lower one for trespassers."],
  ["(?:civil )?damages", "Money a court orders the defendant to pay to compensate the plaintiff for a loss or injury: general damages for pain and suffering, special damages for actual costs like lost wages, and rarely punitive damages to punish."],
  ["(?:a )?breach of contract", "When a party fails to do what the contract requires, without lawful excuse. The other party can sue for damages, and for a serious breach may end the contract or seek an order to perform it."],
  ["(?:a )?defendants?|(?:the )?accused", "The person or organization sued in a civil case, or charged with an offence in a criminal case (also called the accused)."],
  ["(?:the )?divorce act", "The federal law that governs divorce in Canada. The only ground is breakdown of the marriage, shown by living apart for a year, adultery or cruelty, and it covers parenting and support for divorcing couples."],
  ["(?:the )?(?:bc )?family law act", "BC's law on family matters for married and unmarried couples: parenting arrangements based on the child's best interests, child and spousal support, and dividing family property and debt when a relationship ends."],
  ["child support", "Money one parent pays the other to help with a child's living costs after they separate, usually set by the Federal Child Support Guidelines by the paying parent's income and the number of children."],
  ["(?:the )?(?:bc )?court of appeal(?: for british columbia)?", "BC's highest court, which hears appeals from the BC Supreme Court and Provincial Court on errors of law. Appeals from it go to the Supreme Court of Canada with permission."],
  ["(?:the )?canadian human rights act", "The 1977 federal law against discrimination by federally regulated employers and services, such as banks, airlines and the federal government. Complaints go to the Canadian Human Rights Commission."],
  ["(?:the )?indian act", "The 1876 federal law that governs registered First Nations people (status Indians), reserves and band councils. It has been used to control and assimilate First Nations, including through residential schools, and is still in force with many amendments."],
  ["administrative law", "The law governing how government agencies, boards and tribunals make decisions that affect people, such as the Labour Relations Board or the Residential Tenancy Branch, and how courts can review those decisions for fairness."],
  ["constitutional law", "The law of the Constitution: how government is set up, the division of powers between Parliament and the provinces, and the rights in the Charter. Courts can strike down laws that conflict with it."],
  ["(?:the )?division of powers", "The split of law-making power between Parliament and the provinces in the Constitution Act, 1867. Section 91 gives Ottawa matters like criminal law, defence, banking and citizenship; section 92 gives the provinces matters like education, health, property and civil rights, and municipalities."],
  ["double jeopardy", "The rule, in section 11(h) of the Charter, that a person who has been finally acquitted or convicted of an offence cannot be tried or punished for it again."],
  ["(?:an )?arraignment", "The start of a criminal trial, when the charge is read to the accused in court and they enter a plea of guilty or not guilty."],
  ["(?:the )?right to (?:remain )?silen(?:t|ce)", "The right of an accused or detained person not to say anything to police, protected by section 7 of the Charter, and not to testify at their own trial, section 11(c). Silence cannot be used as evidence of guilt."],
  ["(?:a )?voir dire", "A \"trial within a trial\": a hearing held without the jury to decide if a piece of evidence, such as a confession, is admissible."],
  ["hearsay(?: evidence)?", "Evidence of a statement someone made outside court, offered to prove that what it says is true, such as a witness saying what another person told them. It is usually not allowed, with exceptions when it is necessary and reliable."],
  ["(?:a )?mistrials?", "A trial that is ended before a verdict and declared invalid, because of a serious error, misconduct or a hung jury. The accused can usually be tried again."],
  ["(?:an )?absolute discharge|(?:a )?conditional discharge", "A sentence where the accused is found guilty but not convicted, so they have no conviction. An absolute discharge has no conditions; a conditional one comes with probation conditions. The record is removed after one year (absolute) or three (conditional)."],
  ["(?:a )?peace bonds?|(?:a )?section 810(?: order)?", "A court order under section 810 of the Criminal Code requiring someone to keep the peace and be of good behaviour, often with conditions like no contact, for up to a year, when there are grounds to fear they will cause harm. It is not a conviction."],
  ["criminal negligence", "Doing, or failing to do, something that shows wanton or reckless disregard for the lives or safety of others (section 219 of the Criminal Code), such as causing death by criminal negligence, punishable by up to life in prison."],
  ["break(?:ing)? and enter(?:ing)?|b and e", "Breaking into a place such as a house or building to commit an offence there, or breaking out after committing one (section 348 of the Criminal Code). Breaking into a home is indictable with a maximum of life."],
  ["impaired driving|drunk driving|dui", "Operating a vehicle while your ability is impaired by alcohol or drugs, or with a blood alcohol level of 80 mg per 100 mL or more, a Criminal Code offence. In BC, police can also issue an Immediate Roadside Prohibition at 50 mg."],
  ["extrajudicial (?:measures|sanctions)", "Ways under the Youth Criminal Justice Act to deal with a young offender outside court: police warnings, cautions and referrals to community programs (measures), or a formal program the youth must complete (sanctions). They are presumed right for a first non-violent offence."],
  ["strict liability(?: offen[cs]es?)?", "An offence, usually a regulatory one like a pollution or safety violation, where the Crown does not need to prove intent: the accused is liable unless they prove due diligence, that they took all reasonable care. Absolute liability offences allow no such defence."],
  ["trespass(?: to land)?", "Entering or staying on someone's land without permission, a tort even with no damage done. Under BC's Trespass Act it can also be an offence after notice to stay off."],
  ["(?:the )?standard of care", "The level of care a reasonable person would take in the situation. In negligence, the defendant breaches the duty of care by falling below it; professionals are held to the standard of a reasonable member of their profession."],
  ["(?:a )?misrepresentations?", "A false statement of fact that leads someone to enter a contract. If it is innocent, the contract may be cancelled; if it is fraudulent or negligent, the victim can also sue for damages."],
  ["(?:a )?void contracts?", "A contract that has no legal effect from the start and cannot be enforced by either party, such as one for an illegal purpose."],
  ["(?:a )?voidable contracts?", "A valid contract that one party may choose to cancel (set aside), for example because of misrepresentation, duress, undue influence or because they were a minor."],
  ["(?:a )?leases?|(?:a )?tenancy agreements?", "A contract in which a landlord lets a tenant use property, such as an apartment, for a set time in exchange for rent. In BC residential leases are governed by the Residential Tenancy Act."],
  ["(?:the )?(?:bc )?residential tenancy act", "BC's law on renting homes: tenancy agreements, rent increases (capped yearly), security deposits (no more than half a month's rent), repairs, eviction notices and disputes, which go to the Residential Tenancy Branch."],
  ["spousal support", "Money one spouse pays the other after separation to help with living costs, based on need, ability to pay and the roles each played in the relationship, often guided by the Spousal Support Advisory Guidelines."],
  ["(?:the )?duty to consult(?: and accommodate)?", "The Crown's legal duty to consult Indigenous peoples, and accommodate their concerns where needed, before decisions that could affect their Aboriginal or treaty rights, set out in Haida Nation v British Columbia (2004)."],
  ["undrip|(?:the )?(?:united nations |un )?declaration on the rights of indigenous peoples", "The United Nations Declaration on the Rights of Indigenous Peoples, adopted in 2007, setting out rights to self-determination, culture, lands and free, prior and informed consent. BC made it law with DRIPA in 2019, and Canada in 2021."],
  ["theft|stealing", "Taking or using someone else's property without their consent, with the intent to deprive them of it (section 322 of the Criminal Code). Theft over $5,000 is indictable with up to 10 years; theft under $5,000 is a hybrid offence."],
  ["robbery", "Theft with violence or threats of violence, or while armed with a weapon (section 343 of the Criminal Code). It is indictable, with a maximum of life in prison."],
  ["assault", "Intentionally applying force to someone without their consent, or threatening to with the ability to carry it out (section 265 of the Criminal Code). More serious forms are assault with a weapon or causing bodily harm, and aggravated assault."],
  ["sexual assault", "Any sexual contact without consent (sections 271 to 273 of the Criminal Code), from unwanted touching to rape. Consent must be voluntary, ongoing and can be withdrawn at any time; someone who is unconscious or intoxicated cannot consent."],
  ["(?:the )?(?:oakes test)", "The test from R v Oakes (1986) for whether a law that limits a Charter right is saved by section 1: the law must have a pressing and substantial goal, be rationally connected to it, impair the right as little as possible, and its benefits must outweigh its harms."],
  ["(?:the )?(?:victim(?:s'?)? impact statement)", "A written or spoken statement by the victim of a crime, read at sentencing, describing how the crime affected them."],
  ["(?:a )?probation", "A sentence in which the offender stays in the community under conditions, such as reporting to a probation officer, for up to three years."],
  ["(?:a )?(?:parole)", "Early, supervised release of a prisoner for the rest of their sentence, granted by the Parole Board of Canada. A life sentence for first degree murder has no parole for 25 years."],
];
const LAW_TERMS_RE = LAW_TERMS.map(([s, b]) => [new RegExp("^(?:" + s + ")$"), b, s]);
function law12(q){
  const out = body => ({kind:"text", title:null, body, src:"Nimble law", source:"Nimble law"});
  for(const [s, body] of LAW_FACTS) if(new RegExp(s).test(q)) return out(body);
  const tb = termAsk(q.replace(/ in (?:canadian |canada'?s? |bc |criminal |civil |contract |tort |family )?law$| in canada$/, ""), LAW_TERMS_RE, []); return tb ? out(tb) : null;
}
function precalc(query){
  let q = String(query).trim().toLowerCase().replace(/[?.!]+$/, "").replace(/[−–]/g, "-").replace(/^(?:what(?:'s|’s| is) |find |calculate |determine )(?:the )?/, "");
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"});
  for(const [re, body] of PC_FACTS) if(re.test(q)) return out(body);
  const sc10 = sci10(q, query); if(sc10) return sc10;
  const ph12 = phys12(q, query); if(ph12) return ph12;
  const ph11 = phys11(q); if(ph11) return ph11;
  const ch12 = chem12(q, query); if(ch12) return ch12;
  const ch11 = chem11(q, query); if(ch11) return ch11;
  const l11 = ls11(q); if(l11) return l11;
  const a12p = ap12(q); if(a12p) return a12p;
  const e11 = es11(q); if(e11) return e11;
  const v11 = env11(q); if(v11) return v11;
  const s10 = ss10(q); if(s10) return s10;
  const g12 = geo12(q); if(g12) return g12;
  const h12 = hist12(q); if(h12) return h12;
  const lw12 = law12(q); if(lw12) return lw12;
  const c12 = calc12(q); if(c12) return c12;
  const s12 = stats12(q); if(s12) return s12;
  const a12 = aw12(q); if(a12) return a12;
  const w10 = work10(q); if(w10) return w10;
  const p11 = pc11(q); if(p11) return p11;
  const p10 = fm10(q); if(p10) return p10;
  const f11 = fom11(q); if(f11) return f11;
  const f12 = fom12(q); if(f12) return f12;
  let m;
  // how many roots does a degree 4 (or quartic) polynomial have
  if((m = /^how many (?:roots|zeros|solutions) (?:does|can) (?:a |an )?(?:degree[- ](\d+)|(linear|quadratic|cubic|quartic|quintic)) polynomial have$/.exec(q))){
    const n = m[1] ? +m[1] : {linear:1, quadratic:2, cubic:3, quartic:4, quintic:5}[m[2]];
    return out(n + ", counting repeated and complex roots (the fundamental theorem of algebra). At most " + n + " are real.");
  }
  // evaluate log3(1/9), simplify log(100) - log(10): the rest is plain arithmetic
  if((m = /^(?:evaluate|simplify|compute)\s+(.+)$/.exec(q))){
    const v = tryMath(m[1]); if(v !== null) return {kind:"math", value:v};
    q = m[1];
  }
  // log 8 base 2
  if((m = /^log\s*(?:of\s*)?([\d.]+(?:\s*\/\s*[\d.]+)?)\s*(?:to the |in )?base\s*(\d+(?:\.\d+)?)$/.exec(q))){
    const x = pcVal(m[1]), v = x === null ? NaN : Math.log(x) / Math.log(+m[2]); return isFinite(v) ? out(pcFrac(+v.toPrecision(12))) : null;
  }
  // write 2^5 = 32 in log form; write log3(9) = 2 in exponential form
  if((m = /^(?:write|express|convert|rewrite)\s+(\d+(?:\.\d+)?)\s*\^\s*\(?(-?[\d./]+)\)?\s*=\s*([\d./]+)\s+(?:in|as|to)\s+(?:log|logarithmic)(?: form)?$/.exec(q))) return out("log" + m[1] + "(" + m[3] + ") = " + m[2] + ", read as log base " + m[1] + " of " + m[3] + ".");
  if((m = /^(?:write|express|convert|rewrite)\s+log\s*(?:_\s*)?(\d+(?:\.\d+)?)\s*\(\s*([\d./]+)\s*\)\s*=\s*(-?[\d./]+)\s+(?:in|as|to)\s+exponential(?: form)?$/.exec(q))) return out(m[1] + "^" + m[3] + " = " + m[2]);
  // pH and the Richter scale: base-10 logs with a name
  if((m = /\bph\b.*?(?:concentration|\[h\+?\])\s*(?:of |is |=\s*)?([\d.e-]+(?:\s*[x×]\s*10\s*\^\s*-?\d+)?)/.exec(q))){
    const c = pcVal(m[1].replace(/\s*[x×]\s*10\s*\^\s*/, "*10^")); return c > 0 ? out("pH = " + pcNum(-Math.log10(c))) : null;
  }
  if((m = /magnitude\s*([\d.]+).*?(?:times|stronger|more powerful|more intense).*?magnitude\s*([\d.]+)/.exec(q)) || (m = /magnitude\s*([\d.]+).*?magnitude\s*([\d.]+).*?(?:times|stronger)/.exec(q))){
    const r = 10 ** Math.abs(+m[1] - +m[2]); return out(pcNum(r) + " times");
  }
  // the transformation y = f(x) shifted 3 left and 2 down
  if(/\bshift(?:ed|s)?\b|\btranslated\b|\bmoved\b/.test(q) && /\bf\(x\)/.test(q) && /\b(left|right|up|down)\b/.test(q)){
    let h = 0, k = 0;
    for(const [, n, dir] of q.matchAll(/(\d+(?:\.\d+)?)\s*(?:units?\s*)?(left|right|up|down)\b/g)) ({left:() => h -= +n, right:() => h += +n, up:() => k += +n, down:() => k -= +n})[dir]();
    if(h || k) return out("y = " + pcShift(h, k));
  }
  // what transformation maps y = x^2 to y = 3(x - 5)^2 + 1
  if((m = /maps? y\s*=\s*(.+?)\s+(?:to|onto)\s+y\s*=\s*(-?)\s*([\d.\/]*)\s*\(\s*x\s*([+-])\s*([\d.]+)\s*\)\s*(\^\s*\d+)?\s*(?:([+-])\s*([\d.]+))?$/.exec(q))){
    const say = [], a = m[3] ? pcVal(m[3]) : 1;
    if(m[2]) say.push("reflects it across the x-axis");
    if(a !== 1) say.push((a > 1 ? "stretches it vertically by a factor of " : "compresses it vertically by a factor of ") + pcNum(a));
    say.push("shifts it " + pcNum(m[5]) + " units " + (m[4] === "-" ? "right" : "left"));
    if(m[7]) say.push("shifts it " + pcNum(m[8]) + " units " + (m[7] === "+" ? "up" : "down"));
    return out("It " + say.join(", then ") + ".");
  }
  // what happens to y = sqrt(x) when it becomes y = sqrt(x - 3) + 2: read the last equation's a, b, h, k
  if(/\b(becomes?|maps?|changes? to|transform(?:ed|s)? (?:in)?to|turns? into)\b/.test(q) && (m = /y\s*=\s*(-?)\s*([\d.\/]*)\s*(?:sqrt|√|log|ln|sin|cos|tan|abs)?\s*([(|])\s*(-?)\s*([\d.\/]*)\s*\(?\s*x\s*(?:([+-])\s*([\d.]+))?\s*\)?\s*[)|]\s*(?:\^\s*\d+)?\s*(?:([+-])\s*([\d.]+))?\s*$/.exec(q))){
    const say = [], a = m[2] ? pcVal(m[2]) : 1, b = m[5] ? pcVal(m[5]) : 1;
    if(m[1]) say.push("reflects it across the x-axis");
    if(m[4]) say.push("reflects it across the y-axis");
    if(a !== 1) say.push((a > 1 ? "stretches it vertically by a factor of " : "compresses it vertically by a factor of ") + pcNum(a));
    if(b !== 1) say.push("compresses it horizontally by a factor of 1/" + pcNum(b));
    if(m[6]) say.push("shifts it " + pcNum(m[7]) + " units " + (m[6] === "-" ? "right" : "left"));
    if(m[8]) say.push("shifts it " + pcNum(m[9]) + " units " + (m[8] === "+" ? "up" : "down"));
    if(say.length) return out("It " + say.join(", then ") + ".");
  }
  // y = x^3 translated 4 units up
  if((m = /^(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:is )?(?:translated|shifted|moved)\s+(.+)$/.exec(q))){
    let h = 0, k = 0;
    for(const [, n, dir] of m[2].matchAll(/(\d+(?:\.\d+)?)\s*(?:units?\s*)?(left|right|up|down)\b/g)) ({left:() => h -= +n, right:() => h += +n, up:() => k += +n, down:() => k -= +n})[dir]();
    if(h || k){
      const inner = h ? m[1].replace(/x/g, "(x " + (h > 0 ? "- " + pcNum(h) : "+ " + pcNum(-h)) + ")") : m[1];
      return out("y = " + inner + (k ? (k > 0 ? " + " + pcNum(k) : " - " + pcNum(-k)) : ""));
    }
  }
  // y = |x| reflected in the x-axis (or y-axis)
  if((m = /^(?:y\s*=\s*|f\(x\)\s*=\s*)(.+?)\s+(?:is )?reflected (?:in|across|over|about) the ([xy])-?axis$/.exec(q))){
    return out(m[2] === "x" ? "y = -(" + m[1] + ")" : "y = " + m[1].replace(/x/g, "(-x)"));
  }
  // domain of y = sqrt(x - 4), log(x + 2), 1/(x - 3)
  if((m = /^(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(sqrt|√|log|ln)\s*\(\s*([^()]+)\s*\)$/.exec(q)) || (m = /^(?:the )?domain of (?:y\s*=\s*|f\(x\)\s*=\s*)?(\d+)\s*\/\s*\(\s*([^()]+)\s*\)$/.exec(q))){
    const b = pcAt(m[2], 0), k = pcAt(m[2], 1) - b; if(b === null || isNaN(k) || Math.abs(pcAt(m[2], 2) - b - 2 * k) > 1e-9 || k === 0) return null;
    const x0 = pcFrac(-b / k), up = k > 0;
    if(/^\d/.test(m[1])) return out("x ≠ " + x0 + ".");
    return out("x " + (/sqrt|√/.test(m[1]) ? (up ? "≥ " : "≤ ") : (up ? "> " : "< ")) + x0 + ".");
  }
  // if f(x) = 2x - 1, find f^-1(5) (or f(5))
  if((m = /f\(x\)\s*=\s*(.+?),?\s+(?:find|what is|evaluate|calculate)\s+(?:the value of )?f\s*(\^\s*\(?-1\)?|⁻¹|inverse)?\s*\(\s*(-?[\d./]+)\s*\)$/.exec(q))){
    const a = pcVal(m[3]); if(a === null) return null;
    if(!m[2]){ const v = pcAt(m[1], a); return v === null ? null : out(pcFrac(+v.toPrecision(12))); }
    const xs = pcScanRoots("(" + m[1] + ")-(" + a + ")"); return xs.length === 1 ? out(pcFrac(xs[0])) : null;
  }
  // is the inverse of y = x^2 a function
  if(/^is the inverse of (?:y|f\(x\))\s*=\s*x\s*\^\s*2 a function$/.test(q)) return out("No. y = x² fails the horizontal line test, so its inverse is a function only if the domain is restricted, such as x ≥ 0.");
  // write 0.333... as a fraction
  if((m = /^0\.(\d+)(?:\.\.\.|…)(?: as a fraction| to a fraction| in fraction form)?$/.exec(String(query).trim().toLowerCase().replace(/\?$/, "").replace(/^(?:what is |write |convert |express )/, "")))){
    // The shortest lead-in, then the shortest block that repeats at least twice to the end ("0.1666..." is 1, then 6).
    const D = m[1]; let pre = null, rep = null;
    for(let L = 0; L < D.length && pre === null; L++) for(let k = 1; 2 * k <= D.length - L; k++){
      const t = D.slice(L), b = t.slice(0, k); if([...t].every((c, i) => c === b[i % k])){ pre = D.slice(0, L); rep = b; break; }
    }
    if(pre === null) return null;
    const num = +(pre + rep) - (pre ? +pre : 0), den = (10 ** rep.length - 1) * 10 ** pre.length;
    const g = (a, b) => b ? g(b, a % b) : a, d = g(num, den); return out(num / d + "/" + den / d);
  }
  // general term and which term, from a geometric list
  const gl = /(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){2,})/.exec(q);
  if(gl && (m = /^(?:the )?(general term|nth term|explicit formula|which term)\b/.exec(q))){
    const n = gl[1].split(/\s*,\s*/).map(Number), r = n[1] / n[0];
    if(!n.every((v, i) => i === 0 || Math.abs(v - n[i - 1] * r) < 1e-9)) return null;
    if(m[1] === "which term"){
      const t = (/\bis\s+(-?[\d.]+)$/.exec(q) || [])[1]; if(t === undefined) return null;
      const k = Math.log(+t / n[0]) / Math.log(r) + 1; return Number.isInteger(+k.toPrecision(9)) ? out("Term " + +k.toPrecision(9) + ".") : out("None. It falls between terms.");
    }
    return out("tₙ = " + pcNum(n[0]) + "·" + (r < 0 ? "(" + pcFrac(r) + ")" : pcFrac(r)) + "^(n - 1)");
  }
  // sum of a geometric series with a = 5, r = 3, n = 4
  if(/\bgeometric\b/.test(q) && (m = /\ba\s*=\s*(-?[\d./]+).*?\br\s*=\s*(-?[\d./]+)(?:.*?\bn\s*=\s*(\d+))?/.exec(q))){
    const a = pcVal(m[1]), r = pcVal(m[2]); if(a === null || r === null) return null;
    if(m[3]) return out(pcNum(r === 1 ? a * +m[3] : a * (1 - r ** +m[3]) / (1 - r)));
    if(/infinite/.test(q)) return out(Math.abs(r) < 1 ? pcNum(a / (1 - r)) : "It diverges: an infinite geometric sum needs |r| < 1.");
  }
  // infinite sum of 12 - 6 + 3 - ...
  if((m = /^(?:the )?(?:infinite )?sum of\s+(-?\s*\d+(?:\.\d+)?(?:\/\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?(?:\/\d+)?){2,})\s*[+-]?\s*(?:\.\.\.|…)?$/.exec(String(query).trim().toLowerCase().replace(/[−–]/g, "-").replace(/^(?:what is |find )(?:the )?/, "").replace(/\?$/, ""))) && /(\.\.\.|…|infinite)/.test(String(query))){
    const n = [...m[1].matchAll(/([+-]?)\s*(\d+(?:\.\d+)?(?:\/\d+)?)/g)].map(([, sg, v]) => (sg === "-" ? -1 : 1) * pcVal(v)), r = n[1] / n[0];
    if(n.every((v, i) => i === 0 || Math.abs(v - n[i - 1] * r) < 1e-9)) return out(Math.abs(r) < 1 ? pcNum(n[0] / (1 - r)) : "It diverges: the ratio is " + pcFrac(r) + ", and an infinite sum needs |r| < 1.");
  }
  // divide x^3 - 1 by x - 1
  if((m = /^divide\s+(.+?)\s+by\s+(.+)$/.exec(q)) || (m = /^\(?(.+?)\)?\s*(?:÷|divided by)\s*\(?(.+?)\)?$/.exec(q))){
    const a = pcCoeffs(m[1]), b = pcCoeffs(m[2]);
    if(a && b && a.length >= b.length && /x/.test(m[1]) && /x/.test(m[2])){
      const [qt, rm] = pcDivide(a, b), rest = rm.every(c => Math.abs(c) < 1e-9) ? "" : ", remainder " + pcPoly(rm.map(c => +c.toFixed(9)));
      return out(pcPoly(qt.map(c => +c.toFixed(9))) + rest);
    }
  }
  // find k if x - 2 is a factor of x^2 + kx - 6
  if((m = /^(?:the value of )?k\b.*?\bif\s+\(?\s*x\s*([+-])\s*([\d.]+)\s*\)?\s+is a factor of\s+(.+)$/.exec(q.replace(/^find\s+/, ""))) || (m = /^(?:find )?k\b.*?\bif\s+\(?\s*x\s*([+-])\s*([\d.]+)\s*\)?\s+is a factor of\s+(.+)$/.exec(q))){
    const a = (m[1] === "-" ? 1 : -1) * +m[2], at = k => pcAt(m[3].replace(/\bk\b|(?<=\d)k|k(?=x)/g, "(" + k + ")"), a);
    const p0 = at(0), p1 = at(1); if(p0 === null || p1 === null || p1 === p0) return null;
    return out("k = " + pcFrac(+(-p0 / (p1 - p0)).toPrecision(12)));
  }
  // multiplicity of the root x = 2 in (x - 2)^3
  if((m = /multiplicity of (?:the )?(?:root|zero)\s*(?:x\s*=\s*)?(-?[\d.]+)\s+in\s+(.+)$/.exec(q))){
    const a = +m[1], co = pcCoeffs(m[2]); if(!co) return null;
    let c = co, k = 0; while(c.length > 1){ const [qt, rm] = pcDivide(c, [1, -a]); if(Math.abs(rm[0]) > 1e-9) break; c = qt; k++; }
    return out(k ? String(k) : "0. It is not a root.");
  }
  // y-intercept
  if((m = /^(?:the )?y-?intercept of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$/.exec(q))){ const v = pcAt(m[1], 0); return v === null ? null : out("y = " + pcNum(v)); }
  // oblique asymptote and holes of a rational function
  if((m = /^(?:the )?(oblique|slant) asymptote of (?:y\s*=\s*|f\(x\)\s*=\s*)?\(?(.+?)\)?\s*\/\s*\(?([^()]+)\)?$/.exec(q))){
    const a = pcCoeffs(m[2]), b = pcCoeffs(m[3]); if(!a || !b) return null;
    if(a.length !== b.length + 1) return out("None. An oblique asymptote needs the top to be one degree higher than the bottom.");
    return out("y = " + pcPoly(pcDivide(a, b)[0].map(c => +c.toFixed(9))));
  }
  if((m = /\bholes?\b.*?(?:y\s*=\s*|f\(x\)\s*=\s*)\(?(.+?)\)?\s*\/\s*\(([^()]+)\)$/.exec(q))){
    const holes = pcScanRoots(m[2]).filter(r => Math.abs(pcAt(m[1], r) ?? 1) < 1e-9);
    const y = r => { const f = x => pcAt(m[1], x) / pcAt(m[2], x); return pcFrac(+((f(r + 1e-7) + f(r - 1e-7)) / 2).toFixed(6)); };
    return out(holes.length ? holes.map(r => "x = " + pcFrac(r) + ", at the point (" + pcFrac(r) + ", " + y(r) + ")").join("; ") : "None.");
  }
  // phase shift, vertical displacement and range of y = a sin(b(x - c)) + d
  if((m = /^(phase shift|horizontal shift|vertical (?:displacement|shift|translation)|midline|range|max(?:imum)?|min(?:imum)?) of (?:y\s*=\s*|f\(x\)\s*=\s*)?(-?[\d.]*)\s*(sin|cos)\s*\(\s*(?:([\d.]*)\s*\(\s*)?(?:([\d.]*)\s*)?x\s*(?:([+-])\s*([\dπpi./ ]+?))?\s*\)?\s*\)\s*(?:([+-])\s*([\d.]+))?$/.exec(q))){
    const a = m[2] === "" ? 1 : m[2] === "-" ? -1 : +m[2], d = m[8] ? (m[8] === "-" ? -1 : 1) * +m[9] : 0;
    const b = (m[4] ? +m[4] : 1) * (m[5] ? +m[5] : 1), c0 = m[6] ? pcVal(m[7]) : 0; if(c0 === null) return null;
    const c = (m[6] === "-" ? 1 : -1) * c0 / (m[4] ? 1 : b);
    if(/^(phase|horizontal)/.test(m[1])) return out(c === 0 ? "None." : (pcPi(Math.abs(c)) || pcNum(Math.abs(c))) + " to the " + (c > 0 ? "right" : "left") + ".");
    if(/^(vertical|midline)/.test(m[1])) return out(/^midline/.test(m[1]) ? "y = " + pcNum(d) : d === 0 ? "None." : pcNum(Math.abs(d)) + " " + (d > 0 ? "up" : "down") + ".");
    if(/^max/.test(m[1])) return out(pcNum(d + Math.abs(a)));
    if(/^min/.test(m[1])) return out(pcNum(d - Math.abs(a)));
    return out(pcNum(d - Math.abs(a)) + " ≤ y ≤ " + pcNum(d + Math.abs(a)));
  }
  // solve sin^2 x = 1/4: sin x = ±1/2
  if((m = /^solve\s+([\d.]*)\s*(sin|cos|tan)\s*\^\s*2\s*\(?x\)?\s*(?:([+-])\s*([\d.]+))?\s*=\s*(-?[\d./]+)(.*)$/.exec(q))){
    const rhs = pcVal(m[5]); if(rhs === null) return null;
    const k = (rhs - (m[3] ? (m[3] === "-" ? -1 : 1) * +m[4] : 0)) / (m[1] ? +m[1] : 1); if(k < 0) return out("No solution: a square is never negative.");
    m = [m[0], m[2], m[5], m[6]];
    const two = 2 * Math.PI, norm = v => +(((v % two) + two) % two).toPrecision(12), xs = new Set();
    for(const s of [Math.sqrt(k), -Math.sqrt(k)]){
      const base = m[1] === "sin" ? Math.asin(s) : m[1] === "cos" ? Math.acos(s) : Math.atan(s); if(isNaN(base)) continue;
      (m[1] === "sin" ? [base, Math.PI - base] : m[1] === "cos" ? [base, two - base] : [base, base + Math.PI]).forEach(v => xs.add(norm(v)));
    }
    const deg = /deg|°|360/.test(m[3]);
    return xs.size ? out([...xs].sort((a, b) => a - b).map(v => "x = " + (deg ? pcNum(v * 180 / Math.PI) + "°" : pcPi(v) || pcNum(v))).join(" or ")) : out("No solution.");
  }
  // log base 3 of 81, log 5 of 125, log_2(32)
  if((m = /^log(?:arithm)?\s*(?:base\s*|_\s*)?(\d+(?:\.\d+)?)\s*(?:of\s*|\(\s*)([\d.]+(?:\s*\/\s*[\d.]+)?)\s*\)?$/.exec(q))){
    const x = pcVal(m[2]), v = x === null ? NaN : Math.log(x) / Math.log(+m[1]); return isFinite(v) ? out(pcFrac(+v.toPrecision(12))) : null;
  }
  // solve log(x) = 2, log2(x) = 5, ln(x) = 1
  if((m = /^solve\s+([\d.]*)\s*(log|ln)\s*(?:_\s*)?(\d*)\s*\(?\s*x\s*\)?\s*=\s*(-?[\d.]+)$/.exec(q))){
    const c = +m[4] / (m[1] ? +m[1] : 1), b = m[2] === "ln" ? Math.E : m[3] ? +m[3] : 10, x = b ** c;
    return out("x = " + (m[2] === "ln" ? "e^" + pcNum(c) + " ≈ " + pcNum(x) : pcNum(x)));
  }
  // expand log(ab), log(a/b), log(a^3)
  if((m = /^expand (log|ln)\s*\(\s*([a-z])\s*(\*|\/|\^)?\s*([a-z0-9])\s*\)$/.exec(q))){
    const [, f, a, op, b] = m;
    return out(op === "/" ? `${f}(${a}) - ${f}(${b})` : op === "^" ? `${b}·${f}(${a})` : `${f}(${a}) + ${f}(${b})`);
  }
  // solve 3^(x+1) = 27, 2^x = 16, 5^(2x-1) = 125
  if((m = /^(?:solve\s+(?:for x:?\s*)?)?(\d+(?:\.\d+)?)\s*\^\s*\(?\s*(-?\d*(?:\.\d+)?)\s*x\s*(?:([+-])\s*(\d+(?:\.\d+)?))?\s*\)?\s*=\s*(\d+(?:\.\d+)?)$/.exec(q))){
    const k = m[2] === "" ? 1 : m[2] === "-" ? -1 : +m[2], shift = m[3] ? (m[3] === "-" ? -1 : 1) * +m[4] : 0;
    const x = (Math.log(+m[5]) / Math.log(+m[1]) - shift) / k; return isFinite(x) ? out("x = " + pcFrac(x)) : null;
  }
  // geometric sequences: a list of numbers, then what to do with it
  // the first term is 4 and the common ratio is 1/2: the 6th term, or the sum of the first n
  if((m = /first term (?:is |of |=\s*)?(-?[\d./]+)\b.*?(?:common )?ratio (?:is |of |=\s*)?(-?[\d./]+)/.exec(q))){
    const a = pcVal(m[1]), r = pcVal(m[2]), t = /\b(\d+)(?:st|nd|rd|th) term\b/.exec(q), sn = /\bsum of (?:the )?first (\d+)/.exec(q);
    if(a !== null && r !== null && t) return out(pcFrac(+(a * r ** (+t[1] - 1)).toPrecision(12)));
    if(a !== null && r !== null && sn) return out(pcNum(r === 1 ? a * +sn[1] : a * (1 - r ** +sn[1]) / (1 - r)));
  }
  // how many terms are in 3, 6, 12, ..., 384 (geometric or arithmetic)
  if((m = /how many terms\b.*?(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(?:\.\.\.|…)\s*,\s*(-?[\d.]+)/.exec(String(query).toLowerCase()))){
    const [a, b, c, z] = m.slice(1, 5).map(Number);
    const n = b - a === c - b ? (z - a) / (b - a) + 1 : Math.abs(c / b - b / a) < 1e-9 ? Math.log(z / a) / Math.log(b / a) + 1 : NaN;
    return Number.isInteger(+n.toPrecision(9)) && n > 0 ? out(+n.toPrecision(9) + " terms") : null;
  }
  // a town of 15000 grows 2% per year; a car worth $30000 depreciates 15% per year. Value after n.
  if((m = /([\d,]+(?:\.\d+)?)\b.*?\b(grows?|increases?|appreciates?|rises?|decays?|decreases?|depreciates?|loses?|declines?|drops?|falls?)\b(?: by| at)?\s*([\d.]+)\s*%\s*(?:per|a|each|every)\s*([a-z]+).*?after ([\d.]+)/.exec(q))){
    const down = /^(decay|decreas|depreciat|los|declin|drop|fall)/.test(m[2]), v = +m[1].replace(/,/g, "") * (1 + (down ? -1 : 1) * +m[3] / 100) ** +m[5];
    return out(/\$/.test(q) ? "$" + v.toFixed(2) : pcNum(+v.toFixed(1)));
  }
  // how long for 100 g to decay to 25 g with a half-life of 6 hours
  if((m = /how long\b.*?([\d.]+)\s*[a-zµ]*\s*to (?:decay |drop |fall |reduce |shrink )?to ([\d.]+).*?half[- ]life (?:of |is )?([\d.]+)\s*([a-z]+)/.exec(q))){
    const t = +m[3] * Math.log(+m[2] / +m[1]) / Math.log(0.5); return isFinite(t) && t > 0 ? out(pcNum(+t.toFixed(4)) + " " + m[4]) : null;
  }
  // first term of a geometric sequence with r = 2 and 5th term 48
  if((m = /\bfirst term\b.*?\br\s*(?:=|is)\s*(-?[\d./]+).*?\b(\d+)(?:st|nd|rd|th) term (?:is |of |=\s*)?(-?[\d.]+)/.exec(q))){
    const r = pcVal(m[1]); return r === null ? null : out(pcFrac(+(+m[3] / r ** (+m[2] - 1)).toPrecision(12)));
  }
  const N = "-?\\d+(?:\\.\\d+)?(?:\\/\\d+)?";
  const list = new RegExp(`(${N}(?:\\s*[,+]\\s*${N}){2,})`).exec(q) || (/\b(?:common ratio|terms? of|term in)\b/.test(q) && new RegExp(`(${N}\\s*,\\s*${N})`).exec(q));
  if(list && (/\b(?:geometric|common ratio|terms? of|term in|series|converge|diverge)\b/.test(q) || /^sum of\b.*(\.\.\.|…)/.test(String(query).toLowerCase()))){
    const n = list[1].split(/\s*[,+]\s*/).map(pcVal), r = n[1] / n[0];
    if(n.some(v => v === null)) return null;
    const geometric = isFinite(r) && n.every((v, i) => i === 0 || Math.abs(v - n[i - 1] * r) < 1e-9);
    if(/^is\b/.test(q)) return out(geometric ? "Yes. Each term is " + pcFrac(r) + " times the one before." : "No. The ratios between terms are not equal (" + n.slice(1).map((v, i) => pcNum(v / n[i])).join(", ") + ").");
    if(!geometric) return null;
    if(/\b(?:converge|diverge)/.test(q)) return out(Math.abs(r) < 1 ? "Yes. The ratio is " + pcFrac(r) + ", so it converges to " + pcNum(n[0] / (1 - r)) + "." : "No. It diverges: the ratio is " + pcFrac(r) + ", and it needs |r| < 1.");
    if(/(\.\.\.|…)\s*\??$/.test(String(query).trim()) && !/\bfirst \d+ terms\b/.test(q)) return out(Math.abs(r) < 1 ? pcNum(n[0] / (1 - r)) : "It diverges: the ratio is " + pcFrac(r) + ", and an infinite sum needs |r| < 1.");
    if(/common ratio/.test(q)) return out(pcFrac(r));
    if((m = /\b(\d+)(?:st|nd|rd|th) term\b/.exec(q))) return out(pcNum(n[0] * r ** (+m[1] - 1)));
    if((m = /\bsum of (?:the )?first (\d+) terms\b/.exec(q))) return out(pcNum(r === 1 ? n[0] * +m[1] : n[0] * (1 - r ** +m[1]) / (1 - r)));
    if(/\binfinite\b/.test(q)) return out(Math.abs(r) < 1 ? pcNum(n[0] / (1 - r)) : "It diverges: the ratio is " + pcFrac(r) + ", and an infinite sum needs |r| < 1.");
  }
  if(/\binfinite geometric\b/.test(q) && (m = /first term (?:of |is )?(-?[\d.]+).*?ratio (?:of |is )?(-?[\d./]+)/.exec(q))){
    const a = +m[1], r = pcVal(m[2]);
    if(r !== null) return out(Math.abs(r) < 1 ? pcNum(a / (1 - r)) : "It diverges: an infinite geometric sum needs |r| < 1.");
  }
  // 100 g with a half life of 5 years, how much is left after 15 years
  // 100 g with a half life of 5 years; a population of 200 doubles every 3 hours. How much after T?
  // decays from 80 g to 10 g in 12 days: the half-life (or doubling time) from two amounts
  if((m = /from ([\d.]+)\s*([a-zµ]*)\s*to ([\d.]+)\s*[a-zµ]*\s*(?:in|over|after) ([\d.]+)\s*([a-z]+)/.exec(q)) && /half[- ]life|doubling time/.test(q)){
    const r = +m[3] / +m[1], t = +m[4] * Math.log(/half/.test(q) ? 0.5 : 2) / Math.log(r);
    return isFinite(t) && t > 0 ? out(pcNum(+t.toFixed(4)) + " " + m[5]) : null;
  }
  // "What fraction is left" needs no amount; a number glued to a name ("carbon-14") is never the amount.
  if((m = /(?:.*?(?<![-\w.])([\d.]+)\s*([a-zµ]+)?\b|^).*?(half[- ]life (?:of |is )?|doubles every |triples every )([\d.]+)\s*([a-z]+).*?after ([\d.]+)/.exec(q)) && (m[1] || /\b(fraction|percent|proportion)\b/.test(q))){
    const k = /^half/.test(m[3]) ? 0.5 : /^doubles/.test(m[3]) ? 2 : 3, f = k ** (+m[6] / +m[4]);
    if(!m[1] || /\b(fraction|percent|proportion)\b/.test(q)) return out(pcFrac(f) + " (" + pcNum(f * 100) + "%)");
    const left = +m[1] * f;
    return out(pcNum(left) + (m[2] && !/^(with|has|of|doubles|triples|grows|is)$/.test(m[2]) ? " " + m[2] : ""));
  }
  // $500 invested at 4% compounded monthly for 3 years
  const comp = s => ({daily:365, weekly:52, monthly:12, quarterly:4, "semi-annually":2, semiannually:2}[(/compounded (daily|weekly|monthly|quarterly|semi-?annually|annually|yearly)/.exec(s) || [])[1]] || 1);
  // how long until $1000 doubles at 7% compounded annually
  if((m = /^how (?:long|many years)\b.*?\$?\s*([\d,]+(?:\.\d+)?)\s*(?:to )?(?:grows?|increases?|becomes?)?\s*(?:to )\$?\s*([\d,]+(?:\.\d+)?)\b.*? at ([\d.]+)\s*%(.*)$/.exec(q))){
    const n = comp(m[4]), t = Math.log(+m[2].replace(/,/g, "") / +m[1].replace(/,/g, "")) / (n * Math.log(1 + +m[3] / 100 / n));
    if(isFinite(t) && t > 0) return out(pcNum(+t.toFixed(2)) + " years");
  }
  if((m = /^how (?:long|many years)\b.*?\b(doubles?|triples?)\b.*? at ([\d.]+)\s*%(.*)$/.exec(q))){
    const n = comp(m[3]), k = /^d/.test(m[1]) ? 2 : 3, t = Math.log(k) / (n * Math.log(1 + +m[2] / 100 / n));
    return out(pcNum(+t.toFixed(2)) + " years");
  }
  if((m = /(?:\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*dollars)\D*?(?:after|for|over|in) ([\d.]+) years?\s*(?:at|with) ([\d.]+)\s*%(.*)$/.exec(q))){
    const n = comp(m[5]), amt = +(m[1] || m[2]).replace(/,/g, "") * (1 + +m[4] / 100 / n) ** (n * +m[3]);
    return out("$" + amt.toFixed(2));
  }
  if((m = /(?:\$\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*dollars)\s*(?:[a-z]+ ){0,4}?at ([\d.]+)\s*%(.*?)\b(?:for|after|over) ([\d.]+) years?/.exec(q))){
    m = [m[0], m[1] || m[2], m[3], m[4], m[5]];
    const n = {daily:365, weekly:52, monthly:12, quarterly:4, "semi-annually":2, semiannually:2}[(/compounded (daily|weekly|monthly|quarterly|semi-?annually|annually|yearly)/.exec(m[3]) || [])[1]] || 1;
    const amt = +m[1].replace(/,/g, "") * (1 + +m[2] / 100 / n) ** (n * +m[4]);
    return out("$" + amt.toFixed(2));
  }
  // degrees and radians
  if((m = /^(?:convert )?(.+?)\s*(?:degrees?|deg|°)\s+(?:to|in|into)\s+radians?$/.exec(q))){
    const d = pcVal(m[1]); if(d === null) return null;
    const pi = pcPi(d * Math.PI / 180); return out((pi ? pi + " ≈ " : "") + pcNum(d * Math.PI / 180) + " radians");
  }
  if((m = /^(?:convert )?(.+?)\s*(?:radians?|rad)\s+(?:to|in|into)\s+degrees?$/.exec(q)) || ((m = /^(?:convert )?(.+?)\s+(?:to|in|into)\s+degrees?$/.exec(q)) && /π|pi/.test(m[1]))){
    const r = pcVal(m[1]); return r === null ? null : out(pcNum(r * 180 / Math.PI) + "°");
  }
  // remainder when x^3 - 2x + 1 is divided by x - 2
  if((m = /^(?:the )?remainder (?:when |of )?(.+?) (?:is )?divided by \(?\s*x\s*([+-])\s*([\d.]+)\s*\)?$/.exec(q))){
    const v = pcAt(m[1], (m[2] === "-" ? 1 : -1) * +m[3]); return v === null ? null : out(pcNum(v));
  }
  // is x - 1 a factor of x^3 - 1
  if((m = /^is \(?\s*x\s*([+-])\s*([\d.]+)\s*\)? a factor of (.+)$/.exec(q))){
    const a = (m[1] === "-" ? 1 : -1) * +m[2], v = pcAt(m[3], a); if(v === null) return null;
    return out(Math.abs(v) < 1e-9 ? "Yes. P(" + pcNum(a) + ") = 0." : "No. P(" + pcNum(a) + ") = " + pcNum(v) + ", so that is the remainder.");
  }
  // horizontal asymptote and end behaviour, read from far out along x
  if((m = /^horizontal asymptotes? of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$/.exec(q))){
    const a = pcAt(m[1], 1e6), b = pcAt(m[1], 1e7); if(a === null || b === null) return null;
    return out(Math.abs(a - b) < 1e-3 * Math.max(1, Math.abs(b)) ? "y = " + pcFrac(+b.toFixed(4)) : "None. It grows without bound.");
  }
  if((m = /^end behaviou?r of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+)$/.exec(q))){
    const hi = pcAt(m[1], 1e6), lo = pcAt(m[1], -1e6); if(hi === null || lo === null) return null;
    const to = v => Math.abs(v) < 1e3 ? pcNum(+v.toFixed(4)) : v > 0 ? "∞" : "-∞";
    return out("As x → ∞, y → " + to(hi) + ". As x → -∞, y → " + to(lo) + ".");
  }
  // roots, zeros, solving and factoring a quadratic
  if((m = /^(?:roots?|zeros?|solve|factor|x-intercepts?)\s+(?:of\s+)?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?$/.exec(q)) && (m[1] = m[1].replace(/^([^=]+)=([^=]+)$/, "($1)-($2)")) && (/x\s*\^\s*[3-6]/.test(m[1]) || (pcDeg(m[1]) || 0) > 2)){
    const roots = pcPolyRoots(m[1]); if(!roots) return null;
    const deg = pcDeg(m[1]) ?? pcDegree(m[1]), lead = Math.round(pcAt(m[1], 1e4) / 1e4 ** deg);
    if(/^factor/.test(q)){
      const co = pcCoeffs(m[1]);
      if(co && roots.length && roots.length < deg && Number.isInteger(roots[0])){
        const [rest, rm] = pcDivide(co, [1, -roots[0]]);
        if(Math.abs(rm[0]) < 1e-9 && rest.every(c => Number.isInteger(+c.toFixed(9)))) return out("(x " + pcSign(roots[0]) + ")(" + pcPoly(rest.map(c => +c.toFixed(9))) + ")");
      }
      if(roots.length !== deg || roots.some(r => !Number.isInteger(r))) return out(roots.length ? "Its rational roots are " + roots.map(pcFrac).join(", ") + ", but it does not split into integer factors." : "It has no rational roots.");
      return out((lead === 1 ? "" : lead === -1 ? "-" : lead) + [...roots].sort((x, y) => (x !== 0) - (y !== 0)).map(r => r === 0 ? "x" : "(x " + pcSign(r) + ")").join(""));
    }
    return out(roots.length ? roots.map(r => "x = " + pcFrac(r)).join(", ") : "No rational roots.");
  }
  if((m = /^(?:roots?|zeros?|solve|factor|x-intercepts?)\s+(?:of\s+)?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?$/.exec(q)) && (m[1] = m[1].replace(/^([^=]+)=([^=]+)$/, "($1)-($2)")) && /x\s*\^\s*2|x²/.test(m[1])){
    const co = pcQuad(m[1].replace(/x²/g, "x^2")); if(!co) return null;
    const roots = pcRoots(co);
    if(/^factor/.test(q)){
      // Each rational root p/q is a factor (qx - p); what is left over of the leading coefficient leads.
      const parts = (roots.length === 1 ? [roots[0], roots[0]] : roots).map(r => pcFrac(r).split("/").map(Number));
      if(roots.length === 0 || parts.some(([p, q = 1]) => !Number.isInteger(p) || !Number.isInteger(q))) return out("It does not factor over the integers.");
      const k = co[0] / parts.reduce((a, [, q = 1]) => a * q, 1);
      if(!Number.isInteger(+k.toPrecision(12))) return out("It does not factor over the integers.");
      const lead = k === 1 ? "" : k === -1 ? "-" : pcNum(k);
      return out(lead + parts.map(([p, q = 1]) => "(" + (q === 1 ? "" : q) + "x " + (p < 0 ? "+ " + -p : "- " + p) + ")").join(""));
    }
    return out(roots.length ? roots.map(r => "x = " + pcFrac(r)).join(" and ") : "No real roots.");
  }
  if((m = /^(?:roots?|zeros?|solve|x-intercepts?)\s+(?:of\s+)?(?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)(?:\s*=\s*0)?$/.exec(q)) && /x/.test(m[1]) && !/\b(sin|cos|tan|log|ln)\b/.test(m[1])){
    const roots = pcScanRoots(m[1].replace(/^([^=]+)=([^=]+)$/, "($1)-($2)"));
    if(roots.length && roots.length <= 6) return out(roots.map(r => "x = " + pcFrac(r)).join(", "));
  }
  // vertical asymptote of y = 1/(x - 3)
  if((m = /^vertical asymptotes? of (?:y\s*=\s*|f\(x\)\s*=\s*)?(.+?)\s*\/\s*\((.+)\)$/.exec(q))){
    const co = pcQuad(m[2]); if(!co) return null;
    const xs = pcRoots(co).filter(r => Math.abs(pcAt(m[1], r) ?? 1) > 1e-9);
    return out(xs.length ? xs.map(r => "x = " + pcFrac(r)).join(" and ") : "None.");
  }
  // amplitude and period of y = 3sin(2x)
  if((m = /^(amplitude and period|period and amplitude|amplitude|period) of (?:y\s*=\s*|f\(x\)\s*=\s*)?(-?[\d.]*)\s*(sin|cos|tan)\s*\(?\s*(-?[\d.]*\s*(?:π|pi)?)\s*x\s*(?:\/\s*([\d.]+))?/.exec(q))){
    const a = m[2] === "" || m[2] === "-" ? 1 : Math.abs(+m[2]), b = (m[4].trim() === "" || m[4].trim() === "-" ? 1 : Math.abs(pcVal(m[4]))) / (m[5] ? +m[5] : 1);
    const amp = m[3] === "tan" ? "none (tangent has no amplitude)" : pcNum(a);
    const p = (m[3] === "tan" ? Math.PI : 2 * Math.PI) / b, per = (pcPi(p) || pcNum(p)) + (pcPi(p) ? " ≈ " + pcNum(p) : "");
    if(m[1] === "amplitude") return out(m[3] === "tan" ? "None: tangent has no amplitude." : amp);
    if(m[1] === "period") return out(per);
    return out("Amplitude " + amp + ", period " + per + ".");
  }
  // solve sin x = 1/2 for 0 ≤ x < 2π
  if((m = /^solve\s+(-?[\d.]*)\s*(sin|cos|tan)\s*\(?x\)?\s*(?:([+-])\s*([\d.]+))?\s*=\s*(-?[^\s,]+)(.*)$/.exec(q))){
    const coef = m[1] === "" ? 1 : m[1] === "-" ? -1 : +m[1], shift = m[3] ? (m[3] === "-" ? -1 : 1) * +m[4] : 0;
    const rhs = pcVal(m[5].replace(/√(\d)/g, "sqrt($1)")); if(rhs === null) return null;
    const k = (rhs - shift) / coef;
    m = [m[0], m[2], m[5], m[6]];
    const f = m[1], base = f === "sin" ? Math.asin(k) : f === "cos" ? Math.acos(k) : Math.atan(k);
    if(isNaN(base)) return out("No solution: sine and cosine stay between -1 and 1.");
    const two = 2 * Math.PI, norm = v => ((v % two) + two) % two;
    const xs = [...new Set((f === "sin" ? [base, Math.PI - base] : f === "cos" ? [base, two - base] : [base, base + Math.PI]).map(v => +norm(v).toPrecision(12)))].sort((a, b) => a - b);
    const deg = /deg|°|360/.test(m[3]);
    return out(xs.map(v => "x = " + (deg ? pcNum(v * 180 / Math.PI) + "°" : pcPi(v) || pcNum(v))).join(" or "));
  }
  // sin 30 degrees, exact value of cos(5pi/6), tan(45°)
  if((m = /^(?:the )?(exact value of )?(sin|cos|tan|csc|sec|cot)(?![a-z])\s*\(?\s*([^)°]+?)\s*(°|degrees?|deg)?\s*\)?\s*(°|degrees?|deg)?$/.exec(q))){
    const a = pcVal(m[3]); if(a === null) return null;
    const rad = m[4] || m[5] ? a * Math.PI / 180 : a;
    const s = Math.sin(rad), c = Math.cos(rad);
    const v = {sin:s, cos:c, tan:s / c, csc:1 / s, sec:1 / c, cot:c / s}[m[2]];
    if(!isFinite(v) || Math.abs(v) > 1e12) return out("Undefined at that angle.");
    const exact = pcExact(v);
    return out(exact && exact !== pcNum(v) ? exact + " ≈ " + pcNum(v) : pcNum(v));
  }
  // quadrant, coterminal and reference angles, in degrees (or radians when the angle names pi)
  if((m = /^(?:what |which )?(quadrant|coterminal angles?|reference angle)\s+(?:is |of |for |does )?(?:the angle )?(-?[\d.]+\s*(?:π|pi)?(?:\s*\/\s*\d+)?)\s*(°|degrees?|deg|radians?)?(?: in| lie in| fall in)?$/.exec(q)) || (m = /^(?:what |which )?(quadrant) (?:is |does )?(-?[\d.]+)\s*(°|degrees?|deg)? (?:in|lie in)$/.exec(q))){
    const rad = /π|pi/.test(m[2]) || /^rad/.test(m[3] || ""), a = pcVal(m[2]); if(a === null) return null;
    const deg = rad ? a * 180 / Math.PI : a, d = ((deg % 360) + 360) % 360;
    const show = v => rad ? (pcPi(v * Math.PI / 180) || pcNum(v * Math.PI / 180)) : pcNum(v) + "°";
    if(/^quadrant/.test(m[1])) return out(d % 90 === 0 ? "None. It lies on an axis." : "Quadrant " + ["I", "II", "III", "IV"][Math.floor(d / 90)] + ".");
    if(/^coterminal/.test(m[1])) return out(show(Math.abs(d - deg) < 1e-9 ? deg - 360 : d) + " and " + show(deg + 360) + " (any multiple of " + (rad ? "2π" : "360°") + " away).");
    const ref = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
    return out(show(ref));
  }
  // prove tan x cos x = sin x: checked at many points, then the method
  if((m = /^(?:prove|verify|show)(?: that)?\s+(.+?)\s*=\s*(.+)$/.exec(q)) && /\b(sin|cos|tan|sec|csc|cot)\b/.test(m[0])){
    const T = e => e.replace(/\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(\d)\s*\(?\s*x\s*\)?/g, "($1(x))^$2").replace(/\b(sin|cos|tan|sec|csc|cot)\s*\(?\s*x\s*\)?/g, "$1(x)")
      .replace(/sec\(x\)/g, "(1/cos(x))").replace(/csc\(x\)/g, "(1/sin(x))").replace(/cot\(x\)/g, "(cos(x)/sin(x))").replace(/\)\s*(?=[a-z(\d])/g, ")*").replace(/(\d)\s*(?=[a-z(])/g, "$1*");
    const at = (e, x) => tryMath("0+(" + T(e).replace(/\bx\b/g, "(" + x + ")") + ")");
    const xs = [0.3, 0.7, 1.1, 2.0, 2.9, 4.2, 5.5], ok = xs.every(x => { const a = at(m[1], x), b = at(m[2], x); return a !== null && b !== null && Math.abs(a - b) < 1e-9; });
    return out(ok ? "True wherever both sides are defined. To prove it, write everything in sin and cos (tan x = sin x/cos x, sec x = 1/cos x, csc x = 1/sin x, cot x = cos x/sin x) and simplify one side until it matches the other." : "Not an identity: the two sides differ, for example at x = " + xs.find(x => { const a = at(m[1], x), b = at(m[2], x); return a === null || b === null || Math.abs(a - b) >= 1e-9; }) + ".");
  }
  // solve 1/x = 4, or any equation in x whose roots are small fractions
  if((m = /^solve\s+(?:for x:?\s*)?([^=]*x[^=]*)=\s*([^=]+)$/.exec(q)) && !/\b(sin|cos|tan|log|ln)\b/.test(q)){
    const roots = pcScanRoots("(" + m[1] + ")-(" + m[2] + ")");
    if(roots.length && roots.length <= 6) return out(roots.map(r => "x = " + pcFrac(r)).join(" or "));
  }
  // sector area with radius 4 and angle pi/2
  if((m = /^(?:the )?(?:area of (?:a |the )?sector|sector area)\b.*?radius (?:of |is )?([\d.]+).*?angle (?:of |is )?([\d.π\/pi ]+?)\s*(radians?|rad|degrees?|°)?$/.exec(q))){
    const t0 = pcVal(m[2]); if(t0 === null) return null;
    const t = /^d|°/.test(m[3] || "") ? t0 * Math.PI / 180 : t0, area = (+m[1]) ** 2 * t / 2;
    return out((pcPi(area) ? pcPi(area) + " ≈ " : "") + pcNum(area));
  }
  // arc length with radius 5 and angle 2 radians
  if((m = /^arc length\b.*?radius (?:of |is )?([\d.]+).*?angle (?:of |is )?([\d.π\/pi ]+?)\s*(radians?|rad|degrees?|°)?$/.exec(q))){
    const t = pcVal(m[2]); if(t === null) return null;
    return out(pcNum(+m[1] * (/^d|°/.test(m[3] || "") ? t * Math.PI / 180 : t)));
  }
  // inverse of y = 2x + 3
  if((m = /^(?:the )?inverse (?:function )?of (?:y|f\(x\))\s*=\s*([-+*\/.\d x()]+)$/.exec(q)) && /x/.test(m[1])){
    const b = pcAt(m[1], 0), k0 = pcAt(m[1], 1), k2 = pcAt(m[1], 2);
    if(b === null || k0 === null || k2 === null || Math.abs((k2 - b) - 2 * (k0 - b)) > 1e-9 || k0 === b) return null;
    // f⁻¹(x) = (x - b)/k, written over one whole-number denominator: (3x - 1)/2, not decimals.
    const k = k0 - b, slope = 1 / k, cut = -b / k;
    const den = v => +(pcFrac(+v.toPrecision(9)).split("/")[1] || 1), L = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(d => d % den(slope) === 0 && d % den(cut) === 0);
    if(!L) return out("f⁻¹(x) = (x - " + pcNum(b) + ")/" + pcNum(k));
    const A = Math.round(slope * L), B = Math.round(cut * L);
    const top = (A === 1 ? "" : A === -1 ? "-" : A) + "x" + (B ? (B > 0 ? " + " + B : " - " + -B) : "");
    return out("f⁻¹(x) = " + (L === 1 ? top : (B ? "(" + top + ")" : top) + "/" + L));
  }
  // what does y = -2f(3(x - 1)) + 4 do to the graph
  if((m = /y\s*=\s*(-?)\s*([\d.\/]*)\s*f\s*\(\s*x\s*\/\s*(\d+(?:\.\d+)?)\s*\)/.exec(q)) && /\b(do|does|graph|describe|change|changes|effect)\b/.test(q)){
    const d = +m[3]; return out("It stretches it horizontally by a factor of " + pcNum(d) + ".");
  }
  if((m = /y\s*=\s*(-?)\s*([\d.\/]*)\s*f\s*\(\s*(-?)\s*([\d.\/]*)\s*(?:\(\s*)?x\s*(?:([+-])\s*([\d.]+))?\s*\)?\s*\)\s*(?:([+-])\s*([\d.]+))?/.exec(q)) && /\b(do|does|graph|transform|transformation|effect|describe|change|changes|related|relate|compare)\b/.test(q)){
    if(m[2]) m[2] = String(pcVal(m[2])); if(m[4]) m[4] = String(pcVal(m[4]));
    const say = [];
    if(m[1]) say.push("reflects it across the x-axis");
    if(m[3]) say.push("reflects it across the y-axis");
    if(m[2] && +m[2] !== 1) say.push(+m[2] > 1 ? "stretches it vertically by a factor of " + pcNum(m[2]) : "compresses it vertically by a factor of " + pcNum(m[2]));
    if(m[4] && +m[4] !== 1) say.push("compresses it horizontally by a factor of 1/" + pcNum(m[4]) + (+m[4] < 1 ? " (a stretch)" : ""));
    if(m[5]) say.push("shifts it " + pcNum(m[6]) + " units " + (m[5] === "-" ? "right" : "left"));
    if(m[7]) say.push("shifts it " + pcNum(m[8]) + " units " + (m[7] === "+" ? "up" : "down"));
    if(say.length) return out("It " + say.join(", then ") + ".");
  }
  return null;
}
function constant(query){
  const q = query.trim().toLowerCase().replace(/[?.!]+$/, "").replace(/^(?:what(?:'s|’s| is) |value of |tell me )?(?:the )?(?:value of (?:the )?)?/, "").replace(/’/g, "'").trim();
  const hit = CONSTANTS.find(([re]) => re.test(q));
  return hit ? {title:hit[1], body:hit[2], src:"NIST", url:"https://physics.nist.gov/cuu/Constants/"} : null;
}

// First non-null wins, in order. Sources are functions so a throw in one never kills the chain.
async function firstOf(query, fns){
  for(const fn of fns){ const r = await fn(query).catch(()=>null); if(r) return r; }
  return null;
}

// One call, one normalized answer. kind: convert | math | graph | card | text | none
// opts.ifUnset: what to assume while the AI switch is untouched ("no" for the landing demo's examples).
async function answer(query, opts={}){
  const c = tryConvert(query);
  if(c) return {kind:"convert", ...c};
  const nf = numberFact(query);
  if(nf !== null) return {kind:"math", value:nf};
  const m = tryMath(query);
  if(m !== null) return {kind:"math", value:m};
  const pc = precalc(query);
  if(pc) return pc;
  const ge = graphExpr(query), svg = ge && graph(ge);
  if(svg) return {kind:"graph", expr:ge, svg};
  const k = constant(query);
  if(k) return {kind:"text", ...k, sources:sourcesFor(k.body, [k])};
  const dt = deviceTime(query);
  if(dt) return dt;
  // opts.pack: the downloaded offline pack, when the page has one. Offline it is the only answer source left.
  // Private mode: nothing leaves the device. Same path as offline, with its own message when there is no pack.
  if(opts.privateMode) return opts.pack ? (packAnswer(query, opts.pack) || {kind:"pack-miss"}) : {kind:"private-nopack"};
  // Offline, a conversion still answers from the last rate this device saved for the pair (the fetch fails fast).
  if(typeof navigator!=="undefined" && navigator.onLine===false){ const fx=await currency(query).catch(()=>null); if(fx) return fx; }
  if(typeof navigator!=="undefined" && navigator.onLine===false) return opts.pack ? (packAnswer(query, opts.pack) || {kind:"pack-miss"}) : {kind:"offline"};
  // Pattern-gated live sources: each returns null fast unless the query is shaped for it.
  const cur = await currency(query).catch(()=>null);
  if(cur) return cur;
  // Sports before market, so a league name in capitals ("NFL") never reads as a ticker.
  const sp = await sports(query).catch(()=>null);
  if(sp) return sp;
  const mk = await market(query).catch(()=>null);
  if(mk) return mk;
  const live = await firstOf(query, [identity, news, site, etymology, dictionary, weather, localTime]);
  if(live) return live.kind ? live : {kind:"text", ...live, sources:sourcesFor(live.body, [live])};
  // ifUnset: the landing's rotating examples pass "no" so a visitor who never typed spends no AI calls.
  const consent = aiConsent() || opts.ifUnset || "yes";
  if(consent==="no"){
    const hit = labelIfGeneric(await firstOf(query, [ddg, wiki]), query);
    return hit ? {kind:"text", ...hit, sources:sourcesFor(hit.body, [hit]), ...(isTimeSensitive(query) ? {asOf:new Date().toISOString()} : {})} : (opts.pack && packAnswer(query, opts.pack)) || {kind:"none"};
  }
  // A model's number is an unsourced guess: for numeric answers prefer DDG when it has one.
  const aiNote = {};
  // Started now, read only if the answer needs a photo or its source text: it used to wait for the AI (0.3 to 0.7 s more).
  const searching = NO_PHOTO_Q.test(query) ? null : topicSearch(query).catch(()=>null);
  let [ai, dd] = await Promise.all([gemma(query, aiNote).catch(()=>null), ddg(query).catch(()=>null)]);
  // The models clash. DDG's abstract that backs one of the two settles it (the normal path below); otherwise both answers show, with no pick and no photo.
  if(ai && ai.disagree){
    if(!(dd && ai.disagree.some(x => agrees(x.answer, dd.grounding || dd.body)))){
      return {kind:"disagree", title:query, alts:ai.disagree, asOf:new Date().toISOString(),
        sources:(ai.refs||[]).slice(0,2).map(r => ({name:r.title, url:r.url}))};
    }
    ai = null;
  }
  // The model's photo, when its page backs the sentence, stays with the number it was shown with.
  // Only a DDG abstract with a number of its own: "speed of sound" swapped 343 m/s for a definition.
  let hit = (ai && /\d/.test(ai.body) && dd && /\d/.test(dd.body)) ? {...dd, image: dd.image || ai.image || null} : labelIfGeneric(ai || dd || await firstOf(query, [wiki]), query);
  // The answer's Wikipedia topic can supply a picture (when the proxy sent none) and the text behind the sentence (when nothing else did).
  if(hit && (!hit.image || !hit.grounding)){
    const t = await topicFor(query, hit.body, searching).catch(()=>null);
    if(t){
      if(!hit.image && t.photo) hit = {...hit, image:t.photo};
      if(!hit.grounding && t.grounding) hit = {...hit, grounding:t.grounding.extract, groundingTitle:t.grounding.title, groundingUrl:t.grounding.url};
    }
  }
  if(hit) turns.add(query, hit.body);
  // The model names no page, so the DDG abstract is the only link here; it must back the sentence.
  // The proxy's Wikipedia pages fill the second link (web shows at most two): the first ones that are not DDG's own article.
  const wikiRefs = (ai?.refs || []).filter(r => !dd || norm(r.url) !== norm(dd.url)).filter(r => onTopic(r.title, query, hit && hit.body)).slice(0,2).map(r => ({src:r.title, url:r.url, grounding:r.grounding}));
  // The worker's aiError rides on the fallback only when the AI call failed and gave no answer.
  // Every online source came up empty: the offline pack, when there is one, answers instead of "none".
  return hit ? {kind:"text", ...hit, sources:sourcesFor(hit.body, [hit, dd, ...wikiRefs]).slice(0,2), ...(!ai && aiNote.aiError ? {aiError:aiNote.aiError} : {}), ...(isTimeSensitive(query) ? {asOf:new Date().toISOString()} : {})} : (opts.pack && packAnswer(query, opts.pack)) || {kind:"none"};
}

// "This is wrong": the question and the answer text go to the review list, nothing else. True when it was taken.
async function reportWrong(query, answer){
  const d = await getJSON(ANSWER_PROXY+"/report", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q:query, answer:String(answer||"").slice(0,500)})});
  return d?.ok === true;
}
// "Tell me more": three sentences from the proxy for a question already answered, with the pages behind them.
// Null when the proxy has nothing more to say; the one-liner then stands.
async function tellMore(query){
  const d = await getJSON(ANSWER_PROXY, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q:query, more:true})});
  const body = typeof d?.answer==="string" ? d.answer.trim() : "";
  if(!body || body==="UNKNOWN") return null;
  const refs = (Array.isArray(d.refs) ? d.refs : []).filter(r => r && /^https:\/\//.test(r.url||"")).slice(0,2).map(r => ({name:r.title||"Wikipedia", url:r.url}));
  return {body, src:d.source||"Nimble AI", sources:refs};
}

// Photo markup. The frame reserves its 16:9 box before the picture arrives (no layout jump), the cream
// fills it until load, and a picture that fails to load is removed rather than shown broken.
function photoHTML(url, alt){
  return '<span class="mockup-photo"><img src="'+attrEsc(url)+'" alt="'+attrEsc(alt||"")+'" loading="lazy" decoding="async" onload="this.classList.add(\'on\')" onerror="this.parentNode.remove()"></span>';
}
function thumbHTML(url, alt){
  return '<img class="news-thumb" src="'+attrEsc(url)+'" alt="'+attrEsc(alt||"")+'" width="56" height="56" loading="lazy" decoding="async" onload="this.classList.add(\'on\')" onerror="this.remove()">';
}
function attrEsc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
// Every link we render: http(s) only, attribute-escaped. A javascript: or data: URL from a feed or a page becomes "#".
function hrefOf(u){ const t=String(u||""); return attrEsc(/^https?:\/\//i.test(t) ? t : "#"); }
// English fallback for the translator hook: fills {name} slots and nothing else.
function plain(key, vars){ let s=key; if(vars) for(const k in vars) s=s.split("{"+k+"}").join(vars[k]); return s; }

// --- Search history: this device only, newest first, de-duplicated, last 50 ---
// Named searchHistory because a page global called history is window.history. Exported as history.
const HISTORY_KEY = "nimble.history", HISTORY_MAX = 50;
const searchHistory = {
  list(){
    try{
      const a = JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
      return Array.isArray(a) ? a.filter(e=>e && typeof e.q==="string" && e.q).slice(0,HISTORY_MAX) : [];
    }catch{ return []; }
  },
  // `a` is the saved answer snippet: the first 280 characters of the answer's text. Stored on this device only.
  add(query, answer){
    const q = String(query||"").trim(); if(!q) return;
    const a = typeof answer==="string" && answer.trim() ? answer.trim().slice(0,280) : null;
    try{
      const rest = this.list().filter(e=>e.q.toLowerCase()!==q.toLowerCase());
      localStorage.setItem(HISTORY_KEY, JSON.stringify([{q, t:Date.now(), ...(a?{a}:{})}, ...rest].slice(0,HISTORY_MAX)));
    }catch{}
  },
  // Removes the rows whose question is in `queries` (a string or an array of strings).
  remove(queries){
    const drop = new Set([].concat(queries).map(x=>String(x).toLowerCase()));
    try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(this.list().filter(e=>!drop.has(e.q.toLowerCase())))); }catch{}
  },
  clear(){ turns.clear(); try{ localStorage.removeItem(HISTORY_KEY); }catch{} },
};

// Answer as HTML, shared by the landing demo and /app. Returns {h, credit, kind}.
// opts.t is an optional translator (the page's I18N.t); the API workers pass none and get English.
async function renderAnswer(query, opts){
  const esc=t=>String(t).replace(/</g,"&lt;");
  const T=(opts&&opts.t)||plain;
  // The freshness line: quiet, under the answer, same left edge as the source row.
  const fresh=x=>x.asOf?'<p class="as-of num">'+esc(T("as of {t}",{t:asOfLabel(x.asOf,x.asOfDay)}))+'</p>':'';
  const a=(opts&&opts.scripted)||await answer(query, opts);
  // A text answer's header says BACKGROUND for the generic topic page; its lead lines sit right under the header.
  const isText = a.kind==="text";
  let h='<div class="mockup-label">'+T(isText&&a.background?"Background":"Answer")+'</div>', credit='';
  if(isText){
    // One quiet line under the header, never two stacked (same as QueryResult.leadLines in Swift): the resting note first when the free AI is out, then the background caption.
    const note = a.aiError && a.src==="Wikipedia" ? T("The free AI is out of answers for today, so this is from Wikipedia. It resets in the evening.") : "";
    if(a.background) h+='<p class="bg-caption">'+[note, T("Not a direct answer to your question. Background from Wikipedia:")].filter(Boolean).map(esc).join(" ")+'</p>';
    else if(note) h+='<p class="ai-note"><img src="mascot/nim-doze.svg" width="32" height="32" alt="">'+esc(note)+'</p>';
  }
  if(a.kind==="convert"){ h+='<div class="mockup-big num">'+a.to+' '+esc(a.toUnit)+'</div><p class="num">'+a.from+' '+esc(a.fromUnit)+'</p>'; credit=T("computed offline"); }
  else if(a.kind==="card"){
    // Same markup as convert; the whole card opens its source like a text answer does.
    const href=hrefOf(a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query));
    h+='<a class="mockup-link mockup-card" href="'+href+'" target="_blank" rel="noopener"><div class="mockup-big num">'+esc(a.big)+(a.unit?" "+esc(a.unit):"")+'</div><p class="num">'+esc(a.sub)+'</p></a>'+fresh(a);
    credit=esc(T("powered by {s}",{s:a.src}));
  }
  else if(a.kind==="market"){
    // Title, the price, the change in words, then the freshness line and the source. A failed quote shows a calm state, never a number.
    if(a.unavailable){ h+='<p class="market-title">'+esc(a.title)+'</p><p class="market-state">'+esc(T("Quote unavailable right now"))+'</p>'; }
    else {
      h+='<a class="mockup-link mockup-card" href="'+hrefOf(a.url)+'" target="_blank" rel="noopener"><p class="market-title">'+esc(a.title)+'</p><div class="market-price num">'+esc(a.big)+'</div>'+(a.change?'<p class="market-change num">'+esc(a.change)+'</p>':'')+'</a>'+fresh(a);
      credit=esc(T("powered by {s}",{s:a.src}));
    }
  }
  else if(a.kind==="sports"){
    // The score in words with the winner in bold, the status under it, and the as-of line. A failed request is the calm state; a game not found names the days checked. Never a guessed score.
    const head='<p class="sports-title">'+esc(a.title)+'</p>';
    if(a.unavailable) h+=head+'<p class="sports-state">'+esc(T("Scores unavailable right now"))+'</p>';
    else if(a.none){
      const msg = a.league ? T("No {league} games in the last week",{league:a.league})
        : T("No game found for the {team} in the last week",{team:a.title});
      h+=head+'<p class="sports-state">'+esc(msg)+'</p>'+fresh(a);
    }
    else {
      const href=hrefOf(a.url);
      const line = r => r.state==="pre" && r.teams.length===2 ? esc(r.teams[0].name)+" vs "+esc(r.teams[1].name)
        : r.teams.map(t=>{ const sc=t.score!==""?" "+esc(t.score):""; return t.winner ? "<strong>"+esc(t.name)+sc+"</strong>" : esc(t.name)+sc; }).join(", ");
      h+=head+'<div class="sports-rows">'+a.rows.map(r=>'<a class="mockup-link mockup-card" href="'+href+'" target="_blank" rel="noopener"><p class="sports-score num">'+line(r)+'</p><p class="sports-status num">'+esc(r.status)+'</p></a>').join("")+'</div>'+fresh(a);
      credit=esc(T("powered by {s}",{s:a.src}));
    }
  }
  else if(a.kind==="math"){
    h+='<div class="mockup-big num">'+a.value+'</div>';
    const steps = mathSteps(query);
    if(steps) h+='<details class="why steps"><summary>'+esc(T("Show steps"))+'</summary><ol>'+steps.map(l=>"<li>"+esc(l)+"</li>").join("")+"</ol></details>";
    credit=T("computed offline");
  }
  else if(a.kind==="graph"){ h+=a.svg+'<p>y = '+esc(a.expr)+'</p>'; credit=T("computed offline"); }
  else if(a.kind==="news"){
    // One sentence per story, the outlet beside it, and the link on the sentence. A story with a
    // picture gets a 56px square beside its sentence; without one the row is the plain layout.
    h+='<ol class="news">'+a.items.map(i=>'<li'+(i.image?' class="has-thumb"':'')+'>'
      +(i.image?thumbHTML(i.image.url, i.title||i.sentence):'')
      +'<div><a href="'+hrefOf(i.url)+'" target="_blank" rel="noopener">'+esc(i.sentence)+'</a> <span class="news-src">'+esc(i.outlet)+'</span></div></li>').join("")+'</ol>'+fresh(a);
    credit=esc(T("powered by {s}",{s:a.src}));
  }
  else if(a.kind==="disagree"){
    // Both answers, each with its model name quiet under it, and no photo: the sources do not say which is right, so the card picks neither.
    h+='<p class="disagree-title">'+esc(T("Sources disagree"))+'</p>'
      +a.alts.map(x=>'<div class="disagree-alt"><p class="disagree-answer">'+esc(x.answer)+'</p><p class="disagree-model">'+esc(x.model)+'</p></div>').join("")
      +fresh(a)+((a.sources||[]).length ? '<p class="sources">'+sourceRow(a.sources)+'</p>' : "");
    credit="";
  }
  else if(a.kind==="offline"){ h+="<p>"+T("You're offline. Math, units and graphs still work.")+"</p>"; }
  else if(a.kind==="private-nopack"){ h+="<p>"+T("Private mode is on, so nothing leaves this device. Math, units and graphs work. Download the offline answers to look up facts.")+"</p>"; }
  else if(a.kind==="pack-miss"){ h+="<p>"+T("Not in the offline pack. Math, units and graphs still work offline.")+"</p>"; }
  else if(a.kind==="pack"){
    // Offline pack hit: the entry's first sentences, credited to Wikipedia with its article link and the pack's build date.
    h+='<p>'+esc(a.text)+'</p>'+(a.asOf?'<p class="as-of num">'+esc(T("as of {t}",{t:asOfLabel(a.asOf,true)}))+'</p>':'');
    credit='<a href="'+hrefOf(a.url)+'" target="_blank" rel="noopener">'+esc(T("Offline pack \u00B7 Wikipedia (CC BY-SA)"))+'</a>';
  }
  else if(a.kind==="text"){
    // Click through to the source; AI answers have none, so fall back to a web search.
    const href=a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query);
    // A photo (Wikipedia lead image, a site's share image) tops the card; the favicon only stands in when there is none.
    const photo = a.image && a.image.url ? photoHTML(a.image.url, a.title) + (a.image.title ? '<span class="photo-credit">'+esc(a.image.title)+' \u00B7 Wikipedia</span>' : "") : "";
    h+='<a class="mockup-link" href="'+hrefOf(href)+'" target="_blank" rel="noopener">'
      +photo
      +(a.icon&&!photo?'<img class="mockup-icon" src="'+esc(a.icon)+'" alt="" width="24" height="24" loading="lazy">':'')
      +(a.title.toLowerCase()===query.toLowerCase()?'':'<h3 aria-level="2">'+esc(a.title)+'</h3>')
      +(a.rows ? '<div class="compare-rows">'+a.rows.map(r=>'<p><span class="compare-label">'+esc(r.label)+'</span> <strong class="num">'+esc(r.value)+'</strong></p>').join("")+'</div>' : '<p>'+esc(a.body)+'</p>')+'</a>'+fresh(a);
    // "Why this answer": the source line opens the exact text the sentence was cut from, with a link.
    // Shown only when that text says more than the sentence did.
    const why = typeof a.grounding==="string" && a.grounding.trim().length > a.body.trim().length;
    // A site's own page is where the answer came from, not what powered it: "from primitive.dev".
    const credited = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(a.src) ? T("from {s}",{s:a.src}) : T("powered by {s}",{s:a.src});
    if(why){
      // The link names the page the text came from: the Wikipedia topic when there is one, else the source.
      const gHref = a.groundingUrl || href, gName = a.groundingTitle ? a.groundingTitle+" \u00B7 Wikipedia" : a.src;
      h+='<details class="why"><summary>'+esc(credited)+'</summary><p>'+esc(a.grounding.trim())+'</p>'
        +'<a href="'+hrefOf(gHref)+'" target="_blank" rel="noopener">'+esc(gName)+'</a></details>';
      credit="";
    } else credit=esc(credited);
    // Two or more linked sources sit under the sentence, names only; the row replaces the credit line.
    if((a.sources||[]).length>1){
      h+='<p class="sources">'+sourceRow(a.sources)+'</p>';
      credit="";
    }
  }
  else { h+="<p>"+T('No instant answer. Try a question, a sum, or "5 miles to km".')+"</p>"; }
  return {h, credit, kind:a.kind, a};
}

// --- Share card: the answer as a 1200x630 PNG, yellow, one question, one answer, one source ---
// What the card says for each answer kind; null when there is nothing worth sharing.
function shareText(a){
  if(!a) return null;
  switch(a.kind){
    case "math": return typeof a.value==="number" && isFinite(a.value) ? String(+a.value.toPrecision(12)) : null;
    case "convert": return a.to+" "+a.toUnit;
    case "graph": return "y = "+a.expr;
    case "card": return a.big+(a.unit?(a.unit[0]==="\u00B0"?"":" ")+a.unit:"")+(a.sub?", "+a.sub:"");
    case "market": return a.unavailable ? null : a.title+" "+a.big+(a.change?", "+a.change:"");
    case "text": return a.body ? first(a.body) : null;
    case "pack": return a.text ? first(a.text) : null;
    case "news": return a.items[0] ? a.items[0].sentence : null;
    default: return null;
  }
}
const shareSource = a => ["math","convert","graph"].includes(a?.kind) ? "Computed offline" : (a?.src||"");

// Greedy word wrap; a word wider than the line is cut by character so nothing ever clips.
function wrapLines(ctx, text, width){
  const lines=[]; let line="";
  for(const w of String(text).split(/\s+/)){
    const t=line?line+" "+w:w;
    if(ctx.measureText(t).width<=width){ line=t; continue; }
    if(line) lines.push(line);
    line=w;
    while(ctx.measureText(line).width>width && line.length>1){
      let n=line.length-1; while(n>1 && ctx.measureText(line.slice(0,n)).width>width) n--;
      lines.push(line.slice(0,n)); line=line.slice(n);
    }
  }
  if(line) lines.push(line);
  return lines;
}
const SHARE_FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
function shareMark(){
  return new Promise(res=>{
    try{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src="icon-512.png"; }catch{ res(null); }
  });
}
// The three card shapes: wide for links and feeds, square for posts, story for full-screen. Story keeps clear of the
// top and bottom strips the story apps cover with their own buttons.
const SHARE_SHAPES={ wide:{w:1200,h:630,top:72,bottom:72,k:1}, square:{w:1080,h:1080,top:72,bottom:72,k:1.2}, story:{w:1080,h:1920,top:220,bottom:260,k:1.2} };
// Draws the card on an offscreen canvas. Resolves a PNG Blob, or null where there is no canvas.
async function shareImage(query, answer, shape){
  try{
    const text=shareText(answer);
    if(!text || typeof document==="undefined") return null;
    const S=SHARE_SHAPES[shape]||SHARE_SHAPES.wide, k=S.k;
    const W=S.w, H=S.h, M=72, BOX=W-2*M;
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    const ctx=cv.getContext("2d"); if(!ctx) return null;
    const mark=await shareMark();
    const spacing=(px,em)=>{ if("letterSpacing" in ctx) ctx.letterSpacing=(px*em)+"px"; };
    ctx.fillStyle="#ffca30"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#000"; ctx.textBaseline="alphabetic"; ctx.textAlign="left";
    // Question: 36px, 400, top-left, two lines at most.
    const qpx=Math.round(36*k), qlh=Math.round(44*k);
    ctx.font="400 "+qpx+"px "+SHARE_FONT; spacing(qpx,0);
    const q=wrapLines(ctx,query,BOX), qs=q.slice(0,2);
    if(q.length>2){ let l=qs[1]; while(l.length>1 && ctx.measureText(l+"\u2026").width>BOX) l=l.slice(0,-1); qs[1]=l.trimEnd()+"\u2026"; }
    qs.forEach((l,i)=>ctx.fillText(l,M,S.top+Math.round(27*k)+i*qlh));
    // Answer: up to 96px, 700, tight, centred vertically; shrinks until it fits.
    // Room between the question block and the footer, either side of centre.
    const maxH=shape==="story"||shape==="square" ? Math.min(H-S.top-S.bottom-2*(qlh*2+60), 1000) : 280, top=H/2;
    let size=Math.round(96*k), lines, lh;
    for(; size>=28; size-=4){
      ctx.font="700 "+size+"px "+SHARE_FONT; spacing(size,-0.02);
      lines=wrapLines(ctx,text,BOX); lh=Math.round(size*1.1);
      if(lines.length*lh<=maxH) break;
    }
    const y0=top-(lines.length*lh)/2+size*0.82;
    lines.forEach((l,i)=>ctx.fillText(l,M,y0+i*lh));
    // Footer: source small caps bottom-left, the bulb 56px bottom-right.
    const fy=H-S.bottom-28;
    spacing(0,0); ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.textBaseline="middle";
    if("fontVariantCaps" in ctx){ ctx.font="500 28px "+SHARE_FONT; ctx.fontVariantCaps="all-small-caps"; spacing(28,0.08); /* font resets the caps variant, so it goes second */ ctx.fillText(shareSource(answer),M,fy); ctx.fontVariantCaps="normal"; }
    else { ctx.font="500 18px "+SHARE_FONT; ctx.fillText(shareSource(answer).toUpperCase(),M,fy); }
    if(mark){ ctx.imageSmoothingQuality="high"; ctx.drawImage(mark,W-M-56,H-S.bottom-56,56,56); }
    return await new Promise(res=>cv.toBlob(b=>res(b||null),"image/png"));
  }catch{ return null; }
}

// Words for the mic button by state. Only "listening" changes the field's placeholder; "" keeps the usual one.
function listenLabel(state){
  return state==="listening"
    ? {button:"Stop listening", placeholder:"Listening"}
    : {button:"Ask by voice", placeholder:""};
}

function appLink(query){
  return "/app?q="+encodeURIComponent(query);
}

if(typeof module!=="undefined") module.exports={numberFact,precalc,constant,tellMore,reportWrong,packSearch,packHits,packAnswer,PACK_MIN,agrees,sourcesFor,sourceRow,onTopic,answerEntities,photoFromEntity,topicFor,identity,siteHost,site,shareText,shareSource,shareImage,SHARE_SHAPES,cardShape,renderAnswer,tryMath,mathSteps,samplePoints,tryConvert,convertValue,graphExpr,graph,currencyExpr,market,stockSymbol,parseDaily,changeText,asOfLabel,isTimeSensitive,sports,sportsQuery,sportsRecent,sportsRecentDay,gameRow,kickoffLabel,sportsStatus,CRYPTO_RE,first,answer,wiki,relationOf,getJSON,aiConsent,aiRecipient,mascot,appLink,listenLabel,history:searchHistory,turns,isSpecificQuestion,labelIfGeneric};
