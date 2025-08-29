const WordPOS = require("wordpos");
const wordpos = new WordPOS();

const SPLIT = /[^\p{L}\p{N}+#.-]+/u; 
const splitTokens = s =>
  typeof s === "string" ? s.split(SPLIT).map(t => t.trim().toLowerCase()).filter(Boolean) : [];

const toArray = v => (Array.isArray(v) ? v : v ? [v] : []);

const STOPWORDS = new Set([
  "a","an","and","the","in","on","at","for","to","of","is","are","was","were","by","with","or","as","it","be","but","not","this","that","which","who","whom","its","their","they","he","she","we","you","me","him","her","us","them","got",
  "my","your","his","her","our","their","there","where","when","why","how","what","who","whom","whose","if","then","than","so","such","more","most","less","least","all","some","any","no","none",
  "each","every","either","neither","both","few","many","much","into","out","up","down","over","under","after","before","during","while","since","until","about","around","through","across","along",

  "من","في","على","الى","إلى","عن","مع","هذا","هذه","ذلك","تلك","هو","هي","هم","هن","أن","إن","لكن","بل","ثم","قد","كل","أي","أيضا","او","أو","ما","لم","لن","لا","ليس","كان","كانت","يكون","يكونون","يكونون","يكونون","يكونون",
]);

/**
 * Generate keywords from inputs, then expand with WordNet (wordpos) synonyms.
 * - Same parameters as before; now returns Promise<string[]>
 * - Original extraction logic is unchanged; synonyms are appended after.
 */
async function generateKeywords(title, description, provided, linkMeta, extractedImage) {
  const titleTokens       = splitTokens(title);
  const descriptionTokens = splitTokens(description);
  const imageTokens       = splitTokens(extractedImage);

  const providedTokens = toArray(provided).flatMap(splitTokens);

  const linkTokens = linkMeta
    ? [
        ...splitTokens(linkMeta.title),
        ...splitTokens(linkMeta.description),
        ...toArray(linkMeta.keywords).flatMap(splitTokens),
        ...splitTokens(linkMeta.author),
        ...splitTokens(linkMeta.url),
        ...splitTokens(linkMeta.image),
      ]
    : [];

  const base = [...new Set([
    ...titleTokens,
    ...descriptionTokens,
    ...imageTokens,
    ...providedTokens,
    ...linkTokens,
  ])].filter(w => w.length > 1 && !STOPWORDS.has(w));

  const out = new Set(base);


  const TERMS_CAP = 200; 
  const terms = base.slice(0, TERMS_CAP);

  await Promise.all(terms.map(async (token) => {
    try {
      const entries = await wordpos.lookup(token);
      for (const e of entries) {
        if (!e || !e.synonyms) continue;
        for (const syn of e.synonyms) {
          const w = syn.replace(/_/g, " ").toLowerCase().trim();
          if (w && w.length > 1 && !STOPWORDS.has(w)) {
            out.add(w);
          }
        }
      }
    } catch { throw new Error(`WordPOS lookup failed for "${token}"`); }
  }));

  return Array.from(out);
}

module.exports = { generateKeywords };
