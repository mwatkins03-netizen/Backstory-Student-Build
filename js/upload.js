/* Backstory: open a PDF, Word (.docx), or text file. Everything is read in the browser; nothing is uploaded.
   Adapted from Clarify's reader. Search words are picked from the text and shown for the reader to check. */
(function () {
  const $ = s => document.querySelector(s);
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
  const MAX_MB = 30, MAX_PAGES = 60;

  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; no(new Error("couldn't load the file reader (are you offline?)")); };
      document.head.appendChild(s);
    }));
  }
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const msg = t => { $("#fileMsg").textContent = t; };

  /* ---------- PDF: rebuild lines from positioned text, then paragraphs from spacing, indents, and short last lines ---------- */
  async function readPDF(buf) {
    await loadScript(PDFJS);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const n = Math.min(pdf.numPages, MAX_PAGES), pages = [];
    for (let i = 1; i <= n; i++) {
      msg(`Reading page ${i} of ${n}…`);
      const tc = await (await pdf.getPage(i)).getTextContent();
      const lines = []; let cur = null;
      tc.items.forEach(it => {
        if (!("str" in it)) return;
        const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
        if (it.str.trim() && (!cur || Math.abs(y - cur.y) > h * 0.5)) { cur = { y, h, x0: x, x1: x, text: "" }; lines.push(cur); }
        if (!cur) return;
        if (it.str) {
          if (cur.text && x - cur.x1 > h * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += " ";
          cur.text += it.str; cur.x1 = Math.max(cur.x1, x + it.width); cur.h = Math.max(cur.h, h);
        }
        if (it.hasEOL) cur = null;
      });
      pages.push(lines.map(l => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter(l => l.text));
    }
    const meta = await pdf.getMetadata().catch(() => null);

    // running heads, footers, and page numbers repeat across pages: drop them
    const norm = t => t.toLowerCase().replace(/\d+/g, "#").trim();
    const count = {};
    pages.forEach(ls => new Set([...ls.slice(0, 3), ...ls.slice(-3)].map(l => norm(l.text))).forEach(k => count[k] = (count[k] || 0) + 1));
    const repeated = k => pages.length >= 3 && count[k] >= Math.max(3, pages.length * 0.4);
    pages.forEach((ls, i) => pages[i] = ls.filter((l, j) => !(/^[\divxlc\s.\-–]+$/i.test(l.text)) && !((j < 3 || j >= ls.length - 3) && repeated(norm(l.text)))));

    const all = pages.flatMap((ls, p) => ls.map(l => ({ ...l, p })));
    const chars = all.reduce((s, l) => s + l.text.length, 0);
    if (chars < 300) throw new Error("this PDF has almost no text in it. It may be scanned pages (pictures of text). Try a different copy, or paste the text");
    const bodyH = median(all.map(l => l.h));
    const gaps = []; for (let i = 1; i < all.length; i++) { const g = all[i - 1].y - all[i].y; if (all[i].p === all[i - 1].p && g > 0 && g < bodyH * 3) gaps.push(g); }
    const step = median(gaps) || bodyH * 1.3;
    const width = median(all.filter(l => l.h <= bodyH * 1.05).map(l => l.x1 - l.x0));
    const isHead = l => l.h > bodyH * 1.12 && l.text.length < 110;

    const blocks = []; let buf2 = "";
    const flush = () => { if (buf2.trim()) blocks.push(buf2.trim()); buf2 = ""; };
    all.forEach((l, i) => {
      const prev = all[i - 1];
      if (prev) {
        const samePage = prev.p === l.p, gap = prev.y - l.y, jumped = !samePage || gap < 0 || gap > bodyH * 6;
        const prevShort = prev.x1 - prev.x0 < width * 0.75 && /[.?!:"”)]$/.test(prev.text);
        const indent = !jumped && l.x0 > prev.x0 + bodyH * 0.8 && l.x0 - prev.x0 < bodyH * 4;
        const bothHead = isHead(l) && isHead(prev) && Math.abs(l.h - prev.h) < 0.5 && !jumped && gap < step * 2.5;
        let brk = !bothHead && (isHead(l) || isHead(prev) || (!jumped && gap > step * 1.45) || prevShort || indent);
        // a sentence that runs on in lowercase is the same paragraph, even across a column or page
        if (/^[a-z(]/.test(l.text) && !/[.?!:]$/.test(prev.text) && !isHead(prev)) brk = false;
        if (brk) flush();
      }
      if (buf2 && /[a-z]-$/.test(buf2) && /^[a-z]/.test(l.text)) buf2 = buf2.slice(0, -1) + l.text;
      else buf2 += (buf2 ? " " : "") + l.text;
    });
    flush();

    let title = meta && meta.info && meta.info.Title ? String(meta.info.Title).trim() : "";
    if (title.length < 12 || /^(microsoft word|untitled|title)|\.(docx?|pdf)$/i.test(title)) {
      const first = pages[0] || [], big = Math.max(...first.map(l => l.h), 0);
      title = first.filter(l => l.h >= big - 0.5).map(l => l.text).join(" ").slice(0, 220);
    }
    return { title, text: blocks.join("\n\n"), note: `${n} page${n === 1 ? "" : "s"}${pdf.numPages > MAX_PAGES ? ` (of ${pdf.numPages}; only the first ${MAX_PAGES} are read)` : ""}` };
  }

  async function readDOCX(buf) {
    await loadScript(MAMMOTH);
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    const text = r.value.replace(/\n{3,}/g, "\n\n").trim();
    const title = (text.split("\n").find(l => l.trim()) || "").trim();
    return { title: title.length < 220 ? title : "", text, note: "Word document" };
  }

  function readText(t, md) {
    if (md) t = t.replace(/^#{1,6}\s+(.+)$/gm, "\n$1\n").replace(/\*\*|__/g, "");
    const head = (t.match(/^\s*(.+)/) || [])[1] || "";
    return { title: head.length < 220 ? head.replace(/^#+\s*/, "") : "", text: t.trim(), note: "text file" };
  }

  async function open(file) {
    if (!file) return;
    if (file.size > MAX_MB * 1e6) { msg(`That file is over ${MAX_MB} MB. Try a smaller copy.`); return; }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    msg(`Opening ${file.name}…`);
    try {
      let r;
      if (ext === "pdf" || file.type === "application/pdf") r = await readPDF(await file.arrayBuffer());
      else if (ext === "docx") r = await readDOCX(await file.arrayBuffer());
      else if (ext === "doc") throw new Error("old .doc files can't be read here. Save it as .docx or PDF");
      else if (["txt", "md", "markdown", "text"].includes(ext) || file.type.startsWith("text/")) r = readText(await file.text(), ext !== "txt");
      else throw new Error("Backstory reads PDF, Word (.docx), and text files");
      const title = r.title || file.name.replace(/\.[^.]+$/, "");
      App.uploaded({ name: file.name, title, text: r.text });
      msg(`Read ${file.name} (${r.note}, about ${r.text.split(/\s+/).length.toLocaleString()} words). Search words are below.`);
      $("#addTerm").scrollIntoView({ block: "nearest" });
    } catch (e) {
      msg(`Couldn't read ${file.name}: ${e.message}.`);
    }
  }

  const dz = $("#dropZone");
  $("#fileIn").addEventListener("change", e => { open(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => dz.addEventListener(t, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => open(e.dataTransfer.files[0]));
  // a file dropped outside the drop zone shouldn't make the browser leave the page
  ["dragover", "drop"].forEach(t => document.addEventListener(t, e => { if (!dz.contains(e.target)) e.preventDefault(); }));
  App.openFile = open;
})();
