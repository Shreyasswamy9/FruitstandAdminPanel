import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';

export const createUser = async (userData: { email: string; name?: string; phone?: string }) => {
    const data: Prisma.usersCreateInput = {
        id: randomUUID(),
        email: userData.email,
        created_at: new Date(),
        updated_at: new Date(),
    };

    if (userData.name) {
        data.raw_user_meta_data = { name: userData.name } as Prisma.InputJsonValue;
    }

    if (userData.phone) {
        data.phone = userData.phone;
    }

    return prisma.users.create({ data });
};

export const getUserById = async (id: string) => {
    return prisma.users.findUnique({
        where: { id },
    });
};

export const getAllUsers = async () => {
    return prisma.users.findMany();
};

export const updateUser = async (id: string, userData: Partial<{ email: string; name: string; phone: string }>) => {
    const data: Prisma.usersUpdateInput = {};

    if (userData.email) {
        data.email = userData.email;
    }

    if (userData.phone) {
        data.phone = userData.phone;
    }

    if (userData.name) {
        data.raw_user_meta_data = { name: userData.name } as Prisma.InputJsonValue;
    }

    return prisma.users.update({
        where: { id },
        data,
    });
};

export const deleteUser = async (id: string) => {
    return prisma.users.delete({
        where: { id },
    });
};