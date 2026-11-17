import AppError from "./AppError.js";

/**
 * Validates a filename.
 * Throws AppError(400) if invalid or contains path traversal characters.
 */
export function validateFileName(name) {
    if (typeof name !== "string") {
        throw new AppError("File name must be a string", 400);
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 255) {
        throw new AppError("File name must be between 1 and 255 characters", 400);
    }
    if (trimmed === "." || trimmed === "..") {
        throw new AppError("Invalid file name", 400);
    }
    // Reject slashes, backslashes, null bytes, and non-printable control characters
    if (/[\/\\\x00-\x1f\x7f]/.test(trimmed)) {
        throw new AppError("File name contains invalid characters", 400);
    }
    return trimmed;
}

/**
 * Validates a file or folder numeric ID.
 * Throws AppError(400) if invalid.
 */
export function validateFileId(id) {
    const str = String(id).trim();
    if (!/^\d+$/.test(str) || BigInt(str) <= 0n) {
        throw new AppError("Invalid file ID", 400);
    }
    return str;
}

/**
 * Checks if a buffer represents printable text (plain text, json, csv, etc.)
 */
function isPrintableText(buffer) {
    const checkLength = Math.min(buffer.length, 4096);
    let nullCount = 0;
    for (let i = 0; i < checkLength; i++) {
        const byte = buffer[i];
        if (byte === 0) {
            nullCount++;
        }
        // Disallow null bytes and non-whitespace control characters in text files
        if (byte < 7 || (byte > 13 && byte < 32 && byte !== 27)) {
            return false;
        }
    }
    return nullCount === 0;
}

/**
 * Detects the file format by inspecting magic bytes/signatures.
 */
