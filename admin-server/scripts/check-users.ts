import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
    console.log('🔍 Checking all users...\n');

    const users = await prisma.users.findMany();

    for (const user of users) {
        console.log(`Email: ${user.email}`);
        console.log(`ID: ${user.id}`);
        console.log(`Created: ${user.created_at}\n`);
    }
}

checkUsers()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
