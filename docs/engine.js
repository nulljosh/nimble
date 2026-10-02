// Nimble answer engine. Shared by the web app (/app) and the landing page demo.
const ANSWER_PROXY = "https://nimble-answers.trommatic.workers.dev";

// Every network source goes through here: hard timeout, non-2xx = null, bad JSON = null.
// A dead upstream costs one timeout, never a hung answer. TIMEOUT_MS is the calibration knob.
const TIMEOUT_MS = 6000;
async function getJSON(url, opts){
  try{
    const r = await fetch(url, {...opts, signal: AbortSignal.timeout(TIMEOUT_MS)});
    return r.ok ? await r.json() : null;
  }catch{ return null; }
}

// --- offline math ---
// A small recursive-descent evaluator over the whitelisted text. No eval and no Function:
// Cloudflare Workers forbid both, and the agent API at /api runs this same engine there.
const MATH_FNS = new Set(["sqrt","sin","cos","tan","log","log2","log10","abs","round","floor","ceil","cbrt"]);
function evalMath(src){
  const tk = src.match(/Math\.[A-Za-z0-9]+|\d+\.?\d*|\.\d+|\*\*|[-+*\/(),]/g) || [];
  if(tk.join("") !== src.replace(/\s+/g,"")) throw 0;
  let i = 0;
  const peek = () => tk[i], next = () => tk[i++];
  const expr = () => { let v = term(); while(peek()==="+"||peek()==="-") v = next()==="+" ? v+term() : v-term(); return v; };
  const term = () => { let v = unary(); while(peek()==="*"||peek()==="/") v = next()==="*" ? v*unary() : v/unary(); return v; };
  const unary = () => peek()==="-" ? (i++, -unary()) : peek()==="+" ? (i++, unary()) : power();
  const power = () => { const b = atom(); return peek()==="**" ? (i++, b**unary()) : b; };
  const atom = () => {
    const t = next();
    if(t===undefined) throw 0;
    if(t==="("){ const v = expr(); if(next()!==")") throw 0; return v; }
    if(t==="Math.PI") return Math.PI;
    if(t==="Math.E") return Math.E;
    if(t.startsWith("Math.")){
      const f = t.slice(5);
      if(!MATH_FNS.has(f) || next()!=="(") throw 0;
      const v = expr(); if(next()!==")") throw 0; return Math[f](v);
    }
    const n = Number(t); if(Number.isNaN(n)) throw 0; return n;
  };
  const v = expr(); if(i!==tk.length) throw 0; return v;
}
function tryMath(s){
  const t = s.trim().toLowerCase().replace(/([\d.]+)\s*%\s*of\s*/g,"$1/100*").replace(/\^/g,"**").replace(/\bpi\b/g,"Math.PI").replace(/\be\b/g,"Math.E")
    .replace(/\b(sqrt|sin|cos|tan|log|log2|log10|abs|round|floor|ceil|cbrt)\b/g,"Math.$1")
    .replace(/\bln\b/g,"Math.log");
  if(!/^[0-9+\-*/(). ,]*(Math\.[a-z0-9]+|[0-9+\-*/(). ,])*$/.test(t)) return null;
  if(!/[0-9]/.test(t) || !/[+\-*/]|Math\./.test(t)) return null;
  try{ const v = evalMath(t);
    return (typeof v==="number" && isFinite(v)) ? v : null; }
  catch{ return null; }
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

async function ddg(query){
  const d = await getJSON(`${ANSWER_PROXY}/?ddg=${encodeURIComponent(query)}`);
  if(d){
    const heading = d.Heading || query;
    if(d.Answer) return {title:heading, body:d.Answer, src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null};
    if(d.AbstractText) return {title:heading, body:first(d.AbstractText), src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null};
    if(d.Definition) return {title:heading, body:d.Definition, src:d.DefinitionSource||"DuckDuckGo", url:d.DefinitionURL};
  }
  return null;
}

async function wiki(query){
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`);
  let title = s?.query?.search?.[0]?.title;
  if(!title){ // fulltext search down or empty: prefix search is a separate endpoint
    const o = await getJSON(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&origin=*`);
    title = o?.[1]?.[0];
  }
  if(!title) return null;
  const sum = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if(!sum?.extract || sum.type==="disambiguation") return null;
  return {title:sum.title, body:first(sum.extract), src:"Wikipedia", url:sum.content_urls?.desktop?.page, img:sum.thumbnail?.source||null};
}

