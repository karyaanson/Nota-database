# Receipt Scanner

Snap a photo of a receipt → it gets read by AI → the photo lands in Google Drive → the line items land in a Google Sheet.

Runs as an installable PWA — no Mac, no Xcode, no Apple Developer account required.

## 1. Open this project in a cloud dev environment

You don't need to install Node locally. Two good options:

- **[StackBlitz](https://stackblitz.com)** — drag this whole folder into a new project, or push it to GitHub and open `stackblitz.com/github/your-username/your-repo`.
- **[GitHub Codespaces](https://github.com/features/codespaces)** — push this folder to a GitHub repo, then click "Code" → "Codespaces" → "Create codespace".

Either way, once it opens run:

```
npm install
npm run dev
```

and open the preview URL it gives you.

## 2. Set up Google Cloud (for Drive + Sheets access)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project.
2. Under **APIs & Services → Library**, enable the **Google Drive API** and **Google Sheets API**.
3. Under **APIs & Services → Credentials**, click **Create Credentials → OAuth Client ID**.
   - Application type: **Web application**
   - Authorized JavaScript origins: add your StackBlitz/Codespaces preview URL and, later, your deployed URL.
4. Copy the client ID into `.env` as `VITE_GOOGLE_CLIENT_ID` (copy `.env.example` to `.env` first).
5. Create a blank Google Sheet. Copy the ID out of its URL (`.../d/THIS_PART/edit`) into `.env` as `VITE_SHEET_ID`. Optionally add header row: `Date | Merchant | Item | Price`.

Note: while your OAuth consent screen is in "Testing" mode, only email addresses you explicitly add as test users can sign in — that's fine for a personal app, just add your own Google account under **OAuth consent screen → Test users**.

## 3. Set up the extraction function

`api/extract.js` calls Claude's vision API to read each receipt. It needs to run server-side so your API key isn't exposed in the browser.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Deploy this project to **[Vercel](https://vercel.com)** (free tier is fine) — it auto-detects the `/api` folder as serverless functions.
3. In the Vercel project settings, add an environment variable: `ANTHROPIC_API_KEY`.
4. Also add your `VITE_GOOGLE_CLIENT_ID` and `VITE_SHEET_ID` as environment variables there too.
5. Add the deployed URL to your OAuth Client's **Authorized JavaScript origins** (step 2 above).

## 4. Install it on your iPhone

Once deployed, open the URL in **Safari** on your iPhone → tap the Share icon → **Add to Home Screen**. It now behaves like an installed app: its own icon, full-screen, works from the home screen.

## Project structure

```
src/
  App.jsx                 — main screen: capture → extract → sync flow
  components/
    CaptureButton.jsx      — opens the camera via a native file input
    ReceiptCard.jsx        — displays one scanned receipt
  lib/
    extractReceipt.js      — sends the photo to /api/extract
    googleApi.js           — Drive upload + Sheets append (client-side OAuth)
api/
  extract.js               — serverless function, calls Claude's vision API
```

## Notes

- The camera capture uses `<input type="file" capture="environment">`, which opens the native iOS camera UI directly from Safari/home-screen PWA — no extra permissions dance needed.
- Google sign-in happens the first time you scan a receipt, using a popup-based OAuth flow (Google Identity Services). Your access token lives only in memory — you'll re-authenticate each session, which is fine for a personal-use app.
- If you want receipts to persist across sessions instead of just re-fetching from the Sheet, that's a good next step once the core flow is working.
