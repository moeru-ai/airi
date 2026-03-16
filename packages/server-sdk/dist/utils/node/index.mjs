import process from "node:process";

//#region src/utils/node/process.ts
let running = true;
function killProcess() {
	running = false;
}
process.on("SIGTERM", () => {
	killProcess();
});
process.on("SIGINT", () => {
	killProcess();
});
process.on("uncaughtException", (e) => {
	console.error(e);
	killProcess();
});
function runUntilSignal() {
	setTimeout(() => {
		if (running) runUntilSignal();
	}, 10);
}

//#endregion
export { runUntilSignal };
//# sourceMappingURL=index.mjs.map