const { WebSocketServer } = require('ws');
const { supabase } = require('../config/supabase');

function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Keep track of all connected players
  // Key: socket, Value: { userId, sessionId, position, lastUpdate }
  const players = new Map();

  wss.on('connection', (socket, req) => {
    console.log('New WS connection');

    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'join') {
          const { userId, sessionId, position } = data;
          players.set(socket, { userId, sessionId, position, lastUpdate: Date.now() });
          
          // Update last_seen_at in DB
          try {
            await supabase
              .from('user_profiles')
              .update({ last_seen_at: new Date().toISOString() })
              .eq('user_id', userId);
          } catch (err) {
            console.error('Error updating last_seen_at:', err);
          }
          
          // Send existing players to the new player
          const otherPlayers = [];
          for (const [s, p] of players.entries()) {
            if (s !== socket) {
              otherPlayers.push({ userId: p.userId, sessionId: p.sessionId, position: p.position });
            }
          }
          
          console.log(`📥 User ${userId} (Session: ${sessionId}) joining. Sending ${otherPlayers.length} existing players`);
          socket.send(JSON.stringify({ type: 'playersList', players: otherPlayers }));

          // Notify others about the new player
          console.log(`📤 Broadcasting playerJoined to ${players.size - 1} other players`);
          broadcast({
            type: 'playerJoined',
            player: { userId, sessionId, position }
          }, socket);

          console.log(`✅ User ${userId} (Session: ${sessionId}) joined. Total players: ${players.size}`);
        } 
        
        else if (data.type === 'updatePosition') {
          const player = players.get(socket);
          if (player) {
            player.position = data.position;
            player.lastUpdate = Date.now();

            // Broadcast to all other players (only if there are others)
            const otherCount = players.size - 1;
            if (otherCount > 0) {
              broadcast({
                type: 'playerMoved',
                userId: player.userId,
                sessionId: player.sessionId,
                position: data.position
              }, socket);
            }

            // Update last_seen_at if it's been more than 1 minute since last update
            if (Date.now() - player.lastUpdate > 60000) {
              await supabase
                .from('user_profiles')
                .update({ last_seen_at: new Date().toISOString() })
                .eq('user_id', player.userId);
            }
          }
        }

        else if (data.type === 'saveLocation') {
          // Explicit save request
          const { userId, position } = data;
          await supabase
            .from('game_locations')
            .upsert({ 
              user_id: userId, 
              x: position.x, 
              y: position.y, 
              direction: position.direction,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        }

      } catch (error) {
        console.error('WS Error:', error);
        socket.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    socket.on('close', async () => {
      const player = players.get(socket);
      if (player) {
        console.log(`User ${player.userId} (Session: ${player.sessionId}) left the game`);
        
        // Save final location to DB
        try {
          await supabase
            .from('game_locations')
            .upsert({ 
              user_id: player.userId, 
              x: player.position.x, 
              y: player.position.y,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        } catch (dbError) {
          console.error('Error saving final location:', dbError);
        }

        broadcast({
          type: 'playerLeft',
          userId: player.userId,
          sessionId: player.sessionId
        }, socket);
        players.delete(socket);
      }
    });
  });

  function broadcast(data, excludeSocket = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === 1 && client !== excludeSocket) {
        client.send(message);
      }
    });
  }

  return wss;
}

module.exports = { createWebSocketServer };
