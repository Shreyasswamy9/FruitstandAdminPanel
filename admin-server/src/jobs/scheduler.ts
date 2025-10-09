import cron from 'node-cron';
import { cleanupJob } from './cleanup.job';

// Schedule a job to run every day at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Running cleanup job...');
    cleanupJob();
});