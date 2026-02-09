import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const now = new Date();

    // Admin users with temporary passwords
    const adminUsers = [
        { 
            email: 'austin@fruitstandny.com', 
            name: 'Austin',
                tempPassword: process.env.AUSTIN_PASSWORD || 'ChangeMe123!' 
        },
        { 
            email: 'theodore@fruitstandny.com', 
            name: 'Theodore',
                tempPassword: process.env.THEODORE_PASSWORD || 'ChangeMe123!' 
        },
        { 
            email: 'chey@fruitstandny.com', 
            name: 'Chey',
                tempPassword: process.env.CHEY_PASSWORD || 'ChangeMe123!' 
        },
        { 
            email: 'shreyas@fruitstandny.com', 
            name: 'Shreyas',
                tempPassword: process.env.SHREYAS_PASSWORD || 'ChangeMe123!' 
        },
    ];

    console.log('🌱 Seeding admin users...\n');

    for (const userData of adminUsers) {
        const existingUser = await prisma.users.findFirst({
            where: { email: userData.email }
        });

        const hashedPassword = await hash(userData.tempPassword, 10);

        if (existingUser) {
            // Update existing user with temp password
            await prisma.users.update({
                where: { id: existingUser.id },
                data: {
                    encrypted_password: hashedPassword,
                    recovery_token: `TEMP_PASSWORD_${existingUser.id}`, // Unique flag per user
                    raw_user_meta_data: { name: userData.name },
                    updated_at: now,
                }
            });
            console.log(`✅ Updated user: ${userData.name} (${userData.email})`);
            console.log(`   Temporary password: ${userData.tempPassword}\n`);
            continue;
        }

        const newUserId = randomUUID();
        await prisma.users.create({
            data: {
                id: newUserId,
                email: userData.email,
                encrypted_password: hashedPassword,
                recovery_token: `TEMP_PASSWORD_${newUserId}`, // Unique flag per user
                raw_user_meta_data: { name: userData.name },
                email_confirmed_at: now,
                created_at: now,
                updated_at: now,
            },
        });

        console.log(`✅ Created user: ${userData.name} (${userData.email})`);
        console.log(`   Temporary password: ${userData.tempPassword}\n`);
    }

    console.log('✨ Seeding complete!\n');
    console.log('📝 Please provide these temporary passwords to the users.');
    console.log('   They will be required to change their password on first login.\n');
}

main()
    .catch((e) => {
        console.error('Error seeding admin users:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
