import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { shareCreateLimiter } from "../middleware/security.js";
import { validate, z, id } from "../middleware/validate.js";
import {
    shareWithUserController,
    updateShareController,
    revokeShareController,
    sharedWithMeController,
    sharedByMeController,
    resourceAccessController,
    createLinkController,
    revokeLinkController
} from "../controllers/share.controller.js";

const shareRouter = Router();

// All sharing management requires a signed-in user
shareRouter.use(authMiddleware);

const resourceType = z.enum(["file", "folder"]);
const permission = z.enum(["viewer", "editor"]);

const shareBody = z.object({
    resourceType,
    resourceId: id,
    email: z.string().trim().toLowerCase().email().max(255),
    permission: permission.default("viewer"),
}).strict();

const linkBody = z.object({
    resourceType,
    resourceId: id,
    expiresInHours: z.union([z.coerce.number().positive().max(24 * 365), z.null()]).optional(),
    password: z.string().min(4).max(128).optional().nullable(),
    requireSignIn: z.boolean().optional(),
    // Accepted for backwards compatibility but ignored: links are always view-only
    permission: permission.optional(),
}).strict();

const typeAndShare = z.object({ type: resourceType, shareId: id });

shareRouter.get("/with-me", sharedWithMeController);
shareRouter.get("/by-me", sharedByMeController);
shareRouter.get("/resource/:type/:id", validate({ params: z.object({ type: resourceType, id }) }), resourceAccessController);

shareRouter.post("/links", shareCreateLimiter, validate({ body: linkBody }), createLinkController);
shareRouter.delete("/links/:linkId", validate({ params: z.object({ linkId: id }) }), revokeLinkController);

shareRouter.post("/", shareCreateLimiter, validate({ body: shareBody }), shareWithUserController);
shareRouter.patch("/:type/:shareId", validate({ params: typeAndShare, body: z.object({ permission }).strict() }), updateShareController);
shareRouter.delete("/:type/:shareId", validate({ params: typeAndShare }), revokeShareController);

export default shareRouter;
