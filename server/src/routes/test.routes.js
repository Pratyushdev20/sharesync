import express from "express";
import { testApi } from "../controllers/test.controller.js";
import Router from "express";

const router = Router();

router.post("/users",testApi);

export default router ;


