/**
 * Return a UUID4 string
 * 
 * @return string
 * @see http://stackoverflow.com/a/2117523
 */
function uuid4()
{
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c)
	{
		var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
		return v.toString(16);
	});
}

/**
 * Return a new unique server token
 * 
 * @return string
 */
function newToken()
{
	var token = "";
	while (true)
	{
		token = uuid4().replace(/-/g, "").slice(-8);
		if (typeof findInitiatorIdFromToken(token) === "undefined")
		{
			return token;
		}
	}
}

/**
 * Search and return a known initiator ID associated with the token
 * 
 * @return string Initiator ID or undefined if failure
 */
function findInitiatorIdFromToken(token)
{
	for (var id in gSessions)
	{
		if (gSessions.hasOwnProperty(id))
		{
			if (token === gSessions[id].token)
			{
				return id;
			}
		}
	}
}

/**
 * Search and return a known initiator ID associated with the receiver
 * 
 * @return string Initiator ID or undefined if failure
 */
function findInitiatorIdFromReceiver(receiverId)
{
	for (var id in gSessions)
	{
		if (gSessions.hasOwnProperty(id))
		{
			if (gSessions[id].receiver === receiverId)
			{
				return id;
			}
		}
	}
}

var io = require("socket.io")(6033, {
	"origins": "*:*", // CORS
});

var gSessions = {};

io.on("connection", function(socket)
{
	console.log("connection: " + socket.id);
	// Called when a new initiator is connected
	socket.on("signaling-new-initiator", function()
	{
		console.log("signaling-new-initiator: " + socket.id);
		if (!(socket.id in gSessions))
		{
			console.log("beg session: " + socket.id);
			var token = newToken();
			gSessions[socket.id] = {
				token: token,
				receiver: null,
				has_ack: false,
			};
			console.log("session count: " + Object.keys(gSessions).length + "(+1)");
			socket.emit("signaling-new-initiator:token", token);
		}
		else
		{
			console.log("resume session: " + socket.id);
		}
	});

	// Called when an initiator is sending its offer
	socket.on("signaling-send-offer", function(offer)
	{
		console.log("signaling-send-offer: " + socket.id);
		if (!(socket.id in gSessions))
		{
			// No initiator found (???)
			console.log("Initiator not found");
		}
		else
		{
			var s = gSessions[socket.id];
			if (!s.receiver)
			{
				console.log("Offer heading nowhere");
			}
			else
			{
				// Echo the offer to the receiver
				io.to(s.receiver).emit("signaling-send-offer", offer);
			}
		}
	});

	// Called when an initiator is acking the answer
	socket.on("signaling-ack-answer", function()
	{
		console.log("signaling-ack-answer: " + socket.id);
		if (!(socket.id in gSessions))
		{
			// No initiator found (???)
			console.log("Initiator not found");
		}
		else
		{
			var s = gSessions[socket.id];
			s.has_ack = true;
			io.to(s.receiver).emit("signaling-ack-answer");
		}
	});

	// Called when a new receiver is connected
	socket.on("signaling-new-receiver", function(token)
	{
		console.log("signaling-new-receiver: " + socket.id);
		var initiatorId = findInitiatorIdFromToken(token);
		if (typeof initiatorId === "undefined")
		{
			// No initiator found
			console.log("Initiator not found for token: " + token);
			socket.emit("signaling-req-disconnect", "Invalid token");
		}
		else
		{
			var s = gSessions[initiatorId];
			if (s.receiver)
			{
				// Replace the old one
				io.to(s.receiver).emit("signaling-req-disconnect", "Replaced");
			}
			s.receiver = socket.id;
			io.to(initiatorId).emit("signaling-new-receiver");
		}
	});

	// Called when a receiver is sending its answer
	socket.on("signaling-send-answer", function(answer)
	{
		console.log("signaling-send-answer: " + socket.id);
		var initiatorId = findInitiatorIdFromReceiver(socket.id);
		if (typeof initiatorId === "undefined")
		{
			// No initiator found
			console.log("Initiator not found");
			socket.emit("signaling-req-disconnect", "Invalid token");
		}
		else
		{
			io.to(initiatorId).emit("signaling-send-answer", answer);
		}
	});

	// Called when a client has disconnected
	socket.on("disconnect", function()
	{
		console.log("disconnect: " + socket.id);
		if (socket.id in gSessions)
		{
			// Initiator
			var s = gSessions[socket.id]
			delete gSessions[socket.id]
			if (!s.has_ack && s.receiver)
			{
				io.to(s.receiver).emit("signaling-req-disconnect",
						"Peer disconnected");
			}
			console.log("end session: " + socket.id);
			console.log("session count: " + Object.keys(gSessions).length + "(-1)");
		}
		else
		{
			// Receiver
			var initiatorId = findInitiatorIdFromReceiver(socket.id);
			if (typeof initiatorId === "undefined")
			{
				// No initiator found
				return
			}
			gSessions[initiatorId].receiver = null;
		}
	});
});

console.log("RTC signaling server started");
