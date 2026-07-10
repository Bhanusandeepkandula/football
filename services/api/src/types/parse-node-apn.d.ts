// Minimal ambient type shim for `@parse/node-apn`, which ships no TypeScript
// declarations (see services/api/README.md — "add a small *.d.ts shim if
// needed"). Covers only the slice of the API the push worker uses
// (src/routes/push.ts): a token-based Provider and a rawPayload Notification.
declare module '@parse/node-apn' {
  export interface ApsPayload {
    event?: 'update' | 'end' | 'start';
    timestamp?: number;
    'content-state'?: unknown;
    'stale-date'?: number;
    'dismissal-date'?: number;
    alert?: string | { title?: string; subtitle?: string; body?: string };
    sound?: string | { critical?: number; name?: string; volume?: number };
    'interruption-level'?: 'passive' | 'active' | 'time-sensitive' | 'critical';
    badge?: number;
    [key: string]: unknown;
  }

  export class Notification {
    constructor(payload?: unknown);
    topic?: string;
    pushType?: string;
    priority?: number;
    expiry?: number;
    collapseId?: string;
    threadId?: string;
    id?: string;
    payload: Record<string, unknown>;
    rawPayload?: unknown;
    aps: ApsPayload;
  }

  export interface ResponseSent {
    device: string;
  }

  export interface ResponseFailure {
    device: string;
    status?: number | string;
    error?: Error;
    response?: {
      reason?: string;
      timestamp?: number | string;
    };
  }

  export interface Responses {
    sent: ResponseSent[];
    failed: ResponseFailure[];
  }

  export interface ProviderOptions {
    token: {
      key: string | Buffer;
      keyId: string;
      teamId: string;
    };
    production?: boolean;
    rejectUnauthorized?: boolean;
    connectionRetryLimit?: number;
    requestTimeout?: number;
  }

  export class Provider {
    constructor(options: ProviderOptions);
    send(notification: Notification, recipients: string | string[]): Promise<Responses>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, listener: (...args: any[]) => void): this;
    shutdown(callback?: () => void): Promise<void>;
  }
}
