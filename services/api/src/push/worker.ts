// The push worker + APNs sender + Live-Activity mapping all live in
// `src/routes/push.ts` (it owns both the HTTP `registerPush(app)` surface and
// the background `startPushWorker()` that rides the live hub). This module is
// the seam `server.ts` imports; it simply re-exports the real implementation so
// the bootstrap doesn't need to know where it lives.
export { startPushWorker } from '../routes/push.js';
