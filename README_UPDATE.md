# Health Quest v7 — corrected random-check bonus

This fixes the random-check +5 XP rule.

## Correct rule

The +5 XP goes to the PLAYER WHO WAS ASSIGNED THE RANDOM CHECK, not the person who verifies it.

- Verified random check → assigned player gets +5 XP
- Failed random check → no +5 XP, and the completion is removed as before
- Excused random check → no +5 XP
- The verifier gets no XP

No Google Sheet or Apps Script changes are required.

## GitHub update

At the ROOT of your GitHub repository:

1. Replace `index.html`
2. Add `app-v7.js`
3. Leave `config.js`, `styles.css`, Google Sheets, and `Code.gs` unchanged.

Once v7 works, you may delete the older app-v6.js and earlier app files.

Open after deployment:
https://vinnyolima.github.io/Health_Quest/?v=7
