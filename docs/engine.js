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
// ponytail: whitelist-guarded eval over Math.*; upgrade to a real parser if untrusted input ever matters.
function tryMath(s){
  const t = s.trim().toLowerCase().replace(/\^/g,"**").replace(/\bpi\b/g,"Math.PI").replace(/\be\b/g,"Math.E")
    .replace(/\b(sqrt|sin|cos|tan|log|log2|log10|abs|round|floor|ceil|cbrt)\b/g,"Math.$1")
    .replace(/\bln\b/g,"Math.log");
  if(!/^[0-9+\-*/(). ,]*(Math\.[a-z0-9]+|[0-9+\-*/(). ,])*$/.test(t)) return null;
  if(!/[0-9]/.test(t) || !/[+\-*/]|Math\./.test(t)) return null;
  try{ const v = Function('"use strict";return ('+t+')')();
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
  return {from:t(v),to:t(out),fromUnit:from,toUnit:to};
}

// --- graph (points from Curvely's public API) ---
function graphExpr(s){
  let q=s.trim().toLowerCase();
  const verb=/^(plot|graph|draw|sketch)\s+/.test(q); q=q.replace(/^(plot|graph|draw|sketch)\s+/,"");
  const y=/^(y|f\(x\))\s*=\s*/.test(q); q=q.replace(/^(y|f\(x\))\s*=\s*/,"");
  return (verb||y) && q.includes("x") && /^[0-9a-z+\-*/^(). ]+$/.test(q) ? q : null;
}
async function graph(expr){
  try{
    const res=await getJSON("https://curvely.heyitsmejosh.com/api/sample",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expr,from:-10,to:10,samples:200})});
    const pts=(res?.points||[]).filter(p=>Number.isFinite(p.y)); if(pts.length<3) return null;
    const W=480,H=200, xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys), ys_=Math.max(y1-y0,1e-9);
    const X=x=>(x-x0)/(x1-x0)*W, Y=y=>H-(y-y0)/ys_*H;
    let d="",prev=null;
    for(const p of pts){ d+=(prev===null||p.x-prev>(x1-x0)/50?"M":"L")+X(p.x).toFixed(1)+" "+Y(p.y).toFixed(1); prev=p.x; }
    const ax=(y0<=0&&y1>=0?`<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>`:"")+(x0<=0&&x1>=0?`<line y1="0" y2="${H}" x1="${X(0)}" x2="${X(0)}"/>`:"");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><g stroke="currentColor" stroke-opacity=".3">${ax}</g><path d="${d}" fill="none" stroke="var(--accent, #ffca30)" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }catch{ return null; }
}

// ponytail: encyclopedia paragraphs are not answers; keep the first sentence.
// Don't split after a short capitalized abbreviation (Mr., Dr., St., Ver.).
const first = (t) => t.trim().split(/(?<![A-Z][a-z]{0,2}\.)(?<=[.!?])\s+(?=[A-Z0-9"(])/)[0];

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
  return {kind:"convert", from:String(c.v), fromUnit:c.from, to:(c.v*rate).toFixed(2), toUnit:c.to, src:d.base?"Frankfurter":"ExchangeRate-API"};
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
  return {title:`${loc.name}${loc.country?", "+loc.country:""}`, body:`${Math.round(c.temperature_2m)}°C${sky?", "+sky:""}, wind ${Math.round(c.wind_speed_10m)} km/h.`, src:"Open-Meteo", url:"https://open-meteo.com"};
}
async function localTime(query){
  const place=/^(?:what(?:'s| is) the )?(?:current )?time (?:in|at) (.+?)\??$/i.exec(query.trim())?.[1]; if(!place) return null;
  const loc=await geocode(place); if(!loc?.timezone) return null;
  try{ return {title:`${loc.name}${loc.country?", "+loc.country:""}`, body:new Intl.DateTimeFormat("en",{timeZone:loc.timezone,hour:"numeric",minute:"2-digit",weekday:"long"}).format(new Date())+".", src:loc.timezone}; }
  catch{ return null; }
}

async function gemma(query){
  const d = await getJSON(ANSWER_PROXY, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q:query})});
  const a = (d?.answer||"").trim();
  return a && a.toUpperCase()!=="UNKNOWN" ? {title:query, body:a, src:d.source||"Nimble AI"} : null;
}

// First non-null wins, in order. Sources are functions so a throw in one never kills the chain.
async function firstOf(query, fns){
  for(const fn of fns){ const r = await fn(query).catch(()=>null); if(r) return r; }
  return null;
}

// One call, one normalized answer. kind: convert | math | graph | text | none
async function answer(query){
  const c = tryConvert(query);
  if(c) return {kind:"convert", ...c};
  const m = tryMath(query);
  if(m !== null) return {kind:"math", value:m};
  const ge = graphExpr(query), svg = ge && await graph(ge);
  if(svg) return {kind:"graph", expr:ge, svg};
  // Pattern-gated live sources: each returns null fast unless the query is shaped for it.
  const cur = await currency(query).catch(()=>null);
  if(cur) return cur;
  const live = await firstOf(query, [dictionary, weather, localTime]);
  if(live) return {kind:"text", ...live};
  // A model's number is an unsourced guess: for numeric answers prefer DDG when it has one.
  const [ai, dd] = await Promise.all([gemma(query).catch(()=>null), ddg(query).catch(()=>null)]);
  const hit = (ai && /\d/.test(ai.body) && dd) ? dd : (ai || dd || await firstOf(query, [wiki]));
  return hit ? {kind:"text", ...hit} : {kind:"none"};
}

if(typeof module!=="undefined") module.exports={tryMath,tryConvert,convertValue,graphExpr,currencyExpr,first,answer,getJSON};
