/* Undo history and portable, validated session backups. */
let historyGeneration = 0;
const GAMEPLAY_FIELDS = ['teams', 'currentClue', 'currentWager', 'activeBuzzedTeamId', 'spentClues', 'gamePhase',
  'categoryIntroIndex', 'lockedOutTeamIds', 'wageringTeamId', 'clueStage', 'answerVisible', 'finalParticipants', 'finalStage', 'timer'];

function gameplaySnapshot(state = gameState) {
  return JSON.parse(JSON.stringify(Object.fromEntries(GAMEPLAY_FIELDS.map(key => [key, state[key]]))));
}

function recordGameChange(label, change) {
  const before = gameplaySnapshot();
  const result = change();
  if (result === null || result === false) return result;
  const after = gameplaySnapshot();
  if (JSON.stringify(before) === JSON.stringify(after)) return result;
  gameState.undoStack.push({ label, before, after });
  gameState.undoStack = gameState.undoStack.slice(-50);
  gameState.redoStack = [];
  appendScoreEvent(label);
  return result;
}

function appendScoreEvent(label) {
  historyGeneration++;
  gameState.scoreEvents.push({ time: new Date().toISOString(), label,
    scores: gameState.teams.map(team => ({ teamId: team.id, score: team.score })) });
  gameState.scoreEvents = gameState.scoreEvents.slice(-500);
}

function restoreGameplay(snapshot) {
  const names = new Map(gameState.teams.map(team => [team.id, { name: team.name, color: team.color }]));
  Object.assign(gameState, JSON.parse(JSON.stringify(snapshot)));
  gameState.teams.forEach(team => Object.assign(team, names.get(team.id)));
}

function undoGameChange() {
  const entry = gameState.undoStack.pop();
  if (!entry) return false;
  restoreGameplay(entry.before);
  gameState.redoStack.push(entry);
  appendScoreEvent(`Undo: ${entry.label}`);
  return true;
}
function redoGameChange() {
  const entry = gameState.redoStack.pop();
  if (!entry) return false;
  restoreGameplay(entry.after);
  gameState.undoStack.push(entry);
  appendScoreEvent(`Redo: ${entry.label}`);
  return true;
}

function deckToCSV(deck) {
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Round', 'Category', 'Value', 'Question', 'Answer', 'IsDailyDouble', 'MediaType', 'MediaURL']];
  ['singleJeopardy', 'doubleJeopardy'].forEach((round, i) => deck[round].categories.forEach(cat => cat.clues.forEach(clue =>
    rows.push([i ? 'double' : 'single', cat.name, clue.value, clue.question, clue.answer, clue.isDailyDouble ? 'TRUE' : 'FALSE', clue.mediaType, clue.mediaUrl]))));
  const clue = deck.finalJeopardy;
  if (clue) rows.push(['final', clue.category, '', clue.question, clue.answer, 'FALSE', clue.mediaType, clue.mediaUrl]);
  return rows.map(row => row.map(quote).join(',')).join('\r\n');
}

function validateBackupDeck(source) {
  if (!source?.singleJeopardy || !source?.doubleJeopardy || !Array.isArray(source.singleJeopardy.categories) || !Array.isArray(source.doubleJeopardy.categories)) throw new Error('Backup has no valid deck.');
  const original = ['singleJeopardy', 'doubleJeopardy'].flatMap(round => source[round].categories.flatMap(cat => {
    if (typeof cat.name !== 'string' || !Array.isArray(cat.clues)) throw new Error('Invalid backup category.');
    return cat.clues;
  }));
  if (source.finalJeopardy) original.push(source.finalJeopardy);
  if (original.length > 500) throw new Error('Too many clues in backup.');
  original.forEach(clue => {
    if (typeof clue.question !== 'string' || typeof clue.answer !== 'string' || typeof clue.category !== 'string' || typeof clue.mediaUrl !== 'string' ||
      !Number.isSafeInteger(clue.value) || typeof clue.isDailyDouble !== 'boolean') throw new Error('Invalid backup clue.');
  });
  const deck = processCSVDeck(deckToCSV(source));
  for (const round of ['singleJeopardy', 'doubleJeopardy']) {
    if (deck[round].categories.length !== source[round].categories.length) throw new Error('Backup categories must be unique.');
    deck[round].categories.forEach((cat, index) => { if (typeof source[round].categories[index].id === 'string') cat.id = source[round].categories[index].id; });
  }
  const converted = ['singleJeopardy', 'doubleJeopardy'].flatMap(round => deck[round].categories.flatMap(cat => cat.clues));
  if (deck.finalJeopardy) converted.push(deck.finalJeopardy);
  const ids = new Set();
  // Content is validated independently; carry stable IDs across edits and backups.
  original.forEach((clue, index) => {
    if (typeof clue.id !== 'string' || !clue.id || clue.id.length > 160 || ids.has(clue.id)) throw new Error('Backup clue IDs must be present and unique.');
    const target = converted[index];
    if (!target || target.question !== clue.question || target.answer !== clue.answer || target.value !== clue.value) throw new Error('Backup clues must remain in validated deck order.');
    ids.add(clue.id); target.id = clue.id;
  });
  return deck;
}

