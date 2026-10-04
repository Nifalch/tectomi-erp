import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()).filter(Boolean) ?? "*";

@WebSocketGateway({
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server;

  notifyUser(userId: string, payload: unknown) {
    this.server.to(userId).emit("notification", payload);
  }
}
