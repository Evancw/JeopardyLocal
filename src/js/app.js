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

function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.warn("localStorage save failed (blocked or disabled):", e);
  }
}

function loadStateFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
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
    gameState.finalStage = 'category';
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

// Sync command emitter
function broadcastAction(action, payload = null) {
  // 1. BroadcastChannel (modern samedomain tab sync)
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ action, payload });
    } catch (e) {
      console.warn("BroadcastChannel postMessage failed:", e);
    }
  }
  
  // 2. Direct Window Messaging (Offline file:// protocol fallback)
  directWindows.forEach(win => {
    try {
      if (win && !win.closed) {
        win.postMessage({ action, payload }, '*');
      } else {
        directWindows.delete(win);
      }
    } catch (e) {
      console.warn("Failed to direct postMessage to child window:", e);
      directWindows.delete(win);
    }
  });
}
