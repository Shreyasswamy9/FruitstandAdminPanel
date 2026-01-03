import "dotenv/config";
import { createAdminApp } from "../src/adminApp";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const app = createAdminApp();

export default function handler(req: VercelRequest, res: VercelResponse): void {
  app(req, res);
}
