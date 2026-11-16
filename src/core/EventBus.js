/**
 * Synchronous & Async EventBus with Inspectable Ring Buffer (`F-CORE-04`)
 * Decouples pure Game Engines from View / Audio / VFX controllers.
 */

function nowTimestamp() {
  return Math.round(globalThis.performance ? globalThis.performance.now() : Date.now());
}

export class EventBus {
  constructor(options = {}) {
    this.maxLogSize = Math.max(10, Number(options.maxLogSize) || 500);
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
    /** @type {Array<{ event: string, type: string, payload: any, timestamp: number }>} */
    this.log = [];
  }

  /**
   * Registers an event listener and returns an unsubscribe function.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function}
   */
  on(event, handler) {
    if (typeof event !== 'string' || !event || typeof handler !== 'function') {
      return () => {};
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Registers a one-time event listener.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function}
   */
  once(event, handler) {
    if (typeof event !== 'string' || !event || typeof handler !== 'function') {
      return () => {};
    }
    const wrapper = (payload, meta) => {
      this.off(event, wrapper);
      return handler(payload, meta);
    };
    return this.on(event, wrapper);
  }

  /**
   * Unregisters a specific listener (or all listeners for `event` if `handler` omitted).
   * @param {string} event
   * @param {Function} [handler]
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;
    if (!handler) {
      this.listeners.delete(event);
      return;
    }
    const set = this.listeners.get(event);
    set.delete(handler);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Emits an event synchronously, records to the ring buffer, and invokes all listeners.
   * @param {string} event
   * @param {any} [payload={}]
   */
  emit(event, payload = {}) {
    if (typeof event !== 'string' || !event) return null;
    const entry = {
      event,
      type: event,
      payload,
      timestamp: nowTimestamp(),
    };
    this.log.push(entry);
    if (this.log.length > this.maxLogSize) {
      this.log.shift();
    }

    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const fn of [...handlers]) {
        try {
          fn(payload, entry);
        } catch (_err) {
          // Isolate listener errors so one faulty UI subscriber never breaks engine settlement
        }
      }
    }

    const wildcardHandlers = this.listeners.get('*');
    if (wildcardHandlers && event !== '*') {
      for (const fn of [...wildcardHandlers]) {
        try {
          fn(payload, entry);
        } catch (_err) {
          // Ignore
        }
      }
    }

    return entry;
  }

  /**
   * Emits an event asynchronously and awaits all listener promises.
   * @param {string} event
   * @param {any} [payload={}]
   */
  async emitAsync(event, payload = {}) {
    if (typeof event !== 'string' || !event) return null;
    const entry = {
      event,
      type: event,
      payload,
      timestamp: nowTimestamp(),
    };
    this.log.push(entry);
    if (this.log.length > this.maxLogSize) {
      this.log.shift();
    }

    const handlers = [...(this.listeners.get(event) || []), ...(this.listeners.get('*') || [])];
    for (const fn of handlers) {
      await fn(payload, entry);
    }
    return entry;
  }

  /**
   * Returns a shallow copy of the event log (optionally filtered by event name).
   * @param {string|null} [eventFilter=null]
   */
  getLog(eventFilter = null) {
    if (eventFilter) {
      return this.log.filter((item) => item.event === eventFilter);
    }
    return [...this.log];
  }

  /**
   * Returns all logged events and clears the internal ring buffer.
   */
  drainLog() {
    const drained = [...this.log];
    this.log.length = 0;
    return drained;
  }

  /**
   * Clears the event log.
   */
  clearLog() {
    this.log.length = 0;
  }
}

export function createEventBus(options = {}) {
  return new EventBus(options);
}

export default EventBus;
