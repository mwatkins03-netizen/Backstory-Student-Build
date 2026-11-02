/* Backstory: turning catalog entries and Jev's numbers into a ranked reading list.
   Every sentence here is written by a rule from the numbers. Change the rules, and the list changes. */
(function () {
  const { esc, pct, snip } = App;
  const J = App.jev;

  const rel = it => it.jev?.relevant ? J.expected(it.jev.relevant) : null;              // 0–3
  const level = it => it.jev?.level ? Math.round(J.expected(it.jev.level)) : null;      // 0–3
  const angle = it => it.jev?.angle ? { key: it.jev.angle.choice, p: it.jev.angle.probabilities[it.jev.angle.choice] } : null;
  const yes = (it, k, t = 0.6) => it.jev?.[k] ? it.jev[k].noul >= t : false;

  function score(it, ctx) {
    if (!it.jev) return 1 - it.catalogRank / 12;
    let s = (rel(it) / 3) * 0.72;
    if (ctx.focus && it.jev.focus) s += it.jev.focus.noul * 0.18;
    if (it.access?.free) s += 0.04;
    s += 0.06 * Math.max(0, 1 - it.catalogRank / 10);
    return s;
  }

  // catalog order only: alternate between sources so one catalog doesn't fill the top
  function interleave(items) {
    const by = {}; items.forEach(it => (by[it.src] = by[it.src] || []).push(it));
    const lists = Object.values(by), out = [];
    for (let i = 0; out.length < items.length; i++) lists.forEach(l => l[i] && out.push(l[i]));
    return out;
  }

  function rank(s) {
    const ctx = { focus: s.input.focus }, items = s.items.filter(it => it.kind !== "background");
    const jevOn = s.jevOn && items.some(it => it.jev);
    let ranked = jevOn ? [...items].sort((a, b) => score(b, ctx) - score(a, ctx)) : interleave(items);
    const off = jevOn ? ranked.filter(it => it.jev && rel(it) < 1.15) : [];
    ranked = ranked.filter(it => !off.includes(it));

    const path = { start: [], deeper: [], angles: [], missing: [] };
    if (jevOn) {
      const used = new Set(), take = (list, n) => list.filter(it => !used.has(it.key)).slice(0, n).map(it => (used.add(it.key), it));
      path.start = take(ranked.filter(it => level(it) !== null && level(it) <= 1 && rel(it) >= 1.6), 2);
      path.deeper = take(ranked.filter(it => level(it) !== null && level(it) >= 2 && rel(it) >= 1.6), 2);
      storyAngles(s).filter(a => a.on).forEach(a => {
        const best = ranked.find(it => !used.has(it.key) && angle(it)?.key === a.key && rel(it) >= 1.5);
        if (best) { used.add(best.key); path.angles.push({ angle: a.key, item: best }); }
        else if (!ranked.some(it => angle(it)?.key === a.key && rel(it) >= 1.5)) path.missing.push(a.key);
      });
    }
    return { ranked, off, path, jevOn };
  }

  function storyAngles(s) {
    if (!s.story) return [];
    return Object.keys(J.ANGLES).map(k => ({ key: k, p: s.story[k]?.noul ?? 0, on: (s.story[k]?.noul ?? 0) >= 0.5 })).sort((a, b) => b.p - a.p);
  }

  function bestBackground(s) {
    const bg = s.items.filter(it => it.kind === "background");
    if (!bg.length) return { main: null, more: [] };
    const sorted = s.jevOn && bg.some(b => b.jev) ? [...bg].sort((a, b) => (rel(b) ?? 0) - (rel(a) ?? 0) || a.catalogRank - b.catalogRank) : bg;
    const main = sorted[0];
    return { main, more: sorted.slice(1).filter(b => !b.jev || rel(b) >= 1.3) };
  }

  /* ---------- the sentences ---------- */
  const REL_WORDS = ["not related", "loosely related", "related background", "directly explains the background"];
  const LEVEL_WORDS = ["general readers", "readers with a little background", "students and scholars", "specialists"];
  function why(it, focus) {
    const out = [];
    if (it.jev) {
      const r = rel(it);
      out.push(`Jev: ${REL_WORDS[Math.round(r)]} (${r.toFixed(1)} of 3).`);
      if (level(it) !== null) out.push(`Written for ${LEVEL_WORDS[level(it)]}.`);
      if (focus && it.jev.focus) out.push(it.jev.focus.noul >= 0.6 ? `Speaks to your focus, “${focus}”.` : it.jev.focus.noul < 0.3 ? `Probably not about “${focus}”.` : "");
      if (yes(it, "onesided")) out.push("Argues one side: read it next to a source from another angle.");
      if (yes(it, "firsthand")) out.push("A firsthand account.");
    }
    if (it.citedBy >= 25) out.push(`Cited by ${it.citedBy.toLocaleString()} other works.`);
    if (it.editions >= 5) out.push(`${it.editions} editions in print over the years.`);
    return out.filter(Boolean).join(" ");
  }

  const KIND_LABEL = { book: "Book", article: "Article", chapter: "Book chapter", background: "Encyclopedia" };
  function card(it, n, s, opts = {}) {
    const a = angle(it), lv = level(it), saved = App.lib.has(it.key);
    const meta = [it.authors?.length ? esc(it.authors.join(", ")) + (it.authors.length >= 3 ? " et al." : "") : "", it.year, it.venue ? `<i>${esc(it.venue)}</i>` : "", it.pages ? it.pages + " pages" : ""].filter(Boolean).join(" · ");
    const tags = [
      `<span class="tag kind">${KIND_LABEL[it.kind] || "Reading"}</span>`,
      a ? `<span class="tag angle a-${a.key}">${J.ANGLE_NAMES[a.key]}</span>` : "",
      lv !== null ? `<span class="tag level">${["Intro", "Accessible", "Academic", "Specialist"][lv]}</span>` : "",
      yes(it, "onesided") ? `<span class="tag warn">One side</span>` : "",
      yes(it, "firsthand") ? `<span class="tag">Firsthand</span>` : "",
      it.access?.free ? `<span class="tag free">Free</span>` : ""
    ].join("");
    const w = why(it, s.input.focus);
    return `<li class="item" data-key="${esc(it.key)}">
      ${n ? `<span class="num" aria-hidden="true">${n}</span>` : ""}
      <div class="item-main">
        <h3><a href="${esc(it.access?.url || it.links?.[0]?.url)}" target="_blank" rel="noopener">${esc(it.title)}</a></h3>
        ${meta ? `<p class="meta">${meta}</p>` : ""}
        <p class="tags">${tags}</p>
        ${opts.reason ? `<p class="why"><b>${esc(opts.reason)}</b> ${esc(w)}</p>` : w ? `<p class="why">${esc(w)}</p>` : ""}
        <p class="where"><span class="field inline">Where to get it:</span> <a href="${esc(it.access.url)}" target="_blank" rel="noopener">${esc(it.access.label)}</a>${(it.links || []).filter(l => l.url !== it.access.url).map(l => ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")} <span class="src">via ${esc(it.src)}</span></p>
        <div class="item-acts">
          <button class="btn small ${saved ? "saved" : "ghost"}" data-save="${esc(it.key)}" aria-pressed="${saved}">${saved ? "Saved ✓" : "Save to library"}</button>
          ${it.abstract || it.subjects?.length ? `<details class="more"><summary>What the catalog says</summary>${it.abstract ? `<p>${esc(it.abstract)}</p>` : ""}${it.subjects?.length ? `<p class="subj"><span class="field inline">Subjects:</span> ${esc(it.subjects.join("; "))}</p>` : ""}</details>` : ""}
          ${it.jev ? `<details class="more nums"><summary>Jev's numbers</summary>${numbers(it, s)}</details>` : ""}
        </div>
      </div>
    </li>`;
  }

  function numbers(it, s) {
    const qs = it.kind === "background" ? J.Q_BACKGROUND : J.qSource(s.input.focus);
    return Object.entries(qs).map(([k, q]) => {
      const ans = it.jev[k]; if (!ans) return "";
      let rows;
      if (ans.type === "noul") rows = `<div class="pr"><span>yes</span><span class="pb"><i style="width:${pct(ans.noul)}"></i></span><span>${pct(ans.noul)}</span></div>`;
      else {
        const t = J.topKey(ans);
        rows = Object.entries(ans.probabilities).map(([o, p]) => `<div class="pr ${o === t ? "win" : ""}"><span>${esc(ans.type === "score" ? o + " · " + (ans.legend?.[o] || "").split(":")[0] : J.ANGLE_NAMES[o] || o)}</span><span class="pb"><i style="width:${pct(p)}"></i></span><span>${pct(p)}</span></div>`).join("");
      }
      return `<p class="q">${esc(q.instructions)}</p>${rows}`;
    }).join("") + `<p class="hint">Jev returns these numbers and nothing else. The tags and sentences above are written from them by rules in <code>js/rank.js</code>.</p>`;
  }

  App.rank = { rank, storyAngles, bestBackground, card, why, rel, level, angle, yes, KIND_LABEL };
})();
