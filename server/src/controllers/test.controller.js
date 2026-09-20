export const testApi = (req,res) =>{
    const userdata = req.body;

    res.status(200).json({
        success : true ,
        data : userdata
    });
};