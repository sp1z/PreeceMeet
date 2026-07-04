# PreeceMeet — Desktop Client Layout Brief

**For:** Claude Design
**From:** Russell Preece
**Product:** PreeceMeet desktop client (Electron + React + LiveKit)
**Repo:** github.com/sp1z/PreeceMeet
**Version at time of brief:** 1.7.1
**Brand system already delivered:** `PreeceMeet Handoff` (Preece house design — hexagon cell, circuit field, video-lens glyph, Manrope / IBM Plex Mono). Tokens live in `app/src/brand-tokens.css`. Please build **on top of** that system, not around it.

---

## 1. What PreeceMeet is

PreeceMeet is a small-team video calling app for the `meet.russellpreece.com` service. It is a desktop-first Electron app (Windows / macOS / Linux) with a companion iOS/Android app (mobile is out of scope for this brief). The desktop client is the "primary surface" — it's what people leave open all day, the way one might leave Slack or Discord open. It is **not** a scheduled-meeting product like Zoom; it's an **always-on team-presence + call surface** — closer to a Discord or a Teams chat panel than to a meeting scheduler.

Core capabilities:

- **Channels** — persistent named rooms (e.g. `#office`, `#focus`, `#lunch`). You click one to join its LiveKit call. Empty channels are quiet; occupied channels show a live badge + participant list.
- **Direct calls** — 1:1 ringing between users (SignalR-driven `/hubs/call`). Incoming call = modal ring, outgoing call = modal with "calling…" state.
- **User roster** — everyone in the org, with live presence dots (online / offline). Click a user to ring them.
- **In-call surface** — LiveKit video tiles, mic/cam/screenshare/hangup controls, optional chat side-panel, optional "game mode" (small always-on-top overlay for when you want the call visible while working in another app).
- **Settings / admin** — profile (display name + emoji avatar), channels management, device permissions, debug log upload; admins get a user-management panel.
- **Auto-update** — electron-builder + GitHub releases; the app shows an "install update" nudge when a new version is available.

Vibe: **calm, professional, present but not shouty.** This is a tool a small distributed team uses all day. It should feel like a well-crafted native app, not a webpage. Dark UI is the default and only theme — that's already committed to across the brand system.

## 2. Who uses it

Small trusted teams (10–50 people). Everyone knows everyone. There is no "public directory" or "meet a stranger" flow. Login is email + password (+ optional TOTP). The people using it are technical enough to appreciate density and keyboard-friendliness but non-technical enough that they should never see jargon.

Primary user job-to-be-done, in order of frequency:

1. Glance at the sidebar → see who's around → click to join or ring.
2. Sit in a channel call all afternoon with 2–4 colleagues while working.
3. Rapid 1:1 pop-in call ("hey got a sec?") — ring → answer → talk → hang up.
4. Occasional screenshare while explaining something.
5. Occasional text chat inside a live call (URL sharing, quick asides).

## 3. What screens exist

The desktop client has a small set of top-level surfaces. **Please design all of them as a cohesive set** — they share chrome and should feel like one app, not a series of unrelated pages.

### 3.1 `LoginPage` — pre-auth
Full-window centered card. Fields: email, password, "remember me", "sign in". Below: server URL (advanced, collapsible). PreeceMark + wordmark at the top. On error: inline red message. On submit: spinner in the button.

### 3.2 `TotpPage` — pre-auth, second step
Same shell as Login. Single 6-digit code input, "verify" button, "back" link. Should feel like a natural continuation of Login, not a jarring new screen.

### 3.3 `MainPage` — the app. **This is where you should spend the most design energy.**
A classic three-region layout, but the regions should be considered carefully:

