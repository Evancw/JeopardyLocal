/**
 * Jeopardy Game Core Engine & Synchronization Broker
 * BMAD Phase 4 - Streamlined Vanilla JS Architecture
 */

// Shared Broadcast Channel for instant dual-screen sync
const CHANNEL_NAME = 'jeopardy_game_channel';
let broadcastChannel = null;
try {
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
} catch (e) {
  console.warn("BroadcastChannel not supported or blocked in this environment:", e);
}

// Global list of active direct window references for fallback offline sync
const directWindows = new Set();

// Central State Structure
const gameState = {
  sessionId: globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  revision: 0,
  timer: null,
  teams: [], // Dynamic array of 2 to 4 teams
  deck: {
    singleJeopardy: { categories: [] },
    doubleJeopardy: { categories: [] },
    finalJeopardy: null
  },
  currentClue: null, // Active Clue object
  lockedOutTeamIds: [],
  wageringTeamId: null,
  clueStage: 'idle',
  answerVisible: false,
  finalParticipants: [],
  finalStage: 'category',
  currentWager: null, // Active Daily Double / Final Jeopardy wager
  activeBuzzedTeamId: null, // Buzzed team ID allowed to answer
  spentClues: [], // Stable clue IDs
  deckName: null, // Filename of the loaded game board CSV
  gamePhase: 'setup', // 'setup' | 'single_jeopardy' | 'double_jeopardy' | 'final_jeopardy' | 'completed'
  categoryIntroIndex: null, // null | number (0-4) during active round category reveals
  settings: {
    clueFontSizeMultiplier: 1.0,
    soundEnabled: true
  }
};

// State Helpers
const STORAGE_KEY = 'jeopardy_local_state';

function isHostView() {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search).get('view') !== 'board' && !window.location.pathname.endsWith('board.html');
}

function saveStateToStorage() {
  if (!isHostView()) return;
  gameState.revision = Math.max(Date.now(), gameState.revision + 1);
  try {
    const state = JSON.stringify(gameState);
    localStorage.setItem(STORAGE_KEY, state);
    localStorage.setItem(`${STORAGE_KEY}:${gameState.sessionId}`, state);
  } catch (e) {
    console.warn("localStorage save failed (blocked or disabled):", e);
  }
}

function loadStateFromStorage() {
  try {
    const session = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('session');
    const stored = localStorage.getItem(session ? `${STORAGE_KEY}:${session}` : STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed.deck?.singleJeopardy?.categories || !parsed.deck?.doubleJeopardy?.categories || !Array.isArray(parsed.teams)) return false;
      Object.assign(gameState, parsed);
      ensureDeckIds(gameState.deck);
      const clues = ['singleJeopardy', 'doubleJeopardy'].flatMap(round =>
        gameState.deck[round].categories.flatMap(cat => cat.clues.map(clue => ({ clue, round }))));
      gameState.spentClues = clues.filter(({ clue, round }) => gameState.spentClues.includes(clue.id) ||
        gameState.spentClues.includes(`${round === 'singleJeopardy' ? 'single_jeopardy' : 'double_jeopardy'}-${clue.category}-${clue.value}`)).map(({ clue }) => clue.id);
      if (gameState.currentClue && !gameState.currentClue.id) {
        gameState.currentClue = clues.find(({ clue }) => clue.category === gameState.currentClue.category &&
          clue.question === gameState.currentClue.question)?.clue || null;
      }
      if (!parsed.clueStage) gameState.clueStage = gameState.currentClue ?
        (gameState.currentClue.isDailyDouble && !gameState.currentWager ? 'wager' : 'answering') : 'idle';
      if (!parsed.wageringTeamId && gameState.currentClue?.isDailyDouble) gameState.wageringTeamId = gameState.activeBuzzedTeamId;
      if (!parsed.finalParticipants && gameState.gamePhase === 'final_jeopardy') {
        gameState.finalParticipants = gameState.teams.filter(t => t.score > 0 || typeof t.finalWager === 'number')
          .map(t => ({ teamId: t.id, startingScore: t.score - (t.finalResult === 'correct' ? t.finalWager : t.finalResult === 'incorrect' ? -t.finalWager : 0) }));
        gameState.finalStage = gameState.teams.some(t => typeof t.finalWager === 'number') ? 'judging' : 'wager';
      }
      return true;
    }
  } catch (e) {
    console.warn("localStorage load failed (blocked or disabled):", e);
  }
  return false;
}

function resetGameState() {
  if (gameState.teams) {
    gameState.teams.forEach(t => {
      t.score = 0;
      delete t.finalWager;
      delete t.finalResult;
    });
  }
  clearActiveClue();
  gameState.finalParticipants = [];
  gameState.finalStage = 'category';
  gameState.activeBuzzedTeamId = null;
  gameState.spentClues = [];
  gameState.categoryIntroIndex = null;
  gameState.gamePhase = 'setup';
  saveStateToStorage();
}

function clearActiveClue() {
  gameState.currentClue = null;
  gameState.currentWager = null;
  gameState.activeBuzzedTeamId = null;
  gameState.wageringTeamId = null;
  gameState.lockedOutTeamIds = [];
  gameState.clueStage = 'idle';
  gameState.answerVisible = false;
  gameState.timer = null;
}

function availablePhases() {
  const phases = [];
  if (gameState.deck.singleJeopardy.categories.length) phases.push('single_jeopardy');
  if (gameState.deck.doubleJeopardy.categories.length) phases.push('double_jeopardy');
  if (gameState.deck.finalJeopardy) phases.push('final_jeopardy');
  return phases;
}

