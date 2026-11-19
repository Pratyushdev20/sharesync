import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate, z, id } from "../middleware/validate.js";
import {
    listNotifications,
    unreadCount,
    markRead,
    markAllRead,
    deleteNotification,
    registerPushToken,
    unregisterPushToken
} from "../services/notification.service.js";

const router = Router();
router.use(authMiddleware);

const wrap = (fn) => async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await fn(req) });
    } catch (err) {
        next(err);
    }
};

const listQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    before: id.optional(),
    unread: z.enum(["true", "false"]).optional(),
});

const pushBody = z.object({
    token: z.string().trim().min(10).max(255),
    platform: z.enum(["ios", "android", "web"]).optional(),
}).strict();

// GET /api/notifications?limit=&before=&unread=true
router.get("/", validate({ query: listQuery }), wrap((req) =>
    listNotifications(req.user.uid, {
        limit: req.valid.query.limit,
        before: req.valid.query.before,
        unreadOnly: req.valid.query.unread === "true",
    })
));

// GET /api/notifications/unread-count
router.get("/unread-count", wrap(async (req) => ({ unreadCount: await unreadCount(req.user.uid) })));

// POST /api/notifications/read-all
router.post("/read-all", wrap((req) => markAllRead(req.user.uid)));

// PATCH /api/notifications/:id/read   { read?: boolean }
router.patch(
    "/:id/read",
    validate({ params: z.object({ id }), body: z.object({ read: z.boolean().optional() }).strict() }),
    wrap((req) => markRead(req.user.uid, req.params.id, req.body.read !== false))
);

// Push tokens (mobile push delivery; optional, see PUSH_ENABLED).
// Registered BEFORE "DELETE /:id" so "/push-tokens" is never treated as a notification id.
router.post("/push-tokens", validate({ body: pushBody }), wrap((req) => registerPushToken(req.user.uid, req.body.token, req.body.platform)));
router.delete(
    ["/push-tokens", "/push-tokens/:token"],
    (req, res, next) => {
        const token = req.params?.token || req.body?.token || req.query?.token;
        if (token) req.body = { token };
        next();
    },
    validate({ body: z.object({ token: z.string().max(255) }).strict() }),
    wrap((req) => unregisterPushToken(req.user.uid, req.body.token))
);

// DELETE /api/notifications/:id
router.delete("/:id", validate({ params: z.object({ id }) }), wrap((req) => deleteNotification(req.user.uid, req.params.id)));

export default router;
