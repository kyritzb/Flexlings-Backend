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
          const { userId, sessionId, position, isSpectator } = data;
          
          let username = data.username || 'Player';
          if (userId) {
            try {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('username')
                .eq('user_id', userId)
                .single();
              if (profile?.username) {
                username = profile.username;
              }
            } catch (err) {
              console.error('Error fetching username:', err);
            }
          }

          players.set(socket, { userId, sessionId, position, username, lastUpdate: Date.now(), isSpectator: !!isSpectator });
          
          if (!isSpectator) {
            // Update last_seen_at in DB only for actual players
            try {
              await supabase
                .from('user_profiles')
                .update({ last_seen_at: new Date().toISOString() })
                .eq('user_id', userId);
            } catch (err) {
              console.error('Error updating last_seen_at:', err);
            }
          }
          
          // Send existing players to the new joiner (both players and spectators see others)
          const otherPlayers = [];
          for (const [s, p] of players.entries()) {
            if (s !== socket && !p.isSpectator) {
              otherPlayers.push({ 
                userId: p.userId, 
                sessionId: p.sessionId, 
                position: p.position,
                username: p.username 
              });
            }
          }
          
          console.log(`📥 ${isSpectator ? 'Spectator' : 'User'} ${userId} (Session: ${sessionId}) joining as ${username}. Sending ${otherPlayers.length} existing players`);
          socket.send(JSON.stringify({ type: 'playersList', players: otherPlayers }));

          if (!isSpectator) {
            // Notify others about the new player only if they aren't a spectator
            console.log(`📤 Broadcasting playerJoined to ${players.size - 1} other players`);
            broadcast({
              type: 'playerJoined',
              player: { userId, sessionId, position, username }
            }, socket);
          }

          // Broadcast online count to everyone
          broadcastOnlineCount();

          console.log(`✅ ${isSpectator ? 'Spectator' : 'User'} ${username} joined. Total connections: ${players.size}`);
        } 
        
        else if (data.type === 'updatePosition') {
          const player = players.get(socket);
          if (player && !player.isSpectator) {
            player.position = data.position;
            player.lastUpdate = Date.now();

            // Broadcast to all other players (spectators also need to see movement)
            broadcast({
              type: 'playerMoved',
              userId: player.userId,
              sessionId: player.sessionId,
              position: data.position,
              username: player.username
            }, socket);
          }
        }

        else if (data.type === 'leave') {
          const player = players.get(socket);
          if (player) {
            console.log(`👋 ${player.isSpectator ? 'Spectator' : 'User'} ${player.userId} sent explicit leave`);
            handlePlayerLeave(socket, player);
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
        await handlePlayerLeave(socket, player);
      }
    });
  });

  async function handlePlayerLeave(socket, player) {
    console.log(`${player.isSpectator ? 'Spectator' : 'User'} ${player.userId} left the game`);
    
    if (!player.isSpectator) {
      // Save final location to DB only for actual players
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
    }
    
    players.delete(socket);
    broadcastOnlineCount();
  }

  function broadcastOnlineCount() {
    const count = Array.from(players.values()).filter(p => !p.isSpectator).length;
    console.log(`📢 Broadcasting online count: ${count} (Total connections: ${players.size})`);
    broadcast({ type: 'onlineCount', count });
  }

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