- **Left sidebar** (`Sidebar.tsx`) — collapsible, resizable, ~220px default.
  - Header: brand lockup (`PreeceMeetMark` + `PreeceMeetWordmark`) + a `+` button (add channel).
  - Section: **Users** — roster with presence dot + display name; click to ring. Online users float to the top. A "calling…" spinner appears next to the row you just clicked.
  - Section: **Channels** — list of channels with emoji, name, live indicator (a small pulsing dot when someone's in it), and a numeric participant badge. Below each active channel: participant list (avatar emoji + name, one per row, indented).
  - Footer: **You** — avatar emoji + display name + email (small, muted). Click to open a small popup menu → Settings / Sign Out.
  - Note: the sidebar's structural role is "roster + directory", not "chat list". There is no per-channel chat history in the sidebar — chat is a live-call side panel only.
- **Center content area** — depends on state:
  - **Idle** (not in a call): a large empty state. Currently a big icon + "Select a channel to join". This is the most-often-seen screen when a user first opens the app — please treat it as a real surface, not a placeholder. Consider showing helpful context (recent channels, who's around, tips) rather than a lonely icon.
  - **Connecting**: `ConnectingPanel` with spinner + "Connecting to #channel…".
  - **In call**: `VideoGrid` — LiveKit tiles laid out responsively (1 up, 2 up, 4 up, N-up grid). Self-view toggle. Screenshare tiles are prioritized. Above the grid: the **top bar** (see 3.3.1). Below the grid: the **bottom call-control bar** (see 3.3.2). Both should feel unobtrusive during a call — dim, small, quick to find but not fighting the video.
  - **In call + chat open**: chat side-panel on the right (`ChatPanel`) — narrow, message-list + input. Auto-links URLs. Should not compress the video grid awkwardly.
- **Modals / overlays**:
  - Incoming call ring (large centered card, caller name + avatar + accept/decline).
  - Outgoing call ring (same shape, "calling…" state + cancel).
  - Settings modal (tabs: Profile / Channels / Permissions / Debug).
  - Admin panel modal (user list, invite, promote, deactivate).
  - Emoji picker (for avatar + channel emoji).
  - Screen-share picker (thumbnails of available windows/screens).
  - Device fallback banner (top of window, when a mic/cam device fails, offer retry).
  - Update install nudge (when auto-updater has a new version staged).

### 3.3.1 Top bar — full inventory
The top bar is a single horizontal strip along the top of `MainPage` (below the OS title bar / above the content). It's present whether or not a call is active — the room name simply reads "No active call" when idle. It is also the app's draggable region on Win/Linux, so most of it is drag-surface with buttons marked `nodrag`. **This is the single most-visible control cluster in the app; please give it a considered UX pass.**

Buttons and affordances, left → right in the current build:

1. **Sidebar toggle** — icon button (burger). Collapses/expands the left sidebar; the collapsed state is remembered.
2. **Room name** — text label, e.g. `#office` or "No active call". Prefixed with `#` for channels. Doubles as the primary "where am I" indicator.
3. **Error banner slot** — inline red text that appears here when there's a device/connection error (transient, replaces the update pill when both would show).
4. **Update-available pill** — appears only when `electron-updater` has a new version staged. Reads `↑ v1.7.2 available`; clicking it triggers install and shows `Installing…`. Currently a text pill, styled differently from the icon buttons — a candidate for rethinking.
5. **Game mode toggle** — icon button. Enters the compact overlay mode (see 3.4).
6. **Fullscreen toggle** — icon button. F11 shortcut. Toggles OS fullscreen; button shows an "active" state when in fullscreen.
7. **Admin panel entry** — icon button, **only shown for admin users**. Opens the admin modal.
8. **Chat toggle** — icon button, **only shown when in a call**. Opens/closes the chat side-panel. Carries a red unread-count badge (0–9, then `9+`) when chat is closed and messages have arrived.
9. **Settings** — icon button. Opens the settings modal on the profile tab (footer menu can deep-link into other tabs).
10. **OS window controls** — on Windows/Linux only, the custom minimize/maximize/close cluster sits at the far right. On macOS the traffic lights live at the far left (outside this bar).

Design questions worth Claude Design's judgment:

- Is this too many buttons in one row for the app's calm-tool feel? Should any be demoted (into a settings menu or a hover-reveal), promoted (into the sidebar footer), or grouped (a small overflow menu)?
- The update pill is functionally important but visually mismatched next to the icon-only buttons — better as a chip, a banner below the top bar, or a dot on the settings icon?
- The unread-badge on the chat button: current is a small red circle. Fits the calm palette? Or use cyan `#38D8FF` to stay on-brand?
- Room-name treatment: currently plain text. Could it carry more information (participant count, live-duration timer, mute-all-remote toggle) without becoming noisy?
- On macOS the traffic lights force a left inset — how should the burger + room-name align around that gap so it feels intentional, not accidentally shifted?

### 3.3.2 Bottom call-control bar — full inventory
Only rendered when in a call. Component: `CallControls.tsx`. Buttons left → right:

1. **Mic mute** — toggles microphone; shows muted variant when off.
2. **Camera mute** — toggles camera; shows muted variant when off.
3. **Screen share** — starts/stops screen-share. Opens the screen-share picker modal on start.
4. **PassThru** — local-only view of a window or screen (e.g. reference material, not broadcast to the call). Distinct concept from screen-share; needs its own visual language.
5. **Show self** — toggle self-preview tile.
6. **Hang up** — leave call. Red / destructive styling.

Design questions:

- The **PassThru** vs **Screen share** distinction is subtle but important — most users won't intuit the difference. How can the icons + hover states make it obvious that PassThru is "just for me"?
- Should Hang up be flush right (visually separated as the exit action) or last-in-line? Current is last-in-line.
- Is there room for a "more" overflow (recording, layout options, etc.) as future scope? If so, please leave visual space.

### 3.4 Game mode — miniaturized always-on-top overlay
When the user hits "game mode", the window shrinks to a small compact overlay showing just the video tiles + minimal controls. Three sizes (small / medium / large). Meant to sit in a corner of the screen while the user plays a game or reads docs on the primary display.

**Game-mode title bar (`game-titlebar`) — full inventory, left → right:**

1. **Size buttons** — three small text buttons `S` / `M` / `L`, active state on the current size.
2. **Self toggle** — button reading "Self" with a small icon; toggles whether the user's own tile appears in the overlay.
3. **Mic mute** — same states as the main call bar's mic button.
4. **Camera mute** — same states.
5. **PreeceMeet wordmark** — small brand tag (currently a plain text span; a candidate for the mark).
6. **Restore** — exit-game-mode button (`⊞ Restore`).
7. **OS window controls** — Windows/Linux minimize/close cluster on the right.

Constraints: the title bar has to stay short (game mode's whole window can be as narrow as a few hundred px), and it's the app's drag-handle in overlay mode. Buttons must be big enough to click accurately while gaming (fat mouse targets) but overall footprint must stay tight. There is no channel-switching, chat, screenshare, or settings in game mode — if the user wants those, they exit game mode first. Please respect that minimalism.

Design questions:

- Should size be a segmented control or three separate buttons? Currently three separate.
- Where does the brand go — small mark on the left, small wordmark on the right, or omitted entirely to save room?
- Restore button treatment — icon-only, or keep the label?
- Should the title bar auto-hide after N seconds of no cursor movement (to disappear during focused gaming), reappearing on hover? Open to your recommendation.

### 3.5 Window chrome
- macOS: native traffic lights (we leave a left inset for them).
- Windows / Linux: custom `WindowControls` (minimize / maximize / close) top-right.
- Draggable region across the top of the window.

## 4. Brand system — use these tokens, don't reinvent

Already delivered in `PreeceMeet Handoff` and shipping in `brand-tokens.css`:

**Palette (dark theme):**
- `--pm-ink: #06091E` (deepest bg)
- `--pm-ink-2: #0A0E2E` (surface bg)
- `--pm-primary: #4263EB` (primary blue)
- `--pm-primary-light: #5599FF` (link / hover blue)
- `--pm-accent-cyan: #38D8FF` (accent — use sparingly, for live indicators, keyboard focus rings, the "joining room" tagline shimmer)
- Cell gradient: `#05091F → #0A0E2E`
- Lens gradient: `#A8EEFF → #5599FF → #3366EE`
- Border gradient: `#38D8FF → #4488FF → #3355DD`

**Type:**
- Display / UI: **Manrope** (weights 400 / 600 / 700 / 800)
- Mono / numeric: **IBM Plex Mono** (participant counts, connection stats, code)
- Wordmark: Manrope 800, `letter-spacing: -0.03em`, "Preece" in ink, "Meet" in primary

**Mark component:** `Mark.tsx` exports `PreeceMeetMark` (4 variants: `primary` / `mono` / `onBlue` / `onDark`) and `PreeceMeetWordmark`. Use `variant="onDark"` on dark surfaces (the cell is transparent so the hex border + lens carry the identity).

**Splash animation** — already implemented in `index.html`: staged reveal (hex → circuits → lens pop → border draw → notch dots → wordmark → "JOINING ROOM" cyan Plex Mono tagline → shimmer bar). Please keep this — do not redesign the splash unless you have a specific reason.

## 5. What we're asking for

Please produce a professional client-screen layout comp covering:

1. **`MainPage` — idle state** (no active call). This is the most-seen screen and currently the weakest.
2. **`MainPage` — in-call state** (2 tiles + chat open). Show how top-bar / grid / controls / chat coexist without visual crowding.
3. **`MainPage` — in-call state** (4-participant grid, no chat). Show the grid behavior at density.
4. **Sidebar detail** — how users, channels-with-participants, and the footer stack when the roster is long enough to scroll.
5. **Top bar — in isolation.** All ten affordances from 3.3.1, in your recommended UX (grouping, icon set, active/hover/error states, update-pill treatment, unread-badge treatment, admin-only visibility, mac vs win/linux variants). Please answer the design questions listed inline in 3.3.1.
6. **Bottom call-control bar — in isolation.** All six affordances from 3.3.2 with your recommended icon language and the PassThru-vs-Screenshare disambiguation. Answer the questions in 3.3.2.
7. **Incoming call ring modal** — because it's the highest-stakes interruption in the app.
8. **`LoginPage`** — as the "front door" of the brand.
9. **Game mode overlay** (small size, medium size for comparison) — the compact, corner-of-screen view **including the game-mode title bar** with all seven affordances from 3.4. Please answer the questions listed there.

For each: a full-fidelity comp (light on annotations, heavy on visual clarity) plus a short paragraph on the reasoning. Please respect the brand tokens exactly — palette, type, mark placement. If you want to introduce a new secondary color or gradient, call it out explicitly with a rationale, don't just slip it in.

## 6. Constraints & non-goals

- **Dark theme only.** Not designing light mode. Do not deliver a light comp.
- **Density matters.** Users leave this open all day. Don't waste space with airy hero sections — this is a working app, not a marketing page.
- **Native feel, not web feel.** Small hit targets are fine (this is a desktop app, not mobile). Prefer subtle micro-interactions to bold marketing-style flourishes.
- **No emoji-as-icons where a real icon would do.** We already use emojis intentionally for user avatars and channel icons; don't extend that pattern to system UI.
- **Do not redesign the mark, wordmark, or splash.** Those are settled. If you find a case where they don't work in-context, flag it, don't unilaterally replace.
- **Accessibility:** minimum WCAG AA on all text pairs against the dark surface. Focus rings visible (cyan `#38D8FF` is the current focus color — keep it).
- **Do not add "AI features" chrome, meeting summaries, sparkle icons, or Zoom-style participant sidebars unless we've discussed it.** Scope creep is not welcome.

## 7. Delivery format

Same shape as the brand handoff worked well: an HTML preview (`PreeceMeet Client (standalone).html`) plus a source `.dc.html` in a zip, dropped in `C:\Users\russell\Downloads`. If you want to also deliver Figma / PNG comps, great — but the standalone HTML is the primary deliverable because that's what we can inspect visually against the running app.

If any part of the current app is unclear, ask — the codebase is at `github.com/sp1z/PreeceMeet` and every screen mentioned above is a real React component under `app/src/`.

---

*Prepared with help from Claude Code, working in the PreeceMeet repo.*
