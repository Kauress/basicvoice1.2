const conferenceEl = document.querySelector(".conference");
const audioContainer = document.querySelector(".audio-container");
const form = document.querySelector("form");
const messageContainer = document.querySelector(".message-container");

const socket = io.connect("/"); //make connection with socket server

const state = {
  username: new URLSearchParams(window.location.search).get("username"),
  peers: {}, //store connected users
  audioTrack: null,
  rtcConfig: {
    //simple third party server to retrieve network details
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "turn:159.203.22.190:5500",
        username: "abdullah",
        credential: "qwerty123",
      },
    ],
  },
};

function showLogs(message) {
  insertMessage({ text: message, username: "System" });
}

function getRandomColor() {
  const randomHex = Math.floor(Math.random() * 16777215).toString(16);
  return "#" + randomHex.padStart(6, "0");
}

function getRandomPosition(circle) {
  const childRect = circle.getBoundingClientRect();
  const maxX = conferenceEl.clientWidth - childRect.width - 150;
  const maxY = conferenceEl.clientHeight - childRect.height - 150;
  const randomX = Math.floor(Math.random() * maxX);
  const randomY = Math.floor(Math.random() * maxY);
  return { x: randomX, y: randomY };
}

function createCircle(user) {
  const circle = document.createElement("div");
  circle.id = `ID_${user.userId}`;
  circle.className = "circle";
  circle.style.display = "flex";
  circle.style.backgroundColor = getRandomColor();
  const { x, y } = getRandomPosition(circle);
  circle.style.left = x + "px";
  circle.style.top = y + "px";
  circle.innerHTML = `<label>${user.username}</label>`;
  conferenceEl.appendChild(circle);
}

function removeCircle(userId) {
  const circle = document.querySelector(`#ID_${userId}`);
  if (!circle) return;
  conferenceEl.removeChild(circle);
}

function chanegMicStatus(message, active) {
  const micEl = document.querySelector(".mic");
  //show message related to micrphone access
  micEl.children[0].textContent = message;
  //change microphone access
  micEl.children[1].innerHTML = `<i class="fas ${
    active ? "fa-microphone" : "fa-microphone-slash"
  }"></i>`;
}

function setRemoteAudioTrack(event, user) {
  const [remoteStream] = event.streams;
  const div = document.createElement("div");
  div.id = `DA_${user.userId}`;
  const audio = document.createElement("audio");
  audio.id = `A_${user.userId}`;
  audio.srcObject = remoteStream;
  audio.play();
  audio.addEventListener("play", () => {
    showLogs(`${user.username} started playing!`);
  });
  audio.addEventListener("playing", () => {
    showLogs(`${user.username} saying something!`);
  });
  audio.addEventListener("ended", () => {
    showLogs(`${user.username} voice ended`);
  });
  audio.addEventListener("stalled", () => {
    showLogs(`${user.username} no audio data!`);
  });
  audio.addEventListener("error", (error) => {
    console.log(error);
    showLogs(`${user.username} error while playing audio!`);
  });
  audio.addEventListener("suspend", (error) => {
    console.log(error);
    showLogs(`${user.username} suspended audio`);
  });
  audio.addEventListener("abort", () => {
    showLogs(`${user.username} aborted!`);
  });
  div.appendChild(audio);
  audioContainer.appendChild(div);
}

function removeRemoteAudioTrack(userId) {
  const child = document.querySelector(`#DA_${userId}`);
  audioContainer.removeChild(child);
}

