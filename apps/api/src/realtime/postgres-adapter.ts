import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/postgres-adapter";
import { needsSsl } from "@sala/database";
import pg from "pg";
import type { Server, ServerOptions } from "socket.io";
import { env } from "../env.js";

/** Table the adapter parks oversized (> NOTIFY's ~8 kB) payloads in; see the `socket_io_attachments` migration. */
export const ATTACHMENTS_TABLE = "socket_io_attachments";
/** How often each machine deletes expired attachment rows (the adapter's own default is 30 s). */
export const ATTACHMENTS_CLEANUP_INTERVAL_MS = 60_000;

/** True when cross-machine broadcasts over Postgres should be set up (see `env.realtimeAdapter`). */
export function postgresAdapterEnabled(adapter: string = env.realtimeAdapter, databaseUrl: string = env.databaseUrl): boolean {
  return adapter === "postgres" && databaseUrl !== "";
}

let adapterPool: pg.Pool | null = null;

/**
 * Small dedicated pool for the adapter: LISTEN holds one connection for the process lifetime, so it
 * must not share the request pool, and it deliberately has no statement/query timeout.
 */
function createAdapterPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: needsSsl(databaseUrl) ? true : undefined,
    max: 3,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", (err) => {
    console.error(JSON.stringify({ evt: "realtime_adapter_pool_error", msg: err.message }));
  });
  // pg-pool drops its idle error listener while a client is checked out, and the adapter keeps one
  // client checked out forever for LISTEN. Without a permanent listener a dropped connection would
  // emit an unhandled 'error' and crash the process instead of letting the adapter reconnect.
  pool.on("connect", (client) => {
    client.on("error", (err) => {
      console.error(JSON.stringify({ evt: "realtime_adapter_client_error", msg: err.message }));
    });
  });
  return pool;
}

/**
 * Attaches the Postgres adapter to `io`. Never throws: on any failure it logs and leaves the
 * in-memory adapter in place (broadcasts then only reach sockets on this machine).
 */
export function attachPostgresAdapter(
  io: Pick<Server, "adapter">,
  databaseUrl: string = env.databaseUrl,
  deps: { createPool?: (url: string) => pg.Pool; createAdapter?: typeof createAdapter } = {},
): boolean {
  let pool: pg.Pool | null = null;
  try {
    pool = (deps.createPool ?? createAdapterPool)(databaseUrl);
    io.adapter((deps.createAdapter ?? createAdapter)(pool, {
        tableName: ATTACHMENTS_TABLE,
        cleanupInterval: ATTACHMENTS_CLEANUP_INTERVAL_MS,
        // The default handler only writes to `debug`, which hides NOTIFY/cleanup failures in production.
        errorHandler: (err: Error) => {
          console.error(JSON.stringify({ evt: "realtime_adapter_error", msg: err.message }));
        },
      }));
    adapterPool = pool;
    console.info(JSON.stringify({ evt: "realtime_adapter", adapter: "postgres" }));
    return true;
  } catch (err) {
    console.error(JSON.stringify({ evt: "realtime_adapter_setup_failed", msg: err instanceof Error ? err.message : String(err), fallback: "memory" }));
    pool?.end().catch(() => undefined);
    return false;
  }
}

/** Upper bound on waiting for the adapter pool to close during shutdown. */
export const ADAPTER_POOL_CLOSE_TIMEOUT_MS = 2_000;

/**
 * Closes the adapter's pool (no-op when the adapter was never attached). `pool.end()` only resolves
 * once every client is released, and the adapter holds its LISTEN client until `io.close()`; the
 * timeout keeps a still-held client from hanging shutdown until Fly hard-kills the VM.
 */
export async function closeAdapterPool(timeoutMs: number = ADAPTER_POOL_CLOSE_TIMEOUT_MS): Promise<void> {
  const pool = adapterPool;
  adapterPool = null;
  if (!pool) return;
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
    timer.unref();
  });
  const ended = pool.end().then(
    () => "ended" as const,
    (err: unknown) => {
      console.error(JSON.stringify({ evt: "realtime_adapter_close_error", msg: err instanceof Error ? err.message : String(err) }));
      return "ended" as const;
    },
  );
  const result = await Promise.race([ended, timedOut]);
  clearTimeout(timer);
  if (result === "timeout") console.warn(JSON.stringify({ evt: "realtime_adapter_close_timeout", timeoutMs }));
}

/** Nest's default Socket.IO adapter, plus the Postgres cross-machine adapter when enabled. */
export class PostgresIoAdapter extends IoAdapter {
  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (postgresAdapterEnabled()) attachPostgresAdapter(server);
    return server;
  }
}
