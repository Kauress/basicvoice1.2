const http = require("http");
const express = require("express");
const uuid = require("uuid");
const path = require("path");
const socket = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socket(server);

const User = require("./user");

const PORT = process.env.PORT || 3000;
const state = {
  conferenceId: "abc-def",
  userManager: new User(),
};

app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static("public"));

app.get("/", (req, res, next) => {
  const file = path.resolve(path.join(__dirname, "public", "index.html"));
  return res.status(200).sendFile(file);
});

app.post("/", (req, res) => {
  return res
    .status(200)
    .redirect(`/${state.conferenceId}?username=${req.body.username}`);
});

app.get(`/${state.conferenceId}`, (req, res) => {
  const file = path.resolve(path.join(__dirname, "public", "conference.html"));
  return res.status(200).sendFile(file);
});

const users = {};
//Socket: listen for new connection
io.on("connection", (socket) => {
  socket.on("user-joined", (username) => {
    users[socket.id] = username;
    socket.join(state.conferenceId); //add user in conference room
    const user = {
      username,
      userId: socket.id,
    };
    const userIndex = state.userManager.insertUser(user);
    if (!state.userManager.activeUser) state.userManager.assignUser(userIndex);
    socket.emit("user", user);
    socket.to(state.conferenceId).emit("user-joined", {
      user,
      isActiveUser: username === state.userManager?.activeUser?.username,
    });
  });

  //Receive call from each user in room and send it to new user
  socket.on("call", ({ userId, offer }) => {
    socket.to(userId).emit("call", {
      caller: socket.id, //id of caller
      callerName: users[socket.id],
      offer,
    });
  });

  //Receive answer from new user and send it to each caller in room
  socket.on("answer", ({ caller, answer }) => {
    //send response to caller
    socket.to(caller).emit("answer", {
      responder: socket.id, //id of call receiver
      answer,
    });
  });

  //Exchange network details between new user and old user
  socket.on("ICE-Candidate", ({ receiver, candidate }) => {
    //send ICECandidate to user
    socket.to(receiver).emit("ICE-Candidate", {
      sender: socket.id,
      candidate, //network details of sender
    });
  });

  socket.on("message", (message) => {
    socket.to(state.conferenceId).emit("message", message);
  });

  socket.on("disconnect", () => {
    //remove user from queue
    state.userManager.removeUser(socket.id);
    socket.to(state.conferenceId).emit("user-disconnect", {
      userId: socket.id,
    });
  });

  socket.on("user-bhaggya", console.log);
});

server.listen(PORT, () => {
  console.log(`UP And Running On Port ${PORT}`);
});
