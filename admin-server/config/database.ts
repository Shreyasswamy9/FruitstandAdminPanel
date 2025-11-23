import { PrismaClient } from '@prisma/client';

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
    if ((prisma as any).users) {
      // Check if admin user already exists
      const existingUser = await (prisma as any).users.findUnique({
        where: { email: 'shreyas@fruitstandny.com' }
      });

      if (!existingUser) {
        await (prisma as any).users.create({
          data: {
            name: 'Shreyas',
            email: 'shreyas@fruitstandny.com',
            password: 'admin123'
          }
        });
        console.log('✅ Default admin user created - Email: shreyas@fruitstandny.com, Password: admin123');
      } else {
        console.log('ℹ️  Admin user already exists');
      }
    }
  } catch (error) {
    console.error('Failed to create default user:', error);
  }
}

// Test database connection
async function connectDB() {
  try {
    if (prisma.$connect) {
      await prisma.$connect();
      console.log('Database connected successfully');

      // Create default user after successful connection
      await createDefaultUser();
    } else {
      console.log('Database client not ready. Run "npx prisma generate" first.');
    }
  } catch (error) {
    console.error('Database connection failed:', error);
    console.log('Make sure to run: npx prisma generate && npx prisma db push');
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