const { MongoClient, ObjectID, Logger } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v3.6+ - [API Documentation](http://mongodb.github.io/node-mongodb-native/3.6/api/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen400a app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(
			mongoUrl,
			{
				useNewUrlParser: true
			},
			(err, client) => {
				if (err) reject(err);
				else {
					console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
					resolve(client.db(dbName));
				}
			}
		)
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getUser = function(username){
    return this.connected.then(db =>
        new Promise((resolve, reject) => {
            var users = db.collection('users');
            users.findOne({username: username}).then(function(result) {
                resolve(result);
            }, function(err) {
                reject("Error getting room " + err);
            });
        })
    )
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatrooms from `db`
			 * and resolve an array of chatrooms */
            var chatRooms = db.collection('chatrooms');
            chatRooms.find({}).toArray((err, rooms) => {
                if (err) {
                    console.log('Error occurred: ' + err.message);
                    reject(err);
                }
                else {
                    resolve(rooms);
                }
            })
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read the chatroom from `db`
			 * and resolve the result */
            if (ObjectID.isValid(room_id)) {
                db.collection('chatrooms').findOne({_id: ObjectID(room_id)}).then(function(result) {
                    resolve(result);
                }, function(err) {
                    reject("Error getting room " + err);
                });
            }
            else if (typeof room_id === 'string') {
                db.collection('chatrooms').findOne({_id: room_id}).then(function(result) {
                    resolve(result);
                }, function(err) {
                    reject("Error getting room " + err);
                });
            }
            else {
                reject("Invalid room id type");
            }
		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			/* TODO: insert a room in the "chatrooms" collection in `db`
			 * and resolve the newly added room */
            if (room.name === undefined) {
                reject(new Error("Room without name"))
            }
            else {
                db.collection("chatrooms").insertOne(room, function(err, res) {
                    if (err) {
                        throw err;
                    }
                    room._id = res.insertedId;
                    resolve(room);
                })
            }
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: read a conversation from `db` based on the given arguments
			 * and resolve if found */
            if (before == null) {
                before = Date.now();
            }
            db.collection('conversations').find({
                room_id: room_id,
                timestamp: {"$lte": before - 1}
            }).toArray((err, conversations) => {
                if (err) {
                    console.log('Error occurred: ' + err.message);
                    reject(err);
                }
                else {
                    if (conversations === null) {
                        resolve(null);
                    }

                    conversations.sort(function(curr, next) {
                        return curr.timestamp > next.timestamp;
                    })
                    resolve(conversations[conversations.length - 1]);
                }
            })
		})
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			/* TODO: insert a conversation in the "conversations" collection in `db`
			 * and resolve the newly added conversation */
            if (conversation.room_id === undefined 
                || conversation.room_id === null
                || conversation.timestamp === undefined
                || conversation.timestamp === null 
                || conversation.messages === undefined
                || conversation.messages === null) {
                reject(new Error("Missing conversation attributes"));
            }
            else {
                db.collection("conversations").insertOne(conversation, function(err, res) {
                    if (err) {
                        throw err;
                    }
                    resolve(conversation);
                })
            }
		})
	)
}

module.exports = Database;