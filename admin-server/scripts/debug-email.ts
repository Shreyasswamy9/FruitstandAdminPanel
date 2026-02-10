import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugEmail() {
    console.log('🔍 Debugging email search...\n');

    // Try different variations
    const searches = [
        { email: 'ted@fruitstand' },
        { email: { mode: 'insensitive' as const, equals: 'ted@fruitstand' } },
    ];

    for (const where of searches) {
        const result = await prisma.users.findFirst({ where: where as any });
        console.log(`Search: ${JSON.stringify(where)}`);
        console.log(`Result: ${result ? result.email : 'NOT FOUND'}\n`);
    }

    // List all ted/theodore emails
    console.log('All Theodore/Ted related emails:');
    const allUsers = await prisma.users.findMany({
        where: {
            OR: [
                { email: { contains: 'ted' } },
                { email: { contains: 'theodore' } }
            ]
        }
    });

    allUsers.forEach(u => {
        console.log(`  - ${u.email} (ID: ${u.id})`);
    });
}

debugEmail()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
