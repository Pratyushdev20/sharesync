import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { shareCreateLimiter } from "../middleware/security.js";
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

shareRouter.get("/with-me", sharedWithMeController);
shareRouter.get("/by-me", sharedByMeController);
shareRouter.get("/resource/:type/:id", resourceAccessController);

shareRouter.post("/links", shareCreateLimiter, createLinkController);
shareRouter.delete("/links/:linkId", revokeLinkController);

shareRouter.post("/", shareCreateLimiter, shareWithUserController);
shareRouter.patch("/:type/:shareId", updateShareController);
shareRouter.delete("/:type/:shareId", revokeShareController);

export default shareRouter;
