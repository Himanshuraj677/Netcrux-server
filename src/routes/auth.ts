import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import {prisma} from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables.");
}

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Registering user:", email);

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    if (password.length < 6 || password.length > 15) {
      return res
        .status(400)
        .json({ error: "Password must be between 6 and 15 characters long." });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
      },
    });

    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Logging in user:", email);
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Email and password are required." });
  }
  const user = await prisma.user.findFirst({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token });
});

export default router;
