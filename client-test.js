import { io } from "socket.io-client";

const USER_123 = "USER_123";
const USER_456 = "USER_456";

const socket = io("http://localhost:4000", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("⚡ Connected to server:", socket.id);

  // Mark user online
  socket.emit("user_online", USER_123);

  // Send a friend request after 2 seconds
  setTimeout(() => {
    socket.emit("send_friend_request", {
      fromUserId: USER_123,
      toUserId: USER_456,
    });
  }, 2000);
});

socket.on("friend_request_notification", (data) => {
  console.log("🔔 Friend Request Notification:", data);
});

socket.on("disconnect", () => {
  console.log("⚠️ Disconnected from server");
});
