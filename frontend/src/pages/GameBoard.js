import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Eye, Trash2, ArrowRightLeft } from 'lucide-react';
import GameCard from '@/components/GameCard';
import { createDeck, shuffle } from '@/lib/deck';

const CARD_VALUES = {
  'K': 0, 'A': 1, '2': -2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10
};

function getCardValue(card) {
  if (!card || !card.value) return 0;
  return CARD_VALUES[card.value] ?? 0;
}

function isSpecialCard(card) {
  if (!card || !card.value) return false;
  return ['8', '10', 'J'].includes(card.value);
}

function calculateScore(hand) {
  if (!hand || hand.length === 0) return 0;
  return hand.reduce((sum, card) => sum + getCardValue(card), 0);
}

function getSuitSymbol(suit) {
  const symbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  return symbols[suit] || '?';
}

// ============================================================
// MÉMOIRE DU BOT — le bot joue avec la même information qu'un humain :
// il ne « connaît » que les cartes listées dans revealed_cards (ses X
// cartes de départ + celles que le jeu lui a montrées ensuite).
// ============================================================
const AVG_CARD_VALUE = 5.5; // espérance de la valeur d'une carte inconnue

function knownIndexes(player) {
  const len = player.hand?.length || 0;
  return (player.revealed_cards || []).filter(i => i >= 0 && i < len);
}

// Score que le bot PENSE avoir : cartes connues + moyenne pour les inconnues
function estimateScore(player) {
  const known = knownIndexes(player);
  const knownSum = known.reduce((sum, i) => sum + getCardValue(player.hand[i]), 0);
  const unknownCount = (player.hand?.length || 0) - known.length;
  return knownSum + unknownCount * AVG_CARD_VALUE;
}

// Retire une carte de la main en gardant la mémoire cohérente
// (les index des cartes suivantes se décalent)
function removeCardKeepMemory(player, idx) {
  const card = player.hand.splice(idx, 1)[0];
  player.revealed_cards = (player.revealed_cards || [])
    .filter(i => i !== idx)
    .map(i => (i > idx ? i - 1 : i));
  return card;
}

function rememberCardAt(player, idx) {
  if (!player.revealed_cards) player.revealed_cards = [];
  if (!player.revealed_cards.includes(idx)) player.revealed_cards.push(idx);
}

function forgetCardAt(player, idx) {
  player.revealed_cards = (player.revealed_cards || []).filter(i => i !== idx);
}

