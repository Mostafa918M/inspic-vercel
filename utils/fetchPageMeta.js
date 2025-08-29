const fetch = require("node-fetch");
const cheerio = require("cheerio");
const ApiError = require("../utils/ApiError");

async function fetchPageMeta(url) {
  try {
    const resp = await fetch(url, { timeout: 7000 });
    if (!resp.ok) throw new Error(`Failed to fetch: ${resp.status} ${resp.statusText}`);
    const html = await resp.text();
    const $ = cheerio.load(html);

    const ogTitle = $('meta[property="og:title"]').attr("content");
    const ogDesc  = $('meta[property="og:description"]').attr("content");
    const title   = $("title").text();
    const metaDesc= $('meta[name="description"]').attr("content");
    const metaKeywords = $('meta[name="keywords"]').attr("content");

    return {
      title: (ogTitle || title || "").trim(),
      description: (ogDesc || metaDesc || "").trim(),
      keywords: metaKeywords
        ? metaKeywords.split(",").map(k => k.trim()).filter(Boolean)
        : []
    };
  } catch (e) {
    // Return null on failure, not an ApiError instance
    return null;
  }
}

module.exports = { fetchPageMeta };