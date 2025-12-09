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
            throw new Error('User not found');
        }

        const isValid = await compare(password, user.encrypted_password);

        if (!isValid) {
            throw new Error('Invalid password');
        }

        return user;
    },
};