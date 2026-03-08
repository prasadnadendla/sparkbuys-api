# Sparkbuys API — Backend Service

## Project Overview
Fastify REST API serving OTP auth, Shopify customer management, and push subscriptions.
Deployed on Google Cloud Run at `sparkbuys-api-820618709776.asia-south1.run.app`.

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify v5
- **Database**: PostgreSQL via Hasura GraphQL (`gql.truelet.in`)
- **OTP**: TOTP via `otpauth` library + 2factor SMS gateway
- **Shopify**: Admin API (customer CRUD) + Storefront API (customer access token)

## Key Commands
```bash
npm run local   # dev with nodemon (ts-node)
npm run dist    # clean + build + copy assets
npm start       # run compiled dist/index.js
```

## Config
All config in `src/conf/config.json` (not committed with secrets in production):
- `graphql.endpoint` — Hasura endpoint
- `shopify.storeUrl` — `sparkbuys26.myshopify.com`
- `shopify.adminToken` — `shpat_...` Admin API token (never expires)
- `shopify.storefrontToken` — public Storefront token (no `shpat_` prefix)
- `test.active` — **must be `false` in production** (bypasses OTP with hardcoded code)
- `jwt` — JWT signing secret

## Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signin` | None | Send OTP to phone |
| POST | `/verify` | None | Verify OTP, return JWT + Shopify token |
| POST | `/api/subscribe` | JWT | Save push notification subscription |
| GET | `/system/health` | system_code | Health check |
| GET | `/system/status` | system_code | Request status tracker |
| GET | `/system/metrics` | system_code | Prometheus metrics |

## Auth Flow (`/signin` + `/verify`)
1. `/signin`: find or create user in DB, send TOTP via SMS
2. `/verify`: validate TOTP, ensure Shopify customer exists (await — not background), return `{ token, shopifyToken }`
3. Shopify customer uses synthetic email: `<phone_digits>@customers.sparkbuys.in`
4. TOTP `secret` reused as Shopify customer password (no extra DB field needed)

## Shopify Integration (`src/shopify.ts`)
- `createOrGetShopifyCustomer(phone, secret)` — find by phone (Admin API) or create; returns Shopify customer ID
- `getCustomerAccessToken(phone, secret)` — Storefront API `customerAccessTokenCreate` mutation
- **Critical**: always `await createOrGetShopifyCustomer` before `getCustomerAccessToken` in `/verify` — race condition if run in background
- Admin API version: `2026-01`

## Database (`src/db/queries.ts`)
- Hasura GraphQL client with `fetchPolicy: 'no-cache'`
- Key table: `sb.users` with fields: `id, phone, secret, is_active, blocked, shopify_customer_id`
- `shopify_customer_id BIGINT` — migration: `ALTER TABLE sb.users ADD COLUMN shopify_customer_id BIGINT;`
- Hasura must track `shopify_customer_id` column and grant select/update permissions

## Rate Limiting
- `/signin`: max 3 requests/minute
- `/verify`: max 3 requests/minute
- Global: max 200 requests/minute

## JWT
- Routes under `/api/*` require `Authorization: Bearer <token>` header
- Token verified via `@fastify/jwt` in `onRequest` hook
- JWT payload: `{ phone, uid }`

## Security Notes
- `test.active: false` in production — if `true`, anyone can log in with hardcoded OTP `123456`
- Admin token (`shpat_`) is for Admin API only — never use as Storefront token
- Storefront token has no `shpat_` prefix — it's a public token
