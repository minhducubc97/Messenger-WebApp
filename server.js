const path = require('path');
const fs = require('fs');
const express = require('express');
const cpen400a = require('./cpen400a-tester');
const ws = require('ws');
const Database = require('./Database');
const SessionManager = require('./SessionManager');
const ObjectID = require('mongodb').ObjectID;
const crypto = require('crypto');

function logRequest(req, res, next){
	console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
	next();
}

function isCorrectPassword(password, saltedHash) {
    var salt = saltedHash.substring(0, 20);
    var base64 = saltedHash.substring(20);
    var sha256Hash = crypto.createHash('sha256').update(password + salt).digest('base64');
    if (base64 === sha256Hash) {
        return true;
    }
    return false;
}

function sanitize (inputString) {
    var tagsToReplace = {
        '<': '&lt;',
        '>': '&gt;'
    };
    return inputString.replace(/[<>]/g, function(symbol) {
        return tagsToReplace[symbol] || symbol;
    })
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');
const messageBlockSize = 10;
const broker = new ws.Server({ port: 8000 })
broker.on('connection', function connection(orgClient, request) {
    var rc = request.headers.cookie;
    var cookieObj = {};

    rc && rc.split(';').forEach(function( cookie ) {
        var parts = cookie.split('=');
        cookieObj[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    
    var username = sessionManager.getUsername(cookieObj['cpen400a-session']);
    if (username === undefined || username === null) {
        orgClient.close();
    }
    else {
        orgClient.on('message', function incoming(data) {
            var package = JSON.parse(data);
            var roomId = package.roomId;
            var text = package.text;
            var message = {
                username: sanitize(username),
                text: sanitize(text)
            }
            if (messages[roomId] !== undefined) {
                messages[roomId].push(message);
            }
            else {
                messages[roomId] = [];
                messages[roomId].push(message);
            }
            broker.clients.forEach(function each(client) {
                if (client !== orgClient && client.readyState === ws.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
    
            if (messages[roomId].length === messageBlockSize) {
                var newConversation = {
                    _id: ObjectID(),
                    room_id: roomId,
                    timestamp: Date.now(),
                    messages: messages[roomId]
                }
                db.addConversation(newConversation);
                messages[roomId] = [];
            }
        })
    }
})

var db = new Database("mongodb://localhost:27017", "cpen400a-messenger");
var messages = {};
var promiseRooms = db.getRooms();
promiseRooms.then(function(chatrooms) {
    for (var i = 0; i < chatrooms.length; i++) {
        messages[chatrooms[i]._id.toString()] = [];
    }
}, function(err) {
    console.log("Error reading rooms' data");
});
var sessionManager = new SessionManager();

// express app
let app = express();

app.use(express.json()) 						// to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);							// logging for debug

app.route('/chat')
.get(sessionManager.middleware, function(req, res, next) {
    var promiseRooms = db.getRooms();
    promiseRooms.then(function(chatrooms) {
        var chatrooms_mess = chatrooms.map(room => Object.assign({
            messages: messages[room._id]
        }, room));
        // console.log(chatrooms_mess);
        res.status(200).json(chatrooms_mess);
    }, function(err) {
        console.log("Error reading rooms' data")
    })
})
.post(sessionManager.middleware, function(req, res, next) {
    if ('name' in req.body) {
        var newId = ObjectID();
        messages[newId] = [];
        var newRoom = {
            _id: newId,
            name: req.body.name,
            image: req.body.image,
            messages: messages[newId]
        }
        console.log("SERVER DEBUGGER")
        console.log(newRoom)
        db.addRoom(newRoom);
        res.status(200).json(newRoom);
    }
    else {
        res.status(400).json('Missing name field')
    }
})

app.get('/chat/:room_id', sessionManager.middleware, function (req, res) {
    var promiseRoom = db.getRoom(req.params['room_id']);
    promiseRoom.then(function(room) {
        if (room !== null) {
            res.status(200).send(room);
        }
        else {
            res.status(404).send('Room ' + req.params[0] + ' was not found');
        }
    })
})

app.get('/chat/:room_id/messages', sessionManager.middleware, function (req, res) {
    var promiseConversation = db.getLastConversation(req.params['room_id'], req.query.before);
    promiseConversation.then(function(conversation) {
        if (conversation !== null) {
            res.status(200).send(conversation);
        }
        else {
            res.status(404).send('Conversation ' + req.params['room_id'] + ' was not found');
        }
    })
})

app.get('/profile', sessionManager.middleware, function (req, res) {
    var obj = {
        username: req.username
    }
    res.status(200).send(JSON.stringify(obj));
})

app.post('/login', function (req, res) {
    var username = req.body.username;
    db.getUser(username).then(function(results) {
        if (results === null) {
            return res.redirect('/login');
        }
        else {
            var password = req.body.password;
            if (isCorrectPassword(password, results.password)) {
                sessionManager.createSession(res, username, 50000);
                return res.redirect('/');
            }
            else {
                return res.redirect('/login');
            }
        }
    })
})

app.get('/logout', function (req, res) {
    sessionManager.deleteSession(req);
    res.redirect('/login');
})

// serve static files (client-side)
app.use('/+', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.use('/profile', sessionManager.middleware, express.static(clientApp + '/profile.html'));
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.use((err, req, res, next) => {
    if (err instanceof SessionManager.Error) {
        if (req.headers.accept == "application/json") {
            return res.status(401).json(err);
        }
        else {
            return res.redirect('/login');
        }
    }
    else if (err) {
        return res.status(500).send("Error 500");
    }
    else {
        next();
    }
})

app.listen(process.env.PORT || port, () => {
	console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
});

cpen400a.connect('http://35.183.65.155/cpen400a/test-a5-server.js');
cpen400a.export(__filename, { app, messages, broker, db, messageBlockSize, sessionManager, isCorrectPassword });