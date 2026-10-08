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
  gameState.currentClue = null;
  gameState.currentWager = null;
  gameState.activeBuzzedTeamId = null;
  gameState.spentClues = [];
  gameState.categoryIntroIndex = null;
  gameState.gamePhase = 'setup';
  saveStateToStorage();
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
