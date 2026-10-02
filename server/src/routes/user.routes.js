import express from "express";
import {createUserController,getUsersController,getUserByIdController}from "../controllers/user.controller.js";
const router = express.Router();

router.get("/", getUsersController);
router.post("/", createUserController);
router.get('/:id',getUserByIdController)
export default router;