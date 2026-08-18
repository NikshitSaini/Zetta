import moongoose from "mongoose";


const userSchema = new moongoose.Schema({
    fullname: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    ProfilePic:{
        type:String,
        default:""
    }
}, { timestamps: true });

const User = moongoose.model("User", userSchema);

export default User;