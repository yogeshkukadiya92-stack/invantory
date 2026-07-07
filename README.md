# Inventory App

Production inventory, billing, stock, purchase order, returns, barcode, and
reporting app built with Next.js and MongoDB.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Required Environment Variables

```env
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net/inventory?retryWrites=true&w=majority
MONGODB_DB=inventory
SESSION_SECRET=replace-with-a-long-random-secret
```

`MONGODB_URI` and `SESSION_SECRET` are required. `MONGODB_DB` defaults to
`inventory` when omitted.

## First User

Create the first account from the login page. The first registered user becomes
`admin` automatically. After that, new signups must be invited from Settings.

## Deployment

For Railway, Vercel, Render, or another Node.js host:

```bash
npm install
npm run build
npm run start
```

Add the same environment variables in the platform dashboard before deploying.

## Notes

- Product images are stored in MongoDB through the built-in storage API.
- No browser-exposed database keys are required.
- Camera barcode scanning requires HTTPS in production; localhost works for
  local testing.
