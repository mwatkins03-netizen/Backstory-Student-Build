/* Backstory, layer 3: hand-off to Gemini. Builds a packet from the current search for the reader to paste into
   a Gem running the Backstory Guide skill. Nothing is sent from this page. */
(function () {
  const { $, $$, snip, copy } = App;
  const R = App.rank, J = App.jev;
  const FILES = { skill: "gemini/backstory-guide/SKILL.md", gem: "gemini/gem-instructions.md" };
  const text = { skill: null, gem: null, setup: `HOW TO SET UP THE BACKSTORY GUIDE

Option A · As a Gem (the Gemini app)
  1. Go to gemini.google.com and sign in with your university account.
  2. Open Gems, then New Gem.
  3. Name it: Backstory Guide
  4. Instructions: paste the "Gem instructions" file.
  5. Knowledge: upload SKILL.md.
  6. Save. Open the Gem and paste your packet.
  Make it once. Use it for every topic.

Option B · No Gem
  Use "Copy skill + packet" and paste both into a new Gemini chat.

Option C · Gemini CLI or another agent that reads Agent Skills
  Copy the folder gemini/backstory-guide/ into your skills folder
  (for Gemini CLI: ~/.gemini/skills/).

What Gemini sees: only what you paste. Backstory sends nothing.
Whether Gems work on your campus account depends on how the
university set up Gemini. Ask your instructor if Gems are missing.` };
  let tab = "skill";

  function packet() {
    const s = App.current; if (!s) return "";
    const r = R.rank(s), { main, more } = R.bestBackground(s), nums = $("#pkNums").checked;
    const L = ["# BACKSTORY PACKET v1", `Topic: ${s.title}`, `Search words: ${s.terms.join("; ")}`, `Focus: ${s.input.focus || "none given"}`, ""];
    if ($("#pkText").checked && s.input.text) L.push("## What I brought in", snip(s.input.text, 6000), "");
    if (main) {
      L.push("## Background (Wikipedia, CC BY-SA 4.0)", `${main.title}: ${main.extract}`, `Link: ${main.url}`);
      more.forEach(b => L.push(`Also: ${b.title}${b.description ? " (" + b.description + ")" : ""}: ${b.url}`));
      L.push("");
    }
    const angles = R.storyAngles(s);
    if (angles.length) L.push("## Angles Jev found in the story", angles.map(a => `${J.ANGLE_NAMES[a.key]} ${Math.round(a.p * 100)}%${a.on ? "" : " (weak)"}`).join("; "), "");
    L.push(`## Reading list (${r.jevOn ? "ranked by Jev's relevance scores" : "in catalog order"})`);
    r.ranked.forEach((it, i) => {
      const a = R.angle(it), lv = R.level(it);
      L.push(`[R${i + 1}] ${it.title}${it.authors?.length ? " | " + it.authors.join(", ") : ""}${it.year ? " | " + it.year : ""} | ${R.KIND_LABEL[it.kind]}${it.venue ? " | " + it.venue : ""}`);
      L.push(`     Where: ${it.access.label}: ${it.access.url}`);
      const tags = [a && J.ANGLE_NAMES[a.key], lv !== null && ["intro", "accessible", "academic", "specialist"][lv], R.yes(it, "onesided") && "argues one side", R.yes(it, "firsthand") && "firsthand"].filter(Boolean);
      if (tags.length) L.push(`     Tags: ${tags.join(", ")}`);
      if (nums && it.jev) L.push(`     Jev: relevance ${R.rel(it).toFixed(2)}/3${it.jev.focus ? `, focus ${Math.round(it.jev.focus.noul * 100)}%` : ""}`);
      if (it.abstract) L.push(`     Catalog: ${snip(it.abstract, 400)}`);
    });
    if (r.path.missing.length) L.push("", `Angles with nothing on the list yet: ${r.path.missing.map(k => J.ANGLE_NAMES[k]).join(", ")}`);
    L.push("", "## What I want", "Explain the backstory in plain language and help me choose what to read first.");
    return L.join("\n");
  }

  async function load() {
    for (const k of ["skill", "gem"]) {
      if (text[k]) continue;
      try { const r = await fetch(FILES[k]); if (!r.ok) throw 0; text[k] = await r.text(); } catch { text[k] = null; }
    }
  }
  function show() {
    const t = tab === "packet" ? packet() : text[tab];
    $("#skillBody").textContent = t || `Couldn't load ${FILES[tab]} from here. Open Backstory from a web address (GitHub Pages or a local server), or open the file in the Backstory folder.`;
    $$(".ms-tabs [role=tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.file === tab));
  }
  $$(".ms-tabs [role=tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.file; show(); }));
  $("#btnShowSkill").addEventListener("click", async () => { const v = $("#skillView"); v.hidden = !v.hidden; if (!v.hidden) { await load(); show(); } });
  $("#btnPacket").addEventListener("click", () => copy(packet(), "Packet copied. Paste it into the Backstory Guide Gem."));
  $("#btnSkillPacket").addEventListener("click", async () => {
    await load();
    if (!text.skill) { App.toast("Couldn't load the skill file from here. Use Copy packet and the Gem instead."); return; }
    copy(text.skill + "\n\n---\n\n" + packet(), "Skill and packet copied. Paste both into a new Gemini chat.");
  });
  ["#pkText", "#pkNums"].forEach(s => $(s).addEventListener("change", () => { if (tab === "packet" && !$("#skillView").hidden) show(); }));
  App.packet = packet;
})();
