STUDORA — STAGE 1
=================

Included:
- Responsive desktop sidebar and mobile bottom navigation
- Dashboard visual foundation
- Dark mode by default
- Light mode toggle (preference saved in browser localStorage)
- Live date and time-based greeting
- Navigation shell with coming-soon feedback
- Responsive layouts for desktop, tablet and mobile

RUN LOCALLY
-----------
Option A (simplest):
1. Extract the ZIP file.
2. Open the extracted "studora-stage-1" folder.
3. Double-click index.html.
4. The app opens in your browser.

Option B (recommended in VS Code):
1. Open the folder in VS Code.
2. Install the "Live Server" extension if you do not already have it.
3. Right-click index.html and choose "Open with Live Server".

DEPLOY TO VERCEL
----------------
1. Go to https://vercel.com/
2. Create a new project and import your Git repository, OR use a simple static hosting workflow.
3. The project is plain HTML/CSS/JS; no build command is needed.
4. Set the output directory to the project root if prompted.

NOTES
-----
- Stage 1 is the visual and navigation foundation, not the complete task manager yet.
- The dashboard currently contains sample preview values.
- Theme preference is saved locally in the browser.
- Lucide icons and Google Fonts load from the internet.
- No account, backend, or cloud sync is configured yet.
- Stage 2 will add real tasks and local persistence.
