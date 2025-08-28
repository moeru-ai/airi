import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types';

import WebSocket from 'crossws/websocket';

import { sleep } from '@moeru/std';

export interface ClientOptions<C = undefined> {
  url?: string;
  name: string;
  possibleEvents?: Array<keyof WebSocketEvents<C>>;
  token?: string;
  onError?: (error: unknown) => void;
  onClose?: () => void;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  // Consider adding a onReconnectAttempt callback
  onReconnectAttempt?: (attempt: number) => void;
}

export enum ReadyState {
  CONNECTING,
  OPEN,
  CLOSING,
  CLOSED,
}


export class Client<C = undefined> {
  private connected = false;
  private websocket?: WebSocket;
  private shouldClose = false;
  private reconnecting = false; // Prevent multiple reconnects
  public readyState: ReadyState = ReadyState.CLOSED;


  private readonly opts: Required<Omit<ClientOptions<C>, 'token'>> & Pick<ClientOptions<C>, 'token'>;
  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>
  >();

  constructor(options: ClientOptions<C>) {
    this.opts = {
      url: 'ws://localhost:6121/ws',
      possibleEvents: [],
      onError: () => { },
      onClose: () => { },
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      ...options,
    };

    this.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        this.tryAnnounce();
      }
      else {
        await this.retryWithExponentialBackoff(() => this.tryAuthenticate());
      }
    });

    if (this.opts.autoConnect) {
      void this.connect();
    }
  }

  private async retryWithExponentialBackoff(fn: () => void | Promise<void>) {
    if (this.reconnecting)
        return;
    this.reconnecting = true;

    const { maxReconnectAttempts } = this.opts;
    let attempts = 0;

    while (maxReconnectAttempts === -1 || attempts < maxReconnectAttempts) {
      try {
        this.opts.onReconnectAttempt?.(attempts);
        await fn();
        this.reconnecting = false;
        return;
      }
      catch (err) {
        this.opts.onError?.(err);
        console.error(`Reconnect attempt ${attempts + 1} failed:`, err); // More specific logging
        const delay = Math.min(2 ** attempts * 1000, 30_000);
        await sleep(delay);
      }
      finally {
        attempts++;
      }
    }

    console.error(`Maximum retry attempts (${maxReconnectAttempts}) reached`);
    this.reconnecting = false;
    // Consider emitting a specific "reconnectFailed" event here
  }


  private async tryReconnectWithExponentialBackoff() {
    if (this.shouldClose) {
      return;
    }
    await this.retryWithExponentialBackoff(() => this._connect());
  }

  private _connect(): Promise<void> {
    if (this.shouldClose || this.connected) {
      return Promise.resolve();
    }

    this.readyState = ReadyState.CONNECTING;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url);
      this.websocket = ws;

      ws.onerror = (event: Event) => {
        this.connected = false;
        this.readyState = ReadyState.CLOSED;
        this.opts.onError?.(event);
        console.error('WebSocket error:', event);
        reject(new Error('WebSocket error')); // More consistent error

      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        this.readyState = ReadyState.CLOSED;

        if (this.connected) {
          this.connected = false;
          this.opts.onClose?.();
        }
        if (this.opts.autoReconnect && !this.shouldClose) {
          void this.tryReconnectWithExponentialBackoff();
        }
      };

      ws.onmessage = this.handleMessageBound;

      ws.onopen = () => {
        console.log('WebSocket opened');
        this.connected = true;
        this.readyState = ReadyState.OPEN;
        this.opts.token ? this.tryAuthenticate() : this.tryAnnounce();
        resolve();
      };
    });
  }

  async connect() {
    await this.tryReconnectWithExponentialBackoff();
  }

  private tryAnnounce() {
    this.send({
      type: 'module:announce',
      data: {
        name: this.opts.name,
        possibleEvents: this.opts.possibleEvents,
      },
    });
  }

  private tryAuthenticate() {
    if (this.opts.token) {
      this.send({
        type: 'module:authenticate',
        data: { token: this.opts.token },
      });
    }
  }

  private readonly handleMessageBound = (event: MessageEvent) => {
    void this.handleMessage(event);
  };

  private async handleMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data as string) as WebSocketEvent<C>;
      const listeners = this.eventListeners.get(data.type);
      if (!listeners?.size) {
        return;
      }

      const executions: Promise<void>[] = [];
      for (const listener of listeners) {
        executions.push(Promise.resolve(listener(data as any)));
      }
      await Promise.allSettled(executions);
    } catch (err) {
      console.error('Failed to parse message:', err);
      this.opts.onError?.(err);
    }
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): void {
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.eventListeners.set(event, listeners);
    }
    listeners.add(callback as any);
  }

  offEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback?: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void,
  ): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) {
      return;
    }

    if (callback) {
      listeners.delete(callback as any);
      if (!listeners.size) {
        this.eventListeners.delete(event);
      }
    }
    else {
      this.eventListeners.delete(event);
    }
  }

  send(data: WebSocketEvent<C>): void {
    if (this.websocket && this.connected && this.readyState === ReadyState.OPEN) {
      this.websocket.send(JSON.stringify(data));
    }
    else {
      console.warn('WebSocket is not connected, message not sent');
    }
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (this.websocket && this.connected && this.readyState === ReadyState.OPEN) {
      this.websocket.send(data);
    }
    else {
      console.warn('WebSocket is not connected, raw message not sent');
    }
  }

  close(): void {
    this.shouldClose = true;
    this.readyState = ReadyState.CLOSING;
    if (this.websocket) {
      this.websocket.close();
      this.websocket.onclose = () => {
        this.connected = false;
        this.readyState = ReadyState.CLOSED;
      };
    }
  }
}
