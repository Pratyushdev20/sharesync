import AppError from "../utils/AppError.js";
import {createUser,getUsers,getUserById,updateUser,deleteUser} from "../services/user.service.js";


export async function getUsersController(req,res){
    try {
        const users = await getUsers();
        res.status(200).json({ data: users });
    } catch (error) {
        res.status(500).json({ message: "Error fetching users", error: error.message });
    }
}
export async function createUserController(req,res){
    try {
        const userdata = req.body;
        const newUser = await createUser(userdata);
        res.status(201).json({data : newUser})
    }
    catch (error){
        res.status(500).json({ message: "Error creating user", error: error.message });
    }
}
export async function getUserByIdController(req,res,next){
    try {
        const userId = req.params.id ;
        const user = await getUserById(userId);
        if(!user){
            throw new AppError("User not found", 404);
        }
        res.status(200).json({
            data : user
        })
    }
    catch (error){
        next(error);
    }
}
export async function updateUserController(req,res,next){
    try{
        const userId = req.params.id ;
        const userdata = req.body ;
        const updatedUser = await updateUser(userId,userdata)
        res.status(200).json({
            data : updatedUser
        })
    }
    catch (error){
        next(error);
    }
}
export async function deleteUserController(req,res,next){
    try{
        const result = await deleteUser(req.params.id);
        if(!result){
            throw new AppError("user not found",404);
        }res.status(200).json({data: result});
    }catch(error){
        next(error);
    }

}