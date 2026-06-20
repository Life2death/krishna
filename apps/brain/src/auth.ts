import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Bearer-token gate on every HTTP request. `/health` is public; `/ws` carries
 * its token as a query param (browsers can't set headers on a WebSocket) and is
 * validated in the socket handler instead.
 */
export function authHook(token: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];
    if (path === "/health" || path === "/ws") return;
    if (req.headers["authorization"] !== `Bearer ${token}`) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  };
}