// "define X" must never fall through to Wikipedia search: that turns "define nimble"
// into a game studio. Wiktionary is deterministic, CORS-open, and needs no key.
async function dictionary(query){
  const w = /^(?:define|definition of|meaning of)\s+(.+)$/i.exec(query.trim())?.[1];
  if(!w) return null;
  const d = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.toLowerCase())}`);
  const m = d?.en?.[0], def = m?.definitions?.[0]?.definition?.replace(/<[^>]+>/g,"").trim();
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
async function etymology(query){
  const m = /^(?:origin|etymology|root|where\s+does\s+the\s+word)\s+(?:of\s+)?(?:the\s+word\s+)?(.+?)(?:\s+come\s+from)?\s*\??$/i.exec(query.trim());
  if(!m) return null;
  const w = m[1].trim();
  const e = await getJSON(`https://wordroot.heyitsmejosh.com/api/etymology/${encodeURIComponent(w.toLowerCase())}`);
  if(!e?.etymology?.length) return null;
  const first = e.etymology[0];
  const sub = `${first.relation.charAt(0).toUpperCase() + first.relation.slice(1)} from ${first.ancestor}`;
  return card(w, e.etymology[0].langCode || "etymology", sub, "Wordroot", `https://wordroot.heyitsmejosh.com/#search=${encodeURIComponent(w)}`);
}

// --- currency ("100 usd to eur") via Frankfurter (ECB rates, CORS-open, no key) ---
function currencyExpr(s){
  const m=/^(?:convert\s+)?(-?\d+(?:\.\d+)?)\s*([a-z]{3})\s+(?:to|in|into|as)\s+([a-z]{3})\??$/i.exec(s.trim());
  return m && !U[m[2].toLowerCase()] && !U[m[3].toLowerCase()] ? {v:+m[1],from:m[2].toUpperCase(),to:m[3].toUpperCase()} : null;
}
async function currency(query){
  const c=currencyExpr(query); if(!c) return null;
  const d=await getJSON(`https://api.frankfurter.dev/v1/latest?base=${c.from}&symbols=${c.to}`)
       || await getJSON(`https://open.er-api.com/v6/latest/${c.from}`); // fallback: same rate map shape
  const rate=d?.rates?.[c.to]; if(!rate) return null;
  const fmt=n=>n.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2});
  return card(fmt(c.v*rate), c.to, `${c.v.toLocaleString("en")} ${c.from} at today's rate`,
    d.base?"Frankfurter":"ExchangeRate-API", d.base?"https://frankfurter.dev":"https://www.exchangerate-api.com");
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
  return card(Math.round(c.temperature_2m), "°C", [loc.name, loc.country, sky, `wind ${Math.round(c.wind_speed_10m)} km/h`].filter(Boolean).join(", "), "Open-Meteo", "https://open-meteo.com");
}
async function localTime(query){
  const place=/^(?:what(?:'s| is) the )?(?:current )?time (?:in|at) (.+?)\??$/i.exec(query.trim())?.[1]; if(!place) return null;
  const loc=await geocode(place); if(!loc?.timezone) return null;
  try{
    const now=new Date(), tz=loc.timezone;
    const big=new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
    const day=new Intl.DateTimeFormat("en",{timeZone:tz,weekday:"long",month:"long",day:"numeric"}).format(now);
    return card(big, loc.name, `${day}, ${tz}`, "Open-Meteo", "https://open-meteo.com");
  }catch{ return null; }
}

// --- AI engine (settings) ---
// Nimble is the free house proxy. The others call the vendor straight from the browser with
// the visitor's own key, stored in localStorage and sent nowhere else.
const SYSTEM = "Answer in one short factual sentence. No preamble, no markdown. If you do not know, reply exactly UNKNOWN.";
const ENGINES = {
  nimble:{name:"Nimble (free)", model:"", base:ANSWER_PROXY},
  claude:{name:"Claude", key:true, model:"claude-opus-5", base:"https://api.anthropic.com"},
  openai:{name:"OpenAI", key:true, model:"gpt-5", base:"https://api.openai.com"},
  ollama:{name:"Ollama (local)", model:"llama3.1:8b", base:"http://localhost:11434"},
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
    default: return "Nimble's answer service, which runs Google Gemma and Alibaba Qwen models on Cloudflare Workers AI";
  }
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
async function gemma(query){
  let c = aiConfig(), e = ENGINES[c.engine] || ENGINES.nimble;
  if(e.key && !c.apiKey){ c = {engine:"nimble"}; e = ENGINES.nimble; } // no key = free proxy
  const base = c.baseURL || e.base, model = c.model || e.model, H = {"Content-Type":"application/json"};
  let d, text, src;
  if(c.engine==="claude" && e===ENGINES.claude){
    d = await getJSON(base+"/v1/messages", {method:"POST", headers:{...H, "x-api-key":c.apiKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model, max_tokens:256, system:SYSTEM, messages:[...turnMessages(), {role:"user", content:query}]})});
    text = (d?.content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""); src = model;
  }else if(e===ENGINES.openai || e===ENGINES.ollama){
    // Ollama speaks the OpenAI chat shape at /v1 (needs OLLAMA_ORIGINS set for the browser).
    d = await getJSON(base+"/v1/chat/completions", {method:"POST", headers:{...H, ...(c.apiKey?{Authorization:"Bearer "+c.apiKey}:{})},
      body:JSON.stringify({model, max_tokens:256, messages:[{role:"system", content:SYSTEM}, ...turnMessages(), {role:"user", content:query}]})});
    text = d?.choices?.[0]?.message?.content; src = model;
  }else{
    d = await getJSON(ANSWER_PROXY, {method:"POST", headers:H, body:JSON.stringify({q:query, turns:turns.list()})});
    text = d?.answer; src = d?.source||"Nimble AI";
  }
  const a = (text||"").trim();
  return a && a.toUpperCase()!=="UNKNOWN" ? {title:query, body:a, src} : null;
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
  const live = await firstOf(query, [etymology, dictionary, weather, localTime]);
  if(live) return live.kind==="card" ? live : {kind:"text", ...live};
  const consent = aiConsent() || opts.ifUnset || null;
  if(consent===null) return {kind:"consent", recipient:aiRecipient()};
  if(consent==="no"){
    const hit = await firstOf(query, [ddg, wiki]);
    return hit ? {kind:"text", ...hit} : {kind:"none"};
  }
  // A model's number is an unsourced guess: for numeric answers prefer DDG when it has one.
  const [ai, dd] = await Promise.all([gemma(query).catch(()=>null), ddg(query).catch(()=>null)]);
  const hit = (ai && /\d/.test(ai.body) && dd) ? dd : (ai || dd || await firstOf(query, [wiki]));
  if(hit) turns.add(query, hit.body);
  return hit ? {kind:"text", ...hit} : {kind:"none"};
}

// The consent card, same words as the native prompt. Pages wire the buttons by data-consent.
function consentHTML(recipient){
  const esc=t=>String(t).replace(/</g,"&lt;");
  return '<div class="mockup-label">Before I answer</div><h3>Send your question to an AI service?</h3><p>To answer, Nimble sends the text you type, and nothing else, to '+esc(recipient)
    +'. No account, contacts, location or identifiers are sent, and Nimble keeps no record of it. If you don\'t allow this, answers come from DuckDuckGo and Wikipedia only. You can change this any time in the web app.</p>'
    +'<div class="consent-actions"><button type="button" class="consent-yes" data-consent="yes">Allow</button><button type="button" class="consent-no" data-consent="no">Don\'t allow</button></div>';
}

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
  add(query){
    const q = String(query||"").trim(); if(!q) return;
    try{
      const rest = this.list().filter(e=>e.q.toLowerCase()!==q.toLowerCase());
      localStorage.setItem(HISTORY_KEY, JSON.stringify([{q, t:Date.now()}, ...rest].slice(0,HISTORY_MAX)));
    }catch{}
  },
  clear(){ turns.clear(); try{ localStorage.removeItem(HISTORY_KEY); }catch{} },
};

