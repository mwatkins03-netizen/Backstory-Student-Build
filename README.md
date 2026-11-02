# Backstory

A Grove Lab student build. **Idea by Caitlin Hereford (PPL and Rhetoric, Senior, WRIT 3810):** an app that points young adults to books, articles, and academic journals so they can understand the news, social media, and pop culture in depth. "History is cyclical, so the only way to understand what is happening now is to understand what has already happened." Prototype by Marc Watkins, coded with Anthropic's Claude.

You bring in a topic, pasted text, a file, or a link. Backstory picks search words you can edit, quotes the background from Wikipedia, searches free catalogs for real books and scholarship, has Jev score every result, and ranks a reading list with a short reading path ("Start here", "Go deeper", "From every angle"). A guide in the corner gives the short version. Folders and a library keep topics and readings.

It's built in three layers, like Clarify:

| Layer | What it does | Who writes the words |
|---|---|---|
| **1 · Catalogs** | Wikipedia (background summaries), Open Library (books), OpenAlex with a Crossref fallback (journals and scholarly books), DOAJ (open-access articles). Search words come from counting names and repeated phrases, with no AI involved, and the reader sees and edits every one. | The catalogs. Wikipedia text is quoted and credited. |
| **2 · Jev** | Jev (TypeSafe AI) returns probabilities only. For the story: which of seven angles help explain it. For each reading: relevance (0–3), main angle, reading level (0–3), argues one side, firsthand, speaks to the focus. For each Wikipedia candidate: relevance, which picks "the idea underneath it." Rules in `js/rank.js` turn the numbers into the ranking, tags, "why" lines, reading path, and gap notes. Every number is shown under "Jev's numbers." | Rules a person wrote. |
| **3 · Gemini** | A skill, `backstory-guide`, that explains the backstory using only the readings on the list, covers every angle, and marks claims as well established, debated, or not known. A packet builder makes the paste. | Gemini, under the skill's rules. |

Caitlin's version one, "a little icon in the corner… a personification of the agent… a more basic breakdown," is the **guide** (`js/guide.js`). It's rule-written from the same data: one sentence on what it's about, why it's bigger than one story, what to read with 10 minutes / an evening / a few weeks, and one thing to keep in mind. It never writes new facts.

The look follows her answers: "academic, clean, organized," "a classic, clean look," folders on the side, "a little library," and "no crazy images." There are no pictures, no motion, and one warm accent color. Light and dark follow the device setting.

## Files

- `index.html`: the app shell. No build step.
- `css/backstory.css`: all styles. **Colors and fonts are the first block.**
- `js/config.js`: **the guide's name, its one-line role, its drawing**, the three example topics, the Jev endpoint, and how many results to ask each catalog for.
- `js/app.js`: saved state (`localStorage` key `backstory.v1`), folders, views, input tabs, phone drawer.
- `js/terms.js`: picks search words from a topic, pasted text, or a link's address.
- `js/sources.js`: layer 1, the catalog calls, normalized into one shape.
- `js/jev.js`: layer 2. The exact questions Jev is asked are at the top.
- `js/rank.js`: the rules that turn Jev's numbers into the list and its sentences.
- `js/search.js`: runs a search and draws the results.
- `js/guide.js`: the guide in the corner.
- `js/library.js`: My library (to read / reading / finished, notes, copy reading list).
- `js/gemini.js`: layer 3, the packet builder and skill viewer.
- `js/upload.js`: PDF, Word, and text files, read in the browser (adapted from Clarify; pdf.js 3.11.174 and mammoth 1.6.0 from cdnjs, loaded only when a file is chosen).
- `how-to-use/index.html`: the student guide (linked as "How to use"). Printable.
- `gemini/backstory-guide/SKILL.md`: the skill (Agent Skills format with YAML front matter).
- `gemini/gem-instructions.md`: a shorter version for a Gemini Gem's Instructions box.

## Outside services

All free, keyless, and open to any web page (CORS checked November 2, 2026).

