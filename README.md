# Inventory App - Phase 1 Setup

## Step 1: Create the project

```bash
npx create-next-app@latest inventory-app --typescript --tailwind --app --src-dir --import-alias "@/*"
cd inventory-app
npm install @supabase/supabase-js @supabase/ssr @zxing/browser jsbarcode xlsx
```

## Step 2: Copy the app files

Keep this structure when copying files:

```text
inventory-app/
├── .env.local            <- create this from .env.local.example
└── src/
    ├── middleware.ts
    ├── lib/
    │   ├── types.ts
    │   └── supabase/
    │       ├── client.ts
    │       └── server.ts
    ├── components/
    │   ├── SignOutButton.tsx
    │   └── ProductForm.tsx
    └── app/
        ├── page.tsx
        ├── login/
        │   └── page.tsx
        └── (app)/
            ├── layout.tsx
            ├── dashboard/page.tsx
            ├── products/
            │   ├── page.tsx
            │   ├── new/page.tsx
            │   ├── [id]/page.tsx
            │   └── labels/page.tsx
            ├── scan/page.tsx
            ├── stock/page.tsx
            ├── reports/page.tsx
            └── settings/page.tsx
```

Important: keep the `[id]` folder name exactly as shown. It is a Next.js dynamic route.

Note: keep the `(app)` folder name exactly as shown. It is a Next.js route group and does not appear in the URL.

## Step 3: Environment variables

Copy `.env.local.example` to `.env.local`, then add the values from your Supabase dashboard under Settings > API:

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

## Step 4: Run locally

```bash
npm run dev
```

Open http://localhost:3000. The login page will appear. Create an account, then run this in the Supabase SQL Editor to make your user an admin:

```sql
update public.profiles set role = 'admin' where id = '<YOUR_USER_UUID>';
```

You can find the UUID in Supabase > Authentication > Users.

## Camera scan note

Browser camera access works only on HTTPS or localhost.

- Local testing: camera works on http://localhost:3000
- Phone testing: deploy to Railway for automatic HTTPS, or use `ngrok` / `cloudflared tunnel`

USB barcode scanners work like keyboards and do not have the same camera restriction.

## Railway deploy

When deploying to Railway, add the same two environment variables in the Railway Variables tab.
