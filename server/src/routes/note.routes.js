import { Router } from "express";
import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate, z, id, optionalFolderId, cleanText } from "../middleware/validate.js";
import {
    createNoteController,
    listNotesController,
    getNoteController,
    updateNoteController,
    deleteNoteController
} from "../controllers/note.controller.js";

const MAX_CONTENT = 500_000; // characters (DB also caps at 512 KB)

const noteRouter = Router();

// Notes can be larger than the global 100kb JSON limit
noteRouter.use(express.json({ limit: "1mb" }));
noteRouter.use(authMiddleware);

const title = cleanText(255).transform((s) => s.trim()).refine((s) => s.length > 0, { message: "is required" });
const kind = z.enum(["note", "document"]);

const createBody = z.object({
    title,
    content: cleanText(MAX_CONTENT).default(""),
    kind: kind.default("note"),
    folder_id: optionalFolderId,
}).strict();

const updateBody = z.object({
    title: title.optional(),
    content: cleanText(MAX_CONTENT).optional(),
    kind: kind.optional(),
    folder_id: z.union([id, z.null(), z.literal("root")]).optional()
        .transform((v) => (v === "root" ? null : v)),
    expected_version: z.coerce.number().int().positive(),
}).strict().refine(
    (b) => b.title !== undefined || b.content !== undefined || b.kind !== undefined || b.folder_id !== undefined,
    { message: "nothing to update" }
);

const listQuery = z.object({
    folder_id: z.union([id, z.literal("root")]).optional(),
    q: z.string().trim().max(100).optional().transform((v) => v || undefined),
    kind: kind.optional(),
});

const idParams = z.object({ id });

noteRouter.get("/", validate({ query: listQuery }), listNotesController);
noteRouter.post("/", validate({ body: createBody }), createNoteController);
noteRouter.get("/:id", validate({ params: idParams }), getNoteController);
noteRouter.patch("/:id", validate({ params: idParams, body: updateBody }), updateNoteController);
noteRouter.put("/:id", validate({ params: idParams, body: updateBody }), updateNoteController);
noteRouter.delete(
    "/:id",
    validate({ params: idParams, query: z.object({ expected_version: z.coerce.number().int().positive().optional() }) }),
    deleteNoteController
);

export default noteRouter;