- **Wikipedia** search API and REST page summaries. Up to six candidates per search, from all the words together and from each word alone. Jev picks the best one.
- **Open Library** search. For each of the first four search words: `subject:"word"` and `word -subject:fiction language:eng`, six results each, sorted by number of editions and merged in turns. Up to 12 books.
- **OpenAlex** works search (articles, books, chapters, reviews; English). **Keyless OpenAlex now shares a small daily budget per network address, about 100 searches a day.** Backstory makes one OpenAlex call per search. If it fails or runs out, Crossref is used instead and the page says so. For class use, get a free key at openalex.org/settings/api and paste it into `openAlexKey` in `js/config.js` (about 1,000 searches a day for the site). The key is visible to anyone who opens the page source; it only spends OpenAlex's free budget, and a new one can be made anytime.
- **Crossref** works search (backup).
- **DOAJ** article search. Tries pairs of search words, then single words, until something comes back. Up to 4.
- **Jev** through the existing Jev Sandbox Worker (`https://jev-sandbox-proxy.watkins-um.workers.dev`): 60 requests a minute, 6,000 characters, 8 questions per request. A search costs one request for the story plus one per result, about 25 to 30, run three at a time. It takes about 20 to 30 seconds. The list appears in catalog order first and re-sorts when Jev finishes.

## Privacy

Backstory collects nothing and has no accounts. Search words go to the catalogs. Jev gets the topic, search words, focus, the start of what was brought in, and one catalog entry at a time, through a proxy that stores nothing. Uploaded files are read in the browser. Folders, searches, the library, and notes are in `localStorage` on that device. Layer 3 sends nothing; the reader decides what to paste into Gemini, and the packet options let them leave out their text or Jev's numbers.

## Verified in the browser (November 2, 2026)

These were checked with live catalogs and live Jev, in light and dark mode, at desktop width and at 375 px with no sideways scrolling:

- Caitlin's own example ("mining massacre in Central Africa," focus "who profits"): Jev chose **Blood diamond** as the idea underneath it, and Tom Zoellner's *The Heartless Stone* topped "Start here."
- "Why does everyone keep quoting 1984?"
- "Tariffs and trade wars"
- A BBC-style link with Jev turned off
- Search words picked from a pasted Voting Rights Act story and a tariffs story
- The guide, folders and the phone drawer, the library (status, notes, folders), and the packet

The file upload code is Clarify's, which was tested on PDFs and Word files. It was not re-run here. The Gemini skill hasn't been run inside the university's Gemini yet. Test it with a packet before class.

Known rough edges: Open Library sometimes returns novels or study guides, and Jev usually pushes those down or off the list, but not always. Search words picked from pasted text are a starting point; some need removing. Jev judges books by title and subjects only.

## Running it

Static files. Serve the folder (`python3 -m http.server`) or publish it on GitHub Pages. Opened as a `file://` page, everything works except the skill preview in section 4. The download links still work.

### Deploy to GitHub Pages

1. Create an empty public repository on github.com.
2. Upload everything in this folder to the repository root, including the hidden `.nojekyll` file (Cmd+Shift+. in Finder shows it). Keep the folders: `css/`, `js/`, `gemini/`, `how-to-use/`.
3. Settings → Pages → Deploy from a branch → `main` / `/ (root)` → Save.
4. The site appears at `https://<user>.github.io/<repo>/` in a minute or two.

The Jev Worker accepts any origin. If it's ever locked down, add the new Pages origin.

## For Caitlin

You said the guiding premise should stay yours, and that you're open to suggestions. Here's what you can change, and what you said you'd do.

**Make it yours (no coding experience needed):**
- **Name the guide.** Open `js/config.js` and change `name: "Guide"`. You can also change its one-line `role` and swap the drawing (any simple SVG with `viewBox="0 0 64 64"`).
- **Change the look.** The first block of `css/backstory.css` has every color (`--navy`, `--accent`, `--paper`…) and the two fonts. Change a value, save, and reload.
- **Change the examples** under "Type a topic" in `js/config.js`.
- **Change the rules.** `js/rank.js` decides what counts as "Start here" (Jev level 0–1 and relevance ≥ 1.6), what's off-topic (relevance < 1.15), and every "why" sentence. These are judgment calls. Make them match how you think readers should move from intro to academic.

**Test it with real people** (the part you picked to do yourself). A first test: give two classmates the same headline. One uses only a search engine for 15 minutes, and the other uses Backstory. Then ask each one: *What's the history behind this? Name one thing you'd read next and why.* Your "how will you know it worked" answer was that people "feel as though they have a deeper understanding." Ask them to rate that from 1 to 5 before and after.

**Saved for later:** "a cool aura that passes over the screen occasionally." It's left out of version one because you also asked for nothing that pulls focus. If you want it, it belongs in the CSS as a slow, faint gradient that switches off for people with "reduce motion" turned on.

**Your AI-use notes** (you agreed to keep them). A starting template:

```
Date:
What I asked the AI to do:
What it did well:
What I changed or rejected, and why:
What I decided myself:
```
