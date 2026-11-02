/* Backstory: the search itself. Bring something in → pick search words → ask the catalogs → Jev ranks → show the list. */
(function () {
  const { $, $$, esc, snip, uid, pct, toast, save } = App;
  const J = App.jev, R = App.rank;
  let terms = [], termsFrom = "";   // termsFrom remembers what the words were picked from, so edits stick until the input changes
  let fileInput = null;

  /* ---------- 1. what the reader brought in ---------- */
  function gather() {
    const focus = $("#inFocus").value.trim(), m = App.mode;
    if (m === "topic") { const t = $("#inTopic").value.trim(); return t && { mode: m, title: t, text: "", focus }; }
    if (m === "text") { const t = $("#inText").value.trim(); return t && { mode: m, title: titleOf(t), text: t.slice(0, 12000), focus }; }
    if (m === "file") return fileInput && { mode: m, title: fileInput.title, text: fileInput.text.slice(0, 12000), file: fileInput.name, focus };
    if (m === "link") { const u = $("#inLink").value.trim(); return u && { mode: m, title: u, url: u, text: "", focus }; }
  }
  const plural = (n, w) => `${n || 0} ${w}${n === 1 ? "" : "s"}`;
  function titleOf(t) { const first = t.split(/\n/).find(l => l.trim()) || t; return snip(first, 90); }

  function proposeTerms(force) {
    const inp = gather(); const sig = inp ? App.mode + "|" + (inp.text || inp.title) : "";
    if (!force && sig === termsFrom) return;
    termsFrom = sig;
    if (!inp) terms = [];
    else if (inp.mode === "topic") terms = App.terms.fromTopic(inp.title);
    else if (inp.mode === "link") { const l = App.terms.fromLink(inp.url); terms = l ? (l.wiki ? [l.wiki] : App.terms.fromHeadline(l.phrase)) : []; }
    else terms = App.terms.fromText(inp.text);
    drawTerms();
  }
  function drawTerms() {
    $("#termsWrap").hidden = !terms.length && !gather();
    $("#terms").innerHTML = terms.map((t, i) => `<li class="term"><span>${esc(t)}</span><button data-rm="${i}" aria-label="Remove ${esc(t)}">×</button></li>`).join("") || `<li class="empty">No search words yet.</li>`;
  }
  $("#terms").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (!b) return; terms.splice(+b.dataset.rm, 1); drawTerms(); $("#addTerm").focus(); });
  $("#addTermForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#addTerm").value.trim(); if (v && !terms.includes(v)) { terms.push(v.slice(0, 60)); drawTerms(); } $("#addTerm").value = ""; });
  let deb; ["#inTopic", "#inText", "#inLink"].forEach(s => $(s).addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(() => proposeTerms(), 350); }));
  $$(".modes [role=tab]").forEach(t => t.addEventListener("click", () => proposeTerms()));

  App.uploaded = r => { fileInput = r; proposeTerms(true); };

  $$(".ex").forEach(b => b.addEventListener("click", () => {
    const ex = App.cfg.examples[+b.dataset.ex];
    App.setMode("topic"); $("#inTopic").value = ex.topic; $("#inFocus").value = ex.focus || "";
    termsFrom = "topic|" + ex.topic; terms = [...ex.terms]; drawTerms(); $("#btnGo").focus();
  }));
  $("#inTopic").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); run(); } });

  /* ---------- 2. run ---------- */
  let running = false;
  function progress(done, total, text) {
    const p = $("#progress"); p.hidden = false;
    p.querySelector("i").style.width = total ? pct(done / total) : "8%"; p.querySelector("p").textContent = text;
  }
  async function run() {
    if (running) return;
    const inp = gather();
    if (!inp) { $("#askMsg").textContent = { topic: "Type a topic first.", text: "Paste some text first.", file: "Choose a file first.", link: "Paste a link first." }[App.mode]; return; }
    proposeTerms();
    if (!terms.length) { $("#askMsg").textContent = "Add at least one search word."; $("#addTerm").focus(); return; }
    $("#askMsg").textContent = ""; running = true; $("#btnGo").disabled = true;

    const s = { id: "s-" + uid(), folderId: $("#saveFolder").value || App.st.folders[0].id, created: Date.now(), title: inp.title, input: inp, terms: [...terms], items: [], story: null, jevOn: $("#useJev").checked, notes: [] };
    $("#results").hidden = false; $("#brief").innerHTML = ""; $("#path").innerHTML = ""; $("#ranked").innerHTML = ""; $("#offWrap").hidden = true; $("#filters").innerHTML = ""; $("#listSub").textContent = "";

    try {
      // a Wikipedia link: read the article's summary as the thing brought in
      if (inp.mode === "link") {
        const l = App.terms.fromLink(inp.url);
        if (!l) throw new Error("That doesn't look like a web address.");
        if (l.wiki) {
          progress(0, 0, "Reading the Wikipedia article…");
          const w = await App.sources.wikiSummary(l.wiki).catch(() => null);
          if (w) { inp.title = w.title; inp.text = w.extract; }
        } else { inp.title = l.phrase ? `${l.phrase} (${l.host})` : l.host; s.notes.push(`Read only the link's address on ${l.host}, not the article.`); }
        s.title = inp.title;
      }
      progress(1, 6, "Looking up the background on Wikipedia, and journals on OpenAlex and DOAJ…");
      $("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      const q = s.terms.slice(0, 3).join(" ");
      const [bg, sch, oa] = await Promise.all([App.sources.background(s.terms), App.sources.scholarship(q), App.sources.doaj(s.terms)]);
      if (sch.note) s.notes.push(sch.note);
      progress(3, 6, "Searching Open Library for books…");
      const bk = await App.sources.books(s.terms);
      // drop the same title arriving from two catalogs
      const seen = new Set();
      s.items = [...bg, ...bk, ...sch.items, ...oa].filter(it => { const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
      s.sources = { books: bk.length, scholarship: sch.items.length, scholarshipFrom: sch.from, openAccess: oa.length, background: bg.length };
      if (!s.items.length) throw new Error("None of the catalogs found anything for those search words. Try fewer or simpler words.");
      commit(s); render(s);

      if (s.jevOn) {
        progress(4, 6, "Checking the connection to Jev…");
        if (!(await J.check())) { s.jevOn = false; s.notes.push("Couldn't reach Jev, so the list is in catalog order."); toast("Jev isn't reachable right now. Showing catalog order."); }
        else {
          const ctx = { title: inp.title, terms: s.terms, focus: inp.focus, text: inp.text };
          const total = s.items.length + 1; let done = 0;
          progress(0, total, `Jev is reading what you brought in…`);
          s.story = await J.story(ctx).catch(() => null); done++;
          const r = await J.scoreAll(s.items, ctx, () => { done++; progress(done, total, `Jev has read ${done - 1} of ${s.items.length} catalog entries`); });
          if (r.failed) s.notes.push(`Jev couldn't read ${r.failed} entr${r.failed === 1 ? "y" : "ies"} (${r.lastErr}). Those are ranked by catalog order.`);
          s.jevAt = Date.now();
        }
      }
      commit(s); render(s);
      $("#progress").hidden = true;
      App.guide.ready(s);
    } catch (e) {
      $("#progress").hidden = true; $("#askMsg").textContent = e.message;
      if (!s.items.length) $("#results").hidden = true;
    } finally { running = false; $("#btnGo").disabled = false; }
  }
  $("#btnGo").addEventListener("click", run);

  function commit(s) {
    const st = App.st;
    if (s.input.text) s.input.text = s.input.text.slice(0, 6000);
    st.searches[s.id] = s; st.current = s.id; st.folder = s.folderId; save(); App.drawFolders();
  }

  /* ---------- 3. show ---------- */
  let filter = "all";
  function render(s) {
    App.current = s;
    const { main, more } = R.bestBackground(s);
    const angles = R.storyAngles(s);
    const inp = s.input;
    $("#brief").innerHTML = `
      <p class="brought"><span class="field inline">You brought in:</span> ${esc(snip(s.title, 140))}${inp.file ? ` <span class="src">(${esc(inp.file)})</span>` : ""}
        <br><span class="field inline">Searched for:</span> ${s.terms.map(t => `<span class="term ro">${esc(t)}</span>`).join(" ")}${inp.focus ? `<br><span class="field inline">Focus:</span> ${esc(inp.focus)}` : ""}</p>
      ${main ? `<figure class="bg-main">
          <figcaption><span class="field inline">The idea underneath it</span><h3>${esc(main.title)}</h3>${main.description ? `<p class="desc">${esc(main.description)}</p>` : ""}</figcaption>
          <blockquote cite="${esc(main.url)}"><p>${esc(main.extract)}</p></blockquote>
          <p class="credit">From Wikipedia, “<a href="${esc(main.url)}" target="_blank" rel="noopener">${esc(main.title)}</a>,” shared under CC BY-SA 4.0. Wikipedia is a starting point: check its sources, and read on below.</p>
        </figure>` : `<p class="hint">Wikipedia didn't have a background article for these search words.</p>`}
      ${more.length ? `<div class="bg-more"><span class="field inline">More background:</span><ul>${more.map(b => `<li><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)}</a>${b.description ? ` <span class="desc">${esc(b.description)}</span>` : ""}</li>`).join("")}</ul></div>` : ""}
      ${angles.length ? `<div class="angles"><p class="field">Angles in your story <span class="opt">Jev's yes-chance that each angle helps explain it</span></p>
        <ul>${angles.map(a => `<li class="angle-chip a-${a.key} ${a.on ? "on" : ""}"><span>${J.ANGLE_NAMES[a.key]}</span><b>${pct(a.p)}</b></li>`).join("")}</ul></div>` : ""}
      ${s.notes.length ? `<ul class="notes">${s.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;

    const r = R.rank(s);
    const src = s.sources || {};
    $("#listSub").textContent = `${r.ranked.length + r.off.length} readings: ${plural(src.books, "book")} from Open Library, ${src.scholarship || 0} from ${src.scholarshipFrom || "OpenAlex"}, ${plural(src.openAccess, "open-access article")} from DOAJ. ` +
      (r.jevOn ? "Ranked by Jev's relevance scores." : s.jevOn ? "Jev is reading them now…" : "In catalog order (Jev is off).");

    // the reading path
    const P = r.path;
    const block = (title, sub, list) => list.length ? `<div class="path-step"><h3>${title}</h3><p class="hint">${sub}</p><ol class="ranked compact">${list.map(x => R.card(x.item || x, 0, s, { reason: x.reason })).join("")}</ol></div>` : "";
    $("#path").innerHTML = r.jevOn ? `<div class="path">
        ${block("Start here", "Written for general readers. Read one of these first.", P.start)}
        ${block("Go deeper", "Academic sources, once you know the basics.", P.deeper)}
        ${block("From every angle", "One reading for each angle Jev found in your story.", P.angles.map(a => ({ item: a.item, reason: J.ANGLE_NAMES[a.angle] + ":" })))}
        ${P.missing.length ? `<p class="gap"><b>Nothing on the list covers ${P.missing.slice(0, 2).map(k => J.ANGLE_NAMES[k].toLowerCase()).join(" or ")}${P.missing.length > 2 ? ` (or ${P.missing.length - 2} more angle${P.missing.length > 3 ? "s" : ""})` : ""} yet.</b> Try adding a search word for that angle and searching again.</p>` : ""}
        ${r.ranked.filter(it => R.yes(it, "onesided")).length ? `<p class="gap">${r.ranked.filter(it => R.yes(it, "onesided")).length} reading${r.ranked.filter(it => R.yes(it, "onesided")).length === 1 ? "" : "s"} on the list argue${r.ranked.filter(it => R.yes(it, "onesided")).length === 1 ? "s" : ""} one side. That's fine to read; pair it with a different angle.</p>` : ""}
      </div>` : "";

    // filters for the full list
    const present = [...new Set(r.ranked.map(it => R.angle(it)?.key).filter(Boolean))];
    const F = [["all", "All"], ["book", "Books"], ["article", "Articles & chapters"], ["free", "Free to read"], ...present.map(k => ["a:" + k, J.ANGLE_NAMES[k]])];
    if (!F.some(f => f[0] === filter)) filter = "all";
    $("#filters").innerHTML = F.map(([k, l]) => `<button class="chip ${k === filter ? "on" : ""}" aria-pressed="${k === filter}" data-f="${k}">${esc(l)}</button>`).join("");
    const pass = it => filter === "all" || (filter === "book" ? it.kind === "book" : filter === "article" ? it.kind !== "book" : filter === "free" ? it.access?.free : R.angle(it)?.key === filter.slice(2));
    const shown = r.ranked.filter(pass);
    $("#ranked").innerHTML = shown.map(it => R.card(it, r.ranked.indexOf(it) + 1, s)).join("") || `<li class="empty">Nothing in this group.</li>`;
    $("#offWrap").hidden = !r.off.length; $("#offCount").textContent = r.off.length;
    $("#offList").innerHTML = r.off.map(it => R.card(it, 0, s)).join("");
  }
  $("#filters").addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; render(App.current); });
  $("#results").addEventListener("click", e => {
    const b = e.target.closest("[data-save]"); if (!b) return;
    const it = App.current.items.find(x => x.key === b.dataset.save);
    const on = App.lib.toggle(it, App.current);
    $$(`[data-save="${CSS.escape(it.key)}"]`).forEach(x => { x.classList.toggle("saved", on); x.classList.toggle("ghost", !on); x.setAttribute("aria-pressed", on); x.textContent = on ? "Saved ✓" : "Save to library"; });
  });

  App.showSearch = id => {
    const s = App.st.searches[id]; if (!s) return;
    App.st.current = id; save(); App.drawFolders(); App.view("search");
    $("#results").hidden = false; $("#progress").hidden = true; render(s); App.guide.ready(s, true);
    $("#results").scrollIntoView({ block: "start" });
  };
  App.render = render;

  // reopen the last topic
  if (App.st.current && App.st.searches[App.st.current]) { const s = App.st.searches[App.st.current]; $("#results").hidden = false; render(s); App.guide.ready(s, true); }
})();
