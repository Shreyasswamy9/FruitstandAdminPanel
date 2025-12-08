import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getUsers = async (req: Request, res: Response) => {
    try {
        // resolve delegate (plural or singular) to avoid TS delegate-name issues
        const usersDelegate = (prisma as any).users ?? (prisma as any).user;
        const users = await usersDelegate.findMany();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

export const createUser = async (req: Request, res: Response) => {
    const { name, email } = req.body;
    try {
        const usersDelegate = (prisma as any).users ?? (prisma as any).user;
        const newUser = await usersDelegate.create({
            data: {
                name: req.body.name,
                email: req.body.email,
                password: typeof req.body.password === 'string' && req.body.password.length ? req.body.password : 'changeme',
            },
        });
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create user' });
    }
};