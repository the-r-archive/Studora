STUDORA — YOUR STUDY OS
=======================

A calm, student-friendly study workspace with an Apple-style liquid-glass look.
Plain HTML, CSS and JavaScript — no build step, no backend.

WHAT WORKS
----------
- Overview dashboard with live stats, today's plan, focus preview and quote
- Tasks: add, complete, delete, filter by today / upcoming / completed / all
- Focus room: 25-minute focus, 50-minute deep work and 5-minute break timers
  that log real focus minutes when a session finishes
- Subjects: add subjects, track chapters done, delete subjects
- Notes: create notes with editable titles and bodies, autosaved in the browser
- Analytics: seven-day focus and task charts plus per-subject progress
- Settings: Google account, daily task goal, daily focus goal, theme, reset data
- Sign in with Google: your Google name and profile photo sync into the
  greeting, sidebar and settings. Signed out, the greeting reads
  "Good morning, Student" (or afternoon / evening).
- Login-gated saving: signed out the workspace is always empty and nothing is
  stored. Sign in with Google and your tasks, notes, subjects and focus history
  are saved for that Google account. Signing out returns the workspace to
  zero; signing back in restores your data.
- Cloud sync: signed-in data is mirrored to a hidden app folder in your own
  Google Drive, so the same tasks appear on every device signed in with the
  same Google account (laptop, phone, another browser). The newest copy wins.
- Loading screen, refreshed neutral glass design, rounding and restrained
  emerald accents (light and dark themes)
- Poppins typography throughout
- Fully responsive: floating glass sidebar on desktop, glass bottom bar on phones
- Logo and favicon are embedded in the page itself, so they cannot 404 on a
  host like Vercel even if the assets folder is not uploaded

RUN LOCALLY
-----------
Option A (simplest):
1. Keep the whole folder together (index.html, style.css, script.js, assets/).
2. Double-click index.html.
3. The app opens in your browser.

Option B (recommended in VS Code):
1. Open the folder in VS Code.
2. Install the "Live Server" extension if you do not already have it.
3. Right-click index.html and choose "Open with Live Server".

ENABLE GOOGLE SIGN-IN
---------------------
The button is already wired up; it just needs your own Google OAuth Client ID.
Without it, clicking "Sign in with Google" shows a friendly "not configured"
toast and the app keeps working as Student.

1. Go to https://console.cloud.google.com and create (or pick) a project.
2. Open "APIs & Services" -> "OAuth consent screen":
   - Choose External, fill in the app name (e.g. STUDORA) and your email.
   - Add the scope "openid", "profile" and "email".
   - While in testing mode, add your Google address under "Test users".
3. Open "APIs & Services" -> "Credentials" -> "Create credentials" ->
   "OAuth client ID", type "Web application".
4. Under "Authorized JavaScript origins" add every origin you will use:
   - http://localhost:5500  (Live Server)
   - http://127.0.0.1:5500  (optional)
   - file:// origin does not work — always open the app through a server,
     or use your deployed URL such as https://your-site.vercel.app
5. Copy the generated client ID (ends in .apps.googleusercontent.com).
6. Open script.js and paste it into the line near the top:
   const GOOGLE_CLIENT_ID = "xxxxxxxx.apps.googleusercontent.com";
7. Reload the page and click "Sign in with Google".

How it works: the page uses Google Identity Services (accounts.google.com/gsi/
client) to request an access token with the "openid profile email" scopes, then
reads name, email and picture from Google's userinfo endpoint. You stay signed
in on this device until you press "Sign out" in Settings; the token itself is
never written to storage. Profile photos are loaded from Google with
referrerpolicy="no-referrer", which is what Google needs to serve them from a
deployed domain.

ENABLE CLOUD SYNC (same tasks on laptop and phone)
--------------------------------------------------
Sync stores one small JSON file in the hidden "app data" folder of the signed-in
user's own Google Drive. No server or database of yours is involved.

1. In the same Google Cloud project, open "APIs & Services" -> "Library" and
   enable the "Google Drive API".
2. Open "APIs & Services" -> "OAuth consent screen" -> "Data access" and add
   the scope: https://www.googleapis.com/auth/drive.appdata
   (it is a non-sensitive scope, so no verification is needed while testing).
3. Redeploy / reload. The first time you sign in, Google asks for Drive access
   in the popup. Accept it and Settings -> Cloud sync shows "On".
4. On your phone, open the deployed site, sign in with the same Google account
   and your tasks are pulled from Drive automatically.

If access is denied or pop-ups are blocked, Settings -> Cloud sync has a
"Turn on cloud sync" / "Reconnect" button. Turning sync off keeps the Drive
copy; "Reset all data" clears it on the next sync.

DEPLOY TO VERCEL
----------------
1. Import the folder as a static project.
2. No build command is needed; use the project root as the output directory.
   Make sure index.html, style.css, script.js and the assets folder are all
   uploaded (the navbar logo and favicon are embedded, so they work regardless).
3. Add your Vercel URL under "Authorized JavaScript origins" for the same
   OAuth client ID (Google Cloud console -> Credentials).
4. Add the Drive API + drive.appdata scope as described above to enable sync.

NOTES
-----
- The app starts completely empty: no sample tasks, subjects or notes — every
  counter begins at zero until you sign in and add something.
- Nothing is saved while signed out. Anything you add before signing in lives
  for that visit only and is saved to your account the moment you sign in.
- Signed-in data is stored in localStorage under your Google account id and,
  when cloud sync is on, also in your Google Drive app folder. Each device
  compares timestamps and keeps the newest copy, so edits made on the phone
  appear on the laptop after a reload / "Sync now".
- On the first sign-in, any data saved by an older version of STUDORA is moved
  into your account.
- Resetting the workspace in Settings clears the data saved for your Google
  account (and the cloud copy on the next sync) but keeps your theme and
  sign-in.
- Icons load from Lucide, fonts from Google Fonts and the Google sign-in
  library from Google, so first load needs internet.
- The profile photo is loaded from Google's servers each visit; if it cannot
  load, the app falls back to the first letter of your name.
