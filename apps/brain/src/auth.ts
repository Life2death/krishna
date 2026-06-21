import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Bearer-token gate on every HTTP request. `/health` is public; `/ws` carries
 * its token as a query param (browsers can't set headers on a WebSocket) and is
 * validated in the socket handler instead.
 */
export function authHook(token: string) {
  const expected = `Bearer ${token}`;
  const expectedBytes = Buffer.from(expected);

  return async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];
    if (path === "/health" || path === "/ws") return;

    const header = req.headers["authorization"];
    if (!header) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const headerBytes = Buffer.from(header);
    const ok =
      headerBytes.length === expectedBytes.length &&
      timingSafeEqual(headerBytes, expectedBytes);

    if (!ok) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
