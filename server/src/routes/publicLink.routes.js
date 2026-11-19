import { Router } from "express";
import { optionalAuthMiddleware } from "../middleware/auth.middleware.js";
import { linkAccessLimiter, linkFailureLimiter } from "../middleware/security.js";
import {
    linkInfoController,
    linkContentsController,
    linkDownloadController
} from "../controllers/share.controller.js";

const publicLinkRouter = Router();

// Share links work without an account (unless the owner required sign-in).
// Failed attempts are rate limited separately to stop token and password guessing.
publicLinkRouter.use(linkAccessLimiter, linkFailureLimiter, optionalAuthMiddleware);

publicLinkRouter.get("/:token", linkInfoController);
publicLinkRouter.get("/:token/contents", linkContentsController);
publicLinkRouter.get("/:token/download", linkDownloadController);

export default publicLinkRouter;
