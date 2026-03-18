import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { toast } from 'sonner';
import { Copy, Play, Users, ArrowLeft } from 'lucide-react';

export default function GameRoom({ user, onLogout }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  useEffect(() => {
    fetchRoom();
    subscribeToRoom();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [code]);

  const fetchRoom = async () => {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      toast.error('Salle introuvable');
      navigate('/lobby');
      return;
    }

    // Ajouter le joueur si pas déjà dedans
    const players = data.game_state?.players || [];
    const alreadyIn = players.find(p => p.user_id === user.id);

    if (!alreadyIn) {
      const newPlayers = [...players, {
        user_id: user.id,
        username: user.username,
        is_ready: false
      }];

      await supabase
        .from('game_rooms')
        .update({ game_state: { ...data.game_state, players: newPlayers } })
        .eq('code', code.toUpperCase());
    }

    if (data.state === 'playing') {
      navigate(`/game/${code}`);
      return;
    }

    setRoom(data);
    setLoading(false);
  };

  const subscribeToRoom = () => {
    channelRef.current = supabase
      .channel(`room-${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `code=eq.${code.toUpperCase()}`
      }, (payload) => {
        const newRoom = payload.new;
        if (newRoom.state === 'playing') {
          toast.success('La partie commence!');
          navigate(`/game/${code}`);
          return;
        }
        setRoom(newRoom);
      })
      .subscribe();
  };

  const handleStartGame = async () => {
    try {
      // Initialiser le jeu
      const deck = createDeck();
      const config = room.config;
      const players = room.game_state?.players || [];

      // Ajouter bot si mode bot
      if (room.mode === 'bot') {
        players.push({
          user_id: 'bot',
          username: `Bot (${config.bot_difficulty})`,
          is_bot: true,
          is_ready: true
        });
      }

      const playersWithCards = players.map(player => ({
        ...player,
        hand: deck.splice(0, config.cards_per_player),
        revealed_cards: player.is_bot ? Array.from({length: config.cards_per_player}, (_, i) => i) : [],
        total_score: 0,
        round_score: 0
      }));

      const gameState = {
        deck,
        discard_pile: [deck.splice(0, 1)[0]],
        players: playersWithCards,
        current_player_index: 0,
        round: 1,
        phase: 'initial_reveal',
        cards_to_reveal: config.visible_at_start,
        drawn_card: null,
        cactus_called: false,
        cactus_caller: null,
        remaining_final_turns: 0
      };

      await supabase
        .from('game_rooms')
        .update({
          state: 'playing',
          game_state: gameState
        })
        .eq('code', code.toUpperCase());

      toast.success('Partie lancée!');
      navigate(`/game/${code}`);
    } catch (error) {
      toast.error('Erreur lors du lancement');
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Code copié!');
  };

  if (loading) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  if (!room) return null;

  const players = room.game_state?.players || [];
  const isCreator = room.creator_id === user.id;
  const canStart = isCreator && (room.mode === 'bot' || players.length >= 2);

  return (
    <div className="desert-bg min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>

      <div className="container mx-auto max-w-4xl relative z-10">
        <Button
          variant="outline"
          onClick={() => navigate('/lobby')}
          className="mb-4 desert-button"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour au lobby
        </Button>

        <Card className="shadow-2xl mb-6">
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
            {room.mode === 'multiplayer' && (
              <div className="flex items-center justify-center space-x-3">
                <div className="text-5xl font-bold tracking-wider text-primary">
                  {code}
                </div>
                <Button variant="outline" size="icon" onClick={copyRoomCode}>
                  <Copy className="h-5 w-5" />
                </Button>
              </div>
            )}

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h3 className="font-semibold text-center mb-3">Configuration</h3>
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
                  <span className="text-muted-foreground">Manches:</span>
                  <span className="font-semibold">{room.config.num_rounds}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-center mb-3 space-x-2">
                <Users className="h-5 w-5" />
                <h3 className="font-semibold">Joueurs ({players.length})</h3>
              </div>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div key={player.user_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-2">
                      <div className="text-2xl">{player.user_id === room.creator_id ? '👑' : '👤'}</div>
                      <span className="font-medium">{player.username}</span>
                    </div>
                    {player.user_id === user.id && (
                      <span className="text-xs bg-accent text-white px-2 py-1 rounded">Vous</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isCreator && (
              <Button
                onClick={handleStartGame}
                disabled={!canStart}
                className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
              >
                <Play className="mr-2 h-5 w-5" />
                {canStart ? 'Lancer la partie' : 'En attente de joueurs...'}
              </Button>
            )}

            {!isCreator && (
              <div className="text-center text-muted-foreground">
                En attente que le créateur lance la partie...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Créer un jeu de cartes
function createDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}
