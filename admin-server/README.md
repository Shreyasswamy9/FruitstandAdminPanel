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

### Running the Development Server
To start the development server, run:
```
npm run dev
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
│   ├── app.ts
│   ├── controllers
│   ├── routes
│   ├── middleware
│   ├── services
│   ├── jobs
│   ├── types
│   └── utils
├── prisma
│   ├── schema.prisma
│   └── seed.ts
├── config
│   └── database.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── ecosystem.config.js
└── README.md
```

## License
This project is licensed under the MIT License. See the LICENSE file for details.