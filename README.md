# Inventory App

Premium inventory management app built with Next.js, MongoDB, and cookie-based authentication.

## Features

- Product catalog with SKU, barcode, categories, pricing, and minimum stock
- Barcode scanning and printable labels
- Stock in, stock out, and adjustment history
- Purchase receiving with supplier, reference, cost, and automatic stock update
- Reorder queue for low-stock and out-of-stock products
- Internal transfer log between locations or branches
- Supplier and category master data
- User list and role visibility
- Dashboard, reports, and Excel export

## Local Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`, create the first account, and sign in. The first registered account becomes admin automatically.

## Environment Variables

```text
MONGODB_URI=mongodb://...
MONGODB_DB=inventory
AUTH_SECRET=long-random-secret
```

`MONGODB_DB` is optional. If it is not set, the app uses `inventory`.

## Railway Deploy

Add a MongoDB service in Railway, then set these variables on the app service:

```text
MONGODB_URI=${{mongodb.MONGO_URL}}
AUTH_SECRET=long-random-secret
```

Use a strong random `AUTH_SECRET` and keep it unchanged after users start logging in, because existing login cookies are signed with this value.

## Build

```bash
npm run build
```

The app uses a MongoDB compatibility layer for older Supabase-named helper files, but production data is stored in MongoDB.

## Camera Scan Note

Browser camera access works only on HTTPS or localhost.

- Local testing: camera works on `http://localhost:3000`
- Railway deployment uses HTTPS automatically
- USB barcode scanners work like keyboards and do not need camera permission
