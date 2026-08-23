import messsage from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getRecieverSocketId, io } from "../lib/socket.js";

export const getAllContacts= async(req,res)=>{
    try{
        const loggedInUserId=req.user._id;
        const contacts=await User.find({_id:{$ne:loggedInUserId}}).select("_id fullname email ProfilePic");
        res.status(200).json(contacts);
    }catch(error){
        console.error("Error fetching contacts:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const getChatById= async(req,res)=>{
    try{
        const {id}=req.params;
        const loggedInUserId=req.user._id;
        const chat=await messsage.find({
            $or:[
                {senderId:loggedInUserId,receiverId:id},        
                {senderId:id,receiverId:loggedInUserId}
            ]
        }).sort({createdAt:1});
        res.status(200).json(chat);
    }catch(error){
        console.error("Error fetching chat:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}


export const sendMessage= async(req,res)=>{ 
    try{
        const {id}=req.params;
        const {text,image}=req.body;
        const loggedInUserId=req.user._id;
        let imageUrl;
        if(image){
            const CloudRes=await cloudinary.uploader.upload(image,{
                folder:"Zetta",
                resource_type:"image"
            });
            imageUrl=CloudRes.secure_url;
        }
        const newMessage=new messsage({
            senderId:loggedInUserId,
            receiverId:id,
            text,
            image:imageUrl
        });


        const savedMessage=await newMessage.save();

        const ReceiverSocketId = getRecieverSocketId(id);
        if(ReceiverSocketId) {
            io.to(ReceiverSocketId).emit('newMessage', savedMessage);
        }


        res.status(201).json(savedMessage);
    }catch(error){
        console.error("Error sending message:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}

export const getAllChats= async(req,res)=>{ 
    try{
        const loggedInUserId=req.user._id.toString();
        const chats=await messsage.find({
            $or:[
                {senderId:loggedInUserId},
                {receiverId:loggedInUserId}
            ]
        })
        const chatPartnerIDs = [
            ...new Set(
                chats
                    .map((msg) =>
                        msg.senderId.toString() === loggedInUserId
                            ? msg.receiverId.toString()
                            : msg.senderId.toString()
                    )
                    .filter((partnerId) => partnerId !== loggedInUserId)
            ),
        ];
        const chatPartners=await User.find({_id:{$in:Array.from(chatPartnerIDs)}}).select("_id fullname email ProfilePic");
        res.status(200).json(chatPartners);
    }
    catch(error){
        console.error("Error fetching chats:", error);
        res.status(500).json({ message: "Internal server error" });
    }
}
