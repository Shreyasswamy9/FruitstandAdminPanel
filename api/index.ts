import { createAdminApp } from "../admin-server/src/adminApp";

const app = createAdminApp();

export default function handler(req: any, res: any): void {
  app(req, res);
}
