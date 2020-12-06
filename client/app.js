// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem) {
	while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString) {
	let template = document.createElement('template');
	template.innerHTML = htmlString.trim();
	return template.content.firstChild;
}

function sanitize (inputString) {
    var tagsToReplace = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    };
    return inputString.replace(/[&<>]/g, function(symbol) {
        return tagsToReplace[symbol] || symbol;
    })
}

// Global variables
var curId = 4;
var profile = {
    username: "Alice"
}

var Service = {
    // functions to make requests to the server
    origin: window.location.origin,
    getAllRooms: function() {
        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", Service.origin + "/chat");
            xhr.onload = function() {
                if (xhr.status == 200) {
                    resolve(JSON.parse(xhr.responseText));
                }
                else if (xhr.status >= 400 && xhr.status < 500) {
                    reject(new Error(xhr.responseText));
                }

                else if (xhr.status >= 500) {
                    reject(new Error(xhr.responseText));
                }
            }
            xhr.onerror = function(message) {
                reject(new Error(message));
            }
            xhr.send();
        });
    },
    addRoom: function(data) {
        return new Promise((resolve, reject) => {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open("POST", Service.origin + "/chat");
                xhr.setRequestHeader("Content-type", "application/json");
                xhr.onload = function() {
                    if (xhr.status == 200) {
                        resolve(JSON.parse(xhr.responseText));
                    }
                    else if (xhr.status >= 400 && xhr.status < 500) {
                        reject(new Error(xhr.responseText));
                    }
    
                    else if (xhr.status >= 500) {
                        reject(new Error(xhr.responseText));
                    }
                }

                xhr.onerror = function(message) {
                    reject(new Error(message))
                }
                xhr.send(JSON.stringify(data));
            }
            catch (err) {
                reject(new Error(err));
            }
        });
    },
    getLastConversation: function(roomId, before) {
        return new Promise((resolve, reject) => {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", Service.origin + "/chat/" + roomId + "/messages?before=" + before);
                xhr.onload = function() {
                    if (xhr.status == 200) {
                        resolve(JSON.parse(xhr.responseText));
                    }
                    else if (xhr.status >= 400 && xhr.status < 500) {
                        reject(new Error(xhr.responseText));
                    }

                    else if (xhr.status >= 500) {
                        reject(new Error(xhr.responseText));
                    }
                }
                xhr.onerror = function(message) {
                    reject(new Error(message));
                }
                xhr.send();
            }
            catch (err) {
                reject(new Error(err));
            }
        })
    },
    getProfile: function() {
        return new Promise((resolve, reject) => {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", Service.origin + "/profile");
                xhr.onload = function() {
                    if (xhr.status == 200) {
                        resolve(JSON.parse(xhr.responseText));
                    }
                    else if (xhr.status >= 400) {
                        reject(new Error(xhr.responseText));
                    }
                }
                xhr.onerror = function(message) {
                    reject(new Error(message));
                }
                xhr.send();
            }
            catch (err) {
                reject(new Error(err));
            }
        })
    }
};

function* makeConversationLoader(room) {
    var lastTimeStamp = room.timestamp;
    var conversationData = null;
    while (lastTimeStamp > 0 && room.canLoadConversation) {
        room.canLoadConversation = false;
        lastConversationPromise = Service.getLastConversation(room.id, lastTimeStamp);
        lastConversationPromise.then(                
            (result) => {
                if (result !== null) {
                    lastTimeStamp = result.timestamp;
                    room.canLoadConversation = true;
                    room.addConversation(result);
                    conversationData = result;
                }
            },
            (error) => {
                console.log(error);
            }
        );
        yield(conversationData);
    }
}

