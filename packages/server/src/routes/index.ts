// Corral API Routes — Mount these alongside Better Auth
// These power: checkout, billing portal, webhooks, device auth, usage, config
//
// Express: app.use("/api/corral", corralRoutes(auth, config))
// Hono:    app.route("/api/corral", corralRoutes(auth, config))
// Next.js: export { handler as GET, handler as POST } in [...corral]/route.ts

export { createCorralRoutes } from './corral-router.js';
export { createWebhookHandler } from '../stripe/webhook.js';