function validateGameplay(source, deck) {
  if (!Array.isArray(source.teams) || source.teams.length < 2 || source.teams.length > 4) throw new Error('Backup needs 2–4 teams.');
  const teams = source.teams.map(team => {
    if (!Number.isSafeInteger(team.id) || typeof team.name !== 'string' || !team.name.trim() || typeof team.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(team.color) || !Number.isSafeInteger(team.score)) throw new Error('Invalid team or score in backup.');
    const result = { id: team.id, name: team.name, color: team.color, score: team.score };
    if (team.finalWager !== undefined) {
      if (!Number.isSafeInteger(team.finalWager) || team.finalWager < 0) throw new Error('Invalid Final wager.');
      result.finalWager = team.finalWager;
    }
    if (team.finalResult !== undefined) {
      if (!['correct', 'incorrect'].includes(team.finalResult)) throw new Error('Invalid Final grade.');
      result.finalResult = team.finalResult;
    }
    return result;
  });
  const teamIds = new Set(teams.map(team => team.id));
  if (teamIds.size !== teams.length) throw new Error('Duplicate team IDs.');
  const clues = ['singleJeopardy', 'doubleJeopardy'].flatMap(round => deck[round].categories.flatMap(cat => cat.clues));
  const clueIds = new Set(clues.map(clue => clue.id));
  const spent = source.spentClues, locked = source.lockedOutTeamIds;
  if (!Array.isArray(spent) || spent.some(id => !clueIds.has(id)) || new Set(spent).size !== spent.length || !Array.isArray(locked) || locked.some(id => !teamIds.has(id)) || new Set(locked).size !== locked.length) throw new Error('Invalid spent clues or team lockouts.');
  const allClues = [...clues, deck.finalJeopardy].filter(Boolean);
  const currentClue = source.currentClue ? allClues.find(clue => clue.id === source.currentClue.id) : null;
  if (source.currentClue && (!currentClue || spent.includes(currentClue.id))) throw new Error('Invalid active clue.');
  if (!['setup', 'single_jeopardy', 'double_jeopardy', 'final_jeopardy', 'completed'].includes(source.gamePhase) ||
    !['idle', 'wager', 'answering'].includes(source.clueStage) || Boolean(currentClue) !== (source.clueStage !== 'idle')) throw new Error('Invalid gameplay stage.');
  if (currentClue) {
    const phaseClues = source.gamePhase === 'final_jeopardy' ? [deck.finalJeopardy] :
      deck[source.gamePhase === 'double_jeopardy' ? 'doubleJeopardy' : 'singleJeopardy'].categories.flatMap(cat => cat.clues);
    if (!phaseClues.some(clue => clue?.id === currentClue.id) || !['single_jeopardy', 'double_jeopardy', 'final_jeopardy'].includes(source.gamePhase)) throw new Error('Active clue belongs to another round.');
    if (source.clueStage === 'wager' && !currentClue.isDailyDouble) throw new Error('Only Daily Doubles have this wagering stage.');
  }
  const active = source.activeBuzzedTeamId, wagering = source.wageringTeamId;
  if ((active !== null && !teamIds.has(active)) || (wagering !== null && !teamIds.has(wagering)) || locked.includes(active)) throw new Error('Invalid answering team.');
  if (source.currentWager !== null && (!Number.isSafeInteger(source.currentWager) || source.currentWager < 5)) throw new Error('Invalid Daily Double wager.');
  if (currentClue?.isDailyDouble && source.clueStage === 'answering' && (!wagering || source.currentWager === null)) throw new Error('Daily Double has no wagering team or wager.');
  const participants = source.finalParticipants;
  if (!Array.isArray(participants) || participants.some(p => !teamIds.has(p.teamId) || !Number.isSafeInteger(p.startingScore) || p.startingScore <= 0) || new Set(participants.map(p => p.teamId)).size !== participants.length) throw new Error('Invalid Final participants.');
  if (!['category', 'wager', 'judging'].includes(source.finalStage)) throw new Error('Invalid Final stage.');
  if (source.gamePhase === 'final_jeopardy' && !deck.finalJeopardy) throw new Error('Final round has no clue.');
  if (source.gamePhase === 'final_jeopardy' && source.finalStage === 'judging' && (!currentClue || participants.some(p => {
    const team = teams.find(t => t.id === p.teamId); return team.finalWager === undefined || team.finalWager > p.startingScore;
  }))) throw new Error('Final judging has incomplete wagers.');
  const categories = deck[source.gamePhase === 'double_jeopardy' ? 'doubleJeopardy' : 'singleJeopardy'].categories;
  if (source.categoryIntroIndex !== null && (!Number.isInteger(source.categoryIntroIndex) || source.categoryIntroIndex < 0 || source.categoryIntroIndex >= categories.length)) throw new Error('Invalid category introduction.');
  let timer = null;
  if (source.timer) {
    const t = source.timer;
    if (!['response', 'final'].includes(t.kind) || !Number.isFinite(t.duration) || t.duration < 1000 || t.duration > 120000 ||
      !Number.isFinite(t.deadline) || typeof t.paused !== 'boolean' || (t.paused && (!Number.isFinite(t.remaining) || t.remaining < 0 || t.remaining > t.duration))) throw new Error('Invalid timer in backup.');
    timer = { kind: t.kind, duration: t.duration, deadline: t.deadline, paused: t.paused };
    if (t.paused) timer.remaining = t.remaining;
  }
  return { teams, currentClue, spentClues: [...spent], lockedOutTeamIds: [...locked], currentWager: source.currentWager,
    activeBuzzedTeamId: active, wageringTeamId: wagering, gamePhase: source.gamePhase, clueStage: source.clueStage,
    categoryIntroIndex: source.categoryIntroIndex, answerVisible: Boolean(source.answerVisible),
    finalParticipants: participants.map(p => ({ teamId: p.teamId, startingScore: p.startingScore })), finalStage: source.finalStage, timer };
}

