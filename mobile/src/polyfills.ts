// Hermes (the JS engine bundled with React Native) doesn't ship DOMException,
// but @microsoft/signalr references it during construction. Provide a minimal
// shim before signalr is required so it doesn't crash at module-init time.

if (typeof (globalThis as any).DOMException === 'undefined') {
  class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'DOMException';
    }
  }
  (globalThis as any).DOMException = DOMException;
}

export {};
