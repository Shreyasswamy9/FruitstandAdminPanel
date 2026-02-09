import { randomUUID } from 'crypto';
import { hash, compare } from 'bcryptjs';
import { prisma } from '../utils/prisma';

export const AuthService = {
    register: async (email: string, password: string) => {
        const hashedPassword = await hash(password, 10);

        return prisma.users.create({
            data: {
                id: randomUUID(),
                email,
                encrypted_password: hashedPassword,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    },

    login: async (email: string, password: string) => {
        const user = await prisma.users.findFirst({
            where: { email },
        });

        if (!user || !user.encrypted_password) {
            throw new Error('Invalid email or password');
        }

        const isValid = await compare(password, user.encrypted_password);

        if (!isValid) {
            throw new Error('Invalid email or password');
        }

        // Check if user needs to change password (recovery_token starts with TEMP_PASSWORD_)
        const requiresPasswordChange = user.recovery_token?.startsWith('TEMP_PASSWORD_') || false;

        // Update last sign in
        await prisma.users.update({
            where: { id: user.id },
            data: { 
                last_sign_in_at: new Date(),
                updated_at: new Date()
            },
        });

        return { user, requiresPasswordChange };
    },

    changePassword: async (userId: string, currentPassword: string, newPassword: string) => {
        const user = await prisma.users.findUnique({
            where: { id: userId },
        });

        if (!user || !user.encrypted_password) {
            throw new Error('User not found');
        }

        const isValid = await compare(currentPassword, user.encrypted_password);

        if (!isValid) {
            throw new Error('Current password is incorrect');
        }

        const hashedPassword = await hash(newPassword, 10);

        await prisma.users.update({
            where: { id: userId },
            data: {
                encrypted_password: hashedPassword,
                recovery_token: null, // Clear temp password flag
                updated_at: new Date(),
            },
        });
    },

    getUserById: async (userId: string) => {
        const user = await prisma.users.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new Error('User not found');
        }

        return user;
    },

    createUser: async (email: string, password: string, isTempPassword: boolean = false) => {
        const hashedPassword = await hash(password, 10);
        const userId = randomUUID();

        return prisma.users.create({
            data: {
                id: userId,
                email,
                encrypted_password: hashedPassword,
                recovery_token: isTempPassword ? `TEMP_PASSWORD_${userId}` : null,
                created_at: new Date(),
                updated_at: new Date(),
            },
        });
    },
};