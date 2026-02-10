import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';

const prisma = new PrismaClient();

async function verifyAccounts() {
    const users = [
        { email: 'austin@fruitstandny.com', password: process.env.AUSTIN_PASSWORD || '' },
        { email: 'theodore@fruitstandny.com', password: process.env.THEODORE_PASSWORD || '' },
        { email: 'chey@fruitstandny.com', password: process.env.CHEY_PASSWORD || '' },
        { email: 'shreyas@fruitstandny.com', password: process.env.SHREYAS_PASSWORD || '' },
    ];

    console.log('🔍 Verifying all user accounts...\n');

    for (const userData of users) {
        const user = await prisma.users.findFirst({
            where: { email: userData.email }
        });

        if (!user) {
            console.log(`❌ ${userData.email}: User not found in database`);
            continue;
        }

        if (!user.encrypted_password) {
            console.log(`❌ ${userData.email}: No password hash set`);
            continue;
        }

        try {
            const isValid = await compare(userData.password, user.encrypted_password);
            if (isValid) {
                console.log(`✅ ${userData.email}: Account verified - password works`);
                console.log(`   Created: ${user.created_at}`);
                console.log(`   Last Sign In: ${user.last_sign_in_at}`);
            } else {
                console.log(`❌ ${userData.email}: Password mismatch - credentials don't work`);
            }
        } catch (error) {
            console.log(`❌ ${userData.email}: Error verifying password`);
        }
    }

    console.log('\n==========================================');
}

verifyAccounts()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
