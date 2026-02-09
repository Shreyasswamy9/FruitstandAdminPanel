# Admin Panel - Setup & Security Guide

## Important Security Notice

**NEVER commit passwords or API keys to the repository!**

This project uses environment variables to manage sensitive credentials. All credentials should be set via `.env` files (which are gitignored) or environment variables in your deployment.

## Initial Setup

### 1. Environment Configuration

Copy `.env.example` to `.env` and fill in your actual values:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- Database connection string
- Shippo API token
- Mailchimp API credentials
- **Admin user passwords** for initial seeding

### 2. Seed Initial Admin Users

Set the temporary passwords in `.env`:

```
AUSTIN_PASSWORD=SecurePassword123!
THEODORE_PASSWORD=SecurePassword123!
CHEY_PASSWORD=SecurePassword123!
SHREYAS_PASSWORD=SecurePassword123!
```

Then run:

```bash
npm run seed
```

This creates 4 admin user accounts in the database. Users will be required to change their password on first login.

### 3. User Login

1. Navigate to `/login`
2. Enter email and the temporary password from `.env`
3. You'll be redirected to `/change-password` to set a permanent password
4. Log in again with your new credentials

## Security Best Practices

✅ **DO:**
- Use strong, unique passwords
- Set different passwords for each environment (dev, staging, production)
- Use environment variables or `.env` files (gitignored)
- Rotate passwords regularly
- Change temporary passwords on first login

❌ **DON'T:**
- Commit `.env` files to git
- Hardcode passwords in source files
- Reuse passwords across environments
- Share passwords via email or chat
- Store credentials in comments or documentation

## Environment Variables

Required for production:

```
DIRECT_URL=postgresql://...
SHIPPO_API_TOKEN=shippo_test_...
MAILCHIMP_API_KEY=...
SESSION_SECRET=long-random-string
JWT_SECRET=long-random-string
NODE_ENV=production
```

## Reference

- **Auth routes**: `src/routes/auth.routes.ts`
- **Auth service**: `src/services/auth.service.ts`
- **Seed script**: `prisma/seed-admin-users.ts`
- **Password script**: `scripts/set-password.ts`
