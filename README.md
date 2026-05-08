# Body Forge AI

Body Forge AI is a static, installable PWA prototype for a local AI fitness coach.

## Modes

1. Pushup Coach
   - Camera-based pose tracking when available.
   - Manual rep fallback.
   - Incremental target: 10 pushups/day in week 1, plus 5 more per day each succeeding week.

2. Plank Coach
   - Timer-based coaching.
   - Camera-based posture reminders when available.

3. Treadmill Coach
   - Timer and interval encouragement.
   - Voice/text coaching prompts.

## AI Architecture

The app uses a hybrid model:

- MediaPipe Pose Landmarker extracts pose landmarks.
- A rule-based rep/form engine interprets those landmarks.
- WebLLM can optionally generate local motivational coaching.
- Built-in fallback coaching works even when WebLLM is unavailable.

## Running Locally

Use a local web server. Camera, service worker, and module imports generally require localhost or HTTPS.

Example with VS Code Live Server:

1. Open this folder in VS Code.
2. Right-click `index.html`.
3. Choose **Open with Live Server**.

## Notes

WebLLM may download a large model on first use and requires a WebGPU-capable browser. MediaPipe model assets are loaded from CDN in this MVP. For a fully offline production build, vendor the WebLLM and MediaPipe assets locally and update `app.js` paths.

## Safety

This app is motivational software, not medical advice. Follow clinician guidance. Stop exercising if you feel pain, dizziness, chest discomfort, or unusual shortness of breath.
