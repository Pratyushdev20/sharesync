import { createNote, listNotes, getNote, updateNote, deleteNote } from "../services/note.service.js";

/** POST /api/notes */
export async function createNoteController(req, res, next) {
    try {
        const note = await createNote(req.user.uid, req.body);
        res.status(201).json({ success: true, message: "Note created", data: note });
    } catch (error) {
        next(error);
    }
}

/** GET /api/notes?folder_id=&q=&kind= */
export async function listNotesController(req, res, next) {
    try {
        const notes = await listNotes(req.user.uid, req.valid.query);
        res.status(200).json({ success: true, data: notes });
    } catch (error) {
        next(error);
    }
}

/** GET /api/notes/:id */
export async function getNoteController(req, res, next) {
    try {
        res.status(200).json({ success: true, data: await getNote(req.user.uid, req.params.id) });
    } catch (error) {
        next(error);
    }
}

/** PATCH /api/notes/:id  (expected_version required) */
export async function updateNoteController(req, res, next) {
    try {
        const note = await updateNote(req.user.uid, req.params.id, req.body);
        res.status(200).json({ success: true, message: "Note saved", data: note });
    } catch (error) {
        next(error);
    }
}

/** DELETE /api/notes/:id?expected_version= */
export async function deleteNoteController(req, res, next) {
    try {
        const result = await deleteNote(req.user.uid, req.params.id, req.valid.query);
        res.status(200).json({ success: true, message: "Note deleted", data: result });
    } catch (error) {
        next(error);
    }
}
