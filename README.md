# Health Quest — GitHub Pages + Google Sheets

This version has **no Firebase**. Your architecture is:

**iPhones / browsers → GitHub Pages website → Google Apps Script → private Google Sheet**

The Google Sheet is the database. Your friends only need the website link, the group code, and the group PIN.

## What is included

- 3-player group
- Diet, Water, Stretch, Exercise
- personal difficulty ranking #1–#4
- monthly targets: 60%, 70%, 80%, 90%, 100%
- major-goal XP weighted by personal difficulty
- +10 XP every 3 consecutive completed days in a category
- +5 XP for one extra-effort bonus per category/day
- live leaderboard
- October calendar check-ins
- one frozen random player/category verification per day
- Verified / Failed / Excused status
- Failed verification automatically removes that checked completion
- mobile layout designed for iPhone

---

# Part 1 — Create the Google Sheet database

1. Go to Google Sheets and create a **blank spreadsheet**.
2. Give it a name such as **Health Quest Database**.
3. In the spreadsheet, choose **Extensions → Apps Script**.
4. Delete the starter code in `Code.gs`.
5. Open this ZIP's `apps-script/Code.gs` file and copy all of it into Apps Script.
6. Click **Save**.
7. At the top of Apps Script, choose the function **setupHealthQuest** and click **Run**.
8. Google will ask you to authorize the script because it needs to edit your spreadsheet. Approve it.
9. Return to the spreadsheet. You should now have these tabs:
   - Config
   - Players
   - Goals
   - Checkins
   - RandomChecks
10. On the **Config** tab you will see your automatically generated **GroupCode** and **GroupPIN**.

Keep the spreadsheet private. Your friends do **not** need access to it.

---

# Part 2 — Deploy the Google Apps Script API

1. Back in Apps Script, click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Description: `Health Quest API`
4. **Execute as:** Me
5. **Who has access:** Anyone
6. Click **Deploy** and approve any authorization prompt.
7. Copy the **Web app URL**. It should end in `/exec`.

Example:

`https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec`

Important: use the `/exec` deployment URL, not the editor URL and not a `/dev` URL.

---

# Part 3 — Connect the website to your Sheet

1. In this project, open `config.js`.
2. Replace:

`PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE`

with the `/exec` URL you copied.
3. Save the file.

The group code and PIN do **not** go into your GitHub code. You and your friends type them into the app, so they are not publicly visible in the repository.

---

# Part 4 — Put the website on GitHub Pages

1. Create a new GitHub repository, for example `health-quest`.
2. Upload the contents of this ZIP to the root of the repository:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
   - `manifest.webmanifest`
   - `.nojekyll`
   - `README.md`
   - the `apps-script` folder can stay in the repo for reference
3. Commit the files.
4. In GitHub go to **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select your default branch (usually `main`) and folder `/ (root)`.
7. Save.
8. After GitHub finishes publishing, it will show a URL similar to:

`https://YOUR-GITHUB-NAME.github.io/health-quest/`

Send that link to your two friends.

---

# Part 5 — Use it on iPhone

Each friend:

1. Opens the GitHub Pages link in Safari.
2. Enters the **Group Code**, **Group PIN**, and their name.
3. Sets their four difficulty ranks and monthly goals.
4. Uses the app each day for check-ins.

For an app-like icon on iPhone:

**Safari → Share → Add to Home Screen**

---

# How the random check works

The Apps Script creates the random check on the server and saves it to the **RandomChecks** tab.

That matters because the assignment is then frozen. Refreshing the website does not reroll it.

For each October date, it chooses:

- one of the players who has joined at the time the check is first created
- one of the four categories

The proof photo is intentionally **not uploaded to the Sheet**. Send the photo in your existing friend group chat. In Health Quest, mark the result:

- Verified
- Failed
- Excused

If the result is **Failed**, the backend changes that person's checked category to incomplete for that date.

---

# Important notes

### This is intentionally a small trust-based app
Anyone who knows the Group Code + PIN can read the challenge data and can mark verification results. That is appropriate for a private 3-friend challenge, but it is not intended as a public production authentication system.

### The Google Sheet remains private
The Apps Script executes as the spreadsheet owner. Do not make the spreadsheet itself public.

### Player identity is stored in the browser
After a friend joins, their browser remembers their player ID. If they tap **Switch player**, clear site data, or move to another phone, they can join again using the same name. The backend reuses an existing player with that exact name.

### Apps Script quotas
This application makes very small requests and is designed for three users, so it should be comfortably within normal Apps Script usage limits for a personal challenge.

### Challenge dates
This build is fixed to **October 1–31, 2026**.

---

# If you change Apps Script later

After modifying `Code.gs`, create a **new deployment version** (Deploy → Manage deployments → Edit → New version → Deploy) so the live `/exec` endpoint uses the updated code.
