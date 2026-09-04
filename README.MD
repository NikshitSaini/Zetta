<h1 align="center">⚡ Zetta — Real-Time Chat with Unlimited File Sharing</h1>

<p align="center">
  A production-grade full-stack chat application with real-time messaging, image sharing, and <strong>unlimited-size file uploads</strong> powered by Telegram as a free storage backend — routed through a Cloudflare Worker relay so zero file bytes ever touch your server.
</p>

<p align="center">
  <a href="https://zetta-vxwn.onrender.com/" target="_blank"><strong>🔗 Live Demo →</strong></a>
</p>

---

## ✨ Feature Highlights

| Category | Features |
|---|---|
| **Auth** | 🔐 Custom JWT authentication (no 3rd-party auth), secure httpOnly cookies, protected routes |
| **Messaging** | ⚡ Real-time messaging via Socket.io, optimistic UI updates |
| **Presence** | 🟢 Online / Offline indicators, live user list |
| **Image Sharing** | 🖼️ Upload images (Cloudinary), click-to-zoom lightbox with Escape-to-close |
| **File Sharing** | 📦 **Unlimited-size** file uploads via Telegram chunking — any file type, any size |
| **File Upload UX** | 📊 Live progress: `3.2 / 40 MB · 1.4 MB/s`, shimmer animation, one-click cancel |
| **Notifications** | 🔔 In-app notification & typing sounds with toggle |
| **Email** | 📨 Welcome emails on signup (Resend) |
| **Security** | 🚦 API rate-limiting (Arcjet), Redis-backed session guards |
| **UI** | 🎨 React 19 + Tailwind CSS + DaisyUI, Zustand state management |
| **Bandwidth** | 💸 File data **never touches Render** — 0 bytes of file bandwidth used |

---

## 🏗️ Architecture — Telegram File Storage

Zetta uses **Telegram as a free, unlimited storage backend** via a Cloudflare Worker relay. File data is chunked in the browser and proxied directly to Telegram — the Render backend only handles tiny JSON metadata (~2 KB per upload).

```
Browser
  │
  ├─ POST /api/files/init ──────────► Render Backend (metadata only)
  │                                        └─ returns { fileId, uploadToken, workerUrl }
  │
  ├─ POST /upload-chunk ───────────► Cloudflare Worker  ──► Telegram API
  │   (19 MB chunks, 1s pacing)          (JWT-verified)        (stores file)
  │
  └─ GET /download/:fileId ────────► Cloudflare Worker
                                          ├─ fetches manifest from Render
                                          └─ streams Telegram chunks → browser
```

### Why it works

| Concern | Solution |
|---|---|
| **Render 0.5 GB/month bandwidth** | Binary never touches Render — only JSON metadata flows through it |
| **Telegram 20 MB `getFile` limit** | Files split into 19 MB chunks — safely under the ceiling |
| **Telegram 1 msg/sec rate limit** | 1,000 ms enforced delay between chunks on the client |
| **Bot token security** | Token lives only in Cloudflare Worker encrypted secrets — never exposed to the browser |
| **Cloudflare free tier (100k req/day)** | A 1 GB file = ~53 requests. You'd need to upload ~1,800 GB/day to hit the cap |
| **Large file support** | 19 MB chunks × unlimited count. A 10 GB file = 538 chunks (~9 min upload) |

---

## 🧪 Environment Setup

### Backend (`/backend/.env`)

```env
PORT=3000
MONGO_URI=your_mongo_uri_here
NODE_ENV=development

JWT_SECRET=your_jwt_secret

RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=your_email_from_address
EMAIL_FROM_NAME=your_email_from_name

CLIENT_URL=http://localhost:5173

REDIS_URL=redis://localhost:6379

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

ARCJET_KEY=your_arcjet_key
ARCJET_ENV=development

# ── Telegram File Storage ─────────────────────────────────────────────────────
WORKER_URL=https://tg-storage-worker.<your-subdomain>.workers.dev
WORKER_KEY=a_shared_secret_for_manifest_endpoint
# JWT_SECRET above is reused for signing upload tokens
```

