import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createUser(data: any) {
  const users = (prisma as any).users ?? (prisma as any).user;
  return users.create({ data });
}

export async function getUserById(id: string) {
  const users = (prisma as any).users ?? (prisma as any).user;
  return users.findUnique({ where: { id: String(id) } });
}

export async function listUsers() {
  const users = (prisma as any).users ?? (prisma as any).user;
  return users.findMany();
}

export async function updateUser(id: string, data: any) {
  const users = (prisma as any).users ?? (prisma as any).user;
  return users.update({ where: { id: String(id) }, data });
}

export async function deleteUser(id: string) {
  const users = (prisma as any).users ?? (prisma as any).user;
  return users.delete({ where: { id: String(id) } });
}