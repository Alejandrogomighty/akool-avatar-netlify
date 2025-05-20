# Akool Avatar Netlify Demo

This repository demonstrates a real-time interactive AI avatar integration using the Akool Streaming API, Netlify Functions, and Agora RTC. It provides a simple, clean web interface where users can speak naturally and interact with their personalized avatar in real time.

## Features

- Two-way live conversation using Web Speech API (continuous speech recognition)
- Akool Streaming API backed by Netlify Functions (create session, push messages)
- AgoraRTC client for low-latency audio/video streaming
- Pure static frontend with minimal UI (HTML/CSS/JavaScript)
- Easy local development with `netlify dev` on port 8888

## Prerequisites

- Node.js (>= 14.x, recommended 18.x)
- npm or yarn
- Netlify CLI (optional, for local functions emulation)

## Environment Variables

Create a `.env` file in the project root or set these vars in your Netlify dashboard:

```env
AKOOL_CLIENT_ID=<your-akool-client-id>
AKOOL_CLIENT_SECRET=<your-akool-client-secret>
```

> The demo uses the Akool client credentials configured in `netlify.toml` by default, but you can override them locally via `.env`.

## Installation

```bash
# Clone the repo
git clone https://github.com/your-org/akool-avatar-netlify.git
cd akool-avatar-netlify

# Install dependencies
npm install
```  

## Local Development

Start Netlify Dev to serve static files and Netlify Functions locally:

```bash
npm start
```

- The static server will run on `http://localhost:8888` (configured in `netlify.toml`).
- Netlify Functions endpoints (create-avatar-session, create-avatar-with-socket, push-avatar-message) will be available under `/.netlify/functions/`.

### Testing the Avatar

1. Open your browser and go to:
   ```
   http://localhost:8888/greeting.html?name=YourName
   ```
2. Grant microphone permission. The app will automatically start listening.
3. Speak naturally; your speech will be transcribed and sent to the avatar.
4. The avatar's video & audio reply will stream back in real time.

## Production Build & Deployment

This project is designed to deploy on Netlify:

1. Push your code to a GitHub (or GitLab/Bitbucket) repository.
2. In the Netlify UI, click **New site from Git**, connect your repo.
3. Set the build command to `npm install` and publish directory to `.`.
4. In **Site settings > Build & deploy > Environment**, add:
   - `AKOOL_CLIENT_ID`
   - `AKOOL_CLIENT_SECRET`
5. Save and deploy. Netlify will handle both static hosting and serverless functions.

> Alternatively, you can run `netlify build` and `netlify deploy --prod` via the CLI once authenticated.

## Project Structure

```
.
├── index.html            # Landing page with user form
├── greeting.html         # Avatar demo page (dynamic UI)
├── js/
│   └── avatar.js         # Frontend logic (Agora, speech, UI)
├── netlify/functions/    # Serverless functions for Akool API
│   ├── create-avatar-session.js
│   ├── create-avatar-with-socket.js
│   └── push-avatar-message.js
├── netlify.toml          # Netlify config (build & dev settings)
├── package.json
└── README.md
```

## Notes & Troubleshooting

- **Port Conflicts**: If `:8888` is in use, update `[dev] port` in `netlify.toml`.
- **Browser Support**: SpeechRecognition works in modern Chrome/Edge; Safari may require user interaction.
- **CORS/HTTPS**: In production, ensure your site is served over HTTPS for audio/video permissions.

## License

MIT © Your Name or Organization 

## Default Deployment Commands

```bash
# Install dependencies
npm install

# Start local development server
npm start

# Build the site locally (Netlify build)
netlify build

# Deploy to Netlify production
netlify deploy --prod --dir=.
```

```bash
# Or with Yarn
yarn

yarn start

netlify build

netlify deploy --prod --dir=.
``` 