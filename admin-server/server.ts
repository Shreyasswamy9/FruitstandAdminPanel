import "dotenv/config";
import { createServer } from "net";
import { createAdminApp } from "./src/adminApp";

const app = createAdminApp();

function findAvailablePort(startPort = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on("error", (error) => {
      server.close(() => {
        if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
          findAvailablePort(startPort + 1).then(resolve).catch(reject);
        } else {
          reject(error);
        }
      });
    });
  });
}

if (require.main === module) {
  findAvailablePort()
    .then((port) => {
      app.listen(port, "0.0.0.0", () => console.log(`Server http://localhost:${port}`));
    })
    .catch((err) => console.error("Port error", err));
}

export default app;
export { createAdminApp };
