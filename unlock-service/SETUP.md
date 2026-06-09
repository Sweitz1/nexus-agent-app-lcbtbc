# Nexus Unlock — Setup Guide

## Quick Start (Web / Windows PC)

### 1. Clone & Install
```bash
git clone <your-repo>
cd unlock-service
npm install
npx prisma generate
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values (see below)
```

### 3. Set Up Database
Use any PostgreSQL provider:
- **Neon** (free tier): https://neon.tech
- **Supabase** (free tier): https://supabase.com
- **Railway**: https://railway.app
- **Local**: `brew install postgresql` or Docker

```bash
npx prisma db push   # Creates all tables
```

### 4. Set Up Stripe
1. Create account at https://stripe.com
2. Go to Dashboard → Products → Create 3 products:
   - **Starter Shop** — recurring $99/month
   - **Pro Shop** — recurring $249/month
   - **Enterprise** — recurring $499/month
3. Copy the **Price IDs** (start with `price_`) into `.env`
4. For webhooks: Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://yourdomain.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`

### 5. Run
```bash
npm run dev    # Development
npm run build && npm start   # Production
```

---

## Wholesale Unlock API

The service ships with **demo mode** (`DEMO_MODE=true`) for testing.
When ready to go live, sign up with a wholesale unlock provider:

| Provider | URL | Notes |
|----------|-----|-------|
| **DirectUnlocks** | directunlocks.com/resellers | Most popular, good API |
| **UnlockBase** | unlockbase.com | Large carrier coverage |
| **GSMUnlockHub** | gsmunlockhub.com | Competitive pricing |
| **IMEI24** | imei24.com | API-friendly |

After getting credentials:
1. Set `DEMO_MODE=false` in `.env`
2. Set `UNLOCK_PROVIDER_API_URL` and `UNLOCK_PROVIDER_API_KEY`
3. Review `src/lib/unlock-providers/direct-unlocks-provider.ts` and adjust to match your provider's API format

---

## Raspberry Pi — Local Shop Server

Run as a local tool box on your shop's network (no internet required for the dashboard, only for provider API calls):

### Pi Setup
```bash
# On Raspberry Pi OS (64-bit recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone & install
git clone <your-repo> ~/unlock-service
cd ~/unlock-service
npm install
npx prisma generate
cp .env.example .env
# Edit .env — for local Pi DB use SQLite or a local Postgres
```

### Run as a Service (auto-start on boot)
```bash
# Install PM2
sudo npm install -g pm2

# Build and start
npm run build
pm2 start "npm start" --name nexus-unlock
pm2 startup && pm2 save
```

### Access from shop computers
The Pi's IP on your local network (e.g. `http://192.168.1.100:3000`).
Set `NEXT_PUBLIC_APP_URL=http://192.168.1.100:3000` in `.env`.

---

## Windows Desktop App (Electron)

Wrap the Next.js app in Electron for an offline-capable desktop tool:

```bash
npm install --save-dev electron electron-builder
```

Add to `package.json`:
```json
"main": "electron/main.js",
"scripts": {
  "electron": "electron .",
  "dist": "electron-builder"
}
```

Create `electron/main.js` to launch the Next.js server and open a browser window.
The app then runs fully locally — no external hosting needed.

---

## Pricing You Can Set

Edit `src/lib/stripe.ts` → `PAY_PER_UNLOCK_PRICES` to set your per-carrier consumer prices.
Edit `PLANS` to set subscription tier prices.

Typical reseller margins: wholesale cost $2–8/unlock → retail $10–25/unlock.
