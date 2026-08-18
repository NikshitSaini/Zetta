import moongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
    try {
        const conn=await moongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected", conn.connection.host);
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
    // showing any 
}

export default connectDB;