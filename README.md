# Clerk Google Auth Page

A Vite, React, and TypeScript authentication page using Clerk for Google OAuth.

## Setup

1. Create a Clerk application in the Clerk Dashboard.
2. Enable the Google social connection for that application.
3. Copy `.env.example` to `.env` and set `VITE_CLERK_PUBLISHABLE_KEY`.
4. Add your local callback URL in Clerk if your instance requires allowed redirects:
   `http://127.0.0.1:5173/sso-callback`

```bash
corepack pnpm install
corepack pnpm dev
```

The app intentionally keeps auth tokens and secrets out of client code. Clerk manages OAuth state, sessions, and user identity.
