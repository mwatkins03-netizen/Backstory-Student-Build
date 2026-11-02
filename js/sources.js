/* Backstory, layer 1: the catalogs. Free, keyless, open to any web page.
   Wikipedia (background), Open Library (books), OpenAlex with Crossref as a backup (scholarship), DOAJ (open-access articles).
   Every result is turned into the same shape so the rest of the app doesn't care where it came from. */
(function () {
  const { snip } = App;
  const L = App.cfg.limits;

  async function getJSON(url, ms = 15000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) { const e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
      return await r.json();
    } catch (e) { if (e.name === "AbortError") throw new Error("timed out"); throw e; }
    finally { clearTimeout(t); }
  }
  const enc = encodeURIComponent;
  const worldcat = (title, author) => `https://search.worldcat.org/search?q=${enc([title, author].filter(Boolean).join(" "))}`;
  const clean = s => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  // some catalogs store titles in ALL CAPS; set those in title case so the list doesn't shout
  const SMALL = new Set("a an and as at but by for from in into nor of on or the to vs with".split(" "));
  function tidyTitle(t) {
    t = clean(t);
    const letters = t.replace(/[^A-Za-z]/g, ""), caps = t.replace(/[^A-Z]/g, "");
    if (letters.length < 12 || caps.length / letters.length < 0.75) return t;
    return t.toLowerCase().replace(/[a-z][a-z'’]*/g, (w, i) => i > 0 && SMALL.has(w) && !/[:–—-]\s*$/.test(t.slice(0, i)) ? w : w[0].toUpperCase() + w.slice(1));
  }

  /* ---------- Wikipedia: the background ---------- */
  async function wikiSearch(q, n = L.background) {
    const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=${n}&format=json&origin=*`);
    return (d.query?.search || []).map(s => s.title);
  }
  async function wikiSummary(title) {
    const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(title.replace(/ /g, "_"))}?redirect=true`);
    if (d.type === "disambiguation" || !d.extract) return null;
    return {
      key: "wp:" + d.title, kind: "background", src: "Wikipedia", title: d.title, description: d.description || "",
      extract: d.extract, url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${enc(d.title)}`
    };
  }
  // candidates from all the words together and from each word alone; Jev (or catalog order) picks the best one
  async function background(terms) {
    const qs = [terms.join(" "), ...terms.slice(0, 4)].filter((q, i, a) => q && a.indexOf(q) === i);
    const lists = await Promise.all(qs.map((q, i) => wikiSearch(q, i ? 2 : 3).catch(() => [])));
    const titles = [...new Set(roundRobin(lists))].slice(0, L.background + 2);
    const out = await Promise.all(titles.map(t => wikiSummary(t).catch(() => null)));
    return out.filter(Boolean).map((b, i) => ({ ...b, catalogRank: i }));
  }
  function roundRobin(lists) { const out = [], n = Math.max(0, ...lists.map(l => l.length)); for (let i = 0; i < n; i++) lists.forEach(l => l[i] !== undefined && out.push(l[i])); return out; }
  async function retry(fn) { try { return await fn(); } catch { await new Promise(r => setTimeout(r, 600)); return fn(); } }

  /* ---------- Open Library: books ---------- */
  const OL_FIELDS = "key,title,subtitle,author_name,first_publish_year,subject,ebook_access,edition_count,number_of_pages_median,first_sentence";
  // for each search word: books catalogued under that subject, and nonfiction in English that mentions it
  async function books(terms) {
    const qs = terms.slice(0, 4).flatMap(t => { t = t.replace(/"/g, ""); return [`subject:"${t}"`, `${t} -subject:fiction language:eng`]; });
    const lists = []; let i = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < qs.length) {
        const k = i++;
        const d = await retry(() => getJSON(`https://openlibrary.org/search.json?q=${enc(qs[k])}&limit=6&fields=${OL_FIELDS}`)).catch(() => ({ docs: [] }));
        // books still in print in many editions first: a rough sign that readers kept coming back to them
        lists[k] = (d.docs || []).sort((a, b) => (b.edition_count || 0) - (a.edition_count || 0));
      }
    }));
    const seen = new Map();
    roundRobin(lists).forEach(b => { if (b.title && !seen.has(b.key)) seen.set(b.key, b); });
    return [...seen.values()].slice(0, L.books).map((b, i) => {
      const free = b.ebook_access === "public" ? "Free to read online" : b.ebook_access === "borrowable" ? "Free to borrow online" : "";
      const url = "https://openlibrary.org" + b.key;
      return {
        key: "ol:" + b.key, kind: "book", src: "Open Library",
        title: tidyTitle(b.title + (b.subtitle ? ": " + b.subtitle : "")), authors: (b.author_name || []).slice(0, 3), year: b.first_publish_year || null,
        pages: b.number_of_pages_median || null, editions: b.edition_count || 0,
        subjects: (b.subject || []).filter(s => s.length < 60).slice(0, 10),
        abstract: b.first_sentence ? "Opens: " + snip(b.first_sentence[0], 200) : "",
        access: free ? { label: free, url, free: true } : { label: "Find it in a library", url: worldcat(b.title, (b.author_name || [])[0]), free: false },
        links: [{ label: "Open Library", url }, { label: "WorldCat", url: worldcat(b.title, (b.author_name || [])[0]) }],
        catalogRank: i
      };
    });
  }

  /* ---------- OpenAlex (Crossref if OpenAlex is busy): journals and scholarly books ---------- */
  function unInvert(inv) {
    if (!inv) return "";
    const words = [];
    Object.entries(inv).forEach(([w, ps]) => ps.forEach(p => words[p] = w));
    return words.join(" ");
  }
  const KIND = { article: "article", review: "article", "journal-article": "article", book: "book", "book-chapter": "chapter", monograph: "book" };
  async function openAlex(q) {
    const sel = "id,doi,display_name,publication_year,cited_by_count,open_access,primary_location,authorships,type,abstract_inverted_index";
    const key = App.cfg.openAlexKey ? `&api_key=${enc(App.cfg.openAlexKey)}` : "";
    const d = await getJSON(`https://api.openalex.org/works?search=${enc(q)}&filter=type:article|book|book-chapter|review,language:en&per-page=${L.articles}&select=${sel}${key}`);
    return (d.results || []).map((w, i) => {
      const venue = w.primary_location?.source?.display_name || "";
      const doi = w.doi || "", oa = w.open_access?.oa_url;
      const authors = (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean);
      const page = doi || w.primary_location?.landing_page_url || w.id;
      return {
        key: "oa:" + w.id.split("/").pop(), kind: KIND[w.type] || "article", src: "OpenAlex",
        title: tidyTitle(w.display_name), authors, year: w.publication_year, venue, citedBy: w.cited_by_count || 0,
        abstract: snip(unInvert(w.abstract_inverted_index), 700),
        access: oa ? { label: "Open access: free to read", url: oa, free: true } : { label: doi ? "Through your library (DOI)" : "Publisher page", url: page, free: false },
        links: [doi ? { label: "DOI", url: doi } : null, { label: "OpenAlex", url: w.id }].filter(Boolean),
        catalogRank: i
      };
    });
  }
  async function crossref(q) {
    const d = await getJSON(`https://api.crossref.org/works?query=${enc(q)}&rows=${L.articles}&filter=type:journal-article,type:book,type:book-chapter,type:monograph&select=DOI,title,author,issued,container-title,type,is-referenced-by-count,abstract`);
    return (d.message?.items || []).filter(w => w.title?.[0]).map((w, i) => {
      const doi = "https://doi.org/" + w.DOI;
      return {
        key: "cr:" + w.DOI, kind: KIND[w.type] || "article", src: "Crossref",
        title: tidyTitle(w.title[0]), authors: (w.author || []).slice(0, 3).map(a => [a.given, a.family].filter(Boolean).join(" ")),
        year: w.issued?.["date-parts"]?.[0]?.[0] || null, venue: clean(w["container-title"]?.[0]), citedBy: w["is-referenced-by-count"] || 0,
        abstract: snip(clean(w.abstract), 700),
        access: { label: "Through your library (DOI)", url: doi, free: false }, links: [{ label: "DOI", url: doi }],
        catalogRank: i
      };
    });
  }
  async function scholarship(q) {
    try { return { items: await openAlex(q), from: "OpenAlex" }; }
    catch (e) {
      const items = await crossref(q).catch(() => []);
      return { items, from: "Crossref", note: `OpenAlex didn't answer (${e.message}), so journal results come from Crossref.` };
    }
  }

  /* ---------- DOAJ: open-access articles ---------- */
  async function doaj(terms) {
    // DOAJ reads the query as search syntax: strip operator characters and quote phrases.
    // Try two words together first, then fall back to one at a time.
    const t = terms.slice(0, 3).map(s => s.replace(/[:"()\[\]{}\/\\^~*?!]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).map(s => s.includes(" ") ? `"${s}"` : s);
    const tries = [t.length > 1 && `${t[0]} AND ${t[1]}`, t.length > 2 && `${t[0]} AND ${t[2]}`, t.length > 2 && `${t[1]} AND ${t[2]}`, ...t].filter(Boolean);
    let d = { results: [] };
    for (const q of tries) {
      d = await getJSON(`https://doaj.org/api/search/articles/${enc(q)}?pageSize=${L.openAccess}`).catch(() => ({ results: [] }));
      if (d.results?.length) break;
    }
    return (d.results || []).map((r, i) => {
      const b = r.bibjson || {};
      const full = (b.link || []).find(l => l.type === "fulltext")?.url;
      const doi = (b.identifier || []).find(x => x.type === "doi")?.id;
      const url = full || (doi ? "https://doi.org/" + doi : "https://doaj.org/article/" + r.id);
      return {
        key: "dj:" + r.id, kind: "article", src: "DOAJ",
        title: tidyTitle(b.title), authors: (b.author || []).slice(0, 3).map(a => a.name).filter(Boolean), year: +b.year || null,
        venue: b.journal?.title || "", subjects: (b.keywords || []).slice(0, 8), abstract: snip(clean(b.abstract), 700),
        access: { label: "Open access: free to read", url, free: true }, links: [{ label: "DOAJ", url: "https://doaj.org/article/" + r.id }],
        catalogRank: i
      };
    }).filter(x => x.title);
  }

  App.sources = { background, books, scholarship, doaj, wikiSummary, worldcat };
})();