### Cloudflare Worker (`/worker/`)

Secrets are set via `wrangler secret put` — they are **never stored in files**:

```bash
cd worker
npx wrangler secret put TELEGRAM_BOT_TOKEN   # from @BotFather
npx wrangler secret put TELEGRAM_CHANNEL_ID  # e.g. -100XXXXXXXXXX
npx wrangler secret put JWT_SECRET           # must match backend JWT_SECRET
```

Non-secret vars go in `worker/wrangler.toml`:

```toml
[vars]
RENDER_BACKEND_URL = "https://your-app.onrender.com"
WORKER_KEY         = "same_value_as_backend_WORKER_KEY"
```

---

## 🚀 One-Time Telegram Setup

> Before deploying, complete these steps once:
>
> 1. Create a Telegram Bot via `@BotFather` → save the `TELEGRAM_BOT_TOKEN`
> 2. Create a **private** Telegram channel → add the bot as **Administrator** (needs "Post Messages")
> 3. Get the channel ID (`TELEGRAM_CHANNEL_ID`, format: `-100XXXXXXXXXX`)
>    — forward any channel message to `@userinfobot` to get it

---

## 🔧 Run Locally

### 1. Backend

```bash
cd backend
npm install
npm run dev          # http://localhost:3000
```

### 2. Cloudflare Worker (local dev)

```bash
cd worker
npm install
npx wrangler dev     # http://localhost:8787
```

> **Note:** For local testing, set `WORKER_URL=http://localhost:8787` in backend `.env`
> and `RENDER_BACKEND_URL=http://localhost:3000` in `worker/wrangler.toml`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

---

## ☁️ Deploy to Production

### 1. Deploy Cloudflare Worker

```bash
cd worker
npx wrangler deploy
```

Update `worker/wrangler.toml` with your real Render backend URL first:
```toml
RENDER_BACKEND_URL = "https://your-app.onrender.com"
```

### 2. Deploy Backend to Render

Set these environment variables in the Render dashboard:

```
WORKER_URL  = https://tg-storage-worker.<your-subdomain>.workers.dev
WORKER_KEY  = your_shared_secret
JWT_SECRET  = your_jwt_secret
# ... all other vars from .env
```

### 3. Deploy Frontend

Build the frontend and serve it via Render (or Netlify / Vercel):

```bash
cd frontend
npm run build        # outputs to frontend/dist/
```

---

## 🗂️ Project Structure

```
Zetta/
├── backend/
│   └── src/
│       ├── controllers/
│       │   ├── file.controller.js      # initUpload, finalizeUpload, getFileManifest, getUserFiles
│       │   └── messgae.controller.js   # sendMessage (extended with file field)
│       ├── models/
│       │   ├── file.model.js           # FileMetadata — chunks, TTL auto-cleanup
│       │   └── message.model.js        # Message — with optional file sub-document
│       └── routes/
│           └── file.routes.js          # /api/files/*
│
├── worker/
│   ├── wrangler.toml                   # Cloudflare Worker config
│   └── src/
│       └── index.js                    # Upload relay + streaming download handler
│
└── frontend/
    └── src/
        ├── hooks/
        │   └── useFileUpload.js        # Chunking engine: split → upload → finalize
        └── components/
            ├── MessageInput.jsx        # Attach button, progress bar, speed display
            └── ChatContainer.jsx       # File bubble + image lightbox
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Zustand, Tailwind CSS, DaisyUI, Lucide Icons, Axios |
| **Backend** | Node.js, Express, MongoDB (Mongoose), Redis, Socket.io |
| **File Storage** | Telegram Bot API (via Cloudflare Worker relay) |
| **Image Hosting** | Cloudinary |
| **Edge Compute** | Cloudflare Workers (JWT verification, chunk relay, streaming download) |
| **Auth** | JWT (httpOnly cookies) |
| **Email** | Resend |
| **Rate Limiting** | Arcjet + Redis |
| **Deployment** | Render (backend), Cloudflare Workers (relay) |