class LobbyView {
    constructor(lobby) {
        this.lobby = lobby;
        this.elem = createDOM('<div class="content"> <ul class="room-list"> </ul> <div class="page-control"> <input id="room-title" type="text"> <button id="create-room-btn">Create Room</button> </div> </div>');
        this.listElem = this.elem.querySelector("ul.room-list")
        this.inputElem = this.elem.querySelector("input");
        this.buttonElem = this.elem.querySelector("button");
        this.redrawList();
        var that = this;
        this.buttonElem.addEventListener("click", function() {
            Service.addRoom({
                _id: curId.toString(),
                name: that.inputElem.value.toString(),
                image: "assets/everyone-icon.png"
            }).then(
                (result) => {
                    that.lobby.addRoom(result._id, result.name, result.image, result.messages);
                    that.inputElem.value = "";
                    curId++;
                },
                (error) => {
                    console.log(error);
                }
            )
        })
        this.lobby.onNewRoom = function(room) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.setAttribute('href', '/#/chat/' + room.id);
            a.innerText = room.name;
            li.appendChild(a);
            that.listElem.appendChild(li);
        };
        this.redrawList();
    }

    redrawList() {
        while(this.listElem.firstChild) {
            this.listElem.removeChild(this.listElem.firstChild);
        }

        var id;
        for (id in this.lobby.rooms) {
            var curRoom = this.lobby.rooms[id];
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.setAttribute('href', '/#/chat/' + curRoom.id);
            a.innerText = curRoom.name;
            li.appendChild(a);
            this.listElem.appendChild(li);
        }
    }
}

class ChatView {
    constructor(socket) {
        this.elem = createDOM('<div class="content"> <h4 class="room-name"></h4> <div class="message-list"> <div class="message"> </div> </div> <div class="page-control"> <textarea id="chat-box"></textarea> <button id="send-btn">Send</button> </div> </div>');
        this.titleElem = this.elem.querySelector("h4");
        this.chatElem = this.elem.querySelector("div.message-list");
        this.inputElem = this.elem.querySelector("textarea");
        this.buttonElem = this.elem.querySelector("button");
        this.room = null;
        this.socket = socket;
        this.chatElem.style.minHeight = "50%";
        this.chatElem.style.maxHeight = "100%";
        var that = this;
        this.buttonElem.addEventListener('click', function() {
            that.sendMessage();
        });
        this.inputElem.addEventListener('keyup', function(event) {
            if (!event.shiftKey && event.key === "Enter") {
                that.sendMessage();
            }
        })
        this.chatElem.addEventListener('wheel', function(event) {
            if (that.chatElem.scrollTop === 0 && event.deltaY < 0 && that.room.canLoadConversation) {
                that.room.getLastConversation.next();
            }
        })
    }

    sendMessage() {
        this.room.addMessage(profile.username, this.inputElem.value);
        this.socket.send(JSON.stringify({
            roomId: this.room.id,
            text: this.inputElem.value
        }));
        this.inputElem.value = "";
    }

    setRoom(room) {
        this.room = room;
        this.titleElem.innerText = room.name;
        while (this.chatElem.firstChild) {
            this.chatElem.removeChild(this.chatElem.firstChild)
        }

        var id;
        for (id = 0; id < this.room.messages.length; id++) {
            var message = this.room.messages[id];
            var div = document.createElement('div');
            if (message.username !== profile.username) {
                div.className = "message";
            }
            else {
                div.className = "message my-message";
            }
            var spanName = document.createElement('span');
            spanName.className = "message-user";
            spanName.innerText = message.username;
            var spanMess = document.createElement('span');
            spanMess.className = "message-text";
            spanMess.innerText = message.text;

            this.chatElem.appendChild(div);
            div.appendChild(spanName);
            div.appendChild(spanMess);
        }

        var that = this;        
        this.room.onNewMessage = function(message) {
            var div = document.createElement('div');
            var sanitizedUsername = sanitize(message.username);
            var sanitizedText = sanitize(message.text);
            if (message.username !== profile.username) {
                div.className = "message";
            }
            else {
                div.className = "message my-message";
            }
            var spanName = document.createElement('span');
            spanName.className = "message-user";
            spanName.innerText = sanitizedUsername;
            var spanMess = document.createElement('span');
            spanMess.className = "message-text";
            spanMess.innerText = sanitizedText;

            that.chatElem.appendChild(div);
            div.appendChild(spanName);
            div.appendChild(spanMess);
        }

        this.room.onFetchConversation = function(conversation) {
            var hb = that.chatElem.scrollHeight;
            var messages = conversation.messages;
            for (var i = messages.length - 1; i >= 0; i--) {
                var div = document.createElement('div');
                if (messages[i].username !== profile.username) {
                    div.className = "message";
                }
                else {
                    div.className = "message my-message";
                }
                var spanName = document.createElement('span');
                spanName.className = "message-user";
                spanName.innerText = messages[i].username;
                var spanMess = document.createElement('span');
                spanMess.className = "message-text";
                spanMess.innerText = messages[i].text;
    
                that.chatElem.prepend(div);
                div.appendChild(spanName);
                div.appendChild(spanMess);
            }
            var ha = that.chatElem.scrollHeight;
            that.chatElem.scrollTop = ha - hb;
        }
    }
}

class ProfileView {
    constructor() {
        this.elem = createDOM('<div class="content"> <div class="profile-form"> <div class="form-field"> <label>Username</label> <input type="text"> </div> <div class="form-field"> <label>Password</label> <input type="password"> </div> <div class="form-field"> <label>Avatar Image</label> <input type="file"> </div> <div class="form-field"> <label>About</label> <input id="desc" type="text"> </div> </div> <div class="page-control"> <button>Save</button> </div> </div>')
    }
}

class Room {
    constructor(id, name, image="assets/everyone-icon.png", messages=[] ) {
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.id = id;
        this.timestamp = Date.now();
        this.getLastConversation = makeConversationLoader(this);
        this.canLoadConversation = true;
    }

    addMessage(username, text) {
        if (!text.trim().length) {
            return;
        }
        else {
            var message = {
                username: username,
                text: text
            }
            this.messages.push(message);
        }
        if (this.onNewMessage !== undefined) {
            this.onNewMessage(message);
        }
    }

    addConversation(conversation) {
        console.log("APP DEBUGGER 1");
        console.log(this.messages);
        this.messages = conversation.messages.concat(this.messages);
        console.log("APP DEBUGGER 2");
        console.log(this.messages);
        if (this.onFetchConversation !== undefined) {
            this.onFetchConversation(conversation);
        }
    }
}

class Lobby {
    constructor() {
        this.rooms = {
        }
    }

    getRoom(roomId) {
        if (this.rooms[roomId] !== undefined) {
            return this.rooms[roomId];
        }
        else {
            return null;
        }
    }

    addRoom(id, name, image, messages) {
        var newRoom = new Room(id, name, image, messages);
        this.rooms[id] = newRoom;
        if (this.onNewRoom !== undefined) {
            this.onNewRoom(newRoom);
        }
    }
}

var main = function() {
    var socket = new WebSocket("ws://localhost:3000");
    socket.addEventListener('message', function(event) {
        var incomingMess = JSON.parse(event.data);
        var selectedRoom = lobby.getRoom(incomingMess.roomId);
        selectedRoom.addMessage(incomingMess.username, incomingMess.text);

    });
    var lobby = new Lobby(); // single source of truth
    var lobbyView = new LobbyView(lobby);
    var chatView = new ChatView(socket);
    var profileView = new ProfileView();
    Service.getProfile().then(
        (result) => {
            profile = result;
        },
        (error) => {
            console.log(error);
        }
    )
    var renderRoute = function() {
        var route = window.location.hash;
        if (route === "#/") {
            var pageview = document.getElementById("page-view");
            emptyDOM(pageview);
            pageview.appendChild(lobbyView.elem);
        }
        else if (route.includes("#/chat")) {
            var pageview = document.getElementById("page-view");
            emptyDOM(document.getElementById("page-view"));
            pageview.appendChild(chatView.elem);
            var curRoom = lobby.getRoom(route.split('/')[2]);
            if (curRoom !== null) {
                chatView.setRoom(curRoom);
            }
        }
        else if (route.includes("#/profile")) {
            var pageview = document.getElementById("page-view");
            emptyDOM(document.getElementById("page-view"));
            pageview.appendChild(profileView.elem);
        }
    };
    var refreshLobby = function() {
        Service.getAllRooms().then( 
            (roomsList) => {
                var roomsArray = Array.from(roomsList);
                for (var i = 0; i < roomsArray.length; i++) {
                    var currRoom = lobby.getRoom(roomsArray[i]._id);
                    if (currRoom !== null) {
                        currRoom.name = roomsArray[i].name;
                        currRoom.image = roomsArray[i].image;
                    }
                    else {
                        lobby.addRoom(roomsArray[i]._id, roomsArray[i].name, roomsArray[i].image, roomsArray[i].messages)
                    }
                }
            }
        ).catch((err) => console.log("Error"))
    }

    renderRoute();
    refreshLobby();
    setInterval(refreshLobby, 5000);
    window.addEventListener('popstate', renderRoute, false);
    cpen400a.export(arguments.callee, { renderRoute, lobbyView, chatView, profileView, lobby, refreshLobby, socket });
}

window.addEventListener("load", main, false);