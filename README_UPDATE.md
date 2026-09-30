# Health Quest v4 — detailed goals + random-check audit

This update adds:

- A free-text definition for every major-goal category.
  Example: Water → “Drink at least 3L of water.”
- An “Edit goal details” button in the dashboard.
- A Group Goal Definitions section where all players can see everyone’s exact commitment.
- The current random check now shows the selected player’s exact goal definition.
- A Random Check Audit table with date, player, category, goal definition, status, and who reviewed it.
- The previous session-preservation fix is included: temporary connection errors do not erase the saved player session.

## IMPORTANT: there are TWO parts to update

### A. Google Apps Script

1. Open your Health Quest Google Sheet.
2. Extensions → Apps Script.
3. Replace the contents of `Code.gs` with the included `apps-script/Code.gs`.
4. Save.
5. Select `setupHealthQuest` in the function dropdown and click Run once.
   - This adds the new `Description` column to Goals and `ReviewedBy` column to RandomChecks.
   - Existing players, goals, check-ins, group code, and PIN are preserved.
6. Redeploy the Web App:
   - Deploy → Manage deployments
   - Click the pencil/edit icon on your Web App deployment
   - Version → New version
   - Deploy
   - Your `/exec` URL should stay the same, so `config.js` does NOT need to change.

### B. GitHub repository

Upload/replace these files at the ROOT of your GitHub repo:

- Replace `index.html`
- Replace `styles.css`
- Add `app-v4.js`

Do NOT change `config.js`.

You may keep the older `app.js` / `app-v3.js`; the new index page loads `app-v4.js`.

After GitHub Pages finishes deploying, open:
https://vinnyolima.github.io/Health_Quest/?v=4

## Existing goals

Existing goals will initially have blank descriptions. Tap **Edit goal details** and add each description.

The description is limited to 240 characters and is shown to everyone in the group so random checks can be judged against the player’s own stated rule.
