import { PrismaClient } from '@prisma/client';
import { compare } from 'bcryptjs';

const prisma = new PrismaClient();

async function testLogin() {
    const email = 'ted@fruitstand';
    const password = 'Theodore2024!';

    console.log(`🔐 Testing login...\n`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}\n`);

    const user = await prisma.users.findFirst({
        where: { email },
    });

    if (!user) {
        console.log(`❌ User not found with email: ${email}`);
        console.log(`\nAvailable emails:`);
        const allUsers = await prisma.users.findMany({
            where: { email: { contains: 'ted' } }
        });
        allUsers.forEach(u => console.log(`  - ${u.email}`));
        process.exit(1);
    }

    console.log(`✅ User found`);
    console.log(`   ID: ${user.id}`);

    if (!user.encrypted_password) {
        console.log(`❌ User has no password hash`);
        process.exit(1);
    }

    const isValid = await compare(password, user.encrypted_password);

    if (!isValid) {
        console.log(`❌ Password is incorrect`);
        process.exit(1);
    }

    console.log(`✅ Password is correct!`);
    console.log(`\n✅ Login should work with:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
}

testLogin()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
