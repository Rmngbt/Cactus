import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Copy, Play, Users, ArrowLeft, RefreshCw } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const POLLING_INTERVAL = 1500; // 1.5 seconds

export default function GameRoom({ user, onLogout }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef(null);
  const previousPlayersRef = useRef([]);

  useEffect(() => {
    fetchRoom();
    
    // Start polling for real-time updates
    pollingRef.current = setInterval(() => {
      fetchRoomSilently();
    }, POLLING_INTERVAL);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [code]);

  const fetchRoomSilently = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/game/room/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const newRoom = response.data;
      
      // Check if game has started - redirect to game board
      if (newRoom.state === 'playing') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
        toast.success('La partie a commencé!');
        navigate(`/game/${code}`);
        return;
      }
      
      // Check for new players
      const currentPlayerIds = previousPlayersRef.current.map(p => p.user_id);
      const newPlayers = newRoom.players.filter(p => !currentPlayerIds.includes(p.user_id));
      
      if (newPlayers.length > 0 && previousPlayersRef.current.length > 0) {
        newPlayers.forEach(player => {
          toast.info(`${player.username} a rejoint la partie!`);
        });
      }
      
      previousPlayersRef.current = newRoom.players;
      setRoom(newRoom);
      
    } catch (error) {
      // Silent fail during polling
      console.log('Polling error:', error.message);
    }
  };

  const fetchRoom = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/game/room/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoom(response.data);
      previousPlayersRef.current = response.data.players;
      
      if (response.data.state === 'playing') {
        navigate(`/game/${code}`);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement de la partie');
      navigate('/lobby');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BACKEND_URL}/api/game/start/${code}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Partie lancée!');
      // Stop polling and navigate
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      navigate(`/game/${code}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors du lancement');
    }
  };

  const copyRoomCode = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code)
        .then(() => {
          toast.success('Code copié dans le presse-papiers!');
        })
        .catch(() => {
          toast.error('Impossible de copier le code');
        });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('Code copié dans le presse-papiers!');
      } catch (err) {
        toast.error('Impossible de copier le code');
      }
      document.body.removeChild(textArea);
    }
  };

  if (loading) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  if (!room) {
    return null;
  }

  const isCreator = room.creator_id === user.user_id;
  const canStart = isCreator && room.players.length >= (room.mode === 'multiplayer' ? 2 : 1);

  return (
    <div className="desert-bg min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>

      <div className="container mx-auto max-w-4xl relative z-10">
        <Button
          variant="outline"
          onClick={() => navigate('/lobby')}
          className="mb-4 desert-button"
          data-testid="back-to-lobby-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour au lobby
        </Button>

        <Card className="shadow-2xl mb-6" data-testid="room-card">
          <CardHeader className="text-center">
            <div className="text-6xl mb-4">🎮</div>
            <CardTitle className="text-3xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
              Salle d'attente
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              {room.mode === 'multiplayer' ? 'Mode Multijoueur' : `Mode Bot (${room.config.bot_difficulty})`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Room Code - Only show in multiplayer mode */}
            {room.mode === 'multiplayer' && (
              <div className="flex items-center justify-center space-x-3">
                <div className="text-5xl font-bold tracking-wider text-primary" data-testid="room-code">
                  {code}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyRoomCode}
                  className="desert-button"
                  data-testid="copy-code-button"
                >
                  <Copy className="h-5 w-5" />
                </Button>
              </div>
            )}

            {room.mode === 'bot' && (
              <div className="text-center">
                <div className="text-2xl font-semibold text-primary">
                  Mode Solo - Contre Bot
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Difficulté: {room.config.bot_difficulty === 'easy' ? 'Facile' : room.config.bot_difficulty === 'medium' ? 'Moyen' : 'Difficile'}
                </p>
              </div>
            )}

            {/* Game Configuration */}
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h3 className="font-semibold text-center mb-3">Configuration de la partie</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cartes par joueur:</span>
                  <span className="font-semibold">{room.config.cards_per_player}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Visibles au début:</span>
                  <span className="font-semibold">{room.config.visible_at_start}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Score cible:</span>
                  <span className="font-semibold">{room.config.score_threshold}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nombre de manches:</span>
                  <span className="font-semibold">{room.config.num_rounds || 1}</span>
                </div>
              </div>
            </div>

            {/* Players List */}
            <div>
              <div className="flex items-center justify-center mb-3 space-x-2">
                <Users className="h-5 w-5" />
                <h3 className="font-semibold">Joueurs ({room.players.length})</h3>
              </div>
              <div className="space-y-2" data-testid="players-list">
                {room.players.map((player, index) => (
                  <div
                    key={player.user_id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    data-testid={`player-${index}`}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="text-2xl">{player.user_id === room.creator_id ? '👑' : '👤'}</div>
                      <span className="font-medium">{player.username}</span>
                      {player.user_id === room.creator_id && (
                        <span className="text-xs bg-primary text-white px-2 py-1 rounded">Créateur</span>
                      )}
                    </div>
                    {player.user_id === user.user_id && (
                      <span className="text-xs bg-accent text-white px-2 py-1 rounded">Vous</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Start Button */}
            {isCreator && (
              <div className="pt-4">
                <Button
                  onClick={handleStartGame}
                  disabled={!canStart}
                  className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
                  data-testid="start-game-button"
                >
                  <Play className="mr-2 h-5 w-5" />
                  {canStart ? 'Lancer la partie' : 'En attente de joueurs...'}
                </Button>
                {room.mode === 'multiplayer' && room.players.length < 2 && (
                  <p className="text-center text-sm text-muted-foreground mt-2">
                    Au moins 2 joueurs requis
                  </p>
                )}
              </div>
            )}

            {!isCreator && (
              <div className="text-center text-muted-foreground">
                En attente que {room.players.find(p => p.user_id === room.creator_id)?.username} lance la partie...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
