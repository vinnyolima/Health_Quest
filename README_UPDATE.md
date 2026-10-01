# Health Quest v5 — scoring update

This update changes only Major Goal XP scoring.

No Google Sheet changes are needed.
No Apps Script changes are needed.
Do not erase any data.
Players do not need to re-enter their goals or descriptions.

## New Major Goal XP

| Target | #1 Hardest | #2 | #3 | #4 Easiest |
|---|---:|---:|---:|---:|
| 60% | 320 | 240 | 180 | 100 |
| 70% | 280 | 230 | 190 | 125 |
| 80% | 240 | 220 | 200 | 150 |
| 90% | 200 | 210 | 210 | 175 |
| 100% | 160 | 200 | 220 | 200 |

The hardest category rewards a realistic lower commitment more.
The easiest category rewards a higher commitment more.
Ranks #2 and #3 transition gradually between those two patterns.

## GitHub update

At the ROOT of your GitHub repository:

1. Replace `index.html` with the included file.
2. Add `app-v5.js`.
3. Leave `config.js`, `styles.css`, Google Sheets, and Apps Script unchanged.

You can leave the older JavaScript files in the repo. The new index.html loads app-v5.js.

After GitHub Pages redeploys, open:
https://vinnyolima.github.io/Health_Quest/?v=5

Existing saved ranks and targets are automatically recalculated under the new scoring table.
