import express from "express";
import {createUserController,getUsersController,getUserByIdController,updateUserController,deleteUserController}from "../controllers/user.controller.js";
const router = express.Router();

router.get("/", getUsersController);
router.post("/", createUserController);
router.get('/:id',getUserByIdController);
router.patch("/:id",updateUserController);
router.delete("/:id",deleteUserController);

export default router;