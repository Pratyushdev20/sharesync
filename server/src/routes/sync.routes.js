import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate, z, id } from "../middleware/validate.js";
import { getChanges, getCursor, registerDevice, listDevices, removeDevice } from "../services/sync.service.js";
import { listResourceActivity, listMyActivity } from "../services/activity.service.js";

const router = Router();
router.use(authMiddleware);

const wrap = (fn) => async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await fn(req) });
    } catch (err) {
        next(err);
    }
};

const cursor = z.union([z.string(), z.number()]).transform((v) => String(v).trim())
    .refine((v) => /^\d{1,18}$/.test(v), { message: "must be a numeric cursor" });
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "invalid device id");

// GET /api/sync/cursor  -> latest event id for this user
router.get("/cursor", wrap(async (req) => ({ cursor: await getCursor(req.user.uid) })));

// GET /api/sync/changes?since=<cursor>&limit=
router.get(
    "/changes",
    validate({ query: z.object({ since: cursor.optional(), limit: z.coerce.number().int().min(1).max(500).optional() }) }),
    wrap((req) => getChanges(req.user.uid, { since: req.valid.query.since ?? "0", limit: req.valid.query.limit }))
);

// Devices
router.get("/devices", wrap((req) => listDevices(req.user.uid)));
router.post(
    "/devices",
    validate({
        body: z.object({
            deviceId,
            platform: z.enum(["ios", "android", "web", "windows", "macos"]).optional(),
            deviceName: z.string().trim().max(100).optional(),
            cursor: cursor.optional(),
        }).strict(),
    }),
    wrap((req) => registerDevice(req.user.uid, req.body))
);
router.delete("/devices/:deviceId", validate({ params: z.object({ deviceId }) }), wrap((req) => removeDevice(req.user.uid, req.params.deviceId)));

// Activity history
router.get("/activity", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) }),
    wrap((req) => listMyActivity(req.user.uid, req.valid.query)));
router.get(
    "/activity/:type/:id",
    validate({
        params: z.object({ type: z.enum(["file", "folder", "note"]), id }),
        query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
    }),
    wrap((req) => listResourceActivity(req.user.uid, req.params.type, req.params.id, req.valid.query))
);

export default router;
