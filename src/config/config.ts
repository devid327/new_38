import { config as dotenv } from "dotenv";
dotenv();

export const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/PositionChecher";

export const PORT = process.env.PORT || 3000;
