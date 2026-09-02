// Nimble answer engine. Shared by the web app (/app) and the landing page demo.
const ANSWER_PROXY = "https://nimble-answers.trommatic.workers.dev";

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
    const r=await fetch("https://curvely.heyitsmejosh.com/api/sample",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expr,from:-10,to:10,samples:200})});
    if(!r.ok) return null;
    const pts=(await r.json()).points.filter(p=>Number.isFinite(p.y)); if(pts.length<3) return null;
    const W=480,H=200, xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys), ys_=Math.max(y1-y0,1e-9);
    const X=x=>(x-x0)/(x1-x0)*W, Y=y=>H-(y-y0)/ys_*H;
    let d="",prev=null;
    for(const p of pts){ d+=(prev===null||p.x-prev>(x1-x0)/50?"M":"L")+X(p.x).toFixed(1)+" "+Y(p.y).toFixed(1); prev=p.x; }
    const ax=(y0<=0&&y1>=0?`<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>`:"")+(x0<=0&&x1>=0?`<line y1="0" y2="${H}" x1="${X(0)}" x2="${X(0)}"/>`:"");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><g stroke="currentColor" stroke-opacity=".3">${ax}</g><path d="${d}" fill="none" stroke="var(--accent, #ffca30)" stroke-width="2" stroke-linejoin="round"/></svg>`;
  }catch{ return null; }
}

async function ddg(query){
  try{
    const d = await (await fetch(`${ANSWER_PROXY}/?ddg=${encodeURIComponent(query)}`)).json();
    const heading = d.Heading || query;
    if(d.Answer) return {title:heading, body:d.Answer, src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null};
    if(d.AbstractText) return {title:heading, body:d.AbstractText, src:d.AbstractSource||"DuckDuckGo", url:d.AbstractURL, img:d.Image?`https://duckduckgo.com${d.Image}`:null};
    if(d.Definition) return {title:heading, body:d.Definition, src:d.DefinitionSource||"DuckDuckGo", url:d.DefinitionURL};
  }catch{}
  return null;
}

async function wiki(query){
  try{
    const s = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`)).json();
    const hit = s?.query?.search?.[0];
    if(!hit) return null;
    const sum = await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`)).json();
    if(!sum.extract) return null;
    return {title:sum.title, body:sum.extract, src:"Wikipedia", url:sum.content_urls?.desktop?.page, img:sum.thumbnail?.source||null};
  }catch{}
  return null;
}

// "define X" must never fall through to Wikipedia search: that turns "define nimble"
// into a game studio. Wiktionary is deterministic, CORS-open, and needs no key.
async function dictionary(query){
  const w = /^(?:define|definition of|meaning of)\s+(.+)$/i.exec(query.trim())?.[1];
  if(!w) return null;
  try{
    const d = await (await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.toLowerCase())}`)).json();
    const m = d?.en?.[0], def = m?.definitions?.[0]?.definition?.replace(/<[^>]+>/g,"").trim();
    if(!def) return null;
    return {title:w, body:`(${m.partOfSpeech.toLowerCase()}) ${def}`, src:"Wiktionary", url:`https://en.wiktionary.org/wiki/${encodeURIComponent(w)}`};
  }catch{}
  return null;
}

async function gemma(query){
  try{
    const res = await fetch(ANSWER_PROXY, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({q:query})});
    if(!res.ok) return null;
    const d = await res.json();
    const a = (d.answer||"").trim();
    if(a && a.toUpperCase()!=="UNKNOWN") return {title:query, body:a, src:d.source||"Nimble AI"};
  }catch{}
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
  // A model's number is an unsourced guess: for numeric answers prefer DDG when it has one.
  const [ai, dd] = await Promise.all([gemma(query), ddg(query)]);
  const hit = (ai && /\d/.test(ai.body) && dd) ? dd : (ai || dd || await dictionary(query) || await wiki(query));
  return hit ? {kind:"text", ...hit} : {kind:"none"};
}
