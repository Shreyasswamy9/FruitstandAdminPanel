import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateTheodoreEmail() {
    console.log(`📧 Updating Theodore's email...\n`);

    // Delete the old ted@fruitstandny.com user if it exists
    const oldTed = await prisma.users.findFirst({
        where: { email: 'ted@fruitstandny.com' }
    });

    if (oldTed) {
        await prisma.users.delete({
            where: { id: oldTed.id }
        });
        console.log(`✅ Deleted old ted@fruitstandny.com account`);
    }

    // Update Theodore's email
    const theodore = await prisma.users.findFirst({
        where: { email: 'theodore@fruitstandny.com' }
    });

    if (!theodore) {
        console.log(`❌ Theodore not found`);
        process.exit(1);
    }

    const updated = await prisma.users.update({
        where: { id: theodore.id },
        data: { 
            email: 'ted@fruitstand',
            updated_at: new Date()
        }
    });

    console.log(`✅ Theodore's email updated!`);
    console.log(`   New email: ${updated.email}`);
    console.log(`   User ID: ${updated.id}`);
    console.log(`\n✅ Theodore can now log in with: ted@fruitstand`);
}

updateTheodoreEmail()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
