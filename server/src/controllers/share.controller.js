import AppError from "../utils/AppError.js";
import {
    shareWithUser,
    updateUserSharePermission,
    revokeUserShare,
    createShareLink,
    revokeShareLink,
    getSharedWithMe,
    getSharedByMe,
    getResourceAccess
} from "../services/share.service.js";
import { getLinkInfo, getLinkFolderContents, getLinkFileForDownload } from "../services/link.service.js";
import { sendFileStream } from "../utils/sendFile.js";
import { getUserName, publishChange, recordActivity } from "../services/events.service.js";
import { createNotifications } from "../services/notification.service.js";

const PERMISSION_TEXT = { viewer: "view", editor: "edit" };

/** Tells the recipient (and the owner's other devices) that sharing changed. */
async function announceShare({ ownerUid, recipientUid, eventType, resourceType, resourceId, resourceName, permission, notification }) {
    await publishChange({
        audience: [ownerUid, recipientUid],
        actorUid: ownerUid,
        eventType,
        resourceType,
        resourceId,
        ownerUid,
        payload: { name: resourceName, permission: permission || null, sharedWithUid: recipientUid },
    });
    if (notification) {
        await createNotifications([{
            userUid: recipientUid,
            actorUid: ownerUid,
            type: eventType,
            resourceType,
            resourceId,
            data: { permission: permission || null },
            ...notification,
        }]);
    }
}

/** Link expiry choices the API accepts (hours). null = never expires. */
const MAX_LINK_HOURS = 24 * 365;

function readLinkPassword(req) {
    const value = req.headers["x-share-password"];
    if (typeof value !== "string" || value.length === 0) return null;
    if (value.length > 256) throw new AppError("Password is too long", 400);
    return value;
}

// ---------------------------------------------------------------------------
// Authenticated sharing management
// ---------------------------------------------------------------------------

/** POST /api/shares  { resourceType, resourceId, email, permission } */
export async function shareWithUserController(req, res, next) {
    try {
        const { resourceType, resourceId, email, permission } = req.body || {};
        const share = await shareWithUser({
            ownerUid: req.user.uid,
            resourceType,
            resourceId,
            recipientEmail: email,
            permission: permission || "viewer"
        });
        const ownerName = await getUserName(req.user.uid);
        await announceShare({
            ownerUid: req.user.uid,
            recipientUid: share.sharedWithUid,
            eventType: "share.created",
            resourceType: share.resourceType,
            resourceId: share.resourceId,
            resourceName: share.resourceName,
            permission: share.permission,
            notification: {
                title: `${ownerName} shared a ${share.resourceType} with you`,
                body: `"${share.resourceName}" - you can ${PERMISSION_TEXT[share.permission]}`,
            },
        });
        res.status(201).json({ success: true, message: `Shared with ${share.recipientName || share.recipientEmail}`, data: share });
    } catch (error) {
        if (error.statusCode === 404 && /Recipient/.test(error.message)) {
            return next(new AppError(
                "No ShareSync account uses this email. Ask them to sign up first, or share a link instead.",
                404,
                "RECIPIENT_NOT_FOUND"
            ));
        }
        if (error.code === "23505") {
            return next(new AppError("Resource is already shared with this user", 409));
        }
        next(error);
    }
}

/** PATCH /api/shares/:type/:shareId  { permission } */
export async function updateShareController(req, res, next) {
    try {
        const updated = await updateUserSharePermission({
            ownerUid: req.user.uid,
            resourceType: req.params.type,
            shareId: req.params.shareId,
            permission: req.body?.permission
        });
        const ownerName = await getUserName(req.user.uid);
        await announceShare({
            ownerUid: req.user.uid,
            recipientUid: updated.shared_with_uid,
            eventType: "share.updated",
            resourceType: req.params.type,
            resourceId: updated.resource_id,
            resourceName: updated.resource_name,
            permission: updated.permission,
            notification: {
                title: `${ownerName} changed your access`,
                body: `"${updated.resource_name}" - you can now ${PERMISSION_TEXT[updated.permission]}`,
            },
        });
        res.status(200).json({ success: true, message: "Permission updated", data: updated });
    } catch (error) {
        next(error);
    }
}

