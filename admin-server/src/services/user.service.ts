import { PrismaClient } from '@prisma/client';
import { User } from '../types/user.types';

const prisma = new PrismaClient();

export const createUser = async (userData: User) => {
    return await prisma.user.create({
        data: userData,
    });
};

export const getUserById = async (id: number) => {
    return await prisma.user.findUnique({
        where: { id },
    });
};

export const getAllUsers = async () => {
    return await prisma.user.findMany();
};

export const updateUser = async (id: number, userData: Partial<User>) => {
    return await prisma.user.update({
        where: { id },
        data: userData,
    });
};

export const deleteUser = async (id: number) => {
    return await prisma.user.delete({
        where: { id },
    });
};