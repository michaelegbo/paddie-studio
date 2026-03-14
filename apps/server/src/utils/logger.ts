/* eslint-disable no-console */
export const logger = {
  info: (...args: any[]) => console.log('[studio]', ...args),
  warn: (...args: any[]) => console.warn('[studio]', ...args),
  error: (...args: any[]) => console.error('[studio]', ...args),
};
