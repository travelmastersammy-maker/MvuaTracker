function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
}
function xmlValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<(?:(?:cap):)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:cap):)?${escaped}\\s*>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}
function stripMarkup(text) { return decodeXml(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function normalizeArea(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bcounty\b/g, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function hasAreaPhrase(haystack, phrase) {
  const normalizedPhrase = normalizeArea(phrase);
  return Boolean(normalizedPhrase) && ` ${normalizeArea(haystack)} `.includes(` ${normalizedPhrase} `);
}
const COUNTY_REGIONS = {
  Coast: ['Mombasa', 'Kilifi', 'Kwale', 'Lamu', 'Tana River'],
  'North Eastern': ['Garissa', 'Wajir', 'Mandera'],
  Northern: ['Turkana', 'Marsabit', 'Samburu', 'Isiolo', 'Wajir', 'Mandera', 'Garissa'],
  Central: ['Nyeri', 'Kirinyaga', 'Murang’a', 'Kiambu', 'Nyandarua'],
  Eastern: ['Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Isiolo'],
  Western: ['Bungoma', 'Busia', 'Kakamega', 'Vihiga', 'Trans Nzoia'],
  'Lake Victoria Basin': ['Kisumu', 'Siaya', 'Homa Bay', 'Migori', 'Busia'],
  'Rift Valley': ['Nakuru', 'Kericho', 'Bomet', 'Narok', 'Kajiado', 'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Samburu', 'Turkana', 'West Pokot', 'Trans Nzoia']
};
const NATIONWIDE = /\b(?:nationwide|countrywide|all counties|every county|across the country|throughout the country|across the whole country|throughout kenya|all of kenya|entire country|most parts of (?:the )?country|most parts of kenya)\b/i;
function inferredExpiry(description, published) {
  const match = String(description || '').match(/\b(?:to|through|until|till|ending(?: on)?|valid(?: until| through| to)?)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*(\d{4})?\b/i);
  if (!match) return NaN;
  const issueTime = Date.parse(published || '');
  const year = match[3] || (Number.isFinite(issueTime) ? String(new Date(issueTime).getUTCFullYear()) : '');
  if (!year) return NaN;
  const day = match[1].padStart(2, '0');
  const date = Date.parse(`${day} ${match[2]} ${year} 23:59:59 GMT+0300`);
  return date;
}
function alertAffectsLocation(alert, place, county) {
  const allText = `${alert.title} ${alert.description} ${alert.area} ${alert.event}`;
  if (NATIONWIDE.test(allText)) return true;
  const locationTerms = [place, county].filter(Boolean);
  if (locationTerms.some(term => hasAreaPhrase(allText, term))) return true;
  const normalizedCounty = normalizeArea(county);
  if (!normalizedCounty) return false;
  for (const [region, counties] of Object.entries(COUNTY_REGIONS)) {
    if (counties.some(name => normalizeArea(name) === normalizedCounty) && hasAreaPhrase(allText, region)) return true;
  }
  return false;
}

module.exports = { decodeXml, xmlValue, stripMarkup, normalizeArea, hasAreaPhrase, inferredExpiry, alertAffectsLocation };
