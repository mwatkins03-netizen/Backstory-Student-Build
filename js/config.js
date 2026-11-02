/* Backstory settings. Caitlin: this is the file to change first.
   The guide's name, how it introduces itself, and its drawing all live here. Colors and fonts are at the top of css/backstory.css. */
window.BACKSTORY = {
  guide: {
    // Give the guide a name. It shows on the corner button and at the top of its panel.
    name: "Guide",
    // One line under the name.
    role: "The short version, in plain words",
    // The drawing: a simple librarian in line art. Swap in any SVG you like (keep viewBox 0 0 64 64 and use currentColor).
    figure: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 60c0-12 8-19 18-19s18 7 18 19"/>
      <path d="M26 42l6 9 6-9"/>
      <circle cx="32" cy="24" r="12"/>
      <path d="M20.5 20c3-7 19-8 23 0"/>
      <circle cx="27" cy="25" r="3.2"/><circle cx="37" cy="25" r="3.2"/><path d="M30.2 25h3.6"/>
      <path d="M29 31.5c2 1.4 4 1.4 6 0"/>
      <path d="M20 52h13v9H20z" fill="var(--paper)"/><path d="M26.5 52v9"/>
    </svg>`
  },

  // The example buttons under "Type a topic". The first one is Caitlin's own example from her proposal.
  examples: [
    { topic: "A mining massacre in Central Africa", terms: ["mining massacre", "Central Africa", "conflict diamonds"], focus: "who profits" },
    { topic: "Why does everyone keep quoting 1984?", terms: ["Nineteen Eighty-Four", "Orwell", "surveillance", "propaganda"], focus: "" },
    { topic: "Tariffs and trade wars", terms: ["tariffs", "trade war", "protectionism"], focus: "how it started" }
  ],

  // Jev proxy (the same one the Jev Sandbox and Clarify use). It holds the API key; this page never sees it.
  jevEndpoint: "https://jev-sandbox-proxy.watkins-um.workers.dev",

  // OpenAlex API key (free, from https://openalex.org/settings/api). Without one, everyone on the same network shares
  // about 100 searches a day; with one, the site gets its own daily budget (about 1,000). Leave "" to run without.
  // This page is public, so anyone can read the key: it only spends OpenAlex's free budget, and you can make a new one anytime.
  openAlexKey: "xc4d84S5EoZj0Zw5g4eaxf",

  // How many results to ask each catalog for.
  limits: { books: 12, articles: 8, openAccess: 4, background: 4 }
};
