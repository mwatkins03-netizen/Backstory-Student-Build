/* Backstory: the guide in the corner. Caitlin's version one: "a personification of the agent" that gives the basic breakdown.
   The guide doesn't write new facts. Each line is a rule filled in from the catalogs and Jev's numbers. Its name and drawing are in js/config.js. */
(function () {
  const { $, esc, snip } = App;
  const G = App.cfg.guide, R = App.rank, J = App.jev;
  const btn = $("#guideBtn"), panel = $("#guidePanel");

  $("#guideFigBtn").innerHTML = G.figure; $("#guideFigPanel").innerHTML = G.figure;
  $("#guideTitle").textContent = G.name; $("#guideRole").textContent = G.role;
  $("#guideBtnLabel").textContent = `${G.name}: the short version`;

  const firstSentence = t => { const m = String(t || "").match(/^.{20,}?[.!?](?=\s+[A-Z“"(]|\s*$)/); return m ? m[0] : snip(t, 220); };
  const link = it => `<a href="${esc(it.access?.url || it.url)}" target="_blank" rel="noopener">${esc(snip(it.title, 90))}</a>`;
  const by = it => it.authors?.length ? ` by ${esc(it.authors[0])}${it.authors.length > 1 ? " and others" : ""}` : "";

  function breakdown(s) {
    const { main } = R.bestBackground(s), r = R.rank(s);
    const angles = R.storyAngles(s).filter(a => a.on).map(a => J.ANGLE_NAMES[a.key].toLowerCase());
    const pool = r.ranked;
    // a book worth weeks: not a study guide or summary, and with Jev, related and not the most basic level
    const guideBook = it => /\b(spark ?notes|cliffs? ?notes|study guide|summary of|for dummies)\b/i.test(it.title);
    const books = pool.filter(it => it.kind === "book" && !guideBook(it) && (!r.jevOn || R.rel(it) >= 1.6));
    const book = books.find(it => !r.jevOn || (R.level(it) ?? 1) >= 1) || books[0];
    const short = pool.find(it => it.kind !== "book" && it.access?.free && (!r.jevOn || R.rel(it) >= 1.6 && (R.level(it) ?? 2) <= 2))
      || pool.find(it => it.kind !== "book" && (!r.jevOn || R.rel(it) >= 1.6));
    const oneSided = r.jevOn ? pool.filter(it => R.yes(it, "onesided")).length : 0;
    const L = [];
    L.push(`<li><b>What it's about.</b> You asked about “${esc(snip(s.title, 90))}.”${main ? ` Underneath it is <b>${esc(main.title)}</b>: “${esc(firstSentence(main.extract))}”` : ""}</li>`);
    if (angles.length) L.push(`<li><b>Why it's bigger than one story.</b> It connects to ${angles.length > 1 ? angles.slice(0, -1).join(", ") + " and " + angles.at(-1) : angles[0]}. Each of those has its own history to read.</li>`);
    if (main) L.push(`<li><b>Got 10 minutes?</b> Read the encyclopedia article on <a href="${esc(main.url)}" target="_blank" rel="noopener">${esc(main.title)}</a>, then check the sources at the bottom of it.</li>`);
    if (short) L.push(`<li><b>Got an evening?</b> Read ${link(short)}${by(short)}${short.access?.free ? " (free to read)" : ""}.</li>`);
    if (book) L.push(`<li><b>Got a few weeks?</b> Read the book ${link(book)}${by(book)}${book.year ? ` (${book.year})` : ""}.</li>`);
    if (r.jevOn && r.path.missing.length) L.push(`<li><b>Something's missing.</b> Nothing here covers ${esc(J.ANGLE_NAMES[r.path.missing[0]].toLowerCase())} yet. Add a search word for it.</li>`);
    else if (oneSided) L.push(`<li><b>Keep in mind.</b> ${oneSided} of these argue${oneSided === 1 ? "s" : ""} one side. Read ${oneSided === 1 ? "it" : "them"} next to something from a different angle.</li>`);
    else L.push(`<li><b>Keep in mind.</b> Check who wrote each reading and when. Older books can be great history but may miss what happened since.</li>`);
    return `<p class="say">Here's the short version.</p><ol class="g-steps">${L.join("")}</ol>
      <p class="g-note">I'm made of rules and Jev's numbers. I don't make up facts, and everything I point to is in a real catalog. ${r.jevOn ? "" : "Jev was off for this search, so my picks follow catalog order."}</p>`;
  }

  const EMPTY = `<p class="say">Hi. I'm ${esc(G.name)}.</p><p>Bring in something you're curious about and press <b>Find the backstory</b>. Then click me and I'll give you the short version: what it's about, and what to read if you have ten minutes, an evening, or a few weeks.</p>`;
  $("#guideBody").innerHTML = EMPTY;

  function open() { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); $("#guideDot").hidden = true; $("#guideClose").focus(); }
  function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); }
  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", () => panel.hidden ? open() : close());
  $("#guideClose").addEventListener("click", close);
  panel.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  App.guide = {
    ready(s, quiet) {
      $("#guideBody").innerHTML = s?.items?.length ? breakdown(s) : EMPTY;
      if (!quiet && panel.hidden) { $("#guideDot").hidden = false; App.toast(`${G.name} has the short version. Click the corner button.`); }
    }
  };
})();
