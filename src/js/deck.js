/* CSV validation and immutable deck identities. No runtime dependencies. */
class DeckImportError extends Error {
  constructor(issues) {
    super(issues.join('\n'));
    this.name = 'DeckImportError';
    this.issues = issues;
  }
}

function parseCSVText(text, delimiter = ',') {
  const rows = [];
  let row = [''], quoted = false, closed = false, line = 1, startLine = 1;
  const pushRow = () => {
    Object.defineProperty(row, 'line', { value: startLine });
    rows.push(row);
    row = [''];
    closed = false;
    startLine = line + 1;
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') { row[row.length - 1] += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else { row[row.length - 1] += char; }
    } else if (char === delimiter) {
      row.push(''); closed = false;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && next === '\n') i++;
      pushRow();
    } else if (char === '"') {
      if (closed || row[row.length - 1] !== '') {
        throw new DeckImportError([`Line ${line}: unexpected quote. Quote the entire field and double embedded quotes.`]);
      }
      quoted = true;
    } else if (closed) {
      if (!/[ \t]/.test(char)) throw new DeckImportError([`Line ${line}: unexpected text after a closing quote.`]);
    } else { row[row.length - 1] += char; }
    if (char === '\n' || (char === '\r' && (!quoted || next !== '\n'))) line++;
  }
  if (quoted) throw new DeckImportError([`Line ${startLine}: unclosed quoted field.`]);
  if (row.length > 1 || row[0] !== '') {
    Object.defineProperty(row, 'line', { value: startLine });
    rows.push(row);
  }
  return rows;
}

function parsePoints(value, allowZero = false) {
  const text = String(value).trim();
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const amount = Number(text.replace(/[$,]/g, ''));
  return Number.isSafeInteger(amount) && amount >= (allowZero ? 0 : 1) ? amount : null;
}

function categoryKey(name) { return name.trim().normalize('NFC').toLowerCase(); }

function deckFingerprint(deck) {
  const content = ['singleJeopardy', 'doubleJeopardy'].map(round =>
    deck[round].categories.map(cat => [cat.name, cat.clues.map(clue =>
      [clue.value, clue.question, clue.answer, clue.isDailyDouble, clue.mediaType, clue.mediaUrl])])
  );
  const final = deck.finalJeopardy;
  content.push(final ? [final.category, final.question, final.answer, final.mediaType, final.mediaUrl] : null);
  let hash = 2166136261;
  for (const char of JSON.stringify(content)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return `deck-${(hash >>> 0).toString(16)}`;
}

function ensureDeckIds(deck) {
  deck.id ||= deckFingerprint(deck);
  ['singleJeopardy', 'doubleJeopardy'].forEach((round, roundIndex) => {
    deck[round].categories.forEach((category, categoryIndex) => {
      category.id ||= `${deck.id}-r${roundIndex}-c${categoryIndex}`;
      category.clues.forEach((clue, clueIndex) => {
        clue.id ||= `${category.id}-q${clueIndex}`;
        clue.category = category.name;
      });
    });
  });
  if (deck.finalJeopardy) deck.finalJeopardy.id ||= `${deck.id}-final`;
  return deck;
}

function processCSVDeck(csvText, options = {}) {
  if (csvText.length > 2 * 1024 * 1024) throw new DeckImportError(['Deck exceeds the 2 MB text limit.']);
  if (csvText.includes('\uFFFD')) throw new DeckImportError(['Text contains replacement characters (�). Re-export as UTF-8 or choose the correct text encoding.']);
  const firstLine = csvText.trimStart().split(/[\r\n]/, 1)[0];
  const delimiter = options.delimiter || (firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',');
  const rows = parseCSVText(csvText, delimiter).filter(row => row.some(field => field.trim() !== ''));
  if (rows.length < 2) throw new DeckImportError(['The file needs a header and at least one clue.']);
  const headers = rows.shift().map(h => h.trim().normalize('NFC').toLowerCase());
  const issues = [], warnings = [];
  if (headers.some(h => /[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/.test(h))) issues.push('Header contains invisible direction or zero-width characters. Remove them from column names.');
  if (new Set(headers).size !== headers.length) issues.push('Header contains duplicate column names.');
  ['round', 'category', 'question', 'answer'].forEach(h => {
    if (!headers.includes(h)) issues.push(`Missing required column: ${h}.`);
  });
  if (issues.length) throw new DeckImportError(issues);
  const deck = { singleJeopardy: { categories: [] }, doubleJeopardy: { categories: [] }, finalJeopardy: null };
  let count = 0;
  rows.forEach(row => {
    const label = `Line ${row.line}`;
    if (row.length !== headers.length) { issues.push(`${label}: expected ${headers.length} fields, found ${row.length}.`); return; }
    const fields = Object.fromEntries(headers.map((h, i) => [h, row[i].trim()]));
    const round = fields.round.toLowerCase();
    if (!['single', 'double', 'final'].includes(round)) { issues.push(`${label}: Round must be Single, Double, or Final.`); return; }
    const before = issues.length;
    ['category', 'question', 'answer'].forEach(h => { if (!fields[h]) issues.push(`${label}: ${h} is required.`); });
    const value = round === 'final' ? 0 : parsePoints(fields.value ?? '');
    if (value === null) issues.push(`${label}: Value must be a positive whole number (200 or "$1,000").`);
    const flag = (fields.isdailydouble || 'FALSE').toUpperCase();
    if (!['TRUE', 'FALSE'].includes(flag)) issues.push(`${label}: IsDailyDouble must be TRUE or FALSE.`);
    const mediaType = (fields.mediatype || 'none').toLowerCase();
    if (!['none', 'image'].includes(mediaType)) issues.push(`${label}: MediaType must be none or image.`);
    if (mediaType === 'image' && !fields.mediaurl) issues.push(`${label}: an image needs MediaURL.`);
    if (fields.mediaurl && /^(?:javascript|vbscript|data:text\/html):/i.test(fields.mediaurl)) issues.push(`${label}: unsupported media URL.`);
    if (round === 'final' && deck.finalJeopardy) issues.push(`${label}: only one Final clue is supported.`);
    if (issues.length !== before) return;
    const clue = { category: fields.category, value, question: fields.question, answer: fields.answer,
      isDailyDouble: flag === 'TRUE', mediaType, mediaUrl: fields.mediaurl || '' };
    if (round === 'final') deck.finalJeopardy = clue;
    else {
      const categories = deck[round === 'single' ? 'singleJeopardy' : 'doubleJeopardy'].categories;
      let category = categories.find(cat => categoryKey(cat.name) === categoryKey(fields.category));
      if (!category) { category = { name: fields.category.normalize('NFC'), clues: [] }; categories.push(category); }
      if (category.clues.some(c => c.value === value)) warnings.push(`${label}: repeated $${value} in ${category.name}; tracked as a separate clue.`);
      clue.category = category.name;
      category.clues.push(clue);
    }
    count++;
  });
  if (count > 500) issues.push('Deck exceeds the 500-clue limit.');
  if (!count) issues.push('No playable clues were found.');
  if (issues.length) throw new DeckImportError(issues);
  ['singleJeopardy', 'doubleJeopardy'].forEach(round => deck[round].categories.forEach(cat => cat.clues.sort((a, b) => a.value - b.value)));
  deck.importSummary = { count, warnings, delimiter };
  return ensureDeckIds(deck);
}

// Use only for text embedded in static HTML templates; never treat deck content as markup.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
