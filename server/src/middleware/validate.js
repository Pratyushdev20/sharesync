import { z } from "zod";
import AppError from "../utils/AppError.js";

/**
 * Request validation with zod schemas.
 *
 *   router.post("/", validate({ body: schema }), controller)
 *
 * Parsed (trimmed, coerced) values replace req.body / req.params and are stored on req.valid.query
 * (Express 5 makes req.query read-only). Unknown body keys are rejected via .strict() schemas.
 */
export function validate({ body, query, params } = {}) {
    return (req, res, next) => {
        try {
            req.valid = req.valid || {};
            if (params) req.params = parse(params, req.params, "URL parameter");
            if (query) req.valid.query = parse(query, req.query, "query parameter");
            if (body) req.body = parse(body, req.body ?? {}, "field");
            next();
        } catch (err) {
            next(err);
        }
    };
}

function parse(schema, data, label) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue.path.length ? `${label} '${issue.path.join(".")}'` : "request";
        throw new AppError(`Invalid ${where}: ${issue.message}`, 400, "VALIDATION_ERROR");
    }
    return result.data;
}

/** Shared schema pieces */
export const id = z.union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d{1,18}$/.test(v) && BigInt(v) > 0n, { message: "must be a positive integer id" });

export const optionalFolderId = z.union([id, z.null(), z.literal("root"), z.literal("")])
    .optional()
    .transform((v) => (v === undefined || v === null || v === "root" || v === "" ? null : v));

/** Removes control characters (except newline/tab) from user-provided text. */
export const cleanText = (max) =>
    z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));

export { z };
