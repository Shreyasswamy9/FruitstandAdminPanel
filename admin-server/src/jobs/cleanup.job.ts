// This file contains a scheduled job for cleaning up old data using node-cron.

import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Schedule a job to run every day at midnight
export const cleanupJob = async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
  try {
    await prisma.user.deleteMany({
      where: {
        // lastLogin doesn't exist; use updatedAt or createdAt instead
        updatedAt: { lt: cutoff as any }
      }
    });
  } catch (e) {
    console.error('cleanupJob error', e);
  } finally {
    await prisma.$disconnect();
  }
};