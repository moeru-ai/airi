import { defineGamelet, defineToolset } from "@proj-airi/plugin-sdk-tamagotchi";
import * as v from "valibot";
//#region src/tools/chessTools.ts
/** Gamelet the tools forward requests to; must match the id in {@link ../index}. */
const GAMELET_ID$1 = "chess";
/** Search depth bounds keep LLM-triggered analysis responsive in the browser. */
const MIN_DEPTH = 1;
const MAX_DEPTH = 20;
/** MultiPV bounds prevent huge candidate-line requests from monopolising Stockfish. */
const MIN_MULTIPV = 1;
const MAX_MULTIPV = 5;
/** Input schema for the `analyze_position` tool. */
const analyzePositionInput = v.object({
	fen: v.string(),
	depth: v.optional(v.number()),
	multipv: v.optional(v.number())
});
/** Input schema for the `explain_move` tool. */
const explainMoveInput = v.object({
	fenBefore: v.string(),
	moveUci: v.string()
});
function boundedInteger(value, min, max, label) {
	if (value === void 0) return void 0;
	if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
	if (value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
	return value;
}
/**
* The coach's LLM-callable chess tools.
*
* Each tool is a thin forwarder: the real engine work runs inside the chess
* gamelet (which owns the Stockfish worker and the board), so `execute` parses
* its input and relays a request to the gamelet via `ctx.gamelets.request`.
* The tools are only offered while the chess gamelet is open.
*/
const chessTools = [{
	id: "analyze_position",
	title: "Analyze chess position",
	description: "Runs the chess engine on a position and returns the best move, evaluation, and candidate lines. Call this before commenting on a position.",
	inputSchema: analyzePositionInput,
	isAvailable: (ctx) => ctx.gamelets.isOpen(GAMELET_ID$1),
	execute: async (input, ctx) => {
		const { fen, depth, multipv } = v.parse(analyzePositionInput, input);
		const safeDepth = boundedInteger(depth, MIN_DEPTH, MAX_DEPTH, "depth");
		const safeMultipv = boundedInteger(multipv, MIN_MULTIPV, MAX_MULTIPV, "multipv");
		return ctx.gamelets.request(GAMELET_ID$1, {
			type: "analyze_position",
			fen,
			...safeDepth === void 0 ? {} : { depth: safeDepth },
			...safeMultipv === void 0 ? {} : { multipv: safeMultipv }
		});
	}
}, {
	id: "explain_move",
	title: "Explain a played move",
	description: "Compares a played move against the engine's best move and returns its classification (brilliant, blunder, ...) and centipawn loss. Call this to evaluate a move before commenting on it.",
	inputSchema: explainMoveInput,
	isAvailable: (ctx) => ctx.gamelets.isOpen(GAMELET_ID$1),
	execute: async (input, ctx) => {
		const { fenBefore, moveUci } = v.parse(explainMoveInput, input);
		return ctx.gamelets.request(GAMELET_ID$1, {
			type: "explain_move",
			fenBefore,
			moveUci
		});
	}
}];
//#endregion
//#region src/index.ts
/**
* Stable gamelet identifier. The board UI is registered under this id and the
* coach tools address the same gamelet through it.
*/
const GAMELET_ID = "chess";
/** Plugin lifecycle hook — no eager work is needed before the host APIs exist. */
async function init() {}
/** Plugin lifecycle hook — the chess plugin has no host-configurable settings yet. */
async function configure() {}
/**
* Registers the chess gamelet UI and the coach's analysis tools, then opens the
* board.
*
* Use when:
* - The plugin host reaches the module-setup lifecycle phase
*
* Expects:
* - `apis` exposes the stage-tamagotchi gamelet kit and the tool registry
*/
async function setupModules({ apis }) {
	try {
		await defineGamelet({ apis }, {
			id: GAMELET_ID,
			title: "Chess",
			entrypoint: "./ui/index.html",
			widgets: [{
				id: "main-board",
				kind: "primary"
			}]
		});
		await defineToolset({ apis }, { tools: chessTools });
		await apis.gamelets?.open(GAMELET_ID);
	} catch (error) {
		console.error("[airi-plugin-game-chess] setupModules failed:", error);
		throw error;
	}
}
//#endregion
export { configure, init, setupModules };
