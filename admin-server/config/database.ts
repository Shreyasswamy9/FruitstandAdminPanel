import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

try {
  prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error', 'warn'],
  });

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} catch (error) {
  console.warn('Prisma client not initialized. Please run "npx prisma generate" first.');
  prisma = {} as PrismaClient;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  if (prisma.$disconnect) {
    await prisma.$disconnect();
  }
});

export default prisma;