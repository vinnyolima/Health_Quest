# Health Quest v9 — November + December challenge

This is a new two-month challenge for **November 1 through December 31, 2026**.

## Rules implemented

### Daily categories
Diet, Water, Stretch, Exercise.

### Major Goal XP
Every player has exactly **300 Major Goal XP** available if all four category targets are reached.

The 300 XP is distributed by personal difficulty rank:

- #1 hardest = **120 XP**
- #2 = **90 XP**
- #3 = **60 XP**
- #4 easiest = **30 XP**

The player's percentage target only changes how many of the 61 Nov-Dec days are required. It does not change the maximum XP.

Major XP still accrues proportionally as progress is made.

### Streaks
Every **5 consecutive completed days** in one daily category earns **+10 XP**.
Missing a day resets that category's streak.

### Weekly challenges
Each player must submit:
- 1 Fitness weekly task
- 1 Nutrition weekly task
- 1 Spiritual / Mindfulness weekly task

That is 3 tasks per player and 9 tasks in the pool once all 3 players are ready.

Every Sunday, the backend makes a fresh random draw from the combined pool for **each player**.
Assignments are independent, so the same task can randomly go to more than one player or appear again in a later week.

A completed weekly challenge earns **+30 XP**.

Weekly assignments will not be created until all 3 players have submitted their full 3-task pools.

### Daily random verification
The v8 behavior is retained:
- one player is freshly drawn at random
- one of Diet / Water / Stretch / Exercise is freshly drawn at random
- the result is saved and does not reroll on refresh
- verified assigned player earns +5 XP
- failed verification removes that day's completion

### Extra effort
Still +5 XP per category/day.

## Existing October data

October check-ins and random checks are preserved in the spreadsheet but are filtered out of the new Nov-Dec app and scoring.

The same Players sheet, group code, and PIN can be reused.

Players should save a new Nov-Dec setup before Nov 1. Once a player has a complete setup and the challenge has started, their setup is locked.


### Emoji avatars
Each player can enter an emoji avatar when joining/reconnecting.

Examples: `🐉`, `🦊`, `🧘`, `🏋️`, `🌟`.

The avatar is stored in the `Players` sheet and shown around the dashboard, leaderboard, weekly challenges, and random checks.

Because this adds an `Avatar` column to the `Players` sheet, run `setupHealthQuest()` once after replacing `Code.gs`. Existing player names and game data are preserved.



## New-round setup behavior

November–December is now treated as a separate round from October.

Running `setupHealthQuest()` adds a `RoundId` column to `Goals` and `WeeklyTasks`. Existing October rows are preserved with a blank RoundId and are ignored by the Nov–Dec app.

So the first time each player opens the new round, the app will show the Nov–Dec setup screen even though their October goals still exist. That setup asks for:

- emoji avatar
- 4 Nov–Dec daily goals
- difficulty ranks and percentage targets
- 3 weekly challenge ideas (1 Fitness, 1 Nutrition, 1 Spiritual/Mindfulness)

After the player saves the setup once, future visits go directly to the dashboard.

You do not need to delete October data.


## Installation

### 1. Google Apps Script
1. Open the Health Quest Google Sheet.
2. Extensions → Apps Script.
3. Replace the current `Code.gs` with `apps-script/Code.gs` from this package.
4. Save.
5. Run `setupHealthQuest()` once.
   - This adds the new `WeeklyTasks` and `WeeklyAssignments` sheets.
   - It updates the challenge dates to Nov 1 – Dec 31.
   - It does **not** erase old October check-ins or random checks.
6. Deploy → Manage deployments.
7. Edit your Web App deployment.
8. Choose **New version** and Deploy.
9. Your existing `/exec` URL should remain the same.

### 2. GitHub
At the root of the GitHub repo:
1. Replace `index.html`
2. Replace `styles.css`
3. Add `app-v9.js`
4. Keep `config.js` unchanged.

After GitHub Pages redeploys, open:

https://vinnyolima.github.io/Health_Quest/?v=9

You can remove older app-v4/app-v5/app-v6/app-v7 files after v9 is working.
