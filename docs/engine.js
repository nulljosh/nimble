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
  if(!/^(who (made|created|built|invented|wrote|developed|designed) (you|nimble)|who are you|what are you|who is (nimble|your (creator|maker)))\s*\??$/i.test(query.trim())) return null;
  return {title:query, body:"Nimble is an instant-answer app made by Joshua Trommel. More of his work is at jaybulb.com.", src:"Nimble"};
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
    [/^(?:what is )?activation energy$/, "The minimum energy colliding particles need to react."],
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
function precalc(query){
  let q = String(query).trim().toLowerCase().replace(/[?.!]+$/, "").replace(/[−–]/g, "-").replace(/^(?:what(?:'s|’s| is) |find |calculate |determine )(?:the )?/, "");
  const out = body => ({kind:"text", title:null, body, src:"Nimble math", source:"Nimble math"});
  for(const [re, body] of PC_FACTS) if(re.test(q)) return out(body);
  const sc10 = sci10(q, query); if(sc10) return sc10;
  const ph11 = phys11(q); if(ph11) return ph11;
  const ch12 = chem12(q, query); if(ch12) return ch12;
  const ch11 = chem11(q, query); if(ch11) return ch11;
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
