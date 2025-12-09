// This file contains a scheduled job for cleaning up old data using node-cron.

import cron from 'node-cron';
import { prisma } from '../utils/prisma';

const INACTIVITY_THRESHOLD_DAYS = 365;

export const scheduleCleanupJob = () => {
    return cron.schedule('0 0 * * *', async () => {
        try {
            console.log('Running cleanup job...');

            const cutoff = new Date(Date.now() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

            const result = await prisma.users.deleteMany({
                where: {
                    last_sign_in_at: {
                        lt: cutoff,
                    },
                },
            });

            console.log(`Deleted ${result.count} inactive users.`);
        } catch (error) {
            console.error('Error running cleanup job:', error);
        }
    });
};