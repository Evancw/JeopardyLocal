# Project Brief: Local Jeopardy-esque Game

> **BMAD Phase 1: Analysis**  
> **Status:** Approved  
> **Version:** 1.2.0  
> **Owner:** Analyst Agent / Human Stakeholder

---

## 1. Project Overview & Context
This project aims to deliver a modern, visually stunning, local-first **Jeopardy-esque game**. Designed to be played locally (e.g., projected on a TV or screen for a gathering, or run in a local classroom/office setting), this web-based application avoids complex cloud server infrastructure, prioritizing high fidelity, low latency, and ease of use.

## 2. High-Level Goals & Objectives
*   **Wowed at First Glance:** Leverage premium modern web aesthetics (sleek dark mode, glassmorphism, fluid animations, dynamic HSL-based colors, and clean modern typography) to make the board feel premium and professional.
*   **Zero-Config Local Setup:** Run entirely in a local browser with zero server dependencies or installations. Just open the files in any modern web browser.
*   **Intuitive CSV Game Management:** Allow easy import of custom game boards via simple **CSV (Comma-Separated Values)** spreadsheets editable in Microsoft Excel, Google Sheets, or Apple Numbers.
*   **Rich Media Clues:** Support high-impact multimedia clues by embedding images (via local or web URLs) directly inside the clue presentation modal.
*   **Scalable Core Engine:** Build a clean, decoupled JavaScript core engine so that new game rules, formats, or visual themes can be added seamlessly.

## 3. High-Level Tech Stack (Approved)
*   **Core**: HTML5, client-side Vanilla JavaScript. Highly streamlined with zero build steps, node_modules, or external bundlers. Built-in CSV Parser.
*   **Styling**: Premium Vanilla CSS (custom properties/variables, CSS Grid, Flexbox, custom scrollbars, and modern glassmorphic tokens).
*   **Synchronization**: Native HTML5 `BroadcastChannel` API for instant, low-latency state sharing between the Host Console and the spectator Board Screen.
*   **State Management & Persistence**: Local Browser Storage (`localStorage`) for session saving and state survival across reloads.

## 4. Key Stakeholders & Target User Roles
*   **The Host (Presenter):** Uses a dedicated "Host Console" screen on their laptop. Reads clues, manually triggers who buzzed in first (since players use their own physical, offline, external buzzers), judges answers (correct/incorrect), and updates scores.
*   **The Players/Teams:** Compete using external, physical, offline hardware buzzers.
*   **The Spectators (Audience):** Watch the primary "Board Screen" projected on a TV or large screen.

## 5. Constraints & Assumptions
*   **Local Execution:** The entire application must operate completely offline. All assets, stylesheets, and scripts are bundled locally. (Note: Media URLs can point to local files or absolute URLs if an internet connection is available).
*   **True Dual-Screen Setup:** Relies on a dual-screen presenter view:
    *   **Host Console Screen** (controls, answer sheet, manual buzzer buttons, score overrides).
    *   **Spectator Board Screen** (main grid, clue zoom modals, team scores, final Jeopardy animation).
*   **State Reset:** Game states should persist through accidental page reloads but remain easily resettable.

---

### [BMAD Review Checklist]
- [x] Align on exact player input mechanisms (Host manually clicks who buzzed first).
- [x] Determine screen arrangement (True dual-screen setup via BroadcastChannel).
- [x] Confirm Tech Stack preference (Pure Vanilla HTML/JS/CSS, streamlined & portable).


