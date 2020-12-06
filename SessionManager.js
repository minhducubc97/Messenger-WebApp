const crypto = require('crypto');
const http = require('http');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
        /* To be implemented */
        var token = crypto.randomBytes(20).toString('base64');
        var obj = {
            username: username,
            timestamp: Date.now(),
            expiry: Date.now() + maxAge
        }
        sessions[token] = obj;
        response.cookie('cpen400a-session', token, {maxAge: maxAge, encode: String});
        setTimeout(() => {
            delete sessions[token];
        }, maxAge);
	};

	this.deleteSession = (request) => {
        /* To be implemented */
        delete request['username'];
        var token = request['session'];
        delete request['session'];
        delete sessions[token];
	};

	this.middleware = (request, response, next) => {
        /* To be implemented */
        var rc = request.headers.cookie;
        if (rc === undefined) {
            next(new SessionError('Cookie header undefined!'))
        }
        else {
            var cookieObj = {};

            rc && rc.split(';').forEach(function( cookie ) {
                var parts = cookie.split('=');
                cookieObj[parts.shift().trim()] = decodeURI(parts.join('='));
            });

            if (cookieObj['cpen400a-session'] === undefined) {
                next(new SessionError('Cookie for cpen400a not found!'));
            }
            else {
                var cpen400aSession = sessions[cookieObj['cpen400a-session']];
                if (cpen400aSession === undefined) {
                    next(new SessionError('Session for cpen400a not found!'));
                }
                else {
                    request.username = cpen400aSession.username;
                    request.session = cookieObj['cpen400a-session'];
                    next();
                }
            }
        }
	};

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;