export function detectMagicBytes(buffer) {
    if (!buffer || buffer.length === 0) {
        return null;
    }

    const len = buffer.length;

    // Dangerous executable binaries
    // Windows PE / EXE / DLL: 'MZ'
    if (len >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
        return { type: "application/x-dosexec", category: "executable" };
    }
    // Linux ELF: '\x7fELF'
    if (len >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
        return { type: "application/x-executable", category: "executable" };
    }
    // Mach-O: 0xFEEDFACE, 0xFEEDFACF, 0xCEFAEDFE, 0xCFFAEDFE
    if (len >= 4 && (
        (buffer[0] === 0xFE && buffer[1] === 0xED && buffer[2] === 0xFA && (buffer[3] === 0xCE || buffer[3] === 0xCF)) ||
        ((buffer[0] === 0xCE || buffer[0] === 0xCF) && buffer[1] === 0xFA && buffer[2] === 0xED && buffer[3] === 0xFE)
    )) {
        return { type: "application/x-mach-binary", category: "executable" };
    }

    // PDF: '%PDF-'
    if (len >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) {
        return { type: "application/pdf", category: "document" };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (len >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
        return { type: "image/png", category: "image" };
    }

    // JPEG: FF D8 FF
    if (len >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return { type: "image/jpeg", category: "image" };
    }

    // GIF: GIF87a or GIF89a
    if (len >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
        (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) {
        return { type: "image/gif", category: "image" };
    }

    // WEBP: RIFF....WEBP
    if (len >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return { type: "image/webp", category: "image" };
    }

    // ZIP (and OpenXML Office: docx, xlsx, pptx): 'PK\x03\x04', 'PK\x05\x06', 'PK\x07\x08'
    if (len >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B &&
        ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
         (buffer[2] === 0x05 && buffer[3] === 0x06) ||
         (buffer[2] === 0x07 && buffer[3] === 0x08))) {
        return { type: "application/zip", category: "archive" };
    }

    // Legacy MS Office (doc, xls, ppt): D0 CF 11 E0 A1 B1 1A E1
    if (len >= 8 &&
        buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
        buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1) {
        return { type: "application/msword", category: "document" };
    }

    // 7z: 37 7A BC AF 27 1C
    if (len >= 6 &&
        buffer[0] === 0x37 && buffer[1] === 0x7A && buffer[2] === 0xBC && buffer[3] === 0xAF &&
        buffer[4] === 0x27 && buffer[5] === 0x1C) {
        return { type: "application/x-7z-compressed", category: "archive" };
    }

    // RAR: 'Rar!\x1A\x07'
    if (len >= 7 &&
        buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21 &&
        buffer[4] === 0x1A && buffer[5] === 0x07) {
        return { type: "application/x-rar-compressed", category: "archive" };
    }

    // GZIP: 1F 8B
    if (len >= 2 && buffer[0] === 0x1F && buffer[1] === 0x8B) {
        return { type: "application/gzip", category: "archive" };
    }

    // MP3: ID3 or 0xFF followed by 0xFB/F3/F2
    if ((len >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) ||
        (len >= 2 && buffer[0] === 0xFF && (buffer[1] === 0xFB || buffer[1] === 0xF3 || buffer[1] === 0xF2))) {
        return { type: "audio/mpeg", category: "audio" };
    }

    // WAV: RIFF....WAVE
    if (len >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45) {
        return { type: "audio/wav", category: "audio" };
    }

    // Ogg: 'OggS'
    if (len >= 4 && buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
        return { type: "audio/ogg", category: "audio" };
    }

    // MP4 / MOV: 'ftyp' at offset 4
    if (len >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        return { type: "video/mp4", category: "video" };
    }

    // WebM / MKV: 1A 45 DF A3
    if (len >= 4 && buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
        return { type: "video/webm", category: "video" };
    }

    // SVG: XML or SVG tag text
    const textStart = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf-8").trimStart();
    if (textStart.startsWith("<?xml") || textStart.startsWith("<svg") || (textStart.includes("<svg") && textStart.includes("xmlns"))) {
        return { type: "image/svg+xml", category: "image" };
    }

    // Printable text (text/plain, text/csv, application/json)
    if (isPrintableText(buffer)) {
        return { type: "text/plain", category: "text" };
    }

    return null;
}

/**
 * Validates actual file content against size, signature, and allowed types.
 */
export function validateFileContent(buffer, declaredMimeType, originalName, maxSize) {
    if (!buffer || buffer.length === 0) {
        throw new AppError("Cannot upload empty file", 400);
    }

    if (buffer.length > maxSize) {
        throw new AppError(`File exceeds maximum size limit of ${Math.round(maxSize / (1024 * 1024))}MB`, 400);
    }

    const detected = detectMagicBytes(buffer);

    if (detected && detected.category === "executable") {
        throw new AppError("Security validation failed: Executable files are not allowed", 400);
    }

    const normalizedMime = (declaredMimeType || "").toLowerCase().trim();

    // Map of declared MIME types to compatible detected categories/types
    const allowedMimeMapping = {
        // Images
        "image/jpeg": ["image/jpeg"],
        "image/jpg": ["image/jpeg"],
        "image/png": ["image/png"],
        "image/gif": ["image/gif"],
        "image/webp": ["image/webp"],
        "image/svg+xml": ["image/svg+xml"],
        // Documents
        "application/pdf": ["application/pdf"],
        "text/plain": ["text/plain"],
        "text/csv": ["text/plain"],
        "application/json": ["text/plain"],
        "application/msword": ["application/msword", "application/zip"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["application/zip"],
        "application/vnd.ms-excel": ["application/msword", "application/zip"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["application/zip"],
        "application/vnd.ms-powerpoint": ["application/msword", "application/zip"],
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["application/zip"],
        // Archives
        "application/zip": ["application/zip"],
        "application/x-zip-compressed": ["application/zip"],
        "application/x-rar-compressed": ["application/x-rar-compressed"],
        "application/vnd.rar": ["application/x-rar-compressed"],
        "application/x-7z-compressed": ["application/x-7z-compressed"],
        "application/gzip": ["application/gzip"],
        "application/x-gzip": ["application/gzip"],
        // Audio
        "audio/mpeg": ["audio/mpeg"],
        "audio/mp3": ["audio/mpeg"],
        "audio/wav": ["audio/wav"],
        "audio/x-wav": ["audio/wav"],
        "audio/ogg": ["audio/ogg"],
        // Video
        "video/mp4": ["video/mp4"],
        "video/webm": ["video/webm"],
        "video/quicktime": ["video/mp4"]
    };

    // If client supplied a mime type not in whitelist
    if (!allowedMimeMapping[normalizedMime]) {
        // Check if detected type is in allowed whitelist
        const isDetectedAllowed = detected && Object.values(allowedMimeMapping).some(types => types.includes(detected.type));
        if (!isDetectedAllowed) {
            throw new AppError("File type not allowed or unrecognized", 400);
        }
    } else {
        const expectedTypes = allowedMimeMapping[normalizedMime];
        if (!detected || !expectedTypes.includes(detected.type)) {
            throw new AppError(`File content does not match declared type '${declaredMimeType}'`, 400);
        }
    }

    const finalMime = normalizedMime === "image/jpg" ? "image/jpeg" :
                      normalizedMime === "audio/mp3" ? "audio/mpeg" :
                      normalizedMime || detected.type;

    return {
        verifiedMimeType: finalMime,
        size: buffer.length
    };
}
