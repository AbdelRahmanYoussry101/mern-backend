import mongoose from "mongoose";

// define the structure (schema) of your user data
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  
  isAdmin: { type: Boolean,
     default: false 
    },

  password: {
    type: String,
    required: true
  },
}, { timestamps: true }); // adds createdAt and updatedAt automatically

// make the model from the schema
const user = mongoose.model("user", userSchema);

// export it so you can use it elsewhere
export default user;
