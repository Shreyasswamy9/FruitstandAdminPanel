# admin-server

## Overview
The `admin-server` project is a TypeScript and Node.js application that provides a RESTful API for managing users, products, and orders. It utilizes Express.js for handling HTTP requests, Prisma ORM for database interactions with a Supabase Postgres database, and includes background job scheduling with node-cron.

## Features
- RESTful API with minimal endpoints for users, products, and orders.
- Database management using Prisma ORM.
- Environment variable management with dotenv.
- Background job scheduling with node-cron.
- Process management using PM2.

## Getting Started

### Prerequisites
- Node.js (version 20 or higher)
- npm (Node package manager)
- A Supabase account and a Postgres database setup.

### Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   cd admin-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up your environment variables:
   - Copy the `.env.example` to `.env` and fill in the required values.
   - See the **Environment Variables** section below for all required vars.

### Running the Development Server
To start the development server, run:
```
npm run dev
```

### Seeding the Database
To populate the database with default seed data (including admin user), run:
```
npm run db:seed
```

### Building the Project
To compile the TypeScript code, run:
```
npm run build
```

### Starting in Production
To start the application in production mode, run:
```
npm start
```

### Running Prisma Migrations
To apply database migrations, run:
```
npm run prisma:migrate
```

## Project Structure
```
admin-server
├── src
│   ├── adminApp.ts
│   ├── controllers
│   ├── routes
│   ├── middleware
│   ├── services
│   ├── jobs
│   ├── types
│   └── utils
├── api
│   └── index.ts (Vercel serverless entry point)
├── pages
│   ├── orders.ts
│   ├── products.ts
│   ├── analytics.ts
│   └── ...
├── prisma
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── config
│   └── database.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json
└── README.md
```

## Environment Variables

The following environment variables are **required** for the application to work:

### Database
- `DIRECT_URL` - Postgres connection string (from Supabase)
- `DATABASE_URL` - (Optional) Alias for DIRECT_URL if needed

### Authentication & Security
- `ADMIN_SESSION_SECRET` - Secret key for signing JWT tokens (use a strong random string, min 32 chars)
- `ADMIN_PASSWORD` - Password for admin login

### Admin Configuration
- `ADMIN_EMAIL` - Email address of the admin user (optional, defaults to `admin@fruitstandny.com`)

### Environment
- `NODE_ENV` - Set to `"production"` for production deployments (automatically set by Vercel)

### PostHog Analytics (Optional)
- `POSTHOG_API_KEY` - Personal API key from PostHog settings
- `POSTHOG_PROJECT_ID` - Project ID from PostHog project settings
- `POSTHOG_HOST` - (Optional) PostHog host URL, defaults to `https://app.posthog.com`

### Mailchimp Integration (Optional)
- `MAILCHIMP_API_KEY` - API key from Mailchimp account settings
- `MAILCHIMP_SERVER_PREFIX` - Server prefix from Mailchimp API key (e.g., `us1`, `us2`)
- `MAILCHIMP_LIST_ID` - Email audience/list ID for syncing customer emails
- `MAILCHIMP_SMS_AUDIENCE_ID` - SMS audience ID for syncing customer phone numbers (if using Mailchimp SMS)

## Vercel Deployment

### Setup
1. Set the **Root Directory** to `admin-server` in Vercel project settings
2. Ensure all environment variables from the **Environment Variables** section above are set in Vercel project settings
3. The build command and function configuration are defined in `admin-server/vercel.json`

### Build Process
- `npm run build` runs: `prisma generate && tsc`
- Compiles TypeScript to `dist/` directory
- Vercel routes all requests to `/api/index` (the serverless function)

### Cookie-Based Sessions
- Authentication uses HttpOnly cookies with JWT tokens
- Cookie name: `fs_admin`
- Token expiration: 24 hours
- Secure flag is enabled in production

## License
This project is licensed under the MIT License. See the LICENSE file for details.