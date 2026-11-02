/* Backstory: picking search words. No AI here: counting and a list of common words.
   The reader sees every word that will be searched and can remove or add any. */
(function () {
  const STOP = new Set(("a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves " +
    "said says say told according new news report reported reports year years time times week weeks month day days people one two three first last many much may might must also however although though like just even still well back get got make made way ways thing things lot really very going goes went come came saying asked asking says claim claims take took see seen use used using want wants know known think thinks via per around across among within without whether including include includes includ according told tells mr mrs ms dr " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december today yesterday tomorrow percent million billion thousand hundred " +
    "https http www com html org net amp image photo video getty reuters associated press subscribe newsletter advertisement read more click share").split(/\s+/));
  const SENT_START_SKIP = new Set("The A An This That These Those It In On At For But And Or If When While After Before As He She They We I You His Her Their Our Its There Here What Why How Who Some Many Most One Two Three".split(" "));

  // phrases in Title Case (names, places, events), then frequent content words
  function fromText(text, max = 6) {
    text = String(text || "").slice(0, 20000);
    const counts = new Map(), add = (k, w, show) => { const key = k.toLowerCase(); const c = counts.get(key) || { w: 0, show }; c.w += w; counts.set(key, c); };
    const cap = /\b([A-Z][a-zA-Z'’\-]+(?:\s+(?:of|the|de|du|la)?\s*[A-Z][a-zA-Z'’\-]+){0,4})/g;
    const lower = text.toLowerCase();
    // does the word also appear in lowercase somewhere? then a capital at a sentence start means nothing
    const usedLower = w => new RegExp(`\\b${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text);
    let m;
    while ((m = cap.exec(text))) {
      let p = m[1].trim().replace(/['’]s$/, "");
      const words = p.split(/\s+/);
      const sentenceStart = /(^|[.!?:"“]\s*|\n\s*)$/.test(text.slice(Math.max(0, m.index - 3), m.index));
      if (words.length === 1 && (SENT_START_SKIP.has(p) || STOP.has(p.toLowerCase()) || p.length < 4)) continue;
      // "Protesters" at the start of a sentence is just a capitalized word, not a name
      if (sentenceStart && words.length === 1 && usedLower(p)) continue;
      while (words.length && SENT_START_SKIP.has(words[0])) words.shift();
      if (sentenceStart && words.length > 1 && usedLower(words[0])) words.shift();
      p = words.join(" "); if (!p || STOP.has(p.toLowerCase()) || p.length < 4) continue;
      add(p, words.length > 1 ? 3 : sentenceStart ? 0.6 : 1.6, p);
    }
    const toks = lower.match(/[a-z][a-z'\-]{3,}/g) || [];
    toks.forEach(t => { t = t.replace(/'s$/, ""); if (!STOP.has(t)) add(t, 1, t); });
    // two ordinary words that keep appearing together ("civil rights", "trade war")
    for (let i = 0, ws = lower.match(/[a-z][a-z'\-]+/g) || []; i < ws.length - 1; i++) {
      const a = ws[i], b = ws[i + 1];
      if (STOP.has(a) || STOP.has(b) || a.length < 4 || b.length < 4) continue;
      add(a + " " + b, 1.4, a + " " + b);
    }
    // a phrase beats a single word of the same weight: "civil rights" says more than "civil"
    const weight = (k, c) => c.w * (k.includes(" ") ? 1.35 : 1);
    const ranked = [...counts.entries()].filter(([, c]) => c.w >= 2).sort((a, b) => weight(...b) - weight(...a));
    const out = [];
    for (const [k, c] of ranked) {
      // skip a word already inside a chosen phrase, and a phrase that repeats a chosen word
      if (out.some(o => o.toLowerCase().includes(k) || k.includes(o.toLowerCase()))) continue;
      out.push(c.show); if (out.length >= max) break;
    }
    return out;
  }

  function fromTopic(t) {
    t = String(t || "").trim().replace(/[?!.]+$/, "");
    if (!t) return [];
    if (/[,;]/.test(t)) return t.split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (t.split(/\s+/).length <= 5) return [t];
    // a long question: keep its names and content words
    const picked = fromText(t + ". " + t, 4);
    return picked.length ? picked : [t];
  }

  // A news link usually carries its headline in the address: /2026/10/30/world/africa/congo-mine-massacre.html
  function fromLink(url) {
    let u; try { u = new URL(url.trim()); } catch { return null; }
    const host = u.hostname.replace(/^www\./, "");
    const wiki = host.match(/^(\w+)\.(?:m\.)?wikipedia\.org$/);
    if (wiki && u.pathname.startsWith("/wiki/")) return { host, wiki: decodeURIComponent(u.pathname.slice(6)).replace(/_/g, " "), lang: wiki[1] };
    const segs = u.pathname.split("/").map(s => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, "")).filter(Boolean);
    // keep real words; drop numbers and id codes like "a1b2c3d4"
    const words = s => s.split(/[-_+]+/).filter(w => /^[a-z]+$/i.test(w) || (w && !/\d/.test(w)));
    let best = segs.map(s => words(s)).filter(w => w.length >= 2).sort((a, b) => b.length - a.length)[0];
    if (!best) { const q = u.searchParams.get("q") || u.searchParams.get("title"); best = q ? q.split(/\s+/) : []; }
    const phrase = best.filter(w => !/^\d+$/.test(w)).join(" ").replace(/\s+/g, " ").trim();
    return { host, phrase };
  }

  // a headline from a link, "congo cobalt mine killings", searches better as pairs: "congo cobalt", "mine killings"
  function fromHeadline(phrase) {
    const w = String(phrase || "").toLowerCase().split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
    const out = []; for (let i = 0; i < w.length && out.length < 4; i += 2) out.push(w.slice(i, i + 2).join(" "));
    return out;
  }

  App.terms = { fromText, fromTopic, fromLink, fromHeadline, STOP };
})();
