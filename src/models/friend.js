// import mongoose from 'mongoose';
// const { Schema } = mongoose;


// const FriendRequestSchema = new Schema({
//     from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//     to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//     status: { type: String, enum: ['pending', 'accepted', 'rejected' ], default: 'pending'},
//     createdAt: { type: Date, default: Date.now }
// });

// export default mongoose.model('FriendRequest', FriendRequestSchema)

import mongoose from 'mongoose';

const FriendSchema = new mongoose.Schema({
  from: { type: String, required: true }, // can be user ID or username
  to: { type: String, required: true },   // can be user ID or username
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
}, { timestamps: true });

export default mongoose.model('Friend', FriendSchema);
 