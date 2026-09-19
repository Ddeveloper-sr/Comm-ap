# Communication — Discord-style Chat App

A Discord-style chat app: servers, text channels, real-time messaging, and voice/video chat.

## What's built

- **Auth** — email/password signup & login (Firebase Auth)
- **Servers & Channels** — create servers, create text/voice channels within them
- **Real-time text chat** — messages sync instantly across users (Firestore)
- **Voice/video chat** — WebRTC peer-to-peer audio/video per voice channel
- **Members list** — shows registered users

## Project structure

```
discord-clone/
├── public/                  ← This is what gets deployed to GitHub Pages
│   ├── index.html            (login/signup page)
│   ├── app.html               (main chat app)
│   ├── css/style.css
│   └── js/
│       ├── firebase-config.js
│       ├── auth.js
│       ├── app.js
│       └── voice.js
├── signaling-server/         ← Deploy this SEPARATELY (not GitHub Pages)
│   ├── server.js
│   └── package.json
└── firestore.rules           ← Paste into Firebase Console → Firestore → Rules
```

## Setup steps

### 1. Firebase (already done)
Your config is already wired into `public/js/firebase-config.js`. Make sure in the
[Firebase Console](https://console.firebase.google.com/) you have:
- **Authentication → Sign-in method → Email/Password → Enabled**
- **Firestore Database → created** (test mode is fine to start)

Once things work, go to **Firestore → Rules** and paste in the contents of
`firestore.rules` from this project, then click **Publish**. This locks the
database down so random people can't wipe your data.

### 2. Deploy the frontend to GitHub Pages
1. Create a new GitHub repo (e.g. `discord-clone`)
2. Push the contents of the `public/` folder to the repo (or push everything and
   set Pages to serve from `/public` — see step 3)
3. In the repo: **Settings → Pages → Source** → pick your branch
   - If you pushed only `public/`'s contents to the repo root, set folder to `/ (root)`
   - If you pushed the whole project, set folder to `/public`
4. Your site will be live at `https://yourusername.github.io/discord-clone/`

### 3. Deploy the signaling server (required for voice/video)
GitHub Pages **cannot** run this — it needs a real Node process. Use a free host:

**Render.com (recommended, free tier):**
1. Push `signaling-server/` to its own GitHub repo (or a subfolder of the same repo)
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo
3. Root directory: `signaling-server` (if it's a subfolder)
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy — Render gives you a URL like `https://your-app.onrender.com`

Note: Render's free tier sleeps after inactivity — first connection after idle
takes ~30-50 seconds to wake up. That's normal, not a bug.

### 4. Connect frontend to signaling server
Open `public/js/voice.js` and update this line with your real Render URL:

```js
const SIGNALING_SERVER_URL = "https://YOUR-SIGNALING-SERVER-URL.onrender.com";
```

Commit and push — GitHub Pages will pick up the change automatically.

## Testing locally before deploying

You can't just double-click `index.html` — ES modules need a real server. From
the `public/` folder run:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. For voice chat to work locally too, start
the signaling server in another terminal:

```bash
cd signaling-server
npm install
npm start
```

And temporarily point `SIGNALING_SERVER_URL` in `voice.js` to `http://localhost:3001`.

## Known limitations (be aware, not blockers)

- **Voice/video is peer-to-peer (mesh)** — fine for a handful of people per
  voice channel; it'll get choppy with many participants (10+) since everyone
  connects directly to everyone else. A production Discord uses media servers
  (SFUs) to solve this — a much bigger project.
- **No TURN server** — if two users are on strict/symmetric NAT networks
  (common on some corporate/mobile networks), the P2P connection may fail to
  establish. Free TURN options exist (e.g. Twilio's) if you hit this.
- **No message editing/deleting UI yet, no roles/permissions, no file uploads.**
  The data model supports extending to these later.

## Next steps you might want
- Add typing indicators
- Add read receipts / unread badges
- Add roles & permissions (admin/mod)
- Add file/image sharing in messages (Firebase Storage)
- Add a TURN server for more reliable voice connections
