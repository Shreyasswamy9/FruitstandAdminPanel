import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';

const extractName = (raw: Prisma.JsonValue) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const meta = raw as Record<string, unknown>;
        const candidate = meta.name ?? meta.full_name ?? meta.fullName;
        return typeof candidate === 'string' ? candidate : null;
    }
    return null;
};

export const getUsers = async (_req: Request, res: Response) => {
    try {
        const users = await prisma.users.findMany({
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                email: true,
                phone: true,
                created_at: true,
                raw_user_meta_data: true,
            },
        });

        const payload = users.map(user => ({
            id: user.id,
            email: user.email,
            phone: user.phone,
            name: extractName(user.raw_user_meta_data),
            createdAt: user.created_at,
        }));

        res.json(payload);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

export const getUser = async (req: Request, res: Response) => {
    try {
        const user = await prisma.users.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                email: true,
                phone: true,
                created_at: true,
                raw_user_meta_data: true,
            },
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            email: user.email,
            phone: user.phone,
            name: extractName(user.raw_user_meta_data),
            createdAt: user.created_at,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { name, email, phone } = req.body as {
        name?: string;
        email?: string;
        phone?: string;
    };

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const data: Prisma.usersCreateInput = {
            id: randomUUID(),
            email,
            created_at: new Date(),
            updated_at: new Date(),
        };

        if (phone) {
            data.phone = phone;
        }

        if (name) {
            data.raw_user_meta_data = { name } as Prisma.InputJsonValue;
        }

        const newUser = await prisma.users.create({ data });
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
};