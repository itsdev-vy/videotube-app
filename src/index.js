import dotenv from "dotenv";
import connectDB from "./db/index.js";

dotenv.config({ path: './env' })

connectDB()
    .then(() => {
        console.log("MongoDB connected !!!");
        const app = require('./app');
        const PORT = process.env.PORT || 8000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        })
    })
    .catch((err) => {
        console.log("MongoDB connection failed !!!", err);
    })