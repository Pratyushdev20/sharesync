import {getHealthStatus} from "../services/health.service.js";


export const getHealth = (req,res,next) =>{
    const result = getHealthStatus();

    res.status(200).json({
        sucess:true ,
        data : result 
    });
};