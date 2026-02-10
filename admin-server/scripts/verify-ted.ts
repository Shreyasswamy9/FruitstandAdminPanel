import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';

const prisma = new PrismaClient();

async function verifyTed() {
    console.log('🔍 Verifying Ted account...\n');

    const ted = await prisma.users.findFirst({
        where: { email: 'ted@fruitstand' }
    });

    if (!ted) {
        console.log(`❌ Ted account not found`);
        process.exit(1);
    }

    console.log(`Email: ${ted.email}`);
    console.log(`ID: ${ted.id}`);
    console.log(`Has password: ${!!ted.encrypted_password}`);

    if (ted.encrypted_password) {
        try {
            const password = process.env.THEODORE_PASSWORD || '';
            const isValid = await compare(password, ted.encrypted_password);
            
            if (isValid) {
                console.log(`✅ Password works!`);
                console.log(`\n✅ Ted can log in with:`);
                console.log(`   Email: ted@fruitstand`);
                console.log(`   Password: ${password}`);
            } else {
                console.log(`❌ Password doesn't match`);
            }
        } catch (error) {
            console.log(`❌ Error verifying password:`, error);
        }
    }
}

verifyTed()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
