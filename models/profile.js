import mongoose from "mongoose";

const profileSchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },

  
  name: { type: String, default: "Your Name" },

  age: { type: Number, default: 18 },

  biography: { type: String, default: "This user hasn't added a bio yet." },

  
  link :{ type: String, default: "This user hasn't added a Photo yet." },
  
  

});

export default mongoose.model("profile", profileSchema);
