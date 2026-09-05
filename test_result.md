#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 5 — Queue power features + Settings/Updates/Theming (main agent, 2026-09-05)
backend:
  - task: "GET /api/tracks/{id}/recommendations (JioSaavn reco.getreco, exclude param)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "GET /api/tracks/{id}/radio (endless mix ~40 tracks)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "GET /api/app/version?current=x.y.z, POST /api/app/version (pin=2468), GET /api/app/releases"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "GET /api/artwork/palette?url= (dominant/vibrant colours via Pillow)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    needs_retesting: true
  - task: "GET /api/tracks/{id}/stream?q=96|160|320 (quality-aware proxy, Range)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    needs_retesting: true
frontend:
  - task: "Track actions sheet: Play next / Add to queue / Start radio (animated tiles)"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/track-actions.tsx"
    needs_retesting: true
  - task: "Queue screen: reorder (long-press ≡ drag), swipe-left remove, bump-to-next, clear, Autoplay toggle + Similar songs list"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/queue.tsx, /app/frontend/src/components/queue-list.tsx"
    needs_retesting: true
  - task: "Settings screen (/settings): updates card, check for updates, quality/crossfade/gapless/autoplay/wifi-only, theme, adaptive colours, accent swatches, app icon grid, storage, about, hidden dev publish (tap version 5x)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/settings.tsx"
    needs_retesting: true
  - task: "Inter font applied globally via @/src/components/text wrapper"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/text.tsx"
    needs_retesting: true
agent_communication:
  - agent: "main"
    message: "No auth. ADMIN_PIN=2468. Web preview cannot play audio (expected). Alternate app icons + APK install are native-only (expected toast on web). Delete any test releases you publish (db.app_releases) at the end so users don't see a fake update."

## Iteration 6 — Search suggestions, Jam (listen together), Apple-style lyrics, perf (main agent)
backend:
  - task: "GET /api/search/suggest?q= (autocomplete: suggestions[] + entities[] song/artist/album)"
    implemented: true
    working: "NA"
    needs_retesting: true
  - task: "GET /api/lyrics — multi-query LRCLIB synced search (Hinglish), source field, JioSaavn plain fallback"
    implemented: true
    working: "NA"
    needs_retesting: true
  - task: "Jam: POST /api/jam, GET /api/jam/{code}, DELETE /api/jam/{code}?device_id, GET /api/jam/time, WS /api/jam/ws/{code}?device_id&name (hello/pong/state/members/control/add_track/ended)"
    implemented: true
    working: "NA"
    needs_retesting: true
frontend:
  - task: "Search: YouTube-Music style suggestions while typing (text rows w/ highlight + fill arrow, entity rows), recent searches (persisted, remove/clear), trending chips, submit → results"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/search.tsx"
    needs_retesting: true
  - task: "Jam screen (/jam) — start (code + QR + share), join by code/link, deep link /jam?code=, members list, guest controls; player Jam pill (testID player-jam); guests' player controls route to host"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/jam.tsx, /app/frontend/src/components/jam-context.tsx"
    needs_retesting: true
  - task: "Lyrics: auto-timed plain lyrics (pill testID lyrics-approx), animated active line + word glow"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/lyrics.tsx"
    needs_retesting: true
  - task: "Perf: useAudioProgress split (position ticks no longer re-render whole app), query defaults staleTime"
    implemented: true
    working: "NA"
    needs_retesting: true
agent_communication:
  - agent: "main"
    message: "Lock-screen/system media controls (setActiveForLockScreen) are native-only; skip on web. For Jam sync use two browser contexts: host starts, guest joins with code; verify members list updates on both and guest sees host's track title. Audio itself won't play on web."

## Iteration 7 — Artist attribution, professional search results, 3-tab queue, lyrics gap dots (main agent)
backend:
  - task: "normalize_song: singer-first artist ordering + artists[] (id,name,role); GET /api/search?q= structured (top artist, artistSongs, deduped songs, remix/lofi variants hidden unless asked)"
    implemented: true
    working: "NA"
    needs_retesting: true
frontend:
  - task: "Search results: Top result artist card (testID top-result-<id>), 'Top songs · X', 'More songs'; ⋯ sheet lists 'View <artist>' rows (action-view-artist, action-view-artist-<id>); player artist tap opens chooser when multiple credited"
    implemented: true
    working: "NA"
    needs_retesting: true
  - task: "Queue screen tabs (queue-tabs): queue-tab-upnext / queue-tab-lyrics / queue-tab-related; Up next only shows queue; Related shows autoplay card + 'Related to “<song>”' list seeded from CURRENT song (stable); playSuggestion inserts after current"
    implemented: true
    working: "NA"
    needs_retesting: true
  - task: "LyricsView shared component (lyrics-view testID) with GapDots for intro/instrumental gaps (lyrics-gap-active when active)"
    implemented: true
    working: "NA"
    needs_retesting: true

## Iteration 8 — Player panel tabs, Made-for-you mixes, Hinglish lyrics, global mini-player (main agent)
backend:
  - task: "GET /api/home/mixes?device_id= (daily 'Made for you' mixes from history; cached per day; refresh=true rebuild). POST /library/recent now increments plays.{id}"
    implemented: true
    needs_retesting: true
  - task: "GET /api/lyrics ?script=latin (default) romanizes Devanagari → Hinglish; prefers Latin-script LRCLIB candidates; script=native keeps original"
    implemented: true
    needs_retesting: true
  - task: "GET /api/tracks/{id}/recommendations — cleaner Related: excludes the song itself/other releases of it, remixes/slowed variants, blends artist hits + 2nd-level recos, dedupes by title"
    implemented: true
    needs_retesting: true
frontend:
  - task: "Player: bottom bar player-tab-upnext/lyrics/related opens slide-up PlayerPanel (testID player-panel, close via queue-close or player-panel-scrim); bottom actions now Save/EQ/Jam (player-jam-btn); artwork sized to fit"
    implemented: true
    needs_retesting: true
  - task: "Home 'Made for you' MixCard row (mix-<id>) → /mix/[id] screen (mix-screen, mix-play, mix-shuffle, mix-download)"
    implemented: true
    needs_retesting: true
  - task: "Global mini-player (visible on Settings/artist/playlist/mix; hidden on player/lyrics/queue/jam); track-actions sheet dismisses on outside tap (track-actions-dismiss)"
    implemented: true
    needs_retesting: true
  - task: "LyricsView: smooth interpolated clock + 0.45s lookahead"
    implemented: true
    needs_retesting: true

## Iteration 9 — Home refresh (main agent)
frontend:
  - task: "Home refresh: header button home-refresh (spins while refreshing) + pull-to-refresh RefreshControl; LiquidRefresh pill (testID liquid-refresh) while rebuilding; refetches trending, rebuilds mixes (refresh=true), invalidates library, reshuffles feed (featured/trending order changes)"
    implemented: true
    needs_retesting: true
