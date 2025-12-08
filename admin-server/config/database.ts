import { PrismaClient } from '@prisma/client';
import debugLib from 'debug';
import { execSync } from 'child_process';
import path from 'path';

const debug = debugLib('app:db');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

try {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['query', 'error', 'warn'],
  });
  
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} catch (error) {
  console.warn('Prisma client not initialized. Please run "npx prisma generate" first.');
  // Create a mock client for development
  prisma = {} as PrismaClient;
}

// Create default admin user
async function createDefaultUser() {
  try {
    if (prisma.users) {
      // Check if admin user already exists
      const existingUser = await prisma.users.findUnique({
        where: { email: 'shreyas@fruitstandny.com' }
      });

      if (!existingUser) {
        await prisma.users.create({
          data: {
            name: 'Shreyas',
            email: 'shreyas@fruitstandny.com',
            password: 'admin123'
          }
        });
        debug('Default admin user created');
      } else {
        console.log('ℹ️  Admin user already exists');
      }
    }
  } catch (err: any) {
    // If the error indicates the underlying table does not exist, don't crash.
    // Prisma error code P2021 indicates that the model/table is missing in the DB.
    const code = err?.code || (err?.meta && err.meta.code);
    if (code === 'P2021' || (err?.message && /does not exist/i.test(err.message))) {
      console.warn('Database schema not found (tables missing). Attempting to run `npx prisma db push` to create tables...');

      try {
        // Run prisma db push in the prisma project directory (project root)
        const cwd = path.resolve(__dirname, '..'); // admin-server/config -> admin-server
        execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', cwd });
        console.log('`prisma db push` completed. Retrying default user creation...');

        // Retry the create flow once
        try {
          const existingUserRetry = await prisma.users.findUnique({
            where: { email: 'shreyas@fruitstandny.com' }
          });
          if (!existingUserRetry) {
            await prisma.users.create({
              data: {
                name: 'Shreyas',
                email: 'shreyas@fruitstandny.com',
                password: 'admin123'
              }
            });
            console.log('Default admin user created after schema push');
          }
        } catch (retryErr: any) {
          console.warn('Retry after prisma db push failed:', retryErr?.message || retryErr);
        }
      } catch (pushErr: any) {
        console.warn('Automatic `prisma db push` failed or not available. Please run manually: `npx prisma db push`', pushErr?.message || pushErr);
      }

      return;
    }
    // Re-throw other unexpected errors
    throw err;
  }
}

// Test database connection
async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
    try {
      await createDefaultUser();
    } catch (e) {
      // Already handled inside createDefaultUser for missing tables.
      // Log unexpected errors but do not crash the server startup.
      console.error('Warning: failed to create default user:', (e as any)?.message || e);
    }
  } catch (e) {
    console.error('Failed to connect to database:', (e as any)?.message || e);
    throw e;
  }
}

// Only connect if prisma is properly initialized
if (prisma) {
  connectDB();
}

// Graceful shutdown
process.on('beforeExit', async () => {
  if (prisma.$disconnect) {
    await prisma.$disconnect();
  }
});

export { connectDB };
export default prisma;