function exportSessionBackup() {
  return JSON.stringify({ format: 'local-jeopardy', version: 1, exportedAt: new Date().toISOString(), state: { ...gameState } }, null, 2);
}
function parseSessionBackup(text) {
  if (text.length > 5 * 1024 * 1024) throw new Error('Backup exceeds 5 MB.');
  const backup = JSON.parse(text);
  if (backup.format !== 'local-jeopardy' || backup.version !== 1) throw new Error('Unsupported session backup.');
  const source = backup.state, deck = validateBackupDeck(source?.deck), gameplay = validateGameplay(source, deck);
  const settings = source.settings;
  if (!settings || !Number.isFinite(settings.clueFontSizeMultiplier) || settings.clueFontSizeMultiplier < 0.6 || settings.clueFontSizeMultiplier > 1.8 ||
    !Number.isInteger(settings.responseSeconds) || settings.responseSeconds < 1 || settings.responseSeconds > 120 ||
    !Number.isInteger(settings.finalSeconds) || settings.finalSeconds < 1 || settings.finalSeconds > 120 || typeof settings.soundEnabled !== 'boolean') throw new Error('Invalid settings in backup.');
  return { ...gameplay, deck, deckName: typeof source.deckName === 'string' ? source.deckName : 'Restored deck',
    settings: { clueFontSizeMultiplier: settings.clueFontSizeMultiplier, responseSeconds: settings.responseSeconds,
      finalSeconds: settings.finalSeconds, soundEnabled: settings.soundEnabled, lowEffects: Boolean(settings.lowEffects) },
    undoStack: validateUndoHistory(source.undoStack, deck), redoStack: validateUndoHistory(source.redoStack, deck), scoreEvents: validateScoreEvents(source.scoreEvents, gameplay.teams) };
}

function validateScoreEvents(events, teams) {
  const ids = new Set(teams.map(team => team.id));
  if (!Array.isArray(events) || events.length > 500) throw new Error('Invalid score history.');
  return events.map(event => {
    if (typeof event.label !== 'string' || typeof event.time !== 'string' || !Number.isFinite(Date.parse(event.time)) ||
      !Array.isArray(event.scores) || event.scores.length !== teams.length || new Set(event.scores.map(s => s.teamId)).size !== teams.length ||
      event.scores.some(score => !ids.has(score.teamId) || !Number.isSafeInteger(score.score))) throw new Error('Invalid score event.');
    return { time: event.time, label: event.label, scores: event.scores.map(s => ({ teamId: s.teamId, score: s.score })) };
  });
}

function validateUndoHistory(entries, deck) {
  if (!Array.isArray(entries) || entries.length > 50) throw new Error('Invalid undo history.');
  return entries.map(entry => {
    if (typeof entry.label !== 'string') throw new Error('Invalid history label.');
    return { label: entry.label, before: validateGameplay(entry.before, deck), after: validateGameplay(entry.after, deck) };
  });
}
