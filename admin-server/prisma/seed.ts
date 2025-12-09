import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
    const now = new Date();

    const user1 = await prisma.users.create({
        data: {
            id: randomUUID(),
            email: 'user1@example.com',
            raw_user_meta_data: { name: 'User One' },
            created_at: now,
            updated_at: now,
        },
    });

    const user2 = await prisma.users.create({
        data: {
            id: randomUUID(),
            email: 'user2@example.com',
            raw_user_meta_data: { name: 'User Two' },
            created_at: now,
            updated_at: now,
        },
    });

    const product1 = await prisma.products.create({
        data: {
            name: 'Product One',
            slug: 'product-one',
            price: new Prisma.Decimal('100.00'),
            description: 'Description for Product One',
            image_url: 'https://via.placeholder.com/300?text=Product+One',
        },
    });

    const product2 = await prisma.products.create({
        data: {
            name: 'Product Two',
            slug: 'product-two',
            price: new Prisma.Decimal('200.00'),
            description: 'Description for Product Two',
            image_url: 'https://via.placeholder.com/300?text=Product+Two',
        },
    });

    const order1 = await prisma.orders.create({
        data: {
            customer: { connect: { id: user1.id } },
            order_number: `FS-${Date.now()}-1`,
            total_amount: new Prisma.Decimal('100.00'),
            subtotal: new Prisma.Decimal('100.00'),
            tax_amount: new Prisma.Decimal('0'),
            shipping_amount: new Prisma.Decimal('0'),
            discount_amount: new Prisma.Decimal('0'),
            status: 'pending',
            payment_status: 'pending',
            shipping_name: 'User One',
            shipping_email: user1.email ?? 'user1@example.com',
            shipping_address_line1: '123 Orchard Road',
            shipping_city: 'New York',
            shipping_state: 'NY',
            shipping_postal_code: '10001',
            shipping_country: 'US',
            shipping_phone: '1234567890',
        },
    });

    const order2 = await prisma.orders.create({
        data: {
            customer: { connect: { id: user2.id } },
            fulfilled_by: { connect: { id: user2.id } },
            order_number: `FS-${Date.now()}-2`,
            total_amount: new Prisma.Decimal('200.00'),
            subtotal: new Prisma.Decimal('200.00'),
            tax_amount: new Prisma.Decimal('0'),
            shipping_amount: new Prisma.Decimal('0'),
            discount_amount: new Prisma.Decimal('0'),
            status: 'fulfilled',
            payment_status: 'paid',
            shipping_name: 'User Two',
            shipping_email: user2.email ?? 'user2@example.com',
            shipping_address_line1: '456 Market Street',
            shipping_city: 'San Francisco',
            shipping_state: 'CA',
            shipping_postal_code: '94105',
            shipping_country: 'US',
            shipping_phone: '9876543210',
            fulfilled_at: now,
            fulfilled_by_name: 'User Two',
            shipped_at: now,
        },
    });

    console.log({ user1, user2, product1, product2, order1, order2 });
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });