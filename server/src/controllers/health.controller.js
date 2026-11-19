import { getHealthStatus, getReadiness } from "../services/health.service.js";

/** GET /api/health — liveness probe */
export const getHealth = (req, res) => {
    res.status(200).json({
        success: true,
        data: getHealthStatus()
    });
};

/** GET /api/health/ready — readiness probe (503 when a dependency is down) */
export const getReady = async (req, res, next) => {
    try {
        const result = await getReadiness();
        res.status(result.status === "ready" ? 200 : 503).json({
            success: result.status === "ready",
            data: result
        });
    } catch (err) {
        next(err);
    }
};
