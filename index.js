import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const port = process.env.PORT || 5000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

app.use(
  cors({
    origin: [clientUrl, "http://localhost:3000"],
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

const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", clientUrl));

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "booknook",
      audience: "booknook-api",
    });
    req.user = {
      id: payload.id || payload.sub,
      name: payload.name,
      email: payload.email,
    };
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

app.get("/", (req, res) => {
  res.send("BookNook server is running");
});

app.get("/books", async (req, res) => {
  const { category, email, limit } = req.query;
  const query = {};
  if (category && category !== "All") {
    query.category = category;
  }
  if (email) {
    query["addedBy.email"] = email;
  }

  let cursor = booksCollection.find(query).sort({ createdAt: -1 });
  const max = parseInt(limit);
  if (max > 0) {
    cursor = cursor.limit(max);
  }

  try {
    const books = await cursor.toArray();
    res.send(books);
  } catch {
    res.status(500).send({ message: "Could not load books" });
  }
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