export default function GameBoard({ user, onLogout }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [swapMyCard, setSwapMyCard] = useState(null);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const [botRevealMessage, setBotRevealMessage] = useState(null);
  const [botActionLog, setBotActionLog] = useState([]);
  const [revealTimer, setRevealTimer] = useState(0);
  const channelRef = useRef(null);
  const countdownRef = useRef(null);
  const revealTimerRef = useRef(null);
  const gameStateRef = useRef(null);
  const statsUpdatedRef = useRef(false);
  const roomRef = useRef(null);
  const botBusyRef = useRef(false);
  const botSlamKeyRef = useRef(null);

  useEffect(() => {
    fetchRoom();
    subscribeToRoom();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    };
  }, [code]);

  useEffect(() => {
    gameStateRef.current = gameState;
    if (gameState?.phase === 'ended' && !statsUpdatedRef.current) {
      statsUpdatedRef.current = true;
      updateStats(gameState);
    }
  }, [gameState]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Le tour du bot est piloté par l'état de la partie : il se relance
  // aussi après un rechargement de page (et pas seulement après une
  // action humaine).
  useEffect(() => {
    if (!gameState || gameState.phase !== 'playing') return;
    const current = gameState.players[gameState.current_player_index];
    if (!current?.is_bot || botBusyRef.current) return;
    botBusyRef.current = true;
    executeBotTurn(gameState).finally(() => {
      botBusyRef.current = false;
    });
  }, [gameState]);

  // Slam hors-tour du bot : comme un vrai joueur, il surveille la défausse
  // en permanence. S'il possède une carte identique au sommet pendant le
  // tour de l'humain, il peut la slammer (probabilité et vitesse selon la
  // difficulté). Le tour en cours n'est pas modifié : le jeu reprend ensuite.
  useEffect(() => {
    if (!gameState || gameState.phase !== 'playing') return;
    if (gameState.drawn_card || gameState.awaiting_special_action || gameState.pending_give_card) return;

    const botIdx = gameState.players.findIndex(p => p.is_bot);
    if (botIdx === -1) return;
    // Pendant son propre tour, le slam est géré dans executeBotTurn
    if (gameState.players[gameState.current_player_index]?.is_bot) return;

    const top = gameState.discard_pile?.[gameState.discard_pile.length - 1];
    if (!top) return;
    const botPlayer = gameState.players[botIdx];
    const botHand = botPlayer.hand || [];
    // Le bot ne peut slammer qu'une carte qu'il CONNAÎT
    if (!knownIndexes(botPlayer).some(i => botHand[i] && botHand[i].value === top.value)) return;

    // Une seule tentative par occasion (même sommet + même main)
    const slamKey = `${gameState.discard_pile.length}-${top.value}-${top.suit}-${botHand.length}`;
    if (botSlamKeyRef.current === slamKey) return;
    botSlamKeyRef.current = slamKey;

    const difficulty = roomRef.current?.config?.bot_difficulty || 'medium';
    const slamChance = difficulty === 'easy' ? 0.4 : difficulty === 'medium' ? 0.7 : 1;
    if (Math.random() > slamChance) return;

    const delay = difficulty === 'hard' ? 900 : 1500;
    const timer = setTimeout(() => executeBotSlam(), delay);
    return () => clearTimeout(timer);
  }, [gameState]);

  // Exécute le slam hors-tour en revalidant l'état au moment de l'action
  // (l'humain a pu jouer entre-temps).
  const executeBotSlam = async () => {
    const gs = gameStateRef.current;
    if (!gs || gs.phase !== 'playing') return;
    if (gs.drawn_card || gs.awaiting_special_action || gs.pending_give_card) return;

    const newGs = JSON.parse(JSON.stringify(gs));
    const botIdx = newGs.players.findIndex(p => p.is_bot);
    if (botIdx === -1) return;

    const top = newGs.discard_pile?.[newGs.discard_pile.length - 1];
    if (!top) return;
    const botPlayer = newGs.players[botIdx];
    const slamIdx = knownIndexes(botPlayer).find(i =>
      botPlayer.hand[i] && botPlayer.hand[i].value === top.value);
    if (slamIdx === undefined) return;

    const slammedCard = removeCardKeepMemory(botPlayer, slamIdx);
    newGs.discard_pile.push(slammedCard);
    addBotLog(`Slam ! Défausse un ${slammedCard.value}`);
    toast.info(`🤖 Le bot slamme un ${slammedCard.value}!`);

    if (newGs.players[botIdx].hand.length === 0) {
      addBotLog('Perfect Cactus !');
      newGs.cactus_called = true;
      newGs.cactus_caller = 'bot';
      newGs.perfect_cactus_players = [...(newGs.perfect_cactus_players || []), 'bot'];
      const finished = endRound(newGs);
      await updateGameState(finished);
      return;
    }

    // Le tour en cours n'est pas modifié : le jeu reprend là où il en était
    await updateGameState(newGs);
  };

  const addBotLog = (message) => {
    setBotActionLog(prev => [...prev.slice(-4), `🤖 ${message}`]);
  };

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

  const updateStats = async (gs) => {
    try {
      // Garde anti-double comptage : recharger la page de fin de partie
      // ne doit pas ré-incrémenter les stats.
      const storageKey = `cactus_stats_recorded_${code.toUpperCase()}`;
      if (localStorage.getItem(storageKey)) return;

      const myPlayer = gs.players.find(p => p.user_id === user.id);
      if (!myPlayer) return;

      // Le vainqueur est comparé à TOUS les joueurs, bot inclus.
      const totals = gs.players.map(p => p.total_score || 0);
      const myTotal = myPlayer.total_score || 0;
      const isWinner = myTotal === Math.min(...totals);
      const myPerfects = (gs.perfect_cactus_players || [])
        .filter(id => id === user.id).length;

      localStorage.setItem(storageKey, '1');

      const { data: currentStats } = await supabase
        .from('stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (currentStats) {
        await supabase
          .from('stats')
          .update({
            games_played: (currentStats.games_played || 0) + 1,
            wins: (currentStats.wins || 0) + (isWinner ? 1 : 0),
            total_score: (currentStats.total_score || 0) + myTotal,
            perfect_cactus_count: (currentStats.perfect_cactus_count || 0) + myPerfects,
          })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('stats')
          .insert({
            user_id: user.id,
            games_played: 1,
            wins: isWinner ? 1 : 0,
            total_score: myTotal,
            perfect_cactus_count: myPerfects
          });
      }

      await supabase
        .from('game_rooms')
        .update({ state: 'finished' })
        .eq('code', code.toUpperCase());

    } catch (err) {
      console.error('Stats update error:', err);
    }
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
        return endRound(newGs);
      }
    }
    return newGs;
  };

  // Clôture une manche : calcule les scores (avec pénalité de +10 pour un
  // Cactus raté), les cumule, puis décide si la partie continue
  // (num_rounds / score_threshold de la config) ou s'arrête.
  const CACTUS_PENALTY = 10;

  const endRound = (gs) => {
    const newGs = { ...gs };
    const roundScores = newGs.players.map(p => calculateScore(p.hand));
    const minScore = Math.min(...roundScores);

    newGs.players = newGs.players.map((p, idx) => {
      let roundScore = roundScores[idx];
      // Cactus raté : l'annonceur n'a pas le score strictement le plus bas
      const missedCactus = newGs.cactus_called &&
        newGs.cactus_caller === p.user_id &&
        roundScore > minScore;
      if (missedCactus) roundScore += CACTUS_PENALTY;

      return {
        ...p,
        round_score: roundScore,
        cactus_penalty: missedCactus,
        total_score: (p.total_score || 0) + roundScore
      };
    });

    const config = roomRef.current?.config || {};
    const numRounds = config.num_rounds || 1;
    const threshold = config.score_threshold || 60;
    const gameOver = newGs.round >= numRounds ||
      newGs.players.some(p => (p.total_score || 0) >= threshold);

    newGs.phase = gameOver ? 'ended' : 'round_ended';
    newGs.drawn_card = null;
    return newGs;
  };

  const handleNextRound = async () => {
    const config = roomRef.current?.config || {};
    const cardsPerPlayer = config.cards_per_player || 4;
    const deck = createDeck();

    const players = gameState.players.map(p => ({
      ...p,
      hand: deck.splice(0, cardsPerPlayer),
      // Le bot mémorise le même nombre de cartes de départ que les humains
      revealed_cards: p.is_bot
        ? Array.from({ length: config.visible_at_start || 2 }, (_, i) => i)
        : [],
      round_score: 0
    }));

    const newGs = {
      deck,
      discard_pile: [deck.splice(0, 1)[0]],
      players,
      current_player_index: 0,
      round: gameState.round + 1,
      phase: 'initial_reveal',
      cards_to_reveal: config.visible_at_start || 2,
      drawn_card: null,
      cactus_called: false,
      cactus_caller: null,
      cactus_caller_username: null,
      remaining_final_turns: 0,
      perfect_cactus_players: gameState.perfect_cactus_players || []
    };

    await updateGameState(newGs);
  };

  // ============================================================
  // BOT LOGIC COMPLET ET CORRIGÉ
  // ============================================================
  const executeBotTurn = async (currentGs) => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      let newGs = JSON.parse(JSON.stringify(currentGs));
      const botIdx = newGs.players.findIndex(p => p.is_bot);
      if (botIdx === -1) return;

      const bot = newGs.players[botIdx];
      if (!bot.hand || bot.hand.length === 0) return;

      // 1. SLAM — défausse rapide. Le slam est une action « hors tour » :
      // il ne consomme PAS le tour, le bot joue ensuite normalement.
      // Le bot ne peut slammer qu'une carte qu'il CONNAÎT.
      const slamTop = newGs.discard_pile?.length > 0
        ? newGs.discard_pile[newGs.discard_pile.length - 1]
        : null;
      let justSlammed = false;
      if (slamTop && slamTop.value) {
        const slamIdx = knownIndexes(bot).find(i =>
          bot.hand[i] && bot.hand[i].value === slamTop.value);
        if (slamIdx !== undefined) {
          justSlammed = true;
          const slammedCard = removeCardKeepMemory(bot, slamIdx);
          addBotLog(`Slam ! Défausse un ${slammedCard.value}`);
          newGs.discard_pile.push(slammedCard);

          if (bot.hand.length === 0) {
            addBotLog('Perfect Cactus !');
            newGs.cactus_called = true;
            newGs.cactus_caller = 'bot';
            newGs.perfect_cactus_players = [...(newGs.perfect_cactus_players || []), 'bot'];
            const finished = endRound(newGs);
            await supabase.from('game_rooms').update({ game_state: finished }).eq('code', code.toUpperCase());
            setGameState(finished);
            return;
          }
          // pas de return : le tour du bot continue après le slam
        }
      }

      // Score que le bot PENSE avoir (cartes connues + moyenne pour les inconnues)
      const estimatedScore = estimateScore(bot);
      const topDiscard = newGs.discard_pile?.length > 0
        ? newGs.discard_pile[newGs.discard_pile.length - 1]
        : null;

      // 2. CACTUS — appeler si le score estimé est bas selon la difficulté
      const currentRoom = roomRef.current;
      // Plus le bot est fort, plus il attend un score bas avant d'appeler Cactus.
      const difficulty = currentRoom?.config?.bot_difficulty || 'medium';
      const cactusThreshold = difficulty === 'easy' ? 18 : difficulty === 'medium' ? 12 : 6;

      if (estimatedScore <= cactusThreshold && !newGs.cactus_called) {
        addBotLog(`Appelle Cactus !`);
        newGs.cactus_called = true;
        newGs.cactus_caller = 'bot';
        newGs.cactus_caller_username = bot.username;
        newGs.remaining_final_turns = newGs.players.length - 1;
        newGs.current_player_index = (newGs.current_player_index + 1) % newGs.players.length;

        await supabase.from('game_rooms').update({ game_state: newGs }).eq('code', code.toUpperCase());
        setGameState(newGs);
        return;
      }

      // 3. RECYCLER le deck si vide
      if (!newGs.deck || newGs.deck.length === 0) {
        if (newGs.discard_pile && newGs.discard_pile.length > 1) {
          const top = newGs.discard_pile.pop();
          newGs.deck = shuffle(newGs.discard_pile.filter(c => c));
          newGs.discard_pile = [top];
          addBotLog('Recycle le deck');
        } else {
          addBotLog('Pas de cartes disponibles');
          return;
        }
      }

      // 4. CHOISIR entre pioche et défausse — sur la base des cartes CONNUES
      const known = knownIndexes(bot);
      const worstKnownIdx = known.length > 0
        ? known.reduce((a, b) => getCardValue(bot.hand[a]) >= getCardValue(bot.hand[b]) ? a : b)
        : -1;
      const worstKnownValue = worstKnownIdx !== -1 ? getCardValue(bot.hand[worstKnownIdx]) : null;

      let drawnCard = null;
      const discardValue = topDiscard ? getCardValue(topDiscard) : 999;

      if (!justSlammed && topDiscard && worstKnownValue !== null &&
          discardValue < worstKnownValue && newGs.discard_pile.length > 0) {
        drawnCard = newGs.discard_pile.pop();
        addBotLog(`Prend la défausse : ${drawnCard?.value}`);
      } else if (newGs.deck && newGs.deck.length > 0) {
        drawnCard = newGs.deck.pop();
        addBotLog(`Pioche une carte`);
      }

      if (!drawnCard) {
        addBotLog('Pas de carte à piocher');
        return;
      }

      // 5. DÉCIDER quoi faire avec la carte piochée
      const drawnValue = getCardValue(drawnCard);
      let discardedCard = null;

      if (worstKnownIdx !== -1 && drawnValue < worstKnownValue) {
        // Remplacer sa pire carte CONNUE (le bot voit la carte qu'il pose : il la mémorise)
        discardedCard = bot.hand[worstKnownIdx];
        bot.hand[worstKnownIdx] = drawnCard;
        rememberCardAt(bot, worstKnownIdx);
        newGs.discard_pile.push(discardedCard);
        newGs.drawn_card = null;
        addBotLog(`Échange ${discardedCard?.value} contre ${drawnCard.value}`);
      } else {
        const unknownIdxs = bot.hand
          .map((c, i) => i)
          .filter(i => !known.includes(i));

        if (unknownIdxs.length > 0 && drawnValue <= AVG_CARD_VALUE) {
          // Carte piochée meilleure que la moyenne : parier en remplaçant
          // une carte inconnue (comme un vrai joueur)
          const targetIdx = unknownIdxs[Math.floor(Math.random() * unknownIdxs.length)];
          discardedCard = bot.hand[targetIdx];
          bot.hand[targetIdx] = drawnCard;
          rememberCardAt(bot, targetIdx);
          newGs.discard_pile.push(discardedCard);
          newGs.drawn_card = null;
          addBotLog(`Remplace une carte inconnue par ${drawnCard.value}`);
        } else {
          // Défausser la carte piochée
          discardedCard = drawnCard;
          newGs.discard_pile.push(discardedCard);
          newGs.drawn_card = null;
          addBotLog(`Défausse ${discardedCard?.value}`);
        }
      }

      // 6. CARTES SPÉCIALES
      if (discardedCard && isSpecialCard(discardedCard)) {
        await new Promise(resolve => setTimeout(resolve, 800));

        if (discardedCard.value === '8') {
          // Regarder une de ses cartes inconnues (elle rejoint sa mémoire)
          const unknownIdx = bot.hand.findIndex((c, i) =>
            c && !knownIndexes(bot).includes(i));
          if (unknownIdx !== -1) {
            rememberCardAt(bot, unknownIdx);
            addBotLog(`Regarde sa carte ${unknownIdx + 1}`);
          }

        } else if (discardedCard.value === '10') {
          // Regarder la carte du joueur humain — notifier !
          const humanIdx = newGs.players.findIndex(p => !p.is_bot);
          if (humanIdx !== -1 && newGs.players[humanIdx].hand.length > 0) {
            // Le bot regarde la carte avec la plus haute valeur estimée
            const targetCardIdx = 0;
            const peekedCard = newGs.players[humanIdx].hand[targetCardIdx];
            if (peekedCard) {
              addBotLog(`Regarde votre carte ${targetCardIdx + 1} : ${peekedCard.value}${getSuitSymbol(peekedCard.suit)}`);
              setBotRevealMessage(`🤖 Le bot a regardé votre carte en position ${targetCardIdx + 1} : ${peekedCard.value}${getSuitSymbol(peekedCard.suit)}`);
              setTimeout(() => setBotRevealMessage(null), 4000);
            }
          }

        } else if (discardedCard.value === 'J') {
          // Échanger sa pire carte CONNUE contre une carte adverse au hasard
          const humanIdx = newGs.players.findIndex(p => !p.is_bot);
          if (humanIdx !== -1 &&
              bot.hand.length > 0 &&
              newGs.players[humanIdx].hand.length > 0) {

            const knownNow = knownIndexes(bot);
            const botGiveIdx = knownNow.length > 0
              ? knownNow.reduce((a, b) => getCardValue(bot.hand[a]) >= getCardValue(bot.hand[b]) ? a : b)
              : Math.floor(Math.random() * bot.hand.length);

            // Il ne connaît pas les cartes de l'adversaire : il en prend une au hasard
            const humanTargetIdx = Math.floor(Math.random() * newGs.players[humanIdx].hand.length);

            const botCard = bot.hand[botGiveIdx];
            const humanCard = newGs.players[humanIdx].hand[humanTargetIdx];

            if (botCard && humanCard) {
              bot.hand[botGiveIdx] = humanCard;
              newGs.players[humanIdx].hand[humanTargetIdx] = botCard;
              // La carte reçue est inconnue : le bot l'oublie de sa mémoire
              forgetCardAt(bot, botGiveIdx);
              addBotLog(`Échange sa carte ${botGiveIdx + 1} contre votre carte ${humanTargetIdx + 1}`);
              toast.info(`🤖 Le bot a échangé une de ses cartes contre votre carte ${humanTargetIdx + 1}!`);
            }
          }
        }
      }

      const updated = advanceTurn(newGs);
      await supabase.from('game_rooms').update({ game_state: updated }).eq('code', code.toUpperCase());
      setGameState(updated);

    } catch (err) {
      console.error('Bot error:', err);
      addBotLog(`Erreur: ${err.message}`);
    }
  };
  // ============================================================
  // FIN BOT LOGIC
  // ============================================================

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
      await updateGameState(newGs);

      toast.info('Mémorisez vos cartes! Démarrage dans 3 secondes...');
      setRevealTimer(3);

      revealTimerRef.current = setInterval(() => {
        setRevealTimer(prev => {
          if (prev <= 1) {
            clearInterval(revealTimerRef.current);
            const finalGs = JSON.parse(JSON.stringify(newGs));
            finalGs.phase = 'playing';
            updateGameState(finalGs);
            toast.success('La partie commence!');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      await updateGameState(newGs);
    }
  };

  const handleDrawDeck = async () => {
    if (!isMyTurn || gameState.drawn_card || gameState.phase !== 'playing') return;
    const newGs = JSON.parse(JSON.stringify(gameState));

    if (!newGs.deck || newGs.deck.length === 0) {
      if (newGs.discard_pile && newGs.discard_pile.length > 1) {
        const top = newGs.discard_pile.pop();
        newGs.deck = shuffle(newGs.discard_pile);
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
    newGs.drawn_card = null;

    if (isSpecialCard(oldCard)) {
      newGs.special_card_available = true;
      newGs.special_card_player = user.id;
      newGs.special_card_type = oldCard.value;
      newGs.awaiting_special_action = true;
      await updateGameState(newGs);
    } else {
      const updated = advanceTurn(newGs);
      await updateGameState(updated);
    }
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
      if (card && card.value === topCard.value) {
        removeCardKeepMemory(newGs.players[targetIdx], targetCardIndex);
        newGs.discard_pile.push(card);
        if (newGs.players[targetIdx].hand.length === 0) {
          const finished = endRound(newGs);
          await updateGameState(finished);
          toast.success('Slam réussi!');
          return;
        }
        newGs.pending_give_card = { from_player: user.id, to_player: targetPlayer };
        toast.success('Slam réussi!');
      } else {
        if (newGs.deck && newGs.deck.length > 0) {
          newGs.players[myPlayerIdx].hand.push(newGs.deck.pop());
        }
        toast.error('Slam raté! +1 carte');
      }
    } else {
      const card = newGs.players[myPlayerIdx].hand[cardIndex];
      if (card && card.value === topCard.value) {
        removeCardKeepMemory(newGs.players[myPlayerIdx], cardIndex);
        newGs.discard_pile.push(card);
        if (newGs.players[myPlayerIdx].hand.length === 0) {
          // Perfect Cactus : main vidée par défausse rapide
          newGs.cactus_called = true;
          newGs.cactus_caller = user.id;
          newGs.perfect_cactus_players = [...(newGs.perfect_cactus_players || []), user.id];
          const finished = endRound(newGs);
          await updateGameState(finished);
          toast.success('Perfect Cactus! 🌵⭐');
          return;
        }
        toast.success('Slam réussi!');
      } else {
        if (newGs.deck && newGs.deck.length > 0) {
          newGs.players[myPlayerIdx].hand.push(newGs.deck.pop());
        }
        toast.error('Slam raté! +1 carte');
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
    if (newGs.drawn_card) {
      newGs.discard_pile.push(newGs.drawn_card);
    }
    newGs.drawn_card = null;
    newGs.current_player_index = (newGs.current_player_index + 1) % newGs.players.length;

    await updateGameState(newGs);
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
    // L'adversaire reçoit une carte qu'il n'a pas vue : elle sort de sa mémoire
    forgetCardAt(newGs.players[targetIdx], targetCardIndex);

    newGs.special_card_available = false;
    newGs.special_card_player = null;
    newGs.special_card_type = null;
    newGs.awaiting_special_action = false;

    const updated = advanceTurn(newGs);
    await updateGameState(updated);
    setSwapMyCard(null);
  };

  const handleClearSpecial = async () => {
    const gs = gameStateRef.current;
    if (!gs) return;
    const newGs = JSON.parse(JSON.stringify(gs));
    newGs.special_reveal = null;
    newGs.special_card_available = false;
    newGs.special_card_player = null;
    newGs.special_card_type = null;
    newGs.awaiting_special_action = false;

    const updated = advanceTurn(newGs);
    await supabase.from('game_rooms').update({ game_state: updated }).eq('code', code.toUpperCase());
    setGameState(updated);
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

    const card = removeCardKeepMemory(newGs.players[myPlayerIdx], cardIndex);
    // La carte reçue est inconnue du destinataire : pas d'ajout à sa mémoire
    newGs.players[targetIdx].hand.push(card);
    newGs.pending_give_card = null;

    await updateGameState(newGs);
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

        {/* Notification bot */}
        {botRevealMessage && (
          <div className="bg-orange-500 text-white p-3 rounded-lg text-center font-semibold mb-2 animate-pulse">
            {botRevealMessage}
          </div>
        )}

        {/* Log actions bot */}
        {botActionLog.length > 0 && (
          <div className="bg-gray-800/80 text-white p-2 rounded-lg mb-2 text-xs space-y-1">
            <div className="font-semibold text-gray-300">Journal du bot :</div>
            {botActionLog.map((log, idx) => (
              <div key={idx} className="text-gray-200">{log}</div>
            ))}
          </div>
        )}

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

                {revealTimer > 0 && (
                  <div className="text-center mb-4">
                    <div className="text-2xl font-bold text-accent animate-pulse">
                      Mémorisez! Démarrage dans {revealTimer}s
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-accent h-2 rounded-full transition-all duration-1000"
                        style={{ width: `${(revealTimer / 3) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-center gap-3">
                  {myPlayer?.hand?.map((card, idx) => {
                    const isRevealed = myPlayer.revealed_cards?.includes(idx);
                    const canReveal = (myPlayer.revealed_cards?.length || 0) < gameState.cards_to_reveal && revealTimer === 0;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleRevealCard(idx)}
                        disabled={isRevealed || !canReveal}
                      >
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
                            <GameCard
                              card={isSpecialRevealed ? gameState.special_reveal.card : null}
                              isHidden={!isSpecialRevealed}
                              size="sm"
                            />
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
                  <button
                    onClick={handleDrawDeck}
                    disabled={!isMyTurn || !!gameState.drawn_card || gameState.phase !== 'playing'}
                  >
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
                    <div className="text-xs text-muted-foreground mt-1">
                      Ou cliquez sur une de vos cartes pour échanger
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <div className="text-sm font-semibold mb-2">Défausse</div>
                  <button
                    onClick={handleDrawDiscard}
                    disabled={!isMyTurn || !!gameState.drawn_card || !gameState.discard_pile?.length || gameState.phase !== 'playing'}
                  >
                    {gameState.discard_pile?.length > 0 ? (
                      <GameCard card={gameState.discard_pile[gameState.discard_pile.length - 1]} size="md" />
                    ) : (
                      <div className="w-24 h-32 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                        Vide
                      </div>
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
                <span className="font-bold text-lg">
                  Votre main ({myPlayer?.hand?.length} cartes)
                </span>
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
                      <GameCard
                        card={isSpecialRevealed ? gameState.special_reveal.card : null}
                        isHidden={!isSpecialRevealed}
                        size="lg"
                      />
                      <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-1">
                        {pendingGiveCard && (
                          <button
                            className="h-7 w-7 rounded-full shadow-lg bg-green-500 text-white flex items-center justify-center"
                            onClick={() => handleGiveCard(cardIdx)}
                          >
                            🎁
                          </button>
                        )}
                        {specialAvailable && gameState.special_card_type === '8' && (
                          <button
                            className="h-7 w-7 rounded-full shadow-lg bg-purple-500 text-white flex items-center justify-center"
                            onClick={() => handleSpecialLookOwn(cardIdx)}
                          >
                            <Eye className="h-3 w-3" />
                          </button>
                        )}
                        {specialAvailable && gameState.special_card_type === 'J' && swapMyCard === null && (
                          <button
                            className="h-7 w-7 rounded-full shadow-lg bg-purple-500 text-white flex items-center justify-center"
                            onClick={() => setSwapMyCard(cardIdx)}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        )}
                        {!pendingGiveCard && !specialAvailable && gameState.discard_pile?.length > 0 && (
                          <button
                            className="h-7 w-7 rounded-full shadow-lg bg-red-500 text-white flex items-center justify-center"
                            onClick={() => handleFastDiscard(cardIdx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        {gameState.drawn_card && isMyTurn && !pendingGiveCard && !specialAvailable && (
                          <button
                            className="h-7 w-7 rounded-full shadow-lg bg-primary text-white flex items-center justify-center"
                            onClick={() => handleExchangeCard(cardIdx)}
                          >
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
          {gameState.cactus_called && gameState.phase !== 'ended' && (
            <div className="bg-accent text-white p-3 rounded-lg text-center font-semibold animate-pulse">
              🌵 Cactus appelé par {gameState.cactus_caller_username || 'un joueur'}! Tours restants: {gameState.remaining_final_turns}
            </div>
          )}

          {pendingGiveCard && (
            <div className="bg-green-600 text-white p-4 rounded-lg text-center space-y-3">
              <div className="font-semibold">🎉 Slam réussi! Donnez une carte à l'adversaire.</div>
              <Button
                onClick={() => { const newGs = { ...gameState, pending_give_card: null }; updateGameState(newGs); }}
                variant="outline" size="sm" className="bg-white text-green-600"
              >
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
                {gameState.special_card_type === 'J' && (swapMyCard === null
                  ? " Sélectionnez d'abord UNE de VOS cartes"
                  : " Maintenant cliquez sur une carte ADVERSE"
                )}
              </div>
              {revealCountdown > 0 && <div className="text-2xl font-bold">{revealCountdown}s</div>}
              {revealCountdown === 0 && (
                <Button onClick={handleSkipSpecial} variant="outline" size="sm" className="bg-white text-purple-600">
                  Passer
                </Button>
              )}
            </div>
          )}

          {/* Fin de manche (la partie continue) */}
          {gameState.phase === 'round_ended' && (
            <div className="bg-orange-400 text-black p-4 rounded-lg text-center space-y-3">
              <div className="text-2xl font-bold">
                Fin de la manche {gameState.round}/{room?.config?.num_rounds || 1}
              </div>
              <div className="space-y-2">
                {[...gameState.players]
                  .sort((a, b) => (a.total_score || 0) - (b.total_score || 0))
                  .map((player) => (
                    <div key={player.user_id} className="flex justify-between p-2 rounded bg-white/50">
                      <span>
                        {player.username}
                        {player.cactus_penalty && (
                          <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded">
                            Cactus raté +10
                          </span>
                        )}
                      </span>
                      <span>
                        +{player.round_score || 0} pts (total : {player.total_score || 0})
                      </span>
                    </div>
                  ))}
              </div>
              {room?.creator_id === user.id ? (
                <Button onClick={handleNextRound} className="desert-button mt-2 bg-accent hover:bg-accent/90">
                  Manche suivante ➜
                </Button>
              ) : (
                <div className="text-sm font-semibold">
                  En attente que le créateur lance la manche suivante...
                </div>
              )}
            </div>
          )}

          {/* Fin de partie */}
          {gameState.phase === 'ended' && (
            <div className="bg-yellow-500 text-black p-4 rounded-lg text-center space-y-3">
              <div className="text-2xl font-bold">🏆 Partie Terminée!</div>
              <div className="space-y-2">
                {[...gameState.players]
                  .sort((a, b) => (a.total_score || 0) - (b.total_score || 0))
                  .map((player, idx) => (
                    <div
                      key={player.user_id}
                      className={`flex justify-between p-2 rounded ${idx === 0 ? 'bg-green-200 font-bold' : 'bg-white/50'}`}
                    >
                      <span>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {player.username}
                        {player.cactus_penalty && (
                          <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded">
                            Cactus raté +10
                          </span>
                        )}
                      </span>
                      <span>{player.total_score || 0} points</span>
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
