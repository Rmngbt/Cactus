import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Trash2, RefreshCw, ArrowRightLeft, Trophy } from 'lucide-react';
import GameCard from '@/components/GameCard';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const POLLING_INTERVAL = 1000; // 1 second for responsive gameplay
const CARD_REVEAL_DURATION = 5000; // 5 seconds per card reveal

export default function GameBoard({ user, onLogout }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawnCard, setDrawnCard] = useState(null);
  const [revealDialog, setRevealDialog] = useState(false);
  const [revealedCardsCount, setRevealedCardsCount] = useState(0);
  const [swapMyCard, setSwapMyCard] = useState(null); // For 10 special ability
  const [revealCountdown, setRevealCountdown] = useState(0); // Countdown for card reveal
  const [cardRevealCountdown, setCardRevealCountdown] = useState(0); // Countdown for initial card reveal (5s)
  const [isRevealingCard, setIsRevealingCard] = useState(false); // Prevent multiple reveals
  const [roundSummaryDialog, setRoundSummaryDialog] = useState(false); // Round summary popup
  const pollingRef = useRef(null);
  const previousTurnRef = useRef(null);
  const previousPhaseRef = useRef(null);
  const countdownRef = useRef(null);
  const cardRevealTimerRef = useRef(null);

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
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (cardRevealTimerRef.current) {
        clearInterval(cardRevealTimerRef.current);
      }
    };
  }, [code]);

  const fetchRoomSilently = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/game/room/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const newGameState = response.data.game_state;
      if (!newGameState) return;
      
      // Detect turn changes
      const newCurrentPlayer = newGameState.players[newGameState.current_player_index];
      const previousTurn = previousTurnRef.current;
      
      if (previousTurn && previousTurn !== newCurrentPlayer.user_id) {
        // Turn has changed
        if (newCurrentPlayer.user_id === user.user_id) {
          toast.info("C'est votre tour!");
        }
      }
      
      // Detect phase changes
      if (previousPhaseRef.current !== newGameState.phase) {
        if (newGameState.phase === 'playing' && previousPhaseRef.current === 'initial_reveal') {
          toast.success('La phase de révélation est terminée. Le jeu commence!');
        } else if (newGameState.phase === 'ended') {
          toast.info('La partie est terminée!');
        }
      }
      
      previousTurnRef.current = newCurrentPlayer.user_id;
      previousPhaseRef.current = newGameState.phase;
      
      setRoom(response.data);
      setGameState(newGameState);
      setDrawnCard(newGameState.drawn_card);
      
    } catch (error) {
      // Check if token expired (401 error)
      if (error.response?.status === 401) {
        toast.error('Session expirée, reconnexion nécessaire');
        localStorage.removeItem('token');
        navigate('/');
        return;
      }
      // Silent fail during polling for other errors
      console.log('Polling error:', error.message);
    }
  };

  useEffect(() => {
    // Show reveal dialog when game state is loaded and we're in initial_reveal phase
    if (gameState && gameState.phase === 'initial_reveal') {
      const myPlayer = gameState.players.find(p => p.user_id === user.user_id);
      if (myPlayer && myPlayer.revealed_cards) {
        setRevealedCardsCount(myPlayer.revealed_cards.length);
        // Only show dialog if not all cards revealed yet
        if (myPlayer.revealed_cards.length < gameState.cards_to_reveal) {
          setRevealDialog(true);
        }
      } else {
        setRevealDialog(true);
      }
    } else if (gameState && gameState.phase === 'playing') {
      // Only close dialog if NOT in the middle of the last card countdown
      // This prevents the dialog from closing when other players finish first
      if (!isRevealingCard) {
        setRevealDialog(false);
      }
    }
  }, [gameState, user.user_id, isRevealingCard]);

  // Handle round summary popup
  useEffect(() => {
    if (gameState && gameState.phase === 'round_summary' && gameState.round_summary) {
      setRoundSummaryDialog(true);
    } else {
      setRoundSummaryDialog(false);
    }
  }, [gameState]);

  const fetchRoom = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/game/room/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoom(response.data);
      setGameState(response.data.game_state);
      setDrawnCard(response.data.game_state?.drawn_card || null);
      
      // Initialize refs
      if (response.data.game_state) {
        const gs = response.data.game_state;
        previousTurnRef.current = gs.players[gs.current_player_index]?.user_id;
        previousPhaseRef.current = gs.phase;
      }
    } catch (error) {
      toast.error('Erreur lors du chargement de la partie');
      navigate('/lobby');
    } finally {
      setLoading(false);
    }
  };

  const sendAction = async (actionData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${BACKEND_URL}/api/game/action/${code}`,
        actionData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update state immediately with response
      if (response.data.game_state) {
        setGameState(response.data.game_state);
        setDrawnCard(response.data.game_state.drawn_card);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Action impossible');
    }
  };

  const handleRevealCard = async (cardIndex) => {
    // Prevent revealing another card while the LAST card countdown is running
    if (isRevealingCard) {
      toast.info('Attendez que la carte soit mémorisée');
      return;
    }
    
    // Check if already revealed
    if (myPlayer.revealed_cards?.includes(cardIndex)) {
      return;
    }
    
    // Update local state immediately for visual feedback
    const updatedRevealedCards = [...(myPlayer.revealed_cards || []), cardIndex];
    const newRevealedCount = updatedRevealedCards.length;
    const isLastCard = newRevealedCount >= gameState.cards_to_reveal;
    
    // Update local game state immediately
    const newGameState = { ...gameState };
    const myPlayerIdx = newGameState.players.findIndex(p => p.user_id === user.user_id);
    if (myPlayerIdx !== -1) {
      newGameState.players[myPlayerIdx].revealed_cards = updatedRevealedCards;
      setGameState(newGameState);
    }
    
    setRevealedCardsCount(newRevealedCount);
    
    // Send to backend
    await sendAction({
      action_type: 'reveal_card',
      card_index: cardIndex
    });
    
    // Only start 5 second countdown for the LAST card
    if (isLastCard) {
      setIsRevealingCard(true);
      setCardRevealCountdown(5);
      
      if (cardRevealTimerRef.current) {
        clearInterval(cardRevealTimerRef.current);
      }
      
      cardRevealTimerRef.current = setInterval(() => {
        setCardRevealCountdown(prev => {
          if (prev <= 1) {
            clearInterval(cardRevealTimerRef.current);
            setIsRevealingCard(false);
            setCardRevealCountdown(0);
            
            // Close dialog after last card timer ends
            setTimeout(() => {
              setRevealDialog(false);
              toast.success('Phase de révélation terminée! Le jeu commence.');
            }, 500);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    // For non-last cards, no timer - can reveal next immediately
  };

  const handleDrawDeck = async () => {
    await sendAction({ action_type: 'draw_deck' });
  };

  const handleDrawDiscard = async () => {
    await sendAction({ action_type: 'draw_discard' });
  };

  const handleExchangeCard = async (cardIndex) => {
    await sendAction({
      action_type: 'exchange',
      card_index: cardIndex
    });
    setDrawnCard(null);
  };

  const handleDiscardDrawn = async () => {
    await sendAction({ action_type: 'discard_drawn' });
    setDrawnCard(null);
  };

  const handleFastDiscard = async (cardIndex, targetPlayer = null, targetCardIndex = null) => {
    await sendAction({
      action_type: 'fast_discard',
      card_index: cardIndex,
      target_player: targetPlayer,
      target_card_index: targetCardIndex
    });
  };

  const handleCallCactus = async () => {
    await sendAction({ action_type: 'cactus' });
  };

  const handleGiveCard = async (cardIndex) => {
    await sendAction({
      action_type: 'give_card',
      card_index: cardIndex
    });
    toast.success('Carte donnée!');
  };

  const handleSkipGiveCard = async () => {
    await sendAction({ action_type: 'skip_give_card' });
  };

  const handleSpecialLookOwn = async (cardIndex) => {
    await sendAction({
      action_type: 'special_look_own',
      card_index: cardIndex
    });
    
    // Start countdown
    setRevealCountdown(5);
    if (countdownRef.current) clearInterval(countdownRef.current);
    
    countdownRef.current = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // Clear special state
          sendAction({ action_type: 'clear_special_reveal' });
          setGameState(prevState => ({
            ...prevState,
            special_card_available: false,
            special_card_player: null,
            special_card_type: null,
            special_reveal: null
          }));
          toast.info('Carte masquée');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSpecialLookOpponent = async (targetPlayer, cardIndex) => {
    await sendAction({
      action_type: 'special_look_opponent',
      target_player: targetPlayer,
      target_card_index: cardIndex
    });
    
    // Start countdown
    setRevealCountdown(5);
    if (countdownRef.current) clearInterval(countdownRef.current);
    
    countdownRef.current = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // Clear special state
          sendAction({ action_type: 'clear_special_reveal' });
          setGameState(prevState => ({
            ...prevState,
            special_card_available: false,
            special_card_player: null,
            special_card_type: null,
            special_reveal: null
          }));
          toast.info('Carte masquée');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSpecialSwap = async (myCardIndex, targetPlayer, targetCardIndex) => {
    await sendAction({
      action_type: 'special_swap',
      card_index: myCardIndex,
      target_player: targetPlayer,
      target_card_index: targetCardIndex
    });
    toast.success('Cartes échangées!');
    
    // Clear special state after swap
    setGameState(prev => ({
      ...prev,
      special_card_available: false,
      special_card_player: null,
      special_card_type: null
    }));
    setSwapMyCard(null);
  };

  const handleSkipSpecial = async () => {
    // Clear countdown if running
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      setRevealCountdown(0);
    }
    
    // Use the dedicated skip_special action to properly advance turn
    await sendAction({ action_type: 'skip_special' });
    // Also clear the special card available state locally
    setGameState(prev => ({
      ...prev,
      special_card_available: false,
      special_card_player: null,
      special_card_type: null,
      special_reveal: null,
      awaiting_special_action: false
    }));
    setSwapMyCard(null);
  };

  const handleResetTurn = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BACKEND_URL}/api/game/reset-turn/${code}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Tour réinitialisé!');
    } catch (error) {
      toast.error('Erreur lors de la réinitialisation');
    }
  };

  const handleStartNextRound = async () => {
    try {
      await sendAction({ action_type: 'start_next_round' });
      setRoundSummaryDialog(false);
      toast.success('Nouvelle manche lancée!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors du lancement de la manche');
    }
  };

  // Helper function to get card value for scoring
  const getCardValue = (card) => {
    const cardValues = {
      'K': 0, 'A': 1, '2': -2, '3': 3, '4': 4, '5': 5,
      '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10
    };
    return cardValues[card.value] || 0;
  };

  if (loading || !gameState) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement du jeu...</div>
      </div>
    );
  }

  const currentPlayer = gameState.players[gameState.current_player_index];
  const isMyTurn = currentPlayer.user_id === user.user_id;
  const myPlayerIndex = gameState.players.findIndex(p => p.user_id === user.user_id);
  const myPlayer = gameState.players[myPlayerIndex];
  
  // Check if we need to give a card
  const pendingGiveCard = gameState.pending_give_card && gameState.pending_give_card.from_player === user.user_id;
  
  // Check if special card action is available for us
  const specialAvailable = gameState.special_card_available && gameState.special_card_player === user.user_id;

  return (
    <div className="desert-bg min-h-screen p-2 md:p-4">
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="flex justify-between items-center mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/lobby')}
            className="desert-button"
            data-testid="back-button"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quitter
          </Button>

          <div className="text-center">
            <div className="text-white font-bold text-xl" data-testid="current-turn">
              Tour de: {currentPlayer.username}
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

        {/* Game Area */}
        <div className="grid gap-4">
          {/* Opponents */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {gameState.players
              .filter(p => p.user_id !== user.user_id)
              .map((player, idx) => (
                <Card key={player.user_id} className="shadow-lg" data-testid={`opponent-${idx}`}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-sm">{player.username}</span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        Cartes: {player.hand.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {player.hand.map((card, cardIdx) => {
                        // Check if this opponent card is being revealed via special
                        const isSpecialRevealed = gameState.special_reveal && 
                          gameState.special_reveal.player_id === user.user_id &&
                          gameState.special_reveal.type === 'look_opponent' &&
                          gameState.special_reveal.target_player === player.user_id &&
                          gameState.special_reveal.card_index === cardIdx;
                        
                        return (
                          <div key={cardIdx} className="relative group">
                            <GameCard 
                              card={isSpecialRevealed ? gameState.special_reveal.card : null} 
                              isHidden={!isSpecialRevealed} 
                              size="sm" 
                            />
                            
                            {/* Fast discard on opponent */}
                            {gameState.discard_pile?.length > 0 && !specialAvailable && !pendingGiveCard && (
                              <Button
                                size="icon"
                                variant="destructive"
                                className="absolute -top-1 -right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleFastDiscard(null, player.user_id, cardIdx)}
                                data-testid={`fast-discard-opponent-${idx}-${cardIdx}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {/* Special: 10 - Look at opponent card */}
                            {specialAvailable && gameState.special_card_type === '10' && (
                              <Button
                                size="icon"
                                variant="default"
                                className="absolute -top-1 -right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-purple-500"
                                onClick={() => handleSpecialLookOpponent(player.user_id, cardIdx)}
                                data-testid={`look-opponent-${idx}-${cardIdx}`}
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                            
                            {/* Special: Valet (J) - Swap with opponent - after selecting own card */}
                            {specialAvailable && gameState.special_card_type === 'J' && swapMyCard !== null && (
                              <Button
                                size="icon"
                                variant="default"
                                className="absolute -top-1 -right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-purple-500"
                                onClick={() => {
                                  handleSpecialSwap(swapMyCard, player.user_id, cardIdx);
                                  setSwapMyCard(null);
                                }}
                                data-testid={`swap-opponent-${idx}-${cardIdx}`}
                              >
                                <ArrowRightLeft className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          {/* Center: Deck and Discard */}
          <Card className="shadow-2xl bg-white/95">
            <CardContent className="p-4">
              <div className="flex justify-center items-center space-x-8 flex-wrap gap-4">
                {/* Deck */}
                <div className="text-center">
                  <div className="text-sm font-semibold mb-2">Pioche</div>
                  <Button
                    onClick={handleDrawDeck}
                    disabled={!isMyTurn || drawnCard !== null || gameState.phase !== 'playing'}
                    className="p-0 h-auto"
                    variant="ghost"
                    data-testid="draw-deck-button"
                  >
                    <GameCard card={null} isHidden={true} size="md" />
                  </Button>
                  <div className="text-xs mt-1">{gameState.deck?.length || 0} cartes</div>
                  {gameState.deck?.length === 0 && gameState.discard_pile?.length > 1 && (
                    <div className="text-xs text-amber-600 mt-1 flex items-center justify-center">
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Recyclage...
                    </div>
                  )}
                </div>

                {/* Drawn Card with clear actions */}
                {drawnCard && (
                  <div className="text-center animate-in fade-in zoom-in border-2 border-accent rounded-lg p-3 bg-accent/10">
                    <div className="text-sm font-semibold mb-2 text-accent">Carte piochée</div>
                    <GameCard card={drawnCard} size="md" />
                    <div className="flex gap-2 mt-3">
                      <Button
                        onClick={handleDiscardDrawn}
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        data-testid="discard-drawn-button"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Défausser
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Ou cliquez sur 🔄 sous une de vos cartes pour l'échanger
                    </div>
                  </div>
                )}

                {/* Discard Pile */}
                <div className="text-center">
                  <div className="text-sm font-semibold mb-2">Défausse</div>
                  <Button
                    onClick={handleDrawDiscard}
                    disabled={!isMyTurn || drawnCard !== null || !gameState.discard_pile || gameState.discard_pile.length === 0 || gameState.phase !== 'playing'}
                    className="p-0 h-auto"
                    variant="ghost"
                    data-testid="draw-discard-button"
                  >
                    {gameState.discard_pile && gameState.discard_pile.length > 0 ? (
                      <GameCard card={gameState.discard_pile[gameState.discard_pile.length - 1]} size="md" />
                    ) : (
                      <div className="w-24 h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                        Vide
                      </div>
                    )}
                  </Button>
                  <div className="text-xs mt-1">{gameState.discard_pile?.length || 0} cartes</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* My Hand */}
          <Card className="shadow-2xl bg-gradient-to-br from-accent/20 to-primary/20" data-testid="my-hand">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="font-bold text-lg">Votre main</span>
                  <span className="text-sm ml-3 text-muted-foreground">
                    Cartes: {myPlayer.hand.length}
                  </span>
                </div>
                <div className="flex space-x-2">
                  {drawnCard && (
                    <Button
                      onClick={handleResetTurn}
                      variant="outline"
                      size="sm"
                      className="desert-button"
                      data-testid="reset-turn-button"
                      title="Débloquer le tour si bloqué"
                    >
                      🔧 Débloquer
                    </Button>
                  )}
                  <Button
                    onClick={handleCallCactus}
                    disabled={!isMyTurn || gameState.cactus_called || gameState.phase !== 'playing'}
                    className="desert-button bg-accent hover:bg-accent/90"
                    data-testid="cactus-button"
                  >
                    🌵 Cactus!
                  </Button>
                </div>
              </div>
              
              <div className="flex flex-wrap justify-center gap-3">
                {myPlayer.hand.map((card, cardIdx) => {
                  // Check if this card should be shown (special reveal)
                  const isSpecialRevealed = gameState.special_reveal && 
                    gameState.special_reveal.player_id === user.user_id &&
                    gameState.special_reveal.type === 'look_own' &&
                    gameState.special_reveal.card_index === cardIdx;
                  
                  return (
                    <div key={cardIdx} className="relative group">
                      <GameCard
                        card={isSpecialRevealed ? gameState.special_reveal.card : null}
                        isHidden={!isSpecialRevealed}
                        size="lg"
                      />
                      
                      <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                        {/* Give card button (after successful fast discard on opponent) */}
                        {pendingGiveCard && (
                          <Button
                            size="icon"
                            variant="default"
                            className="h-7 w-7 rounded-full shadow-lg bg-green-500 hover:bg-green-600"
                            onClick={() => handleGiveCard(cardIdx)}
                            data-testid={`give-card-${cardIdx}`}
                            title="Donner cette carte"
                          >
                            🎁
                          </Button>
                        )}
                        
                        {/* Special: 8 - Look at own card */}
                        {specialAvailable && gameState.special_card_type === '8' && (
                          <Button
                            size="icon"
                            variant="default"
                            className="h-7 w-7 rounded-full shadow-lg bg-purple-500 hover:bg-purple-600"
                            onClick={() => handleSpecialLookOwn(cardIdx)}
                            data-testid={`look-own-${cardIdx}`}
                            title="Regarder cette carte (8)"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        )}
                        
                        {/* Special: Valet (J) - Swap card - select own card first */}
                        {specialAvailable && gameState.special_card_type === 'J' && swapMyCard === null && (
                          <Button
                            size="icon"
                            variant="default"
                            className="h-7 w-7 rounded-full shadow-lg bg-purple-500 hover:bg-purple-600"
                            onClick={() => setSwapMyCard(cardIdx)}
                            data-testid={`swap-select-${cardIdx}`}
                            title="Sélectionner pour échange (Valet)"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                          </Button>
                        )}
                        
                        {/* Fast discard button */}
                        {gameState.discard_pile?.length > 0 && !pendingGiveCard && !specialAvailable && (
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-7 w-7 rounded-full shadow-lg"
                            onClick={() => handleFastDiscard(cardIdx)}
                            data-testid={`fast-discard-${cardIdx}`}
                            title="Défausse rapide"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        
                        {/* Exchange button (when card is drawn) */}
                        {drawnCard && isMyTurn && !pendingGiveCard && !specialAvailable && (
                          <Button
                            size="icon"
                            variant="default"
                            className="h-7 w-7 rounded-full shadow-lg bg-primary"
                            onClick={() => handleExchangeCard(cardIdx)}
                            data-testid={`exchange-card-${cardIdx}`}
                            title="Échanger avec carte piochée"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Info Banner */}
          {gameState.cactus_called && (
            <div className="bg-accent text-white p-3 rounded-lg text-center font-semibold animate-pulse" data-testid="cactus-called-banner">
              🌵 Cactus appelé par {gameState.cactus_caller_username || 'un joueur'}! Tours restants: {gameState.remaining_final_turns}
            </div>
          )}

          {/* Pending Give Card Dialog */}
          {gameState.pending_give_card && gameState.pending_give_card.from_player === user.user_id && (
            <div className="bg-green-600 text-white p-4 rounded-lg text-center space-y-3" data-testid="give-card-banner">
              <div className="font-semibold">
                🎉 Défausse réussie! Vous pouvez donner une de vos cartes à l'adversaire.
              </div>
              <div className="text-sm">Cliquez sur une de vos cartes pour la donner, ou passez.</div>
              <Button
                onClick={handleSkipGiveCard}
                variant="outline"
                size="sm"
                className="bg-white text-green-600 hover:bg-gray-100"
                data-testid="skip-give-card-button"
              >
                Passer (ne pas donner de carte)
              </Button>
            </div>
          )}

          {/* Special Card Available Banner */}
          {gameState.special_card_available && gameState.special_card_player === user.user_id && (
            <div className="bg-purple-600 text-white p-4 rounded-lg text-center space-y-3" data-testid="special-card-banner">
              <div className="font-semibold">
                ✨ Carte spéciale! 
                {gameState.special_card_type === '8' && " 8 - Cliquez sur une de VOS cartes pour la regarder"}
                {gameState.special_card_type === '10' && " 10 - Cliquez sur une carte ADVERSAIRE pour la regarder"}
                {gameState.special_card_type === 'J' && (swapMyCard === null ? " Valet - Cliquez sur une de VOS cartes d'abord" : " Valet - Maintenant cliquez sur une carte ADVERSAIRE pour échanger")}
              </div>
              {revealCountdown > 0 && (
                <div className="text-2xl font-bold bg-white/20 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                  {revealCountdown}s
                </div>
              )}
              {revealCountdown === 0 && (
                <Button
                  onClick={handleSkipSpecial}
                  variant="outline"
                  size="sm"
                  className="bg-white text-purple-600 hover:bg-gray-100"
                  data-testid="skip-special-button"
                >
                  Passer (ne pas utiliser)
                </Button>
              )}
            </div>
          )}

          {/* Card Reveal Banner (when viewing a card) */}
          {gameState.special_reveal && gameState.special_reveal.player_id === user.user_id && revealCountdown > 0 && (
            <div className="bg-blue-600 text-white p-4 rounded-lg text-center space-y-2" data-testid="reveal-countdown-banner">
              <div className="font-semibold">
                👁️ Mémorisez la carte! Temps restant:
              </div>
              <div className="text-3xl font-bold">{revealCountdown}s</div>
            </div>
          )}

          {/* Game Ended Banner */}
          {gameState.phase === 'ended' && (
            <div className="bg-yellow-500 text-black p-4 rounded-lg text-center space-y-3" data-testid="game-ended-banner">
              <div className="text-2xl font-bold">🏆 Partie Terminée!</div>
              <div className="space-y-2">
                {gameState.players
                  .map(p => ({ ...p, score: p.hand.reduce((sum, card) => sum + getCardValue(card), 0) }))
                  .sort((a, b) => a.score - b.score)
                  .map((player, idx) => (
                    <div key={player.user_id} className={`flex justify-between p-2 rounded ${idx === 0 ? 'bg-green-200 font-bold' : 'bg-white/50'}`}>
                      <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {player.username}</span>
                      <span>{player.score} points</span>
                    </div>
                  ))}
              </div>
              <Button
                onClick={() => navigate('/lobby')}
                className="desert-button mt-4"
                data-testid="back-to-lobby-button"
              >
                Retour au lobby
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Initial Reveal Dialog */}
      <Dialog open={revealDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Révélation initiale des cartes</DialogTitle>
            <DialogDescription>
              Cliquez sur {gameState.cards_to_reveal} carte(s) pour les révéler. 
              Vous ne pourrez les voir qu'une seule fois au début!
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="text-center mb-4 text-lg font-semibold">
              Cartes révélées: {revealedCardsCount} / {gameState.cards_to_reveal}
            </div>
            
            <div className="flex flex-wrap justify-center gap-4">
              {myPlayer.hand.map((card, cardIdx) => {
                const isRevealed = myPlayer.revealed_cards?.includes(cardIdx);
                return (
                  <Button
                    key={cardIdx}
                    variant="ghost"
                    className="p-0 h-auto"
                    onClick={() => handleRevealCard(cardIdx)}
                    disabled={isRevealed}
                    data-testid={`reveal-card-${cardIdx}`}
                  >
                    <div className={`transition-all ${isRevealed ? 'scale-110' : ''}`}>
                      <GameCard
                        card={isRevealed ? card : null}
                        isHidden={!isRevealed}
                        size="lg"
                      />
                      {isRevealed && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Eye className="h-8 w-8 text-green-500" />
                        </div>
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
            
            {/* Countdown for LAST card memorization only */}
            {cardRevealCountdown > 0 && (
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-primary animate-pulse">
                  Mémorisez votre dernière carte! {cardRevealCountdown}s
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all duration-1000" 
                    style={{ width: `${(cardRevealCountdown / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Round Summary Dialog */}
      <Dialog open={roundSummaryDialog} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              Fin de la Manche {gameState?.round_summary?.round_number}
            </DialogTitle>
            <DialogDescription>
              Manche {gameState?.round_summary?.round_number} sur {gameState?.round_summary?.total_rounds}
            </DialogDescription>
          </DialogHeader>
          
          {gameState?.round_summary && (
            <div className="py-4 space-y-4">
              {/* Winner announcement */}
              <div className="text-center p-4 bg-gradient-to-r from-yellow-100 to-yellow-200 rounded-lg">
                <div className="text-lg font-semibold text-yellow-800">
                  🏆 Gagnant de la manche
                </div>
                <div className="text-2xl font-bold text-yellow-900">
                  {gameState.round_summary.winner?.username}
                </div>
                <div className="text-lg text-yellow-700">
                  {gameState.round_summary.winner?.round_score} points
                </div>
              </div>
              
              {/* All scores */}
              <div className="space-y-2">
                <div className="font-semibold text-center">Récapitulatif des scores</div>
                {gameState.round_summary.scores
                  ?.sort((a, b) => a.round_score - b.round_score)
                  .map((score, idx) => (
                    <div 
                      key={score.user_id} 
                      className={`flex justify-between items-center p-3 rounded-lg ${
                        idx === 0 ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '👤'}
                        </span>
                        <span className="font-medium">{score.username}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{score.round_score} pts</div>
                        <div className="text-xs text-muted-foreground">
                          Total: {score.total_score} pts
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          <DialogFooter>
            {room?.creator_id === user.user_id ? (
              <Button 
                onClick={handleStartNextRound}
                className="w-full desert-button bg-accent hover:bg-accent/90"
                data-testid="start-next-round-button"
              >
                Lancer la manche {(gameState?.round_summary?.round_number || 0) + 1}
              </Button>
            ) : (
              <div className="w-full text-center text-muted-foreground">
                En attente que le créateur lance la manche suivante...
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
