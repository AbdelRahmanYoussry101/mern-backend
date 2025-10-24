import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import user from "./models/user.js";
import Profile from "./models/profile.js";
import bcrypt from "bcrypt";
import multer from "multer";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import { v2 as cloudinary } from "cloudinary";
dotenv.config();


const app = express();
app.use(helmet());

const allowedOrigins = [
  "http://localhost:3000",  // dev
  "https://portfoliofun.netlify.app/"// production
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));


app.use(express.json());

// ✅ configure multer (for handling file uploads)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET, 
});


// connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.log("DB connection error:", err));

// simple route
app.get("/", function (req, res) {
  res.send("Hello from the backend");
});



function verifyToken(req, res, next) {
  // Header format: "Authorization: Bearer <token>"
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // split "Bearer token"

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_Private_key, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    req.user = decodedUser; // decodedUser = { id, email, iat, exp }
    next(); // continue to next route
  });
}

export default verifyToken;
//upload picture backend
app.post("/upload",verifyToken,upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // upload to cloudinary using upload_stream
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "profiles" },
      async (error, result) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: "Upload to Cloudinary failed" });
        }

        // save image URL to MongoDB
        const profile = await Profile.findOneAndUpdate(
          { userId: req.user.id},
          { link: result.secure_url },
          { new: true }
        );

        if (!profile) return res.status(404).json({ error: "Profile not found" });
        
        res.json({
          message: "Profile picture updated successfully!",
          imageUrl: result.secure_url,
        });
      }
    );

    // pipe file buffer to cloudinary upload
    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});
app.post("/add-user", async function (req, res) {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = new user({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
    });
    await newUser.save();

    const newProfile = new Profile({
      userId: newUser._id
    });
    await newProfile.save();

    res.status(201).json({ message: "User created successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating user" });
  }
});
app.get("/profile", verifyToken, async function (req, res) {
  try {
    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile) {
      return res.status(404).send("Profile not found");
    }

    res.json(profile);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching profile");
  }
});

//get user admin
app.get("/user", verifyToken, async function (req, res) {
  try {
    const userId = req.user.id; // ✅ not _id
    const existingUser = await user.findById(userId);

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: existingUser._id,
      name: existingUser.name,
      isAdmin: existingUser.isAdmin || false,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user" });
  }
});


// get all users
app.get("/get-users", async function (req, res) {
  try {
    const users = await user.find();
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching users" });
  }
});


// Get all profiles
app.get("/profiles", async (req, res) => {
  try {
    const profiles = await Profile.find(); // get all profiles
    res.json(profiles);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error while fetching profiles");
  }
});

// login
app.post("/login", async function (req, res) {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const existingUser = await user.findOne({ email });
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Create JWT token
    const token = jwt.sign(
      { id: existingUser._id, email: existingUser.email },
      process.env.JWT_Private_key,
      { expiresIn: "2h" }
    );
    
    // ✅ Send token and user info to frontend
    res.json({
      message: "Login successful",
      token, // <-- this is what you’ll store in localStorage
      user: {
        id: existingUser._id,
        name: existingUser.name,
        email: existingUser.email,
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging in" });
  }
});

function extractPublicId(url) {
  const match = url.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
  return match ? match[1] : null;
}


app.delete("/deleteUser/:id", verifyToken, async (req, res) => {
  try {
    const requester = await user.findById(req.user.id);
    const targetId = req.params.id;
    
    if (!requester || !requester.isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const targetProfile = await Profile.findOne({ userId: targetId });
    if (targetProfile?.link) {
      const publicId = extractPublicId(targetProfile.link);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
        console.log(`🧹 Deleted image: ${publicId}`);
      }
    }

    
    
  
    // delete the user and their profile
    await user.findByIdAndDelete(targetId);
    await Profile.findOneAndDelete({ userId: targetId });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting user" });
  }
});

app.put("/update-profile",verifyToken, async function (req, res) {
  try {
    const userId = req.user.id;
    const { name,age, biography } = req.body;

    const profile = await Profile.findOne({ userId: userId });
    if (!profile) {
      res.status(404).send("Profile not found");
      return;
    }
    if(name) profile.name = name;
    if (age) profile.age = age;
    if (biography) profile.biography = biography;

    await profile.save();

    res.json(profile);//to make it readable
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating profile");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, function () {
  console.log("Server running on portt " + PORT);
});
