import AppError from "./AppError.js";

/**
 * Streams a (decrypted) file to the client with safe download headers.
 * If decryption/integrity verification fails mid-stream the connection is aborted,
 * so a tampered file is never delivered as if it were complete.
 */
export function sendFileStream(res, next, { fileRecord, stream }, { inline = false } = {}) {
    // Sanitize ASCII filename for Content-Disposition header (RFC 5987 for the UTF-8 name)
    const safeAsciiName = fileRecord.name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    const encodedName = encodeURIComponent(fileRecord.name);
    const disposition = inline ? "inline" : "attachment";

    res.setHeader("Content-Disposition", `${disposition}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader("Content-Type", fileRecord.mime_type || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (fileRecord.size !== undefined && fileRecord.size !== null) {
        res.setHeader("Content-Length", fileRecord.size);
    }

    stream.on("error", () => {
        if (!res.headersSent) {
            next(new AppError("Failed to read file", 500));
        } else {
            res.destroy();
        }
    });

    stream.pipe(res);
}
