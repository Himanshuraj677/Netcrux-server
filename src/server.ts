import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import jwt, { JwtPayload } from "jsonwebtoken";

dotenv.config();

interface TunnelSocket extends Socket {
  tunnelName?: string;
  user?: JwtPayload;
}

const app = express();

app.use("/api", express.json(), authRouter);

const server = http.createServer(app);
const io = new Server<TunnelSocket>(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7, // 10 MB
});

const PORT = process.env.PORT || 8090;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || "tunnel.hcodes.tech";

// Mappings
const clients = new Map<string, TunnelSocket>();
const pendingRequests = new Map<
  string,
  { resolve: (data: any) => void }
>();

io.use((socket: TunnelSocket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.log("Auth token missing");
    return next(new Error("AUTHTOKEN_MISSING"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
    socket.user = decoded;
    next();
  } catch {
    next(new Error("AUTHTOKEN_INVALID"));
  }
});

io.on("connection", (socket: TunnelSocket) => {
  console.log(`${socket.user?.email} connected via ${socket.id}`);

  socket.on("register", ({ name }: { name?: string }) => {
    const assigned = name || uuidv4().slice(0, 8);
    clients.set(assigned, socket);
    socket.tunnelName = assigned;

    console.log(`Client registered as ${assigned}`);

    socket.emit("registered", {
      assigned,
      url: `https://${assigned}.${ROOT_DOMAIN}`,
    });
  });

  socket.on("disconnect", () => {
    if (socket.tunnelName) {
      console.log(`${socket.user?.email} disconnected`);
      clients.delete(socket.tunnelName);
    }
  });

  socket.on(
    "response",
    (msg: { id: string; statusCode: number; headers: any; bodyB64: string }) => {
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pending.resolve(msg);
      pendingRequests.delete(msg.id);
    }
  );
});

// Middleware to read any body as raw bytes
app.use(express.raw({ type: "*/*", limit: "10mb" }));

// ⚠️ FIXED ROUTE GLOB (Express uses * not { })
app.all("{*any}", async (req: Request, res: Response) => {
  const host = req.headers.host || "";
  const subdomain = host.replace(`.${ROOT_DOMAIN}`, "");

  if (!subdomain || subdomain === ROOT_DOMAIN) {
    return res.status(200).send("Tunnel service is running 🚀");
  }

  const socket = clients.get(subdomain);
  if (!socket) {
    return res.status(502).send(`No active tunnel for ${subdomain}`);
  }

  const id = uuidv4();
  const path = req.originalUrl;

  const payload = {
    id,
    method: req.method,
    path,
    headers: req.headers,
    bodyB64:
      req.body && (req.body as Buffer).length
        ? Buffer.from(req.body as Buffer).toString("base64")
        : null,
  };

  const promise = new Promise<{ statusCode: number; headers: any; bodyB64: string }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error("Timeout waiting for client response"));
      }, 30_000);

      pendingRequests.set(id, {
        resolve: (resp) => {
          clearTimeout(timeout);
          resolve(resp);
        },
      });
    }
  );

  socket.emit("request", payload);

  try {
    let { statusCode, headers, bodyB64 } = await promise;

    // Redirect URL rewriting
    if (headers?.location) {
      try {
        const loc = new URL(headers.location, `http://${subdomain}.${ROOT_DOMAIN}`);
        if (
          loc.hostname === "localhost" ||
          loc.hostname.startsWith("127.") ||
          loc.hostname === "::1"
        ) {
          loc.hostname = `${subdomain}.${ROOT_DOMAIN}`;
          loc.protocol = "https:";
          headers.location = loc.toString();
          console.log(`Redirect rewritten for ${subdomain}: ${headers.location}`);
        }
      } catch (err: any) {
        console.warn("Redirect rewrite failed:", err.message);
      }
    }

    // Cookie domain rewrite
    if (headers?.["set-cookie"]) {
      let cookies = headers["set-cookie"];
      if (!Array.isArray(cookies)) cookies = [cookies];
      headers["set-cookie"] = cookies.map((cookie: string) =>
        /Domain=localhost/i.test(cookie)
          ? cookie.replace(/Domain=localhost/i, `Domain=${subdomain}.${ROOT_DOMAIN}`)
          : cookie
      );
      console.log(`Cookie domain fixed for ${subdomain}`);
    }

    // HTML rewrite
    if (bodyB64 && headers["content-type"]?.includes("text/html")) {
      let html = Buffer.from(bodyB64, "base64").toString("utf8");
      html = html.replace(
        /http:\/\/localhost:\d+/g,
        `https://${subdomain}.${ROOT_DOMAIN}`
      );
      bodyB64 = Buffer.from(html).toString("base64");
      console.log(`Rewrote HTML for ${subdomain}`);
    }

    // Forward headers
    for (const [k, v] of Object.entries(headers || {})) {
      if (["transfer-encoding", "connection"].includes(k.toLowerCase())) continue;
      res.setHeader(k, v as string);
    }

    res.status(statusCode || 200);
    if (bodyB64) {
      res.send(Buffer.from(bodyB64, "base64"));
    } else {
      res.send();
    }
  } catch (err: any) {
    console.error("Routing error:", err.message);
    res.status(504).send("Gateway Timeout");
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Tunnel server listening on port ${PORT}`);
  console.log(`🌐 Root domain: ${ROOT_DOMAIN}`);
});
