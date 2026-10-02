// Nimble i18n runtime (vanilla, no framework). Loads generated locale JSON from locales/,
// swaps [data-i18n] text and [data-i18n-aria-label|title|placeholder] attributes, and
// exposes t(key, vars) for dynamic strings. Keys are the English literal, so a missing
// key or a failed load just leaves the English on the page. ?lang=fr overrides for one visit.
(function () {
  const SUPPORTED = ["en", "fr", "es", "zh", "pa"];
  const FALLBACK = "en";
  const ATTRS = ["aria-label", "title", "placeholder"];
  const pick = (v) => (v || "").slice(0, 2).toLowerCase();
  let stored = null;
  try { stored = localStorage.getItem("nimble.lang"); } catch (e) {}
  const asked = pick(new URLSearchParams(location.search).get("lang"));
  const detected = pick(navigator.language || FALLBACK);
  const lang = [asked, stored, detected].find((l) => SUPPORTED.includes(l)) || FALLBACK;

  let dict = {};
  let fallbackDict = {};

  async function loadDict(lng) {
    const r = await fetch(`locales/${lng}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`locale ${lng} ${r.status}`);
    return r.json();
  }

  function t(key, vars) {
    let s = dict[key] ?? fallbackDict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      // A missing key makes t() return the key itself; keep the inline copy rather than printing it.
      const key = el.getAttribute("data-i18n");
      const value = t(key);
      if (value !== key) el.textContent = value;
    });
    ATTRS.forEach((a) => {
      root.querySelectorAll(`[data-i18n-${a}]`).forEach((el) => {
        const key = el.getAttribute(`data-i18n-${a}`);
        const value = t(key);
        if (value !== key) el.setAttribute(a, value);
      });
    });
    document.documentElement.lang = lang;
  }

  document.documentElement.lang = lang;
  const ready = (async () => {
    fallbackDict = await loadDict(FALLBACK).catch(() => ({}));
    dict = lang === FALLBACK ? fallbackDict : await loadDict(lang).catch(() => fallbackDict);
    apply();
  })();

  window.I18N = { t, ready, lang, apply };
})();
