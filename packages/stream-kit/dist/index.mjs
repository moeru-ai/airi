//#region src/queue.ts
function createQueue(options) {
	const queue = [];
	let drainTask;
	const internalEventListeners = {
		enqueue: [],
		dequeue: [],
		process: [],
		error: [],
		result: [],
		drain: []
	};
	const internalHandlerEventListeners = {};
	function on(eventName, listener) {
		internalEventListeners[eventName].push(listener);
	}
	function emit(eventName, ...params) {
		internalEventListeners[eventName].forEach((listener) => listener(...params));
	}
	function onHandlerEvent(eventName, listener) {
		internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || [];
		internalHandlerEventListeners[eventName].push(listener);
	}
	function emitHandlerEvent(eventName, ...params) {
		(internalHandlerEventListeners[eventName] || []).forEach((listener) => listener(...params));
	}
	function enqueue(payload) {
		queue.push(payload);
		emit("enqueue", payload, queue.length);
		if (!drainTask) drainTask = drain();
	}
	function clear() {
		queue.length = 0;
	}
	async function drain() {
		while (queue.length > 0) {
			const payload = queue.shift();
			emit("dequeue", payload, queue.length);
			for (const handler of options.handlers) {
				emit("process", payload, handler);
				try {
					emit("result", payload, await handler({
						data: payload,
						emit: emitHandlerEvent
					}), handler);
				} catch (err) {
					emit("error", payload, err, handler);
					continue;
				}
			}
		}
		emit("drain");
		drainTask = void 0;
	}
	function length() {
		return queue.length;
	}
	return {
		enqueue,
		clear,
		length,
		on,
		onHandlerEvent
	};
}

//#endregion
export { createQueue };