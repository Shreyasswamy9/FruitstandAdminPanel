import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Seed Users
    const user1 = await prisma.user.create({
        data: {
            email: 'user1@example.com',
            name: 'User One',
        },
    });

    const user2 = await prisma.user.create({
        data: {
            email: 'user2@example.com',
            name: 'User Two',
        },
    });

    // Seed Products
    const product1 = await prisma.product.create({
        data: {
            name: 'Product One',
            price: 100,
            description: 'Description for Product One',
        },
    });

    const product2 = await prisma.product.create({
        data: {
            name: 'Product Two',
            price: 200,
            description: 'Description for Product Two',
        },
    });

    // Seed Orders
    await prisma.order.create({
        data: {
            userId: user1.id,
            productId: product1.id,
            quantity: 1,
        },
    });

    await prisma.order.create({
        data: {
            userId: user2.id,
            productId: product2.id,
            quantity: 2,
        },
    });

    console.log({ user1, user2, product1, product2 });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });