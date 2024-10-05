import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import cors from "cors";
import AsyncLock from "async-lock";
import { corsOptions } from "./constants/config.js";

const PORT = 8000 || process.env.PORT;

const app = express();
const server = createServer(app);

app.use(express.json());
app.use(cors(corsOptions));
const io = new Server(server, { cors: corsOptions });
const lock = new AsyncLock();

app.set("io", io);

let editorContent = "";
let currentLanguage = "cpp";

// <---------- SOCKET ---------->
const userToSocketIdMap = new Map();
const socketidToUserMap = new Map();

function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: socketidToUserMap[socketId],
            };
        }
    );
}

io.on("connection", (socket) => {
    console.log("Connected", socket.id);

    // Video Call
    socket.on("room:join", (data) => {
        const { roomId, myName } = data;
        const username = myName;
        // console.log(data);
        userToSocketIdMap.set(username, socket.id);
        socketidToUserMap.set(socket.id, username);

        // io.to(room).emit("user:joined", { username, id: socket.id });
        // socket.join(room);
        // io.to(socket.id).emit("room:join", data);

        const clients = getAllConnectedClients(roomId);

        // console.log("number of users in this room", clients);

        if (clients.length > 0) {
            // console.log(
            //     `total users in the room currently: ,
            //     ${socket.id},
            //     ${clients.length},
            //     ${clients}`
            // );
            io.to(roomId).emit("user:joined", { username, id: socket.id }); // baaki room members ko send karna ki ek new user join ho gaya hai
            io.to(socket.id).emit("room:join", {
                // khud ko batana, ki jo other user hai uske baar mein
                data: data,
                msg: "id of other user of the room",
                id: clients[0]?.socketId,
                otherUserName: socketidToUserMap.get(clients[0]?.socketId),
                editorContent: editorContent,
                currentLanguage: currentLanguage,
            });
        }
        console.log(socketidToUserMap);
        socket.join(roomId);
    });

    socket.on("editor:request", (name) => {
        console.log("request from", name);
        socket.emit("editor:update", {
            content: editorContent,
            language: currentLanguage,
        });
    });

    socket.on("leave:room", ({ roomId, username }) => {
        socket.leave(roomId);
        io.to(roomId).emit("userLeftRoom", { name: username });
    });

    socket.on("user:call", ({ to, offer }) => {
        io.to(to).emit("incomming:call", { from: socket.id, offer });
    });

    socket.on("call:accepted", ({ to, ans }) => {
        io.to(to).emit("call:accepted", { from: socket.id, ans });
    });

    socket.on("peer:nego:needed", ({ to, offer }) => {
        // console.log("peer:nego:needed", offer);
        io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
    });

    socket.on("peer:nego:done", ({ to, ans }) => {
        // console.log("peer:nego:done", ans);
        io.to(to).emit("peer:nego:final", { from: socket.id, ans });
    });

    // WhiteBoard
    socket.on("using:whiteboard", ({ fellowUsername, roomId }) => {
        // console.log("using:whiteboard", fellowUsername);
        socket.to(roomId).emit("fellow:using:whiteboard", {
            fellowUsername,
            id: socket.id,
        });
    });

    socket.on("beginPath", (arg) => {
        socket.broadcast.emit("beginPath", arg);
    });

    socket.on("drawLine", (arg) => {
        socket.broadcast.emit("drawLine", arg);
    });

    socket.on("endPath", () => {
        socket.broadcast.emit("endPath");
    });

    socket.on("changeConfig", (arg) => {
        socket.broadcast.emit("changeConfig", arg);
    });

    socket.on("undo", () => {
        socket.broadcast.emit("undo");
    });

    socket.on("redo", () => {
        socket.broadcast.emit("redo");
    });

    socket.on("clear", () => {
        socket.broadcast.emit("clear");
    });

    // CodeEditor
    socket.on("using:editor", ({ fellowUsername, roomId }) => {
        // socket.broadcast.emit("fellow:using:editor", { fellowUsername });
        // console.log(`telling that ${fellowUsername} using:editor`);
        socket.to(roomId).emit("fellow:using:editor", { fellowUsername });
    });

    socket.on("codeChange", ({ code, roomId }) => {
        // Acquire a lock before changing the code state
        lock.acquire("codeLock", (done) => {
            // codeState = newCode;
            // Broadcast the new code to all clients except the sender
            // socket.broadcast.emit("codeUpdate", newCode);
            editorContent = code;
            io.to(roomId).emit("codeUpdate", code);
            done();
        });
        // codeState = newCode;
        // socket.broadcast.emit("codeUpdate", newCode);
        // console.log("CodeChange", { code, roomId });

        io.to(roomId).emit("codeUpdate", code);
    });

    socket.on("langChange", ({ language, roomId }) => {
        currentLanguage = language;
        io.to(roomId).emit("langChange", language);
    });

    /* discarded
        socket.on("room:join", (data) => {
            const { roomId, username } = data;
            userToSocketIdMap.set(username, socket.id);
            socketIdToUserMap.set(socket.id, username);

            socket.to(roomId).emit("user:joined", { username, id: socket.id }); // broadcasting to all the memebers of this room.
            socket.join(roomId); // let the new user join this room.
            io.to(socket.id).emit("room:join", {
                ...data,
                mySocketId: socket.id,
            }); // let the new user know that he has joined the room.
        });

        socket.on("user:call", ({ to, offer }) => {
            io.to(to).emit("incoming:call", { from: socket.id, offer });
        });

        socket.on("call:accepted", ({ to, ans }) => {
            io.to(to).emit("call:accepted", { from: socket.id, ans });
        });

        // socket.on("disconnect", () => {
        //     console.log("Disconnected");
        // });

        socket.on("peer:nego:needed", ({ to, offer }) => {
            console.log("peer:nego:needed", offer);
            io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
        });

        socket.on("peer:nego:done", ({ to, ans }) => {
            console.log("peer:nego:done", ans);
            io.to(to).emit("peer:nego:final", { from: socket.id, ans });
        });
    */
});

function error(err, req, res, next) {
    if (!test) console.error(err.stack);

    res.status(500);
    res.send("Internal Server Error");
}

app.use(error);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
