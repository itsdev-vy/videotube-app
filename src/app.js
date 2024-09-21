import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));    //To handle application/x-www-form-urlencoded data like + % etc
app.use(express.static('public'));  //Store pdf or image as public asset anyone can access
app.use(cookieParser());    //To access browser cookies for any security purpose

export { app };