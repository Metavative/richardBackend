// import User from "../models/User.js";

// export const editProfile = async (req, res) => {
//   try {
//     const userId = req.user.sub;
//     const { name, username, profile_picture } = req.body;

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const updates = {};
//     if (name) updates.name = name;
//     if (username) updates.username = username;

//     if (req.file) {
//       updates.profile_picture = {
//         key: req.file.filename,
//         url: "/uploads/profilePics/" + req.file.filename,
//       };
//     }

//     const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true });

//     res.json({ message: "Profile updated successfully", user: updatedUser });
//   } catch (err) {
//     console.error("Edit profile error:", err);
//     if (err.code === 11000 && err.keyValue.username) {
//       return res.status(400).json({ message: "Username already exists" });
//     }
//     res.status(500).json({ message: "Server error" });
//   }
// };

import User from "../models/User.js";

export const editProfile = async (req, res) => {
  try {
    // requireAuth guarantees we have a valid decoded token here
    if (!req.user || !req.user.sub) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid token payload" });
    }

    const userId = req.user.sub; // ✅ this matches your requireAuth

    const { name, username } = req.body;

    // make sure the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updates = {};

    if (name) updates.name = name;
    if (username) updates.username = username;

    // handle profile picture if file is uploaded
    if (req.file) {
      updates.profile_picture = {
        key: req.file.filename,
        url: "/uploads/profilePics/" + req.file.filename,
      };
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Edit profile error:", err);

    // duplicate username
    if (err.code === 11000 && err.keyValue?.username) {
      return res.status(400).json({ message: "Username already exists" });
    }

    return res.status(500).json({ message: "Server error" });
  }
};