function insertMessage(message) {
  const wrapper = document.createElement("div");
  wrapper.classList.add("msg-wrapper");
  if (state.username === message.username) wrapper.classList.add("owner"); //add owner class to align message right side

  const sender = document.createElement("span");
  sender.classList.add("sender");
  sender.innerText = message.username;
  wrapper.appendChild(sender);

  const msg = document.createElement("span");
  msg.classList.add("message");
  msg.innerText = message.text;
  wrapper.appendChild(msg);

  messageContainer.appendChild(wrapper);
  //scroll top to see latest message
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

//ask for microphone access
function getAudioStreamAccess() {
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      state.audioTrack = stream.getAudioTracks()[0];

      state.audioTrack.addEventListener("mute", () => {
        chanegMicStatus("Your mic is muted", false);
      });
      state.audioTrack.addEventListener("unmute", () => {
        chanegMicStatus("Your mic is unmuted", true);
      });
      state.audioTrack.addEventListener("ended", (e) => {
        chanegMicStatus("Mic stopped", true);
      });
      if (state.audioTrack.muted) {
        chanegMicStatus("Your mic is muted", false);
      } else {
        chanegMicStatus("You mic is unmuted", true);
      }
      socket.emit("user-joined", state.username).on("user", createCircle);
    })
    .catch((err) => {
      chanegMicStatus(err.message);
    });
}

function removeTrackFromConnection(userId) {
  const connection = state.peers[userId].peerConnection;
  if (!connection) return;
  const sender = connection.getSenders().find(function (s) {
    return s.track === state.audioTrack;
  });
  if (sender) {
    try {
      connection.removeTrack(sender);
      connection.removeStream(new MediaStream([state.audioTrack]));
    } catch (err) {
      console.log(err);
    }
  }
  connection.close();
  delete state.peers[userId];
}

//start a webrtc call with new user
socket.on("user-joined", async ({ user }) => {
  try {
    //create new connection
    const peerConnection = new RTCPeerConnection(state.rtcConfig);
    //store peer connection
    state.peers[user.userId] = { peerConnection };
    //add local track in remote user connection
    peerConnection.addTrack(
      state.audioTrack,
      new MediaStream([state.audioTrack])
    );
    //create offer for new user
    //offer: contains system config like: type of media format being send, ip address and port of caller
    const offer = await peerConnection.createOffer();
    //set offer description in local connection
    peerConnection.setLocalDescription(offer);
    //receive network details from third party server and send details to new user
    peerConnection.addEventListener("icecandidate", function (event) {
      //send network details to new user
      socket.emit("ICE-Candidate", {
        receiver: user.userId,
        candidate: event.candidate,
      });
    });
    peerConnection.addEventListener(
      "icegatheringstatechange",
      function (event) {
        //check gathering status
        showLogs(
          `${user.username} ICE Candidate Gathering State ${event.target.iceGatheringState} | ${peerConnection.iceConnectionState}`
        );
      }
    );
    peerConnection.addEventListener("icecandidateerror", function (event) {
      const { errorCode, errorText, url } = event;
      showLogs(`ICE candidate error:', ${errorCode}, ${errorText}, ${url}`);
    });
    //when new user get chance to speak, this listener will trigger and set the remote stream on dom
    peerConnection.addEventListener("track", (event) => {
      if (event.track.kind === "audio") {
        showLogs(`${user.username} ${event.track.kind} Track received`);
        createCircle(user);
        setRemoteAudioTrack(event, user);
        showLogs(`${user.username} Track ${event.track.readyState}!`);
        event.track.addEventListener("ended", () => {
          showLogs(`${user.username} Track ${event.track.readyState}!`);
        });
        event.track.addEventListener("failed", () => {
          showLogs(`${user.username} Track ${event.track.readyState}!`);
        });
      }
    });

    peerConnection.addEventListener("ended", (event) => {
      //create new user circle
      showLogs(`${user.username} Track ${event.track.readyState}!`);
    });

    //send offer (system config) to new user
    socket.emit("call", { userId: user.userId, offer });
  } catch (err) {
    console.log(err);
    showLogs(
      `Error occured on joined user socket: ${err.message}, please check console for more details!`
    );
  }
});

//receive answer from new user
socket.on("answer", async ({ responder, answer }) => {
  try {
    //get responder connection
    const peerConnection = state.peers[responder].peerConnection;
    //set responder answer (system config) in connection
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  } catch (err) {
    console.log(err);
    showLogs(
      `Error occured while answering call: ${err.message}, please check console for more details!`
    );
  }
});

