# 🐇 PetCam

A local petcam app for watching your pets/rabbits via your computer's webcam. Live feed, motion detection, and recording — all running locally on your machine.

## Tech Stack

| Layer    | Tech               |
|----------|--------------------|
| Frontend | React + Vite       |
| Backend  | Node.js + Express  |
| Styling  | CSS-in-JS (inline) |

---

## Setup

### 1. Install dependencies

```bash
npm run install:all
```

This installs packages for the root, client, and server.

### 2. Run in development

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend** → http://localhost:5173
- **Backend**  → http://localhost:3001

---

## Project Structure

```
bunnycam/
├── client/                  # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── VideoFeed.jsx       # Live webcam display + motion overlay
│       │   ├── Controls.jsx        # Start/stop, record, sensitivity
│       │   ├── ActivityLog.jsx     # Timestamped motion event list
│       │   └── RecordingGallery.jsx # Grid of saved videos
│       ├── hooks/
│       │   ├── useWebcam.js        # getUserMedia lifecycle
│       │   └── useMotion.js        # Canvas pixel-diff motion detection
│       └── App.jsx                 # Layout + state orchestration
│
└── server/                  # Express backend
    ├── routes/
    │   ├── recordings.js   # GET/POST/DELETE saved video clips
    │   └── logs.js          # Persist activity log to JSON
    ├── recordings/         # Saved .webm files land here
    └── index.js             # Server entry point
```

---

## Features

- **Live webcam feed** via `getUserMedia`
- **Motion detection** using canvas pixel-diff algorithm
- **Motion overlay** highlights active areas on the video
- **Activity log** with timestamped motion events
- **Recording** saved to disk via the Express backend
- **Recording gallery** with delete support
- **Multiple cameras** — picker appears if more than one is detected
- **Browser notifications** when motion is detected (opt-in)
- **Sensitivity slider** to tune detection for your space

---

## Stretch Goals / Ideas

- [ ] Improved night mode
- [ ] Timelapse: capture a frame every N seconds and stitch into a video
- [ ] SMS alert on motion (integrate with Resend or Twilio)
- [ ] Train machine learning to differentiate binkies (excited jumping), yawns, and normal movements

---

## Notes

- Recordings are stored in `server/recordings/` and are git-ignored
- Activity logs are stored in `server/activity-log.json` and are git-ignored
- No external services required — everything runs on `localhost`
