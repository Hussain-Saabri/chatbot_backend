import { prisma } from '../lib/prisma.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
export const signup = async (req, res) => {
    const { name, email, password } = req.body;

    try {
        if (!name || !email || !password) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword
            }
        });

        res.status(201).json({ message: "User registered successfully", userId: user.id });
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Email already exists" });
        }
        console.error("Signup error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const login = async (req, res) => {
    console.log("Login request received");

    const { email, password } = req.body;
    console.log("Received email:", email);
    console.log("Received password:", password);
    try {
        if (!email || !password) {
            console.log("User not found")
            return res.status(400).json({ error: "Missing email or password" });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });
        console.log("user consoling",user);

        if (!user || !user.password) {
            console.log("Email doesnot found")
            return res.status(404).json({ error: "Invalid Credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        const token = jwt.sign(
    { userId: user.id, email: user.email }, 
    process.env.JWT_SECRET, 
    { expiresIn: '1h' } 
);
console.log("token",token);
        if (isMatch) {
            res.status(200).json({ message: "Login successful", token,user: { id: user.id, name: user.name, email: user.email } });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
