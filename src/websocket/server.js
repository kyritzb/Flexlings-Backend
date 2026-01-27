const { WebSocketServer } = require('ws');
const { supabase } = require('../config/supabase');

function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Keep track of all connected players
  // Key: socket, Value: { userId, sessionId, position, lastUpdate, lastPositionUpdate }
  const players = new Map();
  
  // Map-based player indexing for O(1) map filtering
  // Key: mapId, Value: Set of sockets
  const playersByMap = new Map();
  
  // Rate limiting configuration
  const POSITION_UPDATE_INTERVAL = 66; // ~15 updates/second (1000ms / 15)

  wss.on('connection', (socket, req) => {
    console.log('New WS connection');

    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === 'join') {
          const { userId, sessionId, position, isSpectator, sprite, mapId, deviceInfo } = data;
          
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

          // Check for existing session (only for actual players, not spectators)
          if (!isSpectator && userId) {
            try {
              console.log(`🔍 Checking for existing session for user ${userId} with sessionId ${sessionId}`);
              
              // FIRST: Check if this exact userId+sessionId combo is already connected in memory
              // This handles duplicate connections from the same tab (React strict mode, reconnections, page refresh, etc.)
              for (const [existingSocket, existingPlayer] of players.entries()) {
                if (existingSocket !== socket && 
                    existingPlayer.userId === userId && 
                    existingPlayer.sessionId === sessionId) {
                  console.log(`⚠️ Duplicate connection detected: Same userId ${userId} and sessionId ${sessionId} already connected. Removing old socket immediately.`);
                  
                  // Immediately clean up the old socket from our data structures
                  removePlayerFromMap(existingSocket, existingPlayer.mapId);
                  players.delete(existingSocket);
                  
                  // Broadcast that the old player left
                  broadcastToMap(existingPlayer.mapId, {
                    type: 'playerLeft',
                    userId: existingPlayer.userId,
                    sessionId: existingPlayer.sessionId
                  }, existingSocket);
                  
                  // Then close the socket
                  existingSocket.close(1008, 'Duplicate connection');
                  
                  console.log(`✅ Cleaned up duplicate socket for userId ${userId} sessionId ${sessionId}`);
                  // Don't break - there might be multiple duplicates
                }
              }
              
              // SECOND: Check database for different sessionId (login from another device)
              const { data: existingSession, error: selectError } = await supabase
                .from('game_sessions')
                .select('session_id')
                .eq('user_id', userId)
                .single();

              if (selectError && selectError.code !== 'PGRST116') {
                // PGRST116 = no rows returned, which is fine
                console.error('Error checking for existing session:', selectError);
                throw selectError;
              }

              if (existingSession && existingSession.session_id !== sessionId) {
                console.log(`🚨 User ${userId} already has an active session. Kicking out old session: ${existingSession.session_id}`);
                
                // Find and disconnect the old session (different device/tab)
                for (const [oldSocket, oldPlayer] of players.entries()) {
                  if (oldPlayer.userId === userId && oldPlayer.sessionId === existingSession.session_id) {
                    // Notify the old session that they've been kicked
                    try {
                      oldSocket.send(JSON.stringify({ 
                        type: 'sessionKicked', 
                        message: 'You have been logged in from another device' 
                      }));
                      console.log(`✅ Sent kick message to old session ${existingSession.session_id}`);
                    } catch (err) {
                      console.error('Error sending kick message:', err);
                    }
                    
                    // Immediately clean up the old socket
                    removePlayerFromMap(oldSocket, oldPlayer.mapId);
                    players.delete(oldSocket);
                    
                    // Broadcast that the old player left
                    broadcastToMap(oldPlayer.mapId, {
                      type: 'playerLeft',
                      userId: oldPlayer.userId,
                      sessionId: oldPlayer.sessionId
                    }, oldSocket);
                    
                    // Close the old socket connection
                    oldSocket.close(1008, 'Session replaced by new login');
                    console.log(`✅ Closed old socket for session ${existingSession.session_id}`);
                    // Don't break - close all sockets with that session
                  }
                }

                // Delete the old session from database
                const { error: deleteError } = await supabase
                  .from('game_sessions')
                  .delete()
                  .eq('user_id', userId);
                
                if (deleteError) {
                  console.error('Error deleting old session:', deleteError);
                }
              } else {
                console.log(`✅ No existing session found for user ${userId}, or same session reconnecting`);
              }

              // Create new session record
              const { error: upsertError } = await supabase
                .from('game_sessions')
                .upsert({
                  user_id: userId,
                  session_id: sessionId,
                  connected_at: new Date().toISOString(),
                  last_heartbeat: new Date().toISOString(),
                  device_info: deviceInfo || null
                }, { onConflict: 'user_id' });

              if (upsertError) {
                console.error('Error creating session record:', upsertError);
                throw upsertError;
              }
              
              console.log(`✅ Created session record for user ${userId} with sessionId ${sessionId}`);

            } catch (err) {
              console.error('❌ Error managing game session:', err);
              console.error('Full error details:', JSON.stringify(err, null, 2));
            }
          }

          const playerData = { 
            userId, 
            sessionId, 
            position, 
            username, 
            sprite, 
            mapId: mapId || null,
            lastUpdate: Date.now(),
            lastPositionUpdate: 0, // For rate limiting
            isSpectator: !!isSpectator 
          };
          
          players.set(socket, playerData);
          
          // Add player to map index (if not a spectator)
          if (!isSpectator) {
            addPlayerToMap(socket, mapId || null);
          }
          
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
          
          // Send existing players to the new joiner (only those on the SAME map)
          const otherPlayers = [];
          for (const [s, p] of players.entries()) {
            if (s !== socket && !p.isSpectator && p.mapId === (mapId || null)) {
              otherPlayers.push({ 
                userId: p.userId, 
                sessionId: p.sessionId, 
                position: p.position,
                username: p.username,
                sprite: p.sprite,
                mapId: p.mapId
              });
            }
          }
          
          console.log(`📥 ${isSpectator ? 'Spectator' : 'User'} ${userId} (Session: ${sessionId}) joining as ${username} on map ${mapId}. Sending ${otherPlayers.length} existing players`);
          socket.send(JSON.stringify({ type: 'playersList', players: otherPlayers }));

          if (!isSpectator) {
            // Notify others on the SAME map about the new player
            console.log(`📤 Broadcasting playerJoined to players on map ${mapId}`);
            broadcastToMap(mapId, {
              type: 'playerJoined',
              player: { userId, sessionId, position, username, sprite, mapId }
            }, socket);
          }

          // Broadcast online count to everyone
          broadcastOnlineCount();

          console.log(`✅ ${isSpectator ? 'Spectator' : 'User'} ${username} joined. Total connections: ${players.size}`);
        } 
        
        else if (data.type === 'updatePosition') {
          const player = players.get(socket);
          if (player && !player.isSpectator) {
            const now = Date.now();
            
            // Server-side rate limiting: max 15 updates/second per player
            if (now - player.lastPositionUpdate < POSITION_UPDATE_INTERVAL) {
              return; // Ignore update, too soon
            }
            
            player.position = data.position;
            player.lastUpdate = now;
            player.lastPositionUpdate = now;

            // Broadcast only to players on the SAME map with timestamp for interpolation
            broadcastToMap(player.mapId, {
              type: 'playerMoved',
              userId: player.userId,
              sessionId: player.sessionId,
              position: data.position,
              username: player.username,
              sprite: player.sprite,
              mapId: player.mapId,
              timestamp: now
            }, socket);
          }
        }

        else if (data.type === 'changeMap') {
          const player = players.get(socket);
          if (player && !player.isSpectator) {
            const oldMapId = player.mapId;
            const newMapId = data.targetMapId;
            const newPosition = { 
              x: data.targetX, 
              y: data.targetY, 
              direction: 'down', 
              isMoving: false 
            };

            console.log(`🌍 Player ${player.username} changing map: ${oldMapId} -> ${newMapId}`);

            // 1. Remove player from old map index
            removePlayerFromMap(socket, oldMapId);

            // 2. Notify players on the OLD map that this player left
            broadcastToMap(oldMapId, {
              type: 'playerLeft',
              userId: player.userId,
              sessionId: player.sessionId
            }, socket);

            // 3. Update player state
            player.mapId = newMapId;
            player.position = newPosition;
            
            // 4. Add player to new map index
            addPlayerToMap(socket, newMapId);

            // 5. Notify players on the NEW map that this player joined
            broadcastToMap(newMapId, {
              type: 'playerJoined',
              player: { 
                userId: player.userId, 
                sessionId: player.sessionId, 
                position: player.position, 
                username: player.username, 
                sprite: player.sprite,
                mapId: player.mapId
              }
            }, socket);

            // 6. Send the NEW map's player list to the player
            const otherPlayers = [];
            for (const [s, p] of players.entries()) {
              if (s !== socket && !p.isSpectator && p.mapId === newMapId) {
                otherPlayers.push({ 
                  userId: p.userId, 
                  sessionId: p.sessionId, 
                  position: p.position,
                  username: p.username,
                  sprite: p.sprite,
                  mapId: p.mapId
                });
              }
            }
            socket.send(JSON.stringify({ type: 'playersList', players: otherPlayers }));
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
          const { userId, position, mapId } = data;
          await supabase
            .from('game_locations')
            .upsert({ 
              user_id: userId, 
              x: position.x, 
              y: position.y, 
              direction: position.direction,
              map_id: mapId,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        }

        else if (data.type === 'heartbeat') {
          // Update heartbeat in database
          const player = players.get(socket);
          if (player && !player.isSpectator && player.userId) {
            try {
              await supabase
                .from('game_sessions')
                .update({ last_heartbeat: new Date().toISOString() })
                .eq('user_id', player.userId)
                .eq('session_id', player.sessionId);
            } catch (err) {
              console.error('Error updating heartbeat:', err);
            }
          }
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
      // Remove player from map index
      removePlayerFromMap(socket, player.mapId);
      
      // Save final location to DB only for actual players
      try {
        await supabase
          .from('game_locations')
          .upsert({ 
            user_id: player.userId, 
            x: player.position.x, 
            y: player.position.y,
            map_id: player.mapId,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });
      } catch (dbError) {
        console.error('Error saving final location:', dbError);
      }

      // Remove game session
      try {
        await supabase
          .from('game_sessions')
          .delete()
          .eq('user_id', player.userId)
          .eq('session_id', player.sessionId);
      } catch (dbError) {
        console.error('Error removing game session:', dbError);
      }

      broadcastToMap(player.mapId, {
        type: 'playerLeft',
        userId: player.userId,
        sessionId: player.sessionId
      }, socket);
    }
    
    players.delete(socket);
    broadcastOnlineCount();
  }

  // Helper functions for map-based player indexing
  function addPlayerToMap(socket, mapId) {
    if (!playersByMap.has(mapId)) {
      playersByMap.set(mapId, new Set());
    }
    playersByMap.get(mapId).add(socket);
    console.log(`📍 Added player to map ${mapId}. Map now has ${playersByMap.get(mapId).size} players`);
  }

  function removePlayerFromMap(socket, mapId) {
    const mapPlayers = playersByMap.get(mapId);
    if (mapPlayers) {
      mapPlayers.delete(socket);
      console.log(`📍 Removed player from map ${mapId}. Map now has ${mapPlayers.size} players`);
      if (mapPlayers.size === 0) {
        playersByMap.delete(mapId);
        console.log(`📍 Map ${mapId} is now empty, removed from index`);
      }
    }
  }

  function broadcastOnlineCount() {
    const count = Array.from(players.values()).filter(p => !p.isSpectator).length;
    console.log(`📢 Broadcasting online count: ${count} (Total connections: ${players.size})`);
    broadcast({ type: 'onlineCount', count });
  }

  function broadcastToMap(mapId, data, excludeSocket = null) {
    const message = JSON.stringify(data);
    const mapPlayers = playersByMap.get(mapId);
    
    if (!mapPlayers) {
      return; // No players on this map
    }
    
    // O(1) lookup instead of O(n) iteration through all clients
    mapPlayers.forEach((client) => {
      if (client.readyState === 1 && client !== excludeSocket) {
        client.send(message);
      }
    });
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
