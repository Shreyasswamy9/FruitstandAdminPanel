import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateTheodoreEmail() {
    console.log(`📧 Updating Theodore's email to ted@fruitstandny.com...\n`);

    // Update Theodore's email from ted@fruitstand to ted@fruitstandny.com
    const theodore = await prisma.users.findFirst({
        where: { email: 'ted@fruitstand' }
    });

    if (!theodore) {
        console.log(`❌ Theodore not found`);
        process.exit(1);
    }

    const updated = await prisma.users.update({
        where: { id: theodore.id },
        data: { 
            email: 'ted@fruitstandny.com',
            updated_at: new Date()
        }
    });

    console.log(`✅ Theodore's email updated!`);
    console.log(`   Old email: ted@fruitstand`);
    console.log(`   New email: ${updated.email}`);
    console.log(`   User ID: ${updated.id}`);
    console.log(`\n✅ Theodore can now log in with: ted@fruitstandny.com`);
}

updateTheodoreEmail()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
