import "dotenv/config";
import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocket } from "./ws";
import { startBookingSweeper } from "./lib/bookingSweeper";

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
setupWebSocket(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
  startBookingSweeper();
  logger.info("bookingSweeper started (5-min no-show cancel, 1-min interval)");
});

