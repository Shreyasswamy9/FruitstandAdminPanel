import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createAdminApp } from "../admin-server/src/adminApp";

const app = createAdminApp();

export default function handler(req: VercelRequest, res: VercelResponse): void {
  app(req as any, res as any);
}
