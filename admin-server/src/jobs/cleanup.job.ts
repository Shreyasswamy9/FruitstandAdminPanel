// This file contains a scheduled job for cleaning up old data using node-cron.

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Schedule a job to run every day at midnight
cron.schedule('0 0 * * *', async () => {
    try {
        console.log('Running cleanup job...');
        // Example cleanup logic: delete users who haven't logged in for over a year
        const result = await prisma.user.deleteMany({
            where: {
                lastLogin: {
                    lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
                },
            },
        });
        console.log(`Deleted ${result.count} inactive users.`);
    } catch (error) {
        console.error('Error running cleanup job:', error);
    } finally {
        await prisma.$disconnect();
    }
});