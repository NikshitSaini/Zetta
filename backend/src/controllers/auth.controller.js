import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../lib/utils.js";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import cloudinary from "../lib/cloudinary.js";

export const Signup=async (req,res)=>{
    const {fullname,email,password}=req.body;

    try {
        if(!fullname || !email || !password){
            return res.status(400).json({message:"Please provide all required fields"});
        }
        if(password.length<6){
            return res.status(400).json({message:"Password must be at least 6 characters long"});
        }
        const emailRegex=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if(!emailRegex.test(email)){
            return res.status(400).json({message:"Invalid email format"});
        }
        const user= await User.findOne({email:email});
        if(user) return res.status(400).json({message:"User already exists with this email"});

        const salt=await bcrypt.genSalt(10);
        const hashedPassword=await bcrypt.hash(password,salt);

        const newUser=new User({
            fullname,
            email,
            password:hashedPassword
        });

        if(newUser){
            const saveduser=await newUser.save();
            generateToken(saveduser._id,res);

            res.status(201).json({
                _id:newUser._id,
                fullname:newUser.fullname,
                email:newUser.email,
                ProfilePic:newUser.ProfilePic,
            });
            try {
                await sendWelcomeEmail(email,fullname,process.env.CLIENT_URL);
            } catch (error) {
                console.error("Error sending welcome email:", error);
            }
        }else{
            return res.status(400).json({message:"Failed to create user"});
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({message:"Internal server error"});
    }
};

export const Login = async (req,res)=>{
    const {email,password}=req.body;
    try{
        const user= await User.findOne({email:email});
        if(!user) return res.status(400).json({message:"Invalid credentials"});
        const isPasswordValid=await bcrypt.compare(password,user.password);
        if(!isPasswordValid) return res.status(400).json({message:"Invalid credentials"});
        generateToken(user._id,res);
        res.status(200).json({
            _id:user._id,
            fullname:user.fullname,
            email:user.email,
            ProfilePic:user.ProfilePic,
        });
    }catch(error){
        console.error("Login error:", error);
        res.status(500).json({message:"Internal server error"});
    }
}

export const Logout = async (req,res)=>{
    try {
        res.clearCookie("jwt");
        res.status(200).json({message:"Logged out successfully"});
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({message:"Internal server error"});
    }
}

export const UpdateProfile = async (req,res)=>{
    try {
        const {profilePic}=req.body;
        const userId=req.user._id;
        const upload=await cloudinary.uploader.upload(profilePic,{
            folder:"profile_pics",
            public_id:`${userId}_profile_pic`,
            overwrite:true,
        });
        const updatedUser=await User.findByIdAndUpdate(userId,{ProfilePic:upload.secure_url},{new:true});
        res.status(200).json(updatedUser);
    }
    catch(error){
        console.error("Update profile error:", error);
        res.status(500).json({message:"Internal server error"});
    }

}
