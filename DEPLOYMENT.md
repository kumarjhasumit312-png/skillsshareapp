# Deployment Guide (Phase 4)

This covers getting the app running 24/7 on a free cloud VM, and
packaging it as an Android APK. Do this after you've fully tested
the app locally.

## 1. Get a free VM (Oracle Cloud Free Tier)

1. Sign up at oracle.com/cloud/free (needs card for identity verification,
   but "Always Free" resources are never billed).
2. Create an "Always Free" Ampere (ARM) VM, Ubuntu 22.04.
3. In the VM's Security List / Network Security Group, open ports:
   80, 443 (web), 3478 & 5349 (TURN), and UDP 49152-65535 (TURN relay media).

## 2. Push your code to the VM

Easiest from VS Code: install the **Remote-SSH** extension, connect to
your VM's IP, then clone/copy this project folder there. Or use `scp`:

```
scp -r skill-swap-app ubuntu@YOUR_VM_IP:/home/ubuntu/
```

## 3. Install everything on the VM

```bash
sudo apt update
sudo apt install -y python3-pip python3-venv nginx coturn postgresql

cd /home/ubuntu/skill-swap-app
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 4. Set up PostgreSQL (production database)

```bash
sudo -u postgres psql -c "CREATE DATABASE skillswap;"
sudo -u postgres psql -c "CREATE USER skillswap_user WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE skillswap TO skillswap_user;"
```

Then in your `.env` on the VM, set:
```
DATABASE_URL=postgresql://skillswap_user:yourpassword@localhost/skillswap
```

## 5. Run the app as a service (auto-restart, survives reboot)

Copy `deploy/skillswap.service.example` to `/etc/systemd/system/skillswap.service`,
edit the paths/username to match your VM, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable skillswap
sudo systemctl start skillswap
sudo systemctl status skillswap   # check it's running
```

## 6. Nginx + HTTPS

Copy `deploy/nginx.conf.example` to `/etc/nginx/sites-available/skillswap`,
replace `yourdomain.com` with your real domain (a free one from Duck DNS
works fine), then:

```bash
sudo ln -s /etc/nginx/sites-available/skillswap /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

HTTPS is required for camera/mic access in the browser (except on localhost).

## 7. TURN server (for reliable calls across networks)

Copy the relevant lines from `deploy/turnserver.conf.example` into
`/etc/turnserver.conf`, fill in your VM's public IP and a real password, then:

```bash
sudo systemctl enable coturn
sudo systemctl start coturn
```

Then update `static/js/webrtc.js` — add your TURN server to the `iceServers`
array (the file has a commented example already showing the format).

## 8. Android APK (PWA → TWA method)

The app already has `static/manifest.json` and `static/sw.js` for PWA
support. Once the app is live over HTTPS:

1. Install Node.js on your own machine, then:
   ```
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest https://yourdomain.com/static/manifest.json
   ```
2. Follow the prompts (it'll ask for app name, package id, etc.)
3. ```
   bubblewrap build
   ```
   This produces an `.apk` file you can install on Android or share directly.

Note: You'll want real icon files at `static/icons/icon-192.png` and
`icon-512.png` (referenced in manifest.json) before doing this — any
192x192 and 512x512 PNG logo works.

## Order of operations recap
1. VM + code deployed → 2. Database → 3. systemd service running →
4. Nginx + HTTPS working → 5. TURN server → 6. THEN generate the APK
(APK needs a working HTTPS URL to point to).
