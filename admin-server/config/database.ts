import { PrismaClient } from '@prisma/client';
import debugLib from 'debug';
import { execSync } from 'child_process';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'shreyas@fruitstandny.com';

function resolveUsersDelegate() {
	return (prisma as any)?.users ?? (prisma as any)?.user ?? null;
}

// Create default admin user
async function createDefaultUser(isRetry = false): Promise<void> {
	try {
		const users = resolveUsersDelegate();
		if (!users) return;

		const existingUser = await users.findFirst({ where: { email: DEFAULT_ADMIN_EMAIL } });
		if (!existingUser) {
			await users.create({
				data: {
					id: uuidv4(),
					email: DEFAULT_ADMIN_EMAIL,
					name: 'Admin'
				}
			});
			debug('Default admin user created');
		} else {
			console.log('ℹ️  Admin user already exists');
		}
	} catch (err: any) {
		const code = err?.code || err?.meta?.code;
		const msg = String(err?.message || '');
		if (!isRetry && (code === 'P2021' || /does not exist/i.test(msg))) {
			console.warn('Database schema not found (tables missing). Attempting to run `npx prisma db push` to create tables...');
			try {
				const cwd = path.resolve(__dirname, '..');
				execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', cwd });
				console.log('`prisma db push` completed. Retrying default user creation...');
				await createDefaultUser(true);
			} catch (pushErr: any) {
				console.warn('Automatic `prisma db push` failed or not available. Please run manually: `npx prisma db push`', pushErr?.message || pushErr);
			}
			return;
		}
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