// Answer as HTML, shared by the landing demo and /app. Returns {h, credit, kind}.
async function renderAnswer(query, opts){
  const esc=t=>String(t).replace(/</g,"&lt;");
  const a=await answer(query, opts); let h='<div class="mockup-label">Answer</div>', credit='';
  if(a.kind==="convert"){ h+='<div class="mockup-big">'+a.to+' '+esc(a.toUnit)+'</div><p>'+a.from+' '+esc(a.fromUnit)+'</p>'; credit="computed offline"; }
  else if(a.kind==="card"){
    // Same markup as convert; the whole card opens its source like a text answer does.
    const href=esc(a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query)).replace(/"/g,"&quot;");
    h+='<a class="mockup-link mockup-card" href="'+href+'" target="_blank" rel="noopener"><div class="mockup-big">'+esc(a.big)+(a.unit[0]==="°"?"":" ")+esc(a.unit)+'</div><p>'+esc(a.sub)+'</p></a>';
    credit="powered by "+a.src;
  }
  else if(a.kind==="math"){ h+='<div class="mockup-big">'+a.value+'</div>'; credit="computed offline"; }
  else if(a.kind==="graph"){ h+=a.svg+'<p>y = '+esc(a.expr)+'</p>'; credit="computed offline"; }
  else if(a.kind==="consent"){ h=consentHTML(a.recipient); }
  else if(a.kind==="offline"){ h+="<p>You're offline. Math, units and graphs still work.</p>"; }
  else if(a.kind==="text"){
    // Click through to the source; AI answers have none, so fall back to a web search.
    const href=a.url||"https://duckduckgo.com/?q="+encodeURIComponent(query);
    h+='<a class="mockup-link" href="'+esc(href).replace(/"/g,"&quot;")+'" target="_blank" rel="noopener">'
      +(a.title.toLowerCase()===query.toLowerCase()?'':'<h3>'+esc(a.title)+'</h3>')+'<p>'+esc(a.body)+'</p></a>';
    credit="powered by "+a.src;
  }
  else { h+='<p>No instant answer. Try a question, a sum, or "5 miles to km".</p>'; }
  return {h, credit, kind:a.kind};
}

function appLink(query){
  return "/app?q="+encodeURIComponent(query);
}

if(typeof module!=="undefined") module.exports={renderAnswer,tryMath,samplePoints,tryConvert,convertValue,graphExpr,graph,currencyExpr,first,answer,getJSON,aiConsent,aiRecipient,appLink,history:searchHistory,turns};
