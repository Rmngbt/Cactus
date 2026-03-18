import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Trash2, ArrowRightLeft, Trophy } from 'lucide-react';
import GameCard from '@/components/GameCard';

const CARD_VALUES = {
  'K': 0, 'A': 1, '2': -2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10
};

function getCardValue(card) {
  return CARD_VALUES[card.value] || 0;
}

function isSpecialCard(card) {
  return ['8', '10', 'J'].includes(card.value);
}

export default function GameBoard({ user, onLogout }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [swapMyCard, setSwapMyCard] = useState(null);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const channelRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    fetchRoom();
    subscribeToRoom();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [code]);

  const fetchRoom = async () => {
    const { data, error } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      toast.error('Partie introuvable');
      navigate('/lobby');
      return;
    }

    setRoom(data);
    setGameState(data.game_state);
    setLoading(false);
  };

  const subscribeToRoom = () => {
    channelRef.current = supabase
      .channel(`game-${code}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `code=eq.${code.toUpperCase()}`
      }, (payload) => {
        setRoom(payload.new);
        setGameState(payload.new.game_state);
      })
      .subscribe();
  };

  const updateGameState = async (newGameState) => {
    const { error } = await supabase
      .from('game_rooms')
      .update({ game_state: newGameState })
      .eq('code', code.toUpperCase());

    if (error) {
      toast.error('Erreur de synchronisation');
      return false;
    }
    setGameState(newGameState);
    return true;
  };

  const advanceTurn = (gs) => {
    const newGs = { ...gs };
    newGs.current_player_index = (newGs.current_player_index + 1) % newGs.players.length;

    if (newGs.cactus_called && newGs.remaining_final_turns > 0) {
      newGs.remaining_final_turns -= 1;
      if (newGs.remaining_final_turns <= 0) {
        newGs.phase = 'ended';
        newGs.players = newGs.players.map(p => ({
          ...p,
          round_score: p.hand.reduce((sum, card) => sum + getCardValue(card), 0)
        }));
      }
    }
    return newGs;
  };

  const handleRevealCard = async (cardIndex) => {
    if (!gameState || gameState.phase !== 'initial_reveal') return;
    const myPlayerIdx = gameState.players.findIndex(p => p.user_id === user.id);
    if (myPlayerIdx === -1) return;

    const myPlayer = gameState.players[myPlayerIdx];
    if (myPlayer.revealed_cards?.includes(cardIndex)) return;

    const newGs = JSON.parse(JSON.stringify(gameState));
    if (!newGs.players[myPlayerIdx].revealed_cards) {
      newGs.players[myPlayerIdx].revealed_cards = [];
    }
    newGs.players[myPlayerIdx].revealed_cards.push(cardIndex);

    const allReady = newGs.players.every(p => {
      if (p.is_bot) return true;
      return (p.revealed_cards?.length || 0) >= newGs.cards_to_reveal;
    });

    if (allReady) {
      newGs.phase = 'playing';
      toast.success('La partie commence!');
    }

    await updateGameState(newGs);
  };

  const handleDrawDeck = async () => {
    if (!isMyTurn || gameState.drawn_card || gameState.phase !== 'playing') return;
    const newGs = JSON.parse(JSON.stringify(gameState));

    if (!newGs.deck || newGs.deck.length === 0) {
      if (newGs.discard_pile.length > 1) {
        const top = newGs.discard_pile.pop();
        newGs.deck = newGs.discard_pile.sort(() => Math.random() - 0.5);
        newGs.discard_pile = [top];
      } else {
        toast.error('Plus de cartes disponibles');
        return;
      }
    }

    newGs.drawn_card = newGs.deck.pop();
    await updateGameState(newGs);
  };

  const handleDrawDiscard = async () => {
    if (!isMyTurn || gameState.drawn_card || gameState.phase !== 'playing') return;
    if (!gameState.discard_pile || gameState.discard_pile.length === 0) return;

    const newGs = JSON.parse(JSON.stringify(gameState));
    newGs.drawn_card = newGs.discard_pile.pop();
    await updateGameState(newGs);
  };

  const handleExchangeCard = async (cardIndex) => {
    if (!gameState.drawn_card) return;
    const newGs = JSON.parse(JSON.stringify(gameState));
    const myPlayerIdx = newGs.players.findIndex(p => p.user_id === user.id);

    const oldCard = newGs.players[myPlayerIdx].hand[cardIndex];
    newGs.players[myPlayerIdx].hand[cardIndex] = newGs.drawn_card;
    newGs.discard_pile.push(oldCard);

    if (isSpecialCard(oldCard)) {
      newGs.special_card_available = true;
      newGs.special_card_player = user.id;
      newGs.special_card_type = oldCard.value;
      newGs.awaiting_special_action = true;
    } else {
      newGs.drawn_card = null;
      const updated = advanceTurn(newGs);
      await updateGameState(updated);
      if (updated.players[updated.current_player_index]?.is_bot) {
        setTimeout(() => executeBotTurn(updated), 1000);
      }
      return;
    }

    newGs.drawn_card = null;
    await updateGameState(newGs);
  };

  const handleDiscardDrawn = async () => {
    if (!gameState.drawn_card) return;
    const newGs = JSON.parse(JSON.stringify(gameState));
    const discardedCard = newGs.drawn_card;
    newGs.discard_pile.push(discardedCard);
    newGs.drawn_card = null;

    if (isSpecialCard(discardedCard)) {
      newGs.special_card_available = true;
      newGs.special_card_player = user.id;
      newGs.special_card_type = discardedCard.value;
      newGs.awaiting_special_action = true;
      await updateGameState(newGs);
    } else {
      const updated = advanceTurn(newGs);
      await updateGameState(updated);
      if (updated.players[updated.current_player_index]?.is_bot) {
        setTimeout(() => executeBotTurn(updated), 1000);
      }
    }
  };

  const handleFastDiscard = async (cardIndex, targetPlayer = null, targetCardIndex = null) => {
    if (!gameState.discard_pile || gameState.discard_pile.length === 0) return;
    const newGs = JSON.parse(JSON.stringify(gameState));
    const topCard = newGs.discard_pile[newGs.discard_pile.length - 1];
    const myPlayerIdx = newGs.players.findIndex(p => p.user_id === user.id);

    if (targetPlayer) {
      const targetIdx = newGs.players.findIndex(p => p.user_id === targetPlayer);
      const card = newGs.players[targetIdx].hand[targetCardIndex];
      if (card.value === topCard.value) {
        newGs.players[targetIdx].hand.splice(targetCardIndex, 1);
        newGs.discard_pile.push(card);
        if (newGs.players[targetIdx].hand.length === 0) {
          newGs.phase = 'ended';
        }
        newGs.pending_give_card = { from_player: user.id, to_player: targetPlayer };
      } else {
        if (newGs.deck.length > 0) {
          newGs.players[myPlayerIdx].hand.push(newGs.deck.pop());
        }
      }
    } else {
      const card = newGs.players[myPlayerIdx].hand[cardIndex];
      if (card.value === topCard.value) {
        newGs.players[myPlayerIdx].hand.splice(cardIndex, 1);
        newGs.discard_pile.push(card);
        if (newGs.players[myPlayerIdx].hand.length === 0) {
          newGs.cactus_called = true;
          newGs.cactus_caller = user.id;
          newGs.phase = 'ended';
        }
      } else {
        if (newGs.deck.length > 0) {
          newGs.players[myPlayerIdx].hand.push(newGs.deck.pop());
        }
      }
    }
    await updateGameState(newGs);
  };

  const handleCallCactus = async () => {
    if (!isMyTurn || gameState.cactus_called || gameState.phase !== 'playing') return;
    const newGs = JSON.parse(JSON.stringify(gameState));
    newGs.cactus_called = true;
    newGs.cactus_caller = user.id;
    newGs.cactus_caller_username = myPlayer.username;
    newGs.remaining_final_turns = newGs.players.length - 1;
    newGs.drawn_card = null;
    newGs.current_player_index = (newGs.current_player_index + 1) % newGs.players.length;

    await updateGameState(newGs);
    if (newGs.players[newGs.current_player_index]?.is_bot) {
      setTimeout(() => executeBotTurn(newGs), 1000);
    }
  };

  const handleSpecialLookOwn = async (cardIndex) => {
    const newGs = JSON.parse(JSON.stringify(gameState));
    const myPlayerIdx = newGs.players.findIndex(p => p.user_id === user.id);
    const card = newGs.players[myPlayerIdx].hand[cardIndex];

    newGs.special_reveal = {
      player_id: user.id,
      card_index: cardIndex,
      card,
      type: 'look_own'
    };

    await updateGameState(newGs);

    setRevealCountdown(5);
    countdownRef.current = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          handleClearSpecial();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSpecialLookOpponent = async (targetPlayer, cardIndex) => {
    const newGs = JSON.parse(JSON.stringify(gameState));
    const targetIdx = newGs.players.findIndex(p => p.user_id === targetPlayer);
    const card = newGs.players[targetIdx].hand[cardIndex];

    newGs.special_reveal = {
      player_id: user.id,
      card_index: cardIndex,
      card,
      type: 'look_opponent',
      target_player: targetPlayer
    };

    await updateGameState(newGs);

    setRevealCountdown(5);
    countdownRef.current = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          handleClearSpecial();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSpecialSwap = async (myCardIndex, targetPlayer, targetCardIndex) => {
    const newGs = JSON.parse(JSON.stringify(gameState));
    const myPlayerIdx = newGs.players.findIndex(p => p.user_id === user.id);
    const targetIdx = newGs.players.findIndex(p => p.user_id === targetPlayer);

    const myCard = newGs.players[myPlayerIdx].hand[myCardIndex];
    const targetCard = newGs.players[targetIdx].hand[targetCardIndex];

    newGs.players[myPlayerIdx].hand[myCardIndex] = targetCard;
    newGs.players[targetIdx].hand[targetCardIndex] = myCard;

    newGs.special_card_available = false;
    newGs.special_card_player = null;
    newGs.special_card_type = null;
    newGs.awaiting_special_action = false;

    const updated = advanceTurn(newGs);
    await updateGameState(updated);
    setSwapMyCard(null);

    if (updated.players[updated.current_player_index]?.is_bot) {
      setTimeout(() => executeBotTurn(updated), 1000);
    }
  };

  const handleClearSpecial = async () => {
    const newGs = JSON.parse(JSON.stringify(gameState));
    newGs.special_reveal = null;
    newGs.special_card_available = false;
    newGs.special_card_player = null;
    newGs.special_card_type = null;
    newGs.awaiting_special_action = false;

    const updated = advanceTurn(newGs);
    await updateGameState(updated);

    if (updated.players[updated.current_player_index]?.is_bot) {
      setTimeout(() => executeBotTurn(updated), 1000);
    }
  };

  const handleSkipSpecial = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setRevealCountdown(0);
    await handleClearSpecial();
  };

  const handleGiveCard = async (cardIndex) => {
    const newGs = JSON.parse(JSON.stringify(gameState));
    const myPlayerIdx = newGs.players.findIndex(p => p.user_id === user.id);
    const targetIdx = newGs.players.findIndex(p => p.user_id === newGs.pending_give_card.to_player);

    const card = newGs.players[myPlayerIdx].hand.splice(cardIndex, 1)[0];
    newGs.players[targetIdx].hand.push(card);
    newGs.pending_give_card = null;

    await updateGameState(newGs);
  };

  const executeBotTurn = async (currentGs) => {
    try {
      const newGs = JSON.parse(JSON.stringify(currentGs));
      const botIdx = newGs.players.findIndex(p => p.is_bot);
      if (botIdx === -1) return;

      if (newGs.deck.length === 0) {
        if (newGs.discard_pile.length > 1) {
          const top = newGs.discard_pile.pop();
          newGs.deck = newGs.discard_pile.sort(() => Math.random() - 0.5);
          newGs.discard_pile = [top];
        } else return;
      }

      newGs.drawn_card = newGs.deck.pop();

      let highestIdx = 0;
      let highestVal = getCardValue(newGs.players[botIdx].hand[0]);
      newGs.players[botIdx].hand.forEach((card, i) => {
        if (getCardValue(card) > highestVal) {
          highestVal = getCardValue(card);
          highestIdx = i;
        }
      });

      const oldCard = newGs.players[botIdx].hand[highestIdx];
      newGs.players[botIdx].hand[highestIdx] = newGs.drawn_card;
      newGs.discard_pile.push(oldCard);
      newGs.drawn_card = null;

      const updated = advanceTurn(newGs);

      const { error } = await supabase
        .from('game_rooms')
        .update({ game_state: updated })
        .eq('code', code.toUpperCase());

      if (!error) setGameState(updated);
    } catch (err) {
      console.error('Bot error:', err);
    }
  };

  if (loading || !gameState) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement du jeu...</div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.current_player_index];
  const isMyTurn = currentPlayer?.user_id === user.id;
  const myPlayerIndex = gameState.players.findIndex(p => p.user_id === user.id);
  const myPlayer = gameState.players[myPlayerIndex];
  const pendingGiveCard = gameState.pending_give_card?.from_player === user.id;
  const specialAvailable = gameState.special_card_available && gameState.special_card_player === user.id;

  return (
    <div className="desert-bg min-h-screen p-2 md:p-4">
      <div className="container mx-auto max-w-7xl relative z-10">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/lobby')} className="desert-button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quitter
          </Button>
          <div className="text-center">
            <div className="text-white font-bold text-xl">
              Tour de: {currentPlayer?.username}
            </div>
            {isMyTurn && gameState.phase === 'playing' && (
              <div className="text-accent font-semibold animate-pulse">C'est votre tour!</div>
            )}
          </div>
          <div className="text-white text-sm text-right">
            <div>Manche: {gameState.round}/{room?.config?.num_rounds || 1}</div>
            <div>Pioche: {gameState.deck?.length || 0}</div>
          </div>
        </div>

        {/* Phase révélation initiale */}
        {gameState.phase === 'initial_reveal' && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <Card className="w-full max-w-lg mx-4">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold text-center mb-2">Révélation initiale</h2>
                <p className="text-center text-muted-foreground mb-4">
                  Cliquez sur {gameState.cards_to_reveal} carte(s) pour les mémoriser
                </p>
                <div className="text-center mb-4 font-semibold">
                  {myPlayer?.revealed_cards?.length || 0} / {gameState.cards_to_reveal} révélées
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  {myPlayer?.hand?.map((card, idx) => {
                    const isRevealed = myPlayer.revealed_cards?.includes(idx);
                    return (
                      <button key={idx} onClick={() => handleRevealCard(idx)} disabled={isRevealed}>
                        <GameCard card={isRevealed ? card : null} isHidden={!isRevealed} size="lg" />
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-4">
          {/* Adversaires */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {gameState.players
              .filter(p => p.user_id !== user.id)
              .map((player, idx) => (
                <Card key={player.user_id} className="shadow-lg">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-sm">{player.username}</span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {player.hand?.length} cartes
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {player.hand?.map((card, cardIdx) => {
                        const isSpecialRevealed = gameState.special_reveal &&
                          gameState.special_reveal.player_id === user.id &&
                          gameState.special_reveal.type === 'look_opponent' &&
                          gameState.special_reveal.target_player === player.user_id &&
                          gameState.special_reveal.card_index === cardIdx;

                        return (
                          <div key={cardIdx} className="relative group">
                            <GameCard card={isSpecialRevealed ? gameState.special_reveal.card : null} isHidden={!isSpecialRevealed} size="sm" />
                            {gameState.discard_pile?.length > 0 && !specialAvailable && !pendingGiveCard && (
                              <button
                                className="absolute -top-1 -right-1 h-6 w-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                onClick={() => handleFastDiscard(null, player.user_id, cardIdx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                            {specialAvailable && gameState.special_card_type === '10' && (
                              <button
                                className="absolute -top-1 -right-1 h-6 w-6 bg-purple-500 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                onClick={() => handleSpecialLookOpponent(player.user_id, cardIdx)}
                              >
                                <Eye className="h-3 w-3" />
                              </button>
                            )}
                            {specialAvailable && gameState.special_card_type === 'J' && swapMyCard !== null && (
                              <button
                                className="absolute -top-1 -right-1 h-6 w-6 bg-purple-500 text-white rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                onClick={() => { handleSpecialSwap(swapMyCard, player.user_id, cardIdx); setSwapMyCard(null); }}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          {/* Zone centrale */}
          <Card className="shadow-2xl bg-white/95">
            <CardContent className="p-4">
              <div className="flex justify-center items-center space-x-8 flex-wrap gap-4">
                <div className="text-center">
                  <div className="text-sm font-semibold mb-2">Pioche</div>
                  <button onClick={handleDrawDeck} disabled={!isMyTurn || !!gameState.drawn_card || gameState.phase !== 'playing'}>
                    <GameCard card={null} isHidden={true} size="md" />
                  </button>
                  <div className="text-xs mt-1">{gameState.deck?.length || 0} cartes</div>
                </div>

                {gameState.drawn_card && (
                  <div className="text-center border-2 border-accent rounded-lg p-3 bg-accent/10">
                    <div className="text-sm font-semibold mb-2 text-accent">Carte piochée</div>
                    <GameCard card={gameState.drawn_card} size="md" />
                    <Button onClick={handleDiscardDrawn} size="sm" variant="outline" className="mt-3 w-full">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Défausser
                    </Button>
                  </div>
                )}

                <div className="text-center">
                  <div className="text-sm font-semibold mb-2">Défausse</div>
                  <button onClick={handleDrawDiscard} disabled={!isMyTurn || !!gameState.drawn_card || !gameState.discard_pile?.length || gameState.phase !== 'playing'}>
                    {gameState.discard_pile?.length > 0 ? (
                      <GameCard card={gameState.discard_pile[gameState.discard_pile.length - 1]} size="md" />
                    ) : (
                      <div className="w-24 h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">Vide</div>
                    )}
                  </button>
                  <div className="text-xs mt-1">{gameState.discard_pile?.length || 0} cartes</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ma main */}
          <Card className="shadow-2xl bg-gradient-to-br from-accent/20 to-primary/20">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-lg">Votre main ({myPlayer?.hand?.length} cartes)</span>
                <Button
                  onClick={handleCallCactus}
                  disabled={!isMyTurn || gameState.cactus_called || gameState.phase !== 'playing'}
                  className="desert-button bg-accent hover:bg-accent/90"
                >
                  🌵 Cactus!
                </Button>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {myPlayer?.hand?.map((card, cardIdx) => {
                  const isSpecialRevealed = gameState.special_reveal &&
                    gameState.special_reveal.player_id === user.id &&
                    gameState.special_reveal.type === 'look_own' &&
                    gameState.special_reveal.card_index === cardIdx;

                  return (
                    <div key={cardIdx} className="relative group">
                      <GameCard card={isSpecialRevealed ? gameState.special_reveal.card : null} isHidden={!isSpecialRevealed} size="lg" />
                      <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                        {pendingGiveCard && (
                          <button className="h-7 w-7 rounded-full shadow-lg bg-green-500 text-white flex items-center justify-center" onClick={() => handleGiveCard(cardIdx)}>🎁</button>
                        )}
                        {specialAvailable && gameState.special_card_type === '8' && (
                          <button className="h-7 w-7 rounded-full shadow-lg bg-purple-500 text-white flex items-center justify-center" onClick={() => handleSpecialLookOwn(cardIdx)}>
                            <Eye className="h-3 w-3" />
                          </button>
                        )}
                        {specialAvailable && gameState.special_card_type === 'J' && swapMyCard === null && (
                          <button className="h-7 w-7 rounded-full shadow-lg bg-purple-500 text-white flex items-center justify-center" onClick={() => setSwapMyCard(cardIdx)}>
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        )}
                        {!pendingGiveCard && !specialAvailable && gameState.discard_pile?.length > 0 && (
                          <button className="h-7 w-7 rounded-full shadow-lg bg-red-500 text-white flex items-center justify-center" onClick={() => handleFastDiscard(cardIdx)}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        {gameState.drawn_card && isMyTurn && !pendingGiveCard && !specialAvailable && (
                          <button className="h-7 w-7 rounded-full shadow-lg bg-primary text-white flex items-center justify-center" onClick={() => handleExchangeCard(cardIdx)}>
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Banners */}
          {gameState.cactus_called && (
            <div className="bg-accent text-white p-3 rounded-lg text-center font-semibold animate-pulse">
              🌵 Cactus appelé par {gameState.cactus_caller_username}! Tours restants: {gameState.remaining_final_turns}
            </div>
          )}

          {pendingGiveCard && (
            <div className="bg-green-600 text-white p-4 rounded-lg text-center space-y-3">
              <div className="font-semibold">🎉 Défausse réussie! Donnez une carte à l'adversaire.</div>
              <Button onClick={() => { const newGs = {...gameState, pending_give_card: null}; updateGameState(newGs); }} variant="outline" size="sm" className="bg-white text-green-600">
                Passer
              </Button>
            </div>
          )}

          {specialAvailable && (
            <div className="bg-purple-600 text-white p-4 rounded-lg text-center space-y-3">
              <div className="font-semibold">
                ✨ Carte spéciale!
                {gameState.special_card_type === '8' && " Cliquez sur une de VOS cartes pour la voir"}
                {gameState.special_card_type === '10' && " Cliquez sur une carte ADVERSE pour la voir"}
                {gameState.special_card_type === 'J' && (swapMyCard === null ? " Sélectionnez d'abord UNE de VOS cartes" : " Maintenant cliquez sur une carte ADVERSE")}
              </div>
              {revealCountdown > 0 && <div className="text-2xl font-bold">{revealCountdown}s</div>}
              {revealCountdown === 0 && (
                <Button onClick={handleSkipSpecial} variant="outline" size="sm" className="bg-white text-purple-600">
                  Passer
                </Button>
              )}
            </div>
          )}

          {/* Fin de partie */}
          {gameState.phase === 'ended' && (
            <div className="bg-yellow-500 text-black p-4 rounded-lg text-center space-y-3">
              <div className="text-2xl font-bold">🏆 Partie Terminée!</div>
              <div className="space-y-2">
                {gameState.players
                  .map(p => ({ ...p, score: p.hand?.reduce((sum, card) => sum + getCardValue(card), 0) || 0 }))
                  .sort((a, b) => a.score - b.score)
                  .map((player, idx) => (
                    <div key={player.user_id} className={`flex justify-between p-2 rounded ${idx === 0 ? 'bg-green-200 font-bold' : 'bg-white/50'}`}>
                      <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {player.username}</span>
                      <span>{player.score} points</span>
                    </div>
                  ))}
              </div>
              <Button onClick={() => navigate('/lobby')} className="desert-button mt-4">
                Retour au lobby
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