/** DELETE /api/shares/:type/:shareId */
export async function revokeShareController(req, res, next) {
    try {
        const result = await revokeUserShare({
            ownerUid: req.user.uid,
            resourceType: req.params.type,
            shareId: req.params.shareId
        });
        if (result.revoked) {
            const ownerName = await getUserName(req.user.uid);
            await announceShare({
                ownerUid: req.user.uid,
                recipientUid: result.revoked.sharedWithUid,
                eventType: "share.revoked",
                resourceType: result.revoked.resourceType,
                resourceId: result.revoked.resourceId,
                resourceName: result.revoked.resourceName,
                notification: {
                    title: `${ownerName} removed your access`,
                    body: `"${result.revoked.resourceName}" is no longer shared with you`,
                },
            });
        }
        res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        next(error);
    }
}

/** GET /api/shares/with-me */
export async function sharedWithMeController(req, res, next) {
    try {
        const data = await getSharedWithMe(req.user.uid);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/** GET /api/shares/by-me */
export async function sharedByMeController(req, res, next) {
    try {
        const data = await getSharedByMe(req.user.uid);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/** GET /api/shares/resource/:type/:id  -> people and links with access (owner only) */
export async function resourceAccessController(req, res, next) {
    try {
        const data = await getResourceAccess({
            ownerUid: req.user.uid,
            resourceType: req.params.type,
            resourceId: req.params.id
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/shares/links  { resourceType, resourceId, expiresInHours, password, requireSignIn }
 * Links are always view/download only. The raw token is returned ONCE and never stored.
 */
export async function createLinkController(req, res, next) {
    try {
        const { resourceType, resourceId, expiresInHours, password, requireSignIn } = req.body || {};

        let hours = null;
        if (expiresInHours !== undefined && expiresInHours !== null && expiresInHours !== "") {
            hours = Number(expiresInHours);
            if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_LINK_HOURS) {
                throw new AppError("Link expiry must be between 1 hour and 1 year", 400);
            }
        }

        const { shareLink, rawToken } = await createShareLink({
            ownerUid: req.user.uid,
            resourceType,
            resourceId,
            permission: "viewer",
            isAnonymousAllowed: requireSignIn !== true,
            expiresInHours: hours,
            password: password || null
        });

        await publishChange({
            audience: [req.user.uid],
            actorUid: req.user.uid,
            eventType: "link.created",
            resourceType: shareLink.resourceType,
            resourceId: shareLink.resourceId,
            ownerUid: req.user.uid,
            payload: { name: shareLink.resourceName, linkId: String(shareLink.id), hasPassword: shareLink.hasPassword, expiresAt: shareLink.expiresAt },
        });
        res.status(201).json({
            success: true,
            message: "Share link created",
            data: { ...shareLink, token: rawToken, path: `/s/${rawToken}` }
        });
    } catch (error) {
        next(error);
    }
}

/** DELETE /api/shares/links/:linkId */
export async function revokeLinkController(req, res, next) {
    try {
        const result = await revokeShareLink({ ownerUid: req.user.uid, linkId: req.params.linkId });
        await publishChange({
            audience: [req.user.uid],
            actorUid: req.user.uid,
            eventType: "link.revoked",
            resourceType: "link",
            resourceId: req.params.linkId,
            ownerUid: req.user.uid,
        });
        res.status(200).json({ success: true, message: result.message });
    } catch (error) {
        next(error);
    }
}

// ---------------------------------------------------------------------------
// Public link access (account optional, depending on the link)
// ---------------------------------------------------------------------------

/** GET /api/public/links/:token */
export async function linkInfoController(req, res, next) {
    try {
        const data = await getLinkInfo(req.params.token, req.user?.uid || null, readLinkPassword(req));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/** GET /api/public/links/:token/contents?folder_id= */
export async function linkContentsController(req, res, next) {
    try {
        const data = await getLinkFolderContents(
            req.params.token,
            req.user?.uid || null,
            readLinkPassword(req),
            req.query.folder_id
        );
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

/** GET /api/public/links/:token/download?file_id= */
export async function linkDownloadController(req, res, next) {
    try {
        const download = await getLinkFileForDownload(
            req.params.token,
            req.user?.uid || null,
            readLinkPassword(req),
            req.query.file_id
        );
        recordActivity({
            actorUid: req.user?.uid || null,
            action: "link.downloaded",
            resourceType: "file",
            resourceId: download.fileRecord.id,
            metadata: { name: download.fileRecord.name, anonymous: !req.user },
        });
        sendFileStream(res, next, download);
    } catch (error) {
        next(error);
    }
}
