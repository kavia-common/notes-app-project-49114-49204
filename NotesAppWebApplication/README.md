# Lightweight React Template for KAVIA

This project provides a minimal React template with a clean, modern UI and minimal dependencies.

## Backup & Restore (Frontend-only)

This app includes a local backup and restore feature when running without a backend API:
- Automatic daily backups are created while the app is open.
- Manual actions are available in Settings:
  - Backup now
  - Restore from latest (with confirmation)
  - Download backup (exports a .json file)
  - Upload backup (imports a .json backup; you can then restore from latest)

Storage details:
- Backups are stored in localStorage as timestamped JSON snapshots under `notes.mvp.backups.v1`.
- Each snapshot contains:
  ```
  {
    "version": 1,
    "data": {
      "notes": [...],
      "categories": [...],
      "meta": { "version": 1, "created_at": "ISO" }
    }
  }
  ```
- Automatic backups keep a rolling history (last 3 auto snapshots).

Restore behavior:
- Restoring replaces the current local notes state with the snapshot (last-write-wins).
- Validate backup file shape on import; invalid files are rejected.

Caveats:
- This is browser-local only. Clearing browser data will remove backups unless you downloaded them as files.
- If a backend is introduced, migrate to server-side backup endpoints and filesystem storage.

## Voice-to-Text Dictation

You can dictate notes using your microphone with the browser Web Speech API:

- Microphone button to start/stop dictation
- Language selection (default en-US)
- Insert mode: Append to current content or Replace it
- Live listening indicator and interim transcript preview
- Error and permission messages
- Quick Create: make a new note directly from captured speech (available in Create section)

How to use:
1. In the Create section, click “🎤 Dictate” to start listening. Language and mode can be configured.
2. Speak into your mic; interim text appears and final text inserts into the content field (append or replace).
3. Click “⏹ Stop” to stop listening.
4. Use “➕ Quick Create” to create a new note instantly from the last finalized speech.

Edit modal:
- The same dictation UI appears above the content field in the Edit dialog to insert dictated text into an existing note.

Permissions and privacy:
- Your browser will prompt for microphone access on first use. Grant permission for dictation to work.
- If denied, re-enable permissions in your browser’s site settings.
- Speech processing is handled by the browser; no extra backend is used.

Browser support:
- Supported: Most Chromium-based browsers (Chrome, Edge).
- Partial/No support: Firefox, Safari, and some mobile browsers. If unsupported, the UI will show a helpful message.

Limitations:
- Web Speech API is experimental; accuracy/availability varies by browser.
- Long sessions may auto-stop; click Dictate again to resume.
- Background noise can reduce accuracy.

## Features

- **Lightweight**: No heavy UI frameworks - uses only vanilla CSS and React
- **Modern UI**: Clean, responsive design with KAVIA brand styling
- **Fast**: Minimal dependencies for quick loading times
- **Simple**: Easy to understand and modify

## Getting Started

In the project directory, you can run:

### `npm start`

Runs the app in development mode using a container-friendly launcher that binds to 0.0.0.0 and honors PORT.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser (or the container URL provided by your environment).

### `npm run dev`

Alias for development with container-friendly host/port. Works with CRA and preview flags.

Respects, in order of precedence:
- CLI flags: `--port`, `--host` (e.g., `npm run dev -- --port 3000 --host 0.0.0.0`)
- Environment variables: `PORT`, `HOST`
- Fallbacks: `REACT_APP_PORT` for port, and `0.0.0.0` for host; default port 3000

Examples:
- HOST=0.0.0.0 PORT=3000 npm start
- HOST=0.0.0.0 PORT=3000 npm run dev
- REACT_APP_PORT=3000 npm run dev
- npm run dev -- --port 3000 --host 0.0.0.0

Healthcheck:
- Root path `/` responds with the CRA index page once the dev server is ready.
- You can influence host/port via `.env` (see `.env.example`).

### `npm test`

Launches the test runner in interactive watch mode.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

## Customization

### Colors

The main brand colors are defined as CSS variables in `src/App.css`:

```css
:root {
  --kavia-orange: #E87A41;
  --kavia-dark: #1A1A1A;
  --text-color: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
  --border-color: rgba(255, 255, 255, 0.1);
}
```

### Components

This template uses pure HTML/CSS components instead of a UI framework. You can find component styles in `src/App.css`. 

Common components include:
- Buttons (`.btn`, `.btn-large`)
- Container (`.container`)
- Navigation (`.navbar`)
- Typography (`.title`, `.subtitle`, `.description`)

## Learn More

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
