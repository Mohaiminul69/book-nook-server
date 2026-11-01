import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const db = client.db(process.env.DB_NAME || "booknook");
const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");

app.get("/", (req, res) => {
  res.send("BookNook server is running");
});

if (!process.env.VERCEL) {
  client
    .connect()
    .then(() => {
      console.log("Connected to MongoDB");
      app.listen(port, () => {
        console.log(`BookNook server listening on port ${port}`);
      });
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
      process.exit(1);
    });
}

export default app;
