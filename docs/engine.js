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
      const v = Math[f](a.value);
      if(steps) steps.push(f + "(" + a.text + ") = " + mathFmt(v));
      return {text: mathFmt(v), value: v};
    }
    const n = Number(t); if(Number.isNaN(n)) throw 0; return {text:t, value:n, leaf:true};
  };
  const v = expr(); if(i!==tk.length) throw 0; return v.value;
}
// "what's nine plus ten" is math, not a Wikipedia search for Vine. Spoken numbers 0-20, the
// tens and the usual operator words; anything left over fails the whitelist below.
// ponytail: no "twenty one" compounds, add when someone asks for one
const WORD_NUM={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100,thousand:1000,million:1e6};
function spokenMath(s){
  return s.toLowerCase().replace(/[?!]+$/,"").replace(/^\s*(what(?:'s|\u2019s| is)|whats|calculate|compute|how much is|solve|evaluate)\s+/,"")
    .replace(/\b(multiplied by|times)\b/g,"*").replace(/\bdivided by\b/g,"/").replace(/\bto the power of\b/g,"^").replace(/\bplus\b/g,"+").replace(/\bminus\b/g,"-")
    .replace(/\b[a-z]+\b/g,w=>w in WORD_NUM ? WORD_NUM[w] : w);
}
// The on-device expression behind a math query, or null. Percent-of is rewritten to a division
// and a product, so "20% of 50" evaluates as 20/100*50.
function mathSource(s){
  const t = spokenMath(s).trim().replace(/([\d.]+)\s*%\s*of\s*/g,"$1/100*").replace(/\^/g,"**").replace(/\bpi\b/g,"Math.PI").replace(/\be\b/g,"Math.E")
    .replace(/\b(sqrt|sin|cos|tan|log|log2|log10|abs|round|floor|ceil|cbrt)\b/g,"Math.$1")
    .replace(/\bln\b/g,"Math.log");
  if(!/^[0-9+\-*/(). ,]*(Math\.[a-z0-9]+|[0-9+\-*/(). ,])*$/.test(t)) return null;
  if(!/[0-9]/.test(t) || !/[+\-*/]|Math\./.test(t)) return null;
  return t;
}
function tryMath(s){
  const t = mathSource(s); if(t===null) return null;
  try{ const v = evalMath(t);
    return (typeof v==="number" && isFinite(v)) ? v : null; }
  catch{ return null; }
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
const first = (t) => t.trim().split(/(?<!\b[A-Z][a-z]{0,2}\.)(?<=[.!?])\s+(?=[A-Z0-9"(])/)[0];

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
  return words.length > 0 && words.every(w => allowed.has(w));
}

// The linked sources as "Name · Name", each one a link. Names only: no new words in the UI.
function sourceRow(list){
  const esc=t=>String(t).replace(/</g,"&lt;");
  return list.map(s=>'<a href="'+esc(s.url).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener">'+esc(s.name)+'</a>').join(" \u00B7 ");
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
async function topicFor(query, body){
  if(NO_PHOTO_Q.test(query)) return null;
  const ents = answerEntities(query, body);
  const [search, ...first] = await Promise.all([
    getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=3&origin=*`),
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
  {re:/^when\s+(?:was|did|were|is)\s+(.+?)(?:\s+(?:born|founded|built|invented|released|published|created|written|made|died|die))?\s*\??$/i, word:/\b(?:1[0-9]{3}|20[0-9]{2})\b/},
];
function relationOf(query){
  const q = String(query||"").trim();
  for(const r of RELATIONS){ const m = r.re.exec(q); if(m) return {subject:m[1].replace(/^the\s+/i,""), word:r.word, not:r.not}; }
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
  return extract.split(/(?<=[.!?])\s+/).map(s => s.replace(/\s*\(\s*\)/g,"").replace(/\s+,/g,",").trim())
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
function currencyExpr(s){
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
  const rate=d?.rates?.[c.to]; if(!rate) return null;
  const fmt=n=>n.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
  return {...card(fmt(c.v*rate), c.to, `${c.v.toLocaleString("en")} ${c.from} at today's rate`,
    d.base?"Frankfurter":"ExchangeRate-API", d.base?"https://frankfurter.dev":"https://www.exchangerate-api.com"),
    ...(d.date ? {asOf:d.date, asOfDay:true} : {})};
}

// --- freshness: "as of Oct 12, 3:41 pm" for anything time-sensitive. asOf is an ISO time, or a date with asOfDay. ---
// Pure: the day or time is formatted from the value, never from the clock, so tests can pin it with a zone.
function asOfLabel(when, day, tz){
  const d=new Date(when); if(isNaN(d)) return "";
  if(day) return new Intl.DateTimeFormat("en",{month:"short",day:"numeric",timeZone:"UTC"}).format(d);
  return new Intl.DateTimeFormat("en",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",...(tz?{timeZone:tz}:{})}).format(d).replace(/\b(AM|PM)\b/,m=>m.toLowerCase());
}
const asOfNow = o => ({...o, asOf:new Date().toISOString()});

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
async function stockCard(sym){
  const base={kind:"market", title:sym, src:"Stooq", url:`https://stooq.com/q/?s=${sym.toLowerCase()}.us`};
  const p=parseDaily(await quoteText(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}.us&i=d`));
  if(!p) return {...base, unavailable:true};
  return {...base, big:usd(p.close), change:changeText(p.pct, "on "+dayLabel(p.date)), asOf:p.date, asOfDay:true};
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
  const found = (lg, hit, dated) => ({...base, url: SPORTS_LEAGUES[lg].url, rows:[gameRow(hit.ev, hit.ours, lg, now, tz, dated)], asOf});
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
async function weather(query){
  const place=/^(?:what(?:'s| is) the )?weather (?:in|for|at) (.+?)\??$/i.exec(query.trim())?.[1]; if(!place) return null;
  const loc=await geocode(place); if(!loc) return null;
  const w=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code,wind_speed_10m`);
  const c=w?.current; if(!c) return null;
  const sky={0:"clear",1:"mostly clear",2:"partly cloudy",3:"overcast",45:"fog",48:"fog",51:"drizzle",53:"drizzle",55:"drizzle",61:"rain",63:"rain",65:"heavy rain",71:"snow",73:"snow",75:"heavy snow",80:"showers",81:"showers",82:"heavy showers",95:"thunderstorm"}[c.weather_code]||"";
  return asOfNow(card(Math.round(c.temperature_2m), "°C", [loc.name, loc.country, sky, `wind ${Math.round(c.wind_speed_10m)} km/h`].filter(Boolean).join(", "), "Open-Meteo", "https://open-meteo.com"));
}
async function localTime(query){
  const place=/^(?:what(?:'s| is) the )?(?:current )?time (?:in|at) (.+?)\??$/i.exec(query.trim())?.[1]; if(!place) return null;
  const loc=await geocode(place); if(!loc?.timezone) return null;
  try{
    const now=new Date(), tz=loc.timezone;
    const big=new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
    const day=new Intl.DateTimeFormat("en",{timeZone:tz,weekday:"long",month:"long",day:"numeric"}).format(now);
    return asOfNow(card(big, loc.name, `${day}, ${tz}`, "Open-Meteo", "https://open-meteo.com"));
  }catch{ return null; }
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
// --- AI consent (same rule as the native apps) ---
// unset = ask, "no" = DuckDuckGo and Wikipedia only, "yes" = the model may answer.
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
// Who receives the question, named in the consent card. Mirrors AppState.aiRecipient.
function aiRecipient(){
  const c = aiConfig(), e = ENGINES[c.engine] || ENGINES.nimble;
  switch(e.key && !c.apiKey ? "nimble" : c.engine){
    case "claude": return "Anthropic (Claude)";
    case "openai": return "OpenAI";
    case "ollama": return "your own Ollama server";
    case "samantha": return "Samantha, running on this Mac";
    default: return "Nimble's answer service (Google Gemma and Alibaba Qwen on Cloudflare)";
  }
}
// --- Mascot: Flit (default) or Fen, the one in the empty state and the loading card. This device only. ---
// Storage blocked (private windows, site data cleared) keeps the choice for the page instead.
let memMascot = "flit";
function mascot(v){
  if(v!==undefined){ memMascot = v; try{ localStorage.setItem("nimble.mascot", v); }catch{} return v; }
  try{ return localStorage.getItem("nimble.mascot")==="fen" ? "fen" : "flit"; }
  catch{ return memMascot; }
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
  return a && a.toUpperCase()!=="UNKNOWN" ? {title:query, body:a, src, ...(image ? {image} : {}), ...(refs.length ? {refs} : {}), ...why} : null;
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

// First non-null wins, in order. Sources are functions so a throw in one never kills the chain.
async function firstOf(query, fns){
  for(const fn of fns){ const r = await fn(query).catch(()=>null); if(r) return r; }
  return null;
}

// One call, one normalized answer. kind: convert | math | graph | card | text | consent | none
// opts.ifUnset: what to assume while consent is unset ("no" for the landing demo's examples).
async function answer(query, opts={}){
  const c = tryConvert(query);
  if(c) return {kind:"convert", ...c};
  const m = tryMath(query);
  if(m !== null) return {kind:"math", value:m};
  const ge = graphExpr(query), svg = ge && graph(ge);
  if(svg) return {kind:"graph", expr:ge, svg};
  if(typeof navigator!=="undefined" && navigator.onLine===false) return {kind:"offline"};
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
  const consent = aiConsent() || opts.ifUnset || null;
  if(consent===null) return {kind:"consent", recipient:aiRecipient()};
  if(consent==="no"){
    const hit = labelIfGeneric(await firstOf(query, [ddg, wiki]), query);
    return hit ? {kind:"text", ...hit, sources:sourcesFor(hit.body, [hit])} : {kind:"none"};
  }
  // A model's number is an unsourced guess: for numeric answers prefer DDG when it has one.
  const aiNote = {};
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
  let hit = (ai && /\d/.test(ai.body) && dd) ? {...dd, image: dd.image || ai.image || null} : labelIfGeneric(ai || dd || await firstOf(query, [wiki]), query);
  // The answer's Wikipedia topic can supply a picture (when the proxy sent none) and the text behind the sentence (when nothing else did).
  if(hit && (!hit.image || !hit.grounding)){
    const t = await topicFor(query, hit.body).catch(()=>null);
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
  return hit ? {kind:"text", ...hit, sources:sourcesFor(hit.body, [hit, dd, ...wikiRefs]).slice(0,2), ...(!ai && aiNote.aiError ? {aiError:aiNote.aiError} : {})} : {kind:"none"};
}

// The consent card, same words as the native prompt. Pages wire the buttons by data-consent.
// t is the page's translator (I18N.t); without one the English below is used as is.
function consentHTML(recipient, t){
  const esc=t=>String(t).replace(/</g,"&lt;");
  const T=t||plain;
  return '<div class="mockup-label">'+T("Before I answer")+'</div><h3 class="consent-q">'+T("Send your question to an AI service?")+'</h3><p class="consent-copy">'
    +T("Nimble sends your question text, and nothing else, to {s}. No account or personal data, and no record is kept. Change this any time in settings.",{s:esc(recipient)})+'</p>'
    +'<div class="consent-actions"><button type="button" class="consent-yes" data-consent="yes">'+T("Allow")+'</button><button type="button" class="consent-no" data-consent="no">'+T("Don't allow")+'</button></div>';
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
    else if(note) h+='<p class="ai-note">'+esc(note)+'</p>';
  }
  if(a.kind==="convert"){ h+='<div class="mockup-big num">'+a.to+' '+esc(a.toUnit)+'</div><p class="num">'+a.from+' '+esc(a.fromUnit)+'</p>'; credit=T("computed offline"); }
  else if(a.kind==="card"){
    // Same markup as convert; the whole card opens its source like a text answer does.
    const href=esc(a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query)).replace(/"/g,"&quot;");
    h+='<a class="mockup-link mockup-card" href="'+href+'" target="_blank" rel="noopener"><div class="mockup-big num">'+esc(a.big)+(a.unit?" "+esc(a.unit):"")+'</div><p class="num">'+esc(a.sub)+'</p></a>'+fresh(a);
    credit=T("powered by {s}",{s:a.src});
  }
  else if(a.kind==="market"){
    // Title, the price, the change in words, then the freshness line and the source. A failed quote shows a calm state, never a number.
    if(a.unavailable){ h+='<p class="market-title">'+esc(a.title)+'</p><p class="market-state">'+esc(T("Quote unavailable right now"))+'</p>'; }
    else {
      h+='<a class="mockup-link mockup-card" href="'+esc(a.url).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener"><p class="market-title">'+esc(a.title)+'</p><div class="market-price num">'+esc(a.big)+'</div>'+(a.change?'<p class="market-change num">'+esc(a.change)+'</p>':'')+'</a>'+fresh(a);
      credit=T("powered by {s}",{s:a.src});
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
      const href=esc(a.url).replace(/"/g,"&quot;");
      const line = r => r.state==="pre" && r.teams.length===2 ? esc(r.teams[0].name)+" vs "+esc(r.teams[1].name)
        : r.teams.map(t=>{ const sc=t.score!==""?" "+esc(t.score):""; return t.winner ? "<strong>"+esc(t.name)+sc+"</strong>" : esc(t.name)+sc; }).join(", ");
      h+=head+'<div class="sports-rows">'+a.rows.map(r=>'<a class="mockup-link mockup-card" href="'+href+'" target="_blank" rel="noopener"><p class="sports-score num">'+line(r)+'</p><p class="sports-status num">'+esc(r.status)+'</p></a>').join("")+'</div>'+fresh(a);
      credit=T("powered by {s}",{s:a.src});
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
      +'<div><a href="'+esc(i.url).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener">'+esc(i.sentence)+'</a> <span class="news-src">'+esc(i.outlet)+'</span></div></li>').join("")+'</ol>'+fresh(a);
    credit=T("powered by {s}",{s:a.src});
  }
  else if(a.kind==="disagree"){
    // Both answers, each with its model name quiet under it, and no photo: the sources do not say which is right, so the card picks neither.
    h+='<p class="disagree-title">'+esc(T("Sources disagree"))+'</p>'
      +a.alts.map(x=>'<div class="disagree-alt"><p class="disagree-answer">'+esc(x.answer)+'</p><p class="disagree-model">'+esc(x.model)+'</p></div>').join("")
      +fresh(a)+((a.sources||[]).length ? '<p class="sources">'+sourceRow(a.sources)+'</p>' : "");
    credit="";
  }
  else if(a.kind==="consent"){ h=consentHTML(a.recipient, opts&&opts.t); }
  else if(a.kind==="offline"){ h+="<p>"+T("You're offline. Math, units and graphs still work.")+"</p>"; }
  else if(a.kind==="text"){
    // Click through to the source; AI answers have none, so fall back to a web search.
    const href=a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query);
    // A photo (Wikipedia lead image, a site's share image) tops the card; the favicon only stands in when there is none.
    const photo = a.image && a.image.url ? photoHTML(a.image.url, a.title) + (a.image.title ? '<span class="photo-credit">'+esc(a.image.title)+' \u00B7 Wikipedia</span>' : "") : "";
    h+='<a class="mockup-link" href="'+esc(href).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener">'
      +photo
      +(a.icon&&!photo?'<img class="mockup-icon" src="'+esc(a.icon)+'" alt="" width="24" height="24" loading="lazy">':'')
      +(a.title.toLowerCase()===query.toLowerCase()?'':'<h3 aria-level="2">'+esc(a.title)+'</h3>')+'<p>'+esc(a.body)+'</p></a>';
    // "Why this answer": the source line opens the exact text the sentence was cut from, with a link.
    // Shown only when that text says more than the sentence did.
    const why = typeof a.grounding==="string" && a.grounding.trim().length > a.body.trim().length;
    if(why){
      // The link names the page the text came from: the Wikipedia topic when there is one, else the source.
      const gHref = a.groundingUrl || href, gName = a.groundingTitle ? a.groundingTitle+" \u00B7 Wikipedia" : a.src;
      h+='<details class="why"><summary>'+esc(T("powered by {s}",{s:a.src}))+'</summary><p>'+esc(a.grounding.trim())+'</p>'
        +'<a href="'+esc(gHref).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener">'+esc(gName)+'</a></details>';
      credit="";
    } else credit=T("powered by {s}",{s:a.src});
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
// Draws the card on an offscreen canvas. Resolves a PNG Blob, or null where there is no canvas.
async function shareImage(query, answer){
  try{
    const text=shareText(answer);
    if(!text || typeof document==="undefined") return null;
    const W=1200, H=630, M=72, BOX=W-2*M;
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    const ctx=cv.getContext("2d"); if(!ctx) return null;
    const mark=await shareMark();
    const spacing=(px,em)=>{ if("letterSpacing" in ctx) ctx.letterSpacing=(px*em)+"px"; };
    ctx.fillStyle="#ffca30"; ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#000"; ctx.textBaseline="alphabetic"; ctx.textAlign="left";
    // Question: 36px, 400, top-left, two lines at most.
    ctx.font="400 36px "+SHARE_FONT; spacing(36,0);
    const q=wrapLines(ctx,query,BOX), qs=q.slice(0,2);
    if(q.length>2){ let l=qs[1]; while(l.length>1 && ctx.measureText(l+"\u2026").width>BOX) l=l.slice(0,-1); qs[1]=l.trimEnd()+"\u2026"; }
    qs.forEach((l,i)=>ctx.fillText(l,M,M+27+i*44));
    // Answer: up to 96px, 700, tight, centred vertically; shrinks until it fits.
    const maxH=280, top=H/2; // 160 below the question, 502 above the footer: 280 fits either side of centre
    let size=96, lines, lh;
    for(; size>=28; size-=4){
      ctx.font="700 "+size+"px "+SHARE_FONT; spacing(size,-0.02);
      lines=wrapLines(ctx,text,BOX); lh=Math.round(size*1.1);
      if(lines.length*lh<=maxH) break;
    }
    const y0=top-(lines.length*lh)/2+size*0.82;
    lines.forEach((l,i)=>ctx.fillText(l,M,y0+i*lh));
    // Footer: source small caps bottom-left, the bulb 56px bottom-right.
    const fy=H-M-28;
    spacing(0,0); ctx.fillStyle="rgba(0,0,0,0.6)"; ctx.textBaseline="middle";
    if("fontVariantCaps" in ctx){ ctx.font="500 28px "+SHARE_FONT; ctx.fontVariantCaps="all-small-caps"; spacing(28,0.08); /* font resets the caps variant, so it goes second */ ctx.fillText(shareSource(answer),M,fy); ctx.fontVariantCaps="normal"; }
    else { ctx.font="500 18px "+SHARE_FONT; ctx.fillText(shareSource(answer).toUpperCase(),M,fy); }
    if(mark){ ctx.imageSmoothingQuality="high"; ctx.drawImage(mark,W-M-56,H-M-56,56,56); }
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

if(typeof module!=="undefined") module.exports={agrees,sourcesFor,sourceRow,onTopic,answerEntities,photoFromEntity,topicFor,identity,siteHost,site,shareText,shareSource,shareImage,renderAnswer,tryMath,mathSteps,samplePoints,tryConvert,convertValue,graphExpr,graph,currencyExpr,market,stockSymbol,parseDaily,changeText,asOfLabel,sports,sportsQuery,sportsRecent,sportsRecentDay,gameRow,kickoffLabel,sportsStatus,CRYPTO_RE,first,answer,wiki,relationOf,getJSON,aiConsent,aiRecipient,mascot,appLink,listenLabel,history:searchHistory,turns,isSpecificQuestion,labelIfGeneric};
