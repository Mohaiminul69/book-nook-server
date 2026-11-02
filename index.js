import "dotenv/config";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
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

app.get("/books/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: "Book not found" });
  }

  try {
    const book = await booksCollection.findOne({ _id: new ObjectId(id) });
    if (!book) {
      return res.status(404).send({ message: "Book not found" });
    }
    res.send(book);
  } catch {
    res.status(500).send({ message: "Could not load the book" });
  }
});

app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .find({ userEmail: req.user.email })
      .sort({ borrowDate: -1 })
      .toArray();
    res.send(borrows);
  } catch {
    res.status(500).send({ message: "Could not load borrows" });
  }
});

app.post("/borrows", verifyToken, async (req, res) => {
  const { bookId } = req.body;
  if (!ObjectId.isValid(bookId)) {
    return res.status(400).send({ message: "Invalid book" });
  }

  try {
    const alreadyBorrowed = await borrowsCollection.findOne({
      bookId,
      userEmail: req.user.email,
    });
    if (alreadyBorrowed) {
      return res.status(409).send({
        code: "ALREADY_BORROWED",
        message:
          "You already have this book. Return it before borrowing again.",
      });
    }

    const book = await booksCollection.findOneAndUpdate(
      { _id: new ObjectId(bookId), availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: "after" },
    );
    if (!book) {
      return res.status(409).send({
        code: "NOT_AVAILABLE",
        message: "Every copy is out right now.",
      });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setDate(returnDate.getDate() + 7);

    const borrow = {
      bookId,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookImage: book.image,
      bookCategory: book.category,
      userEmail: req.user.email,
      userName: req.user.name,
      borrowDate,
      returnDate,
    };
    const result = await borrowsCollection.insertOne(borrow);
    res.status(201).send({ _id: result.insertedId, ...borrow });
  } catch {
    res.status(500).send({ message: "Could not borrow the book" });
  }
});

app.delete("/borrows/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: "Borrow not found" });
  }

  try {
    const borrow = await borrowsCollection.findOneAndDelete({
      _id: new ObjectId(id),
      userEmail: req.user.email,
    });
    if (!borrow) {
      return res.status(404).send({ message: "Borrow not found" });
    }

    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } },
    );
    res.send({ message: "Book returned", bookTitle: borrow.bookTitle });
  } catch {
    res.status(500).send({ message: "Could not return the book" });
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