//recieve network details (ICE-Candidate) of user
socket.on("ICE-Candidate", async ({ sender, candidate }) => {
  try {
    if (!state.peers[sender]) return;
    //find sender peer connection in list of peers
    const peerConnection = state.peers[sender].peerConnection;
    //store network details in connection
    await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.log(err);
    showLogs(
      `Error occured on ice-candiate socket: ${err.message}, please check console for more details!`
    );
  }
});

//receive call (offer) from users and respond to call by sharing their system details
socket.on("call", async ({ caller, callerName, offer }) => {
  try {
    //create new webrtc peer connection
    const peerConnection = new RTCPeerConnection(state.rtcConfig);
    //store caller peer connection
    state.peers[caller] = { peerConnection };
    //add local stream to caller connection
    peerConnection.addTrack(
      state.audioTrack,
      new MediaStream([state.audioTrack])
    );
    //receive network details from third party server and send it to caller
    peerConnection.addEventListener("icecandidate", function (event) {
      //send network details to caller
      socket.emit("ICE-Candidate", {
        receiver: caller,
        candidate: event.candidate,
      });
    });

    peerConnection.addEventListener(
      "icegatheringstatechange",
      function (event) {
        //check gathering status
        showLogs(
          `${callerName} ICE Candidate Gathering State ${event.target.iceGatheringState} | ${peerConnection.iceConnectionState}`
        );
      }
    );

    peerConnection.addEventListener("icecandidateerror", function (event) {
      const { errorCode, errorText, url } = event;
      showLogs(`ICE candidate error:', ${errorCode}, ${errorText}, ${url}`);
    });
    peerConnection.addEventListener("track", (event) => {
      if (event.track.kind === "audio") {
        createCircle({ userId: caller, username: callerName });
        setRemoteAudioTrack(event, { userId: caller, username: callerName });
        showLogs(`${callerName} Track ${event.track.readyState}!`);
        event.track.addEventListener("failed", () => {
          showLogs(`${callerName} Track ${event.track.readyState}!`);
        });
        event.track.addEventListener("ended", () => {
          showLogs(`${callerName} Track ${event.track.readyState}!`);
        });
      }
    });

    //set received offer (caller system config) in connection
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    //create your system config as answer
    const answer = await peerConnection.createAnswer();
    //set answer in connection
    await peerConnection.setLocalDescription(answer);
    //send call response (system config) to caller
    socket.emit("answer", { caller, answer });
  } catch (err) {
    console.log(err);
    showLogs(
      `Error occured while calling: ${err.message}, please check console for more details!`
    );
  }
});

socket.on("message", insertMessage);

socket.on("user-disconnect", ({ userId }) => {
  //close and delete user connection from list connected users peer
  if (!state.peers[userId]) return;
  removeTrackFromConnection(userId);
  removeCircle(userId);
  removeRemoteAudioTrack(userId);
  showLogs(`User disconnected`);
});

//handle form submission
form.addEventListener("submit", (e) => {
  e.preventDefault(); //prevent page from reloading
  const message = e.target.elements.message.value;
  if (!message) return;
  //send message to other users in room
  const payload = {
    username: state.username,
    text: message,
  };
  socket.emit("message", payload);
  //display message in your chat box
  insertMessage(payload);
  //clear form input
  e.target.elements.message.value = "";
  e.target.elements.message.focus();
});

window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = "";
  for (const user in state.peers) {
    const peerConnection = state.peers[user].peerConnection;
    //Find the sender associated with the track
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track === state.audioTrack);
    // Remove the track by replacing it with a null track
    if (sender) sender.replaceTrack(null);
  }
});

window.addEventListener("unload", function (e) {
  e.preventDefault();
  for (const user in state.peers) {
    const peerConnection = state.peers[user].peerConnection;
    //Find the sender associated with the track
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track === state.audioTrack);
    // Remove the track by replacing it with a null track
    if (sender) sender.replaceTrack(null);
  }
});

window.addEventListener("DOMContentLoaded", () => getAudioStreamAccess());
