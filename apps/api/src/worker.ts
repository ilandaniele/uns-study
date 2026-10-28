import type { AppDO, WorkerEnv } from "./do/app-do.js";
import { secureOriginRedirect } from "./http/secure-origin.js";

export { AppDO } from "./do/app-do.js";

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    return secureOriginRedirect(req) ?? appStub(env).fetch(req);
  },
  async scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(appStub(env).tick());
  },
} satisfies ExportedHandler<WorkerEnv>;

function appStub(env: WorkerEnv): DurableObjectStub<AppDO> {
  return env.APP.get(env.APP.idFromName("app"), { locationHint: "sam" });
}
