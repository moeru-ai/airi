#!/usr/bin/env tsx
import { createServer } from "../server.mjs";
import process, { env, exit } from "node:process";

//#region src/bin/run.ts
const server = createServer({ port: env.PORT ? Number.parseInt(env.PORT) : 6121 });
let stopping = false;
async function shutdown() {
	if (stopping) return;
	stopping = true;
	await server.stop();
	exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.start();

//#endregion
export {  };