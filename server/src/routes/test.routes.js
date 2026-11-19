import { Router } from "express";
import { testApi } from "../controllers/test.controller.js";

const router = Router();

router.post("/users", testApi);

export default router;
