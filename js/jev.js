/* Backstory, layer 2: Jev. Jev (TypeSafe AI) answers typed questions with probabilities, never prose.
   The questions below are exactly what Jev is asked; the app shows them under "What Jev was asked". */
(function () {
  const ENDPOINT = App.cfg.jevEndpoint;

  /* ---------- the questions ---------- */
  const ANGLES = {
    history: "history: how it came to be, earlier events, what happened before",
    power: "politics and power: governments, war, conflict, who holds power",
    money: "economics and trade: money, markets, labor, resources, who profits",
    rights: "ethics and human rights: right and wrong, justice, dignity, suffering",
    law: "law and policy: rules, courts, treaties, regulation, what can be done",
    culture: "society, culture, and media: identity, beliefs, everyday life, how it is portrayed",
    science: "science, technology, health, and the environment"
  };
  const ANGLE_NAMES = { history: "History", power: "Politics & power", money: "Economics & trade", rights: "Ethics & human rights", law: "Law & policy", culture: "Society & media", science: "Science & environment" };
  const LEVELS = ["general readers: no background needed", "accessible: a little background helps", "academic: written for students and scholars", "specialist: technical, for experts in the field"];
  const RELEVANCE = ["not related to what the reader is curious about", "loosely related: shares a word or a place but not the subject", "related background: helps understand the bigger picture", "directly explains the history, ideas, or causes behind it"];

  const Q_STORY = Object.fromEntries(Object.entries(ANGLES).map(([k, d]) => [k, { type: "noul", instructions: `To really understand what the reader brought in, would it help to learn about ${d}?` }]));
  function qSource(focus) {
    const q = {
      relevant: { type: "score", instructions: "How much would this source help the reader understand the background of what they are curious about?", criteria: RELEVANCE },
      angle: { type: "choice", instructions: "Which angle does this source mainly take on its subject?", criteria: ANGLES },
      level: { type: "score", instructions: "Who is this source written for?", criteria: LEVELS },
      onesided: { type: "noul", instructions: "Is this source mainly arguing for one side or position, rather than explaining and weighing the evidence?" },
      firsthand: { type: "noul", instructions: "Is this source a firsthand account, such as journalism from the scene, a memoir, testimony, or primary documents?" }
    };
    if (focus) q.focus = { type: "noul", instructions: `The reader wants to focus on: "${focus}". Does this source speak to that?` };
    return q;
  }
  const Q_BACKGROUND = {
    relevant: { type: "score", instructions: "How much would this encyclopedia article help the reader understand the background of what they are curious about?", criteria: RELEVANCE }
  };

  /* ---------- transport: under the proxy's 60 a minute ---------- */
  const starts = [];
  async function ask(state, questions) {
    while (true) {
      const now = Date.now(); while (starts.length && now - starts[0] > 60000) starts.shift();
      if (starts.length < 50) break;
      await new Promise(r => setTimeout(r, 60000 - (now - starts[0]) + 50));
    }
    starts.push(Date.now());
    const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: state.slice(0, 5950), model: "jev-latest", questions }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    return d.answers;
  }
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
  async function check() { try { const r = await fetch(ENDPOINT); return r.ok; } catch { return false; } }

  /* ---------- what Jev reads ---------- */
  function readerBlock(ctx) {
    const lines = [`WHAT THE READER IS CURIOUS ABOUT: ${ctx.title}`, `SEARCH WORDS: ${ctx.terms.join("; ")}`];
    if (ctx.focus) lines.push(`WHAT THEY WANT TO FOCUS ON: ${ctx.focus}`);
    if (ctx.text) lines.push(`WHAT THEY BROUGHT IN (start):\n${App.snip(ctx.text, ctx.forStory ? 4800 : 1100)}`);
    return lines.join("\n");
  }
  function sourceBlock(it) {
    const kind = it.kind === "background" ? "encyclopedia article" : it.kind;
    const parts = [`CANDIDATE SOURCE (${kind}${it.year ? ", " + it.year : ""}, from ${it.src}): ${it.title}`];
    if (it.authors?.length) parts.push(`By ${it.authors.join(", ")}`);
    if (it.venue) parts.push(`Published in ${it.venue}`);
    if (it.pages) parts.push(`${it.pages} pages`);
    if (it.subjects?.length) parts.push(`Subjects: ${it.subjects.join("; ")}`);
    if (it.description) parts.push(`Description: ${it.description}`);
    const body = it.extract || it.abstract;
    if (body) parts.push(`${it.extract ? "Summary" : "Abstract"}: ${App.snip(body, 1600)}`);
    return parts.join("\n");
  }

  async function story(ctx) { return ask(readerBlock({ ...ctx, forStory: true }), Q_STORY); }
  async function scoreAll(items, ctx, onEach) {
    const qs = qSource(ctx.focus), head = readerBlock(ctx);
    let failed = 0, lastErr = "";
    await pool(items, 3, async it => {
      try { it.jev = await ask(head + "\n\n" + sourceBlock(it), it.kind === "background" ? Q_BACKGROUND : qs); }
      catch (e) { failed++; lastErr = e.message; }
      onEach && onEach(it);
    });
    return { failed, lastErr };
  }

  // the expected value of a 0–3 score, from its probabilities
  const expected = a => a ? Object.entries(a.probabilities).reduce((s, [k, p]) => s + (+k) * p, 0) : null;
  const topKey = a => { const ks = Object.keys(a.probabilities); return ks.reduce((b, k) => a.probabilities[k] > a.probabilities[b] ? k : b, ks[0]); };

  App.jev = { ANGLES, ANGLE_NAMES, LEVELS, RELEVANCE, Q_STORY, Q_BACKGROUND, qSource, story, scoreAll, check, expected, topKey, readerBlock, sourceBlock };
})();
