/* Local editing keeps clue IDs, scores, and spent state intact. */
function deckClues(deck = gameState.deck) {
  return ['singleJeopardy', 'doubleJeopardy'].flatMap(round => deck[round].categories.flatMap(category =>
    category.clues.map(clue => ({ clue, category, round })))).concat(deck.finalJeopardy ? [{ clue: deck.finalJeopardy, category: null, round: 'final' }] : []);
}
function canEditDeck() {
  return !gameState.currentClue && !['final_jeopardy', 'completed'].includes(gameState.gamePhase) && deckClues().length > 0;
}
function refreshEditorButtons() {
  for (const id of ['edit-deck', 'edit-deck-setup']) {
    const button = document.getElementById(id); if (button) button.disabled = !canEditDeck();
  }
}
function commitEditedDeck(deck) {
  const validated = validateBackupDeck(deck);
  gameState.deck = validated;
  gameState.undoStack = []; gameState.redoStack = [];
  appendScoreEvent('Deck edited');
  return validated;
}
function editDeckClue(id, changes) {
  if (!canEditDeck()) throw new Error('Finish the active clue before editing. Final and completed rounds are locked.');
  const deck = JSON.parse(JSON.stringify(gameState.deck));
  const entry = deckClues(deck).find(entry => entry.clue.id === id);
  if (!entry) throw new Error('Choose a clue to edit.');
  const name = changes.category.trim().normalize('NFC');
  if (entry.category) {
    if (deck[entry.round].categories.some(cat => cat !== entry.category && categoryKey(cat.name) === categoryKey(name))) throw new Error('Another category already uses this name.');
    entry.category.name = name;
    entry.category.clues.forEach(clue => { clue.category = name; });
  } else entry.clue.category = name;
  entry.clue.value = entry.round === 'final' ? 0 : parsePoints(changes.value);
  entry.clue.question = changes.question.trim(); entry.clue.answer = changes.answer.trim();
  entry.clue.isDailyDouble = entry.round !== 'final' && changes.isDailyDouble;
  entry.clue.mediaType = changes.mediaType; entry.clue.mediaUrl = changes.mediaUrl.trim();
  if (!name || !entry.clue.question || !entry.clue.answer || entry.clue.value === null) throw new Error('Category, question, answer, and a valid grid value are required.');
  if (entry.category) entry.category.clues.sort((a, b) => a.value - b.value);
  return commitEditedDeck(deck);
}
function moveDeckCategory(clueId, direction) {
  if (!canEditDeck()) throw new Error('Finish the active clue before editing.');
  const deck = JSON.parse(JSON.stringify(gameState.deck));
  const entry = deckClues(deck).find(entry => entry.clue.id === clueId);
  if (!entry?.category) return false;
  const categories = deck[entry.round].categories, index = categories.indexOf(entry.category), next = index + direction;
  if (next < 0 || next >= categories.length) return false;
  [categories[index], categories[next]] = [categories[next], categories[index]];
  commitEditedDeck(deck);
  return true;
}
function downloadText(text, filename, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type })); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function initDeckEditor(onChanged) {
  const dialog = document.getElementById('deck-editor'), select = document.getElementById('editor-clue');
  if (!dialog) return;
  const status = document.getElementById('editor-status'), preview = document.getElementById('editor-preview');
  const fields = Object.fromEntries(['category', 'value', 'question', 'answer', 'mediaType', 'mediaUrl', 'isDailyDouble']
    .map(key => [key, document.getElementById(`editor-${key}`)]));
  function showPreview() {
    preview.textContent = `${fields.category.value}\n${fields.question.value}\n\nAnswer: ${fields.answer.value}`;
  }
  function chooseClue() {
    const entry = deckClues().find(entry => entry.clue.id === select.value);
    if (!entry) return;
    const clue = entry.clue;
    for (const key of ['category', 'value', 'question', 'answer', 'mediaType', 'mediaUrl']) fields[key].value = clue[key];
    fields.isDailyDouble.checked = clue.isDailyDouble;
    fields.value.disabled = entry.round === 'final'; fields.isDailyDouble.disabled = entry.round === 'final';
    showPreview();
  }
  function populate(id) {
    select.replaceChildren();
    deckClues().forEach(({ clue, round }) => {
      const option = document.createElement('option'); option.value = clue.id;
      option.textContent = `${round === 'final' ? 'Final' : round === 'singleJeopardy' ? 'Single' : 'Double'} · ${clue.category} · $${clue.value} · ${clue.question.slice(0, 55)}`;
      select.appendChild(option);
    });
    if (id) select.value = id;
    chooseClue();
  }
  for (const id of ['edit-deck', 'edit-deck-setup']) document.getElementById(id)?.addEventListener('click', () => {
    if (!canEditDeck()) return;
    populate(); status.textContent = ''; dialog.showModal();
  });
  document.getElementById('editor-close').addEventListener('click', () => dialog.close());
  select.addEventListener('change', chooseClue);
  Object.values(fields).forEach(field => field.addEventListener('input', showPreview));
  document.getElementById('editor-save').addEventListener('click', () => {
    try {
      const changes = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, key === 'isDailyDouble' ? field.checked : field.value]));
      editDeckClue(select.value, changes); populate(select.value); onChanged();
      status.textContent = 'Deck updated. Scores and spent clues preserved; undo history cleared.';
    } catch (error) { status.textContent = error.message; }
  });
  for (const [id, direction] of [['category-earlier', -1], ['category-later', 1]]) document.getElementById(id).addEventListener('click', () => {
    try { if (moveDeckCategory(select.value, direction)) { populate(select.value); onChanged(); status.textContent = 'Category order updated; undo history cleared.'; } }
    catch (error) { status.textContent = error.message; }
  });
  document.getElementById('editor-export').addEventListener('click', () => downloadText(deckToCSV(gameState.deck), 'jeopardy-deck.csv', 'text/csv;charset=utf-8'));
  document.getElementById('csv-template').addEventListener('click', () => {
    const template = 'Round,Category,Value,Question,Answer,IsDailyDouble,MediaType,MediaURL\r\nsingle,Science,200,"What is H2O?",Water,TRUE,none,\r\nsingle,Science,400,"How many planets orbit the Sun?",Eight,FALSE,none,\r\nfinal,Space,,Earth orbits this star.,The Sun,FALSE,none,';
    downloadText(template, 'jeopardy-template.csv', 'text/csv;charset=utf-8');
  });
  refreshEditorButtons();
}
