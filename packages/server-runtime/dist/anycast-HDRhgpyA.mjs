import { env } from "node:process";

//#region package.json
var version = "0.9.0-alpha.16";

//#endregion
//#region src/config/env.ts
function fromEnv(envKey, envDefault, options) {
	const value = env[envKey] ?? envDefault;
	if (value === void 0) return;
	if (options?.validator) if (options.validator(value)) return value;
	else return;
	return value;
}

//#endregion
//#region src/config/config.ts
function optionOrEnv(option, envKey, envDefault, options) {
	if (option !== void 0) return option;
	return fromEnv(envKey, envDefault, options);
}

//#endregion
//#region src/middlewares/route/match-expression.ts
function globToRegExp(glob) {
	const pattern = `^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`;
	return new RegExp(pattern);
}
function matchesGlob(glob, value) {
	if (!value) return false;
	return globToRegExp(glob).test(value);
}
function matchesLabelSelector(selector, labels) {
	const [key, value] = selector.split("=", 2);
	if (!key) return false;
	if (typeof value === "undefined") return key in labels;
	return labels[key] === value;
}
function matchesLabelSelectors(selectors, labels) {
	return selectors.every((selector) => matchesLabelSelector(selector, labels));
}
function getPeerLabels$1(peer) {
	return {
		...peer.identity?.plugin?.labels,
		...peer.identity?.labels
	};
}
function matchesRouteExpression(expression, peer) {
	switch (expression.type) {
		case "and": return expression.all.every((expr) => matchesRouteExpression(expr, peer));
		case "or": return expression.any.some((expr) => matchesRouteExpression(expr, peer));
		case "glob": {
			const pluginId = peer.identity?.plugin?.id;
			const matched = matchesGlob(expression.glob, peer.name) || matchesGlob(expression.glob, pluginId) || matchesGlob(expression.glob, peer.identity?.id);
			return expression.inverted ? !matched : matched;
		}
		case "ids": {
			const matched = expression.ids.includes(peer.peer.id);
			return expression.inverted ? !matched : matched;
		}
		case "plugin": {
			const matched = expression.plugins.includes(peer.identity?.plugin?.id ?? "");
			return expression.inverted ? !matched : matched;
		}
		case "instance": {
			const matched = expression.instances.includes(peer.identity?.id ?? "");
			return expression.inverted ? !matched : matched;
		}
		case "label": {
			const matched = matchesLabelSelectors(expression.selectors, getPeerLabels$1(peer));
			return expression.inverted ? !matched : matched;
		}
		case "module": {
			const matched = expression.modules.includes(peer.name);
			return expression.inverted ? !matched : matched;
		}
		case "source": {
			const matched = expression.sources.includes(peer.name);
			return expression.inverted ? !matched : matched;
		}
		default: return false;
	}
}
function matchesDestination(destination, peer) {
	if (typeof destination !== "string") return matchesRouteExpression(destination, peer);
	if (destination === "*") return true;
	const [prefix, rawValue] = destination.split(":", 2);
	const value = rawValue ?? "";
	switch (prefix) {
		case "plugin": return peer.identity?.plugin?.id === value;
		case "instance": return peer.identity?.id === value;
		case "label": return matchesLabelSelectors([value], getPeerLabels$1(peer));
		case "peer": return peer.peer.id === value;
		case "module": return peer.name === value;
		case "source": return peer.name === value;
		default: {
			const pluginId = peer.identity?.plugin?.id;
			return matchesGlob(destination, peer.name) || matchesGlob(destination, pluginId) || matchesGlob(destination, peer.identity?.id);
		}
	}
}
function matchesDestinations(destinations, peer) {
	return destinations.some((destination) => matchesDestination(destination, peer));
}

//#endregion
//#region src/middlewares/route.ts
function getPeerLabels(peer) {
	return {
		...peer.identity?.plugin?.labels,
		...peer.identity?.labels
	};
}
function isDevtoolsPeer(peer) {
	const devtoolsLabel = getPeerLabels(peer).devtools;
	const isDevtoolsLabel = devtoolsLabel === "true" || devtoolsLabel === "1";
	return Boolean(isDevtoolsLabel || peer.name.includes("devtools"));
}
function peerMatchesPolicy(peer, policy) {
	const pluginId = peer.identity?.plugin?.id ?? "";
	if (policy.allowPlugins?.length && !policy.allowPlugins.includes(pluginId)) return false;
	if (policy.denyPlugins?.length && policy.denyPlugins.includes(pluginId)) return false;
	const labels = getPeerLabels(peer);
	if (policy.allowLabels?.length && !matchesLabelSelectors(policy.allowLabels, labels)) return false;
	if (policy.denyLabels?.length && matchesLabelSelectors(policy.denyLabels, labels)) return false;
	return true;
}
function createPolicyMiddleware(policy) {
	return ({ event, peers }) => {
		if (event.route?.bypass) return;
		const targetIds = /* @__PURE__ */ new Set();
		for (const [id, peer] of peers.entries()) if (peerMatchesPolicy(peer, policy)) targetIds.add(id);
		return {
			type: "targets",
			targetIds
		};
	};
}
function collectDestinations(event) {
	if (event.route?.destinations !== void 0) return event.route.destinations;
	const data = event.data;
	if (data?.destinations?.length) return data.destinations;
}

//#endregion
//#region src/middlewares/anycast.ts
function fnv1aHash(input) {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
function createAnycastMiddleware() {
	return ({ event, fromPeer, peers, destinations }) => {
		if (event.route?.bypass) return;
		if (event.route?.strategy !== "anycast") return;
		const candidates = Array.from(peers.entries()).filter(([id, peer]) => {
			if (id === fromPeer.peer.id) return false;
			if (!peer.authenticated) return false;
			if (peer.healthy === false) return false;
			if (destinations && destinations.length > 0) return matchesDestinations(destinations, peer);
			return true;
		}).sort(([a], [b]) => a.localeCompare(b));
		if (candidates.length === 0) return;
		const [selectedId] = candidates[fnv1aHash(event.metadata?.event?.id ?? `${event.type}`) % candidates.length];
		return {
			type: "targets",
			targetIds: new Set([selectedId])
		};
	};
}

//#endregion
export { matchesDestinations as a, isDevtoolsPeer as i, collectDestinations as n, optionOrEnv as o, createPolicyMiddleware as r, version as s, createAnycastMiddleware as t };