function nextGamePhase() {
  const phases = availablePhases();
  return phases[phases.indexOf(gameState.gamePhase) + 1] || 'completed';
}

function finalJudgingComplete() {
  return gameState.finalParticipants.every(participant =>
    gameState.teams.find(team => team.id === participant.teamId)?.finalResult);
}

function beginRound(phase) {
  if (gameState.currentClue && gameState.gamePhase !== 'final_jeopardy') return false;
  if (phase === 'completed' && gameState.gamePhase === 'final_jeopardy' && !finalJudgingComplete()) return false;
  if (phase !== 'completed' && !availablePhases().includes(phase)) return false;
  clearActiveClue();
  gameState.gamePhase = phase;
  gameState.categoryIntroIndex = ['single_jeopardy', 'double_jeopardy'].includes(phase) ? 0 : null;
  if (phase !== 'completed') {
    gameState.teams.forEach(team => { delete team.finalWager; delete team.finalResult; });
    gameState.finalParticipants = phase === 'final_jeopardy' ? gameState.teams.filter(team => team.score > 0)
      .map(team => ({ teamId: team.id, startingScore: team.score })) : [];
    gameState.finalStage = phase === 'final_jeopardy' ? 'wager' : 'category';
  }
  return true;
}

function openGameClue(clue) {
  if (gameState.currentClue || gameState.spentClues.includes(clue.id)) return false;
  clearActiveClue();
  gameState.currentClue = clue;
  gameState.clueStage = clue.isDailyDouble ? 'wager' : 'answering';
  return true;
}

function setDailyDoubleWager(teamId, wager) {
  const clue = gameState.currentClue;
  const team = gameState.teams.find(t => t.id === teamId);
  const round = gameState.gamePhase === 'double_jeopardy' ? 'doubleJeopardy' : 'singleJeopardy';
  const maximum = Math.max(...gameState.deck[round].categories.flatMap(c => c.clues.map(q => q.value)), team?.score || 0);
  if (!team || !clue?.isDailyDouble || gameState.clueStage !== 'wager' || !Number.isSafeInteger(wager) || wager < 5 || wager > maximum) return false;
  gameState.currentWager = wager;
  gameState.wageringTeamId = teamId;
  gameState.activeBuzzedTeamId = teamId;
  gameState.clueStage = 'answering';
  return true;
}

function gradeClue(teamId, result) {
  const clue = gameState.currentClue;
  if (!clue || gameState.gamePhase === 'final_jeopardy' || !['correct', 'incorrect', 'skip'].includes(result)) return null;
  if (result !== 'skip') {
    const team = gameState.teams.find(t => t.id === teamId);
    if (!team || gameState.lockedOutTeamIds.includes(teamId) || gameState.clueStage !== 'answering') return null;
    if (clue.isDailyDouble && gameState.wageringTeamId !== teamId) return null;
    const points = clue.isDailyDouble ? gameState.currentWager : clue.value;
    const score = team.score + (result === 'correct' ? points : -points);
    if (!Number.isSafeInteger(points) || !Number.isSafeInteger(score)) return null;
    team.score = score;
    if (result === 'incorrect') gameState.lockedOutTeamIds.push(teamId);
  }
  const keepOpen = result === 'incorrect' && !clue.isDailyDouble && gameState.lockedOutTeamIds.length < gameState.teams.length;
  gameState.activeBuzzedTeamId = null;
  gameState.timer = null;
  if (!keepOpen) {
    if (!gameState.spentClues.includes(clue.id)) gameState.spentClues.push(clue.id);
    clearActiveClue();
  }
  return { isCorrect: result === 'correct', isIncorrect: result === 'incorrect', keepOpen };
}

function gradeFinal(teamId, result) {
  if (gameState.gamePhase !== 'final_jeopardy' || !['correct', 'incorrect'].includes(result) || gameState.finalStage !== 'judging') return false;
  const participant = gameState.finalParticipants.find(p => p.teamId === teamId);
  const team = gameState.teams.find(t => t.id === teamId);
  if (!participant || !team || !Number.isSafeInteger(team.finalWager)) return false;
  const previous = team.finalResult === 'correct' ? team.finalWager : team.finalResult === 'incorrect' ? -team.finalWager : 0;
  const score = team.score + (result === 'correct' ? team.finalWager : -team.finalWager) - previous;
  if (!Number.isSafeInteger(score)) return false;
  team.score = score;
  team.finalResult = result;
  return true;
}

function stateSnapshot(includeDeck = false) {
  const state = { ...gameState };
  if (!includeDeck) delete state.deck;
  return state;
}

function broadcastAction(action, payload = null) {
  gameState.revision = Math.max(Date.now(), gameState.revision + 1);
  const message = { protocol: 1, role: 'host', sessionId: gameState.sessionId,
    revision: gameState.revision, action, payload,
    state: stateSnapshot(Boolean(payload?.fullSnapshot)), deckId: gameState.deck.id };
  if (broadcastChannel) {
    try { broadcastChannel.postMessage(message); } catch (error) { console.warn('Channel send failed:', error); }
  }
  directWindows.forEach(win => {
    try { if (win && !win.closed) win.postMessage(message, '*'); else directWindows.delete(win); }
    catch { directWindows.delete(win); }
  });
}

function trustedWindowMessage(event) {
  return event.origin === window.location.origin || (window.location.protocol === 'file:' && event.origin === 'null');
}
