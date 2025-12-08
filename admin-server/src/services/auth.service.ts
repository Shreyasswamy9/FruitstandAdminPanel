import { PrismaClient } from '@prisma/client';
import { hash, compare } from 'bcryptjs';

const prisma = new PrismaClient();

export const AuthService = {
    register: async (email: string, password: string) => {
        const hashedPassword = await hash(password, 10);
        const usersDelegate = (prisma as any).users ?? (prisma as any).user;
        return await usersDelegate.create({
            data: {
                email,
                password: hashedPassword,
                // Prisma requires `name` — default to local-part of email when not provided
                name: String(email).split('@')[0] ?? 'User',
            },
        });
    },

    login: async (email: string, password: string) => {
        const usersDelegate = (prisma as any).users ?? (prisma as any).user;
        const user = await usersDelegate.findUnique({
            where: { email },
        });
        if (!user) {
            throw new Error('User not found');
        }
        const isValid = await compare(password, user.password);
        if (!isValid) {
            throw new Error('Invalid password');
        }
        return user;
    },
};