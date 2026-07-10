import { pino } from 'pino';
import { env } from '../config/env.js';

// Single process-wide structured logger. In dev you can pipe stdout through
// `pino-pretty` (not a runtime dep) for readable output:
//   pnpm dev | npx pino-pretty
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: '@matchcenter/api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

/** Namespaced child logger, e.g. `log('fastcast')`. */
export function log(scope: string): Logger {
  return logger.child({ scope });
}
