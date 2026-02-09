import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function setPasswords() {
    const users = [
    { email: 'austin@fruitstandny.com', password: process.env.AUSTIN_PASSWORD || '' },
    { email: 'theodore@fruitstandny.com', password: process.env.THEODORE_PASSWORD || '' },
    { email: 'chey@fruitstandny.com', password: process.env.CHEY_PASSWORD || '' },
    { email: 'shreyas@fruitstandny.com', password: process.env.SHREYAS_PASSWORD || '' },
    ];

    console.log('🔐 Setting passwords for all users...\n');

    for (const userData of users) {
        const user = await prisma.users.findFirst({
            where: { email: userData.email }
        });

        if (!user) {
            console.log(`❌ User not found: ${userData.email}`);
            continue;
        }

        const hashedPassword = await hash(userData.password, 10);

        await prisma.users.update({
            where: { id: user.id },
            data: {
                encrypted_password: hashedPassword,
                recovery_token: null, // Clear temp password flag
                updated_at: new Date(),
            }
        });

        console.log(`✅ ${userData.email}`);
        console.log(`   Password: ${userData.password}\n`);
    }

    console.log('==========================================');
    console.log('All passwords have been set successfully!');
    console.log('Login at: http://localhost:3001/login');
    console.log('==========================================');
}

setPasswords()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
