# Skill Swap App (All Phases)

Flask + Flask-SocketIO + WebRTC based skill exchange app.

## What's included
- **Auth**: signup, login, logout, email verification, password reset
- **Skill Matching**: add skills to teach/learn, matching suggestions,
  send request, pending requests with Accept/Decline
- **Video Call**: WebRTC 1-to-1 video call, mute/unmute, screen share, end call
- **Scheduled Meetings**: generate a meeting code, or join an existing meeting by code
- **Dashboard**: profile, upcoming meetings, pending requests
- **Real-time**: Socket.IO live notifications (new request, request accepted)
  and online/offline status broadcasting
- **Database**: SQLite by default, switch to PostgreSQL via `DATABASE_URL`
- **Deployment configs**: gunicorn config, systemd service template,
  Nginx template, coturn (TURN server) template — see `DEPLOYMENT.md`
- **Android APK setup**: PWA manifest + service worker included, ready
  to wrap with Bubblewrap once deployed — see `DEPLOYMENT.md` section 8

## Setup (VS Code / local)

1. Open this folder in VS Code.
2. Create and activate a virtual environment:
   ```
   python3 -m venv venv
   source venv/bin/activate      # Windows: venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and adjust values if needed
   (defaults work out of the box for local testing — email links will
   print to your terminal instead of sending real emails).
5. Run the app:
   ```
   python app.py
   ```
6. Open `http://localhost:5000` in your browser.

## Testing the video call locally
Open the app in two different browser tabs/windows (or two browsers),
log in as two different users, go to Meetings, create a meeting code in
one tab, then join with that code in the other tab.

## Going live (24/7 hosting + APK)
See `DEPLOYMENT.md` for the full step-by-step: free Oracle Cloud VM,
PostgreSQL, systemd (auto-restart), Nginx + HTTPS, TURN server, and
finally generating the Android APK.

## Notes
- The `iceServers` list in `static/js/webrtc.js` currently only has a
  free public STUN server. Add your TURN server here once deployed
  (`DEPLOYMENT.md` section 7).
- Real email sending needs a Gmail App Password (or another SMTP
  provider) filled into `.env` — until then, `MAIL_SUPPRESS_SEND=True`
  prints links to the console so you can copy-paste and test the flow.

