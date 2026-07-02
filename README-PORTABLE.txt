Yu-Gi-Oh! Deck Recommender — portable edition
=============================================

TO RUN
------
Double-click  launch.bat
Your browser opens at http://localhost:3000 — that's the app.
Close the black console window to stop it.

Nothing needs to be installed: the app is pre-built and a Node.js
runtime is bundled in the runtime\ folder.

TO SHARE WITH SOMEONE
---------------------
Double-click  make-share-copy.bat
It creates a trimmed copy in a sibling folder (skips ~700MB of
development files) and asks whether to blank out YOUR card
collection in the copy so the recipient starts fresh.
Then zip/send that folder. They just run launch.bat.

WHERE YOUR DATA LIVES
---------------------
Everything is in the data\ folder:
  data\app.db        - card catalog + YOUR collection (back it up!)
  data\images\       - cached card images (rebuilds itself if deleted)
The app also has an "Export backup" button (Cards page) that saves
your collection as JSON, re-importable on the Import page.

NOTES
-----
- The app binds to 127.0.0.1 (this computer only). To use a
  different port: open a console and run   set PORT=3210 && launch.bat
- Card database and meta decks refresh from ygoprodeck.com via the
  "Sync" buttons in the app (internet required for that only).
- If you edit the source code, delete the .next folder and run
  launch.bat again — it rebuilds (requires a full Node.js install
  with npm for building; running never needs it).
