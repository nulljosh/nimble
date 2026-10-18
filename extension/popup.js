// Popup: prefill with the page selection, ask the public API, show the one sentence engine.shareText picks.
const API = "https://nimble.jaybulb.com/api/answer?q=";
const $ = id => document.getElementById(id);

async function ask(q) {
  q = q.trim();
  if (!q) return;
  $("a").textContent = "…";
  $("s").textContent = "";
  try {
    const r = await (await fetch(API + encodeURIComponent(q))).json();
    $("a").textContent = shareText(r) || "No answer for that one.";
    $("s").textContent = (r.sources && r.sources[0] && r.sources[0].name) || r.src || "";
  } catch {
    $("a").textContent = "Offline. Try again when you're connected.";
  }
}

async function selection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection()) });
    return result.trim().slice(0, 300);
  } catch { return ""; } // ponytail: chrome:// and store pages refuse injection, just start empty
}

$("q").addEventListener("keydown", e => { if (e.key === "Enter") ask($("q").value); });
selection().then(s => { if (s) { $("q").value = s; ask(s); } });
