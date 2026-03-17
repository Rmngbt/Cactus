import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Plus, Users, TrendingUp, Settings } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Lobby({ user, onLogout }) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [gameMode, setGameMode] = useState('multiplayer');
  const [cardsPerPlayer, setCardsPerPlayer] = useState(4);
  const [visibleAtStart, setVisibleAtStart] = useState(2);
  const [scoreThreshold, setScoreThreshold] = useState(60);
  const [numRounds, setNumRounds] = useState(1);
  const [botDifficulty, setBotDifficulty] = useState('medium');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreateRoom = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${BACKEND_URL}/api/game/create-room`,
        {
          cards_per_player: cardsPerPlayer,
          visible_at_start: visibleAtStart,
          score_threshold: scoreThreshold,
          num_rounds: numRounds,
          mode: gameMode,
          bot_difficulty: botDifficulty
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Partie créée!');
      navigate(`/room/${response.data.room_code}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      toast.error('Veuillez entrer un code');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BACKEND_URL}/api/game/join-room`,
        {
          code: joinCode.toUpperCase(),
          username: user.username
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Partie rejointe!');
      navigate(`/room/${joinCode.toUpperCase()}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="desert-bg min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>
      <div className="cloud cloud-1">☁️</div>
      <div className="cloud cloud-2">☁️</div>
      <div className="cloud cloud-3">☁️</div>

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 pt-4">
          <div className="flex items-center space-x-3">
            <div className="text-5xl floating-cactus">🌵</div>
            <div>
              <h1 className="text-4xl font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
                CACTUS
              </h1>
              <p className="text-white/80">Bonjour, {user.username}!</p>
            </div>
          </div>

          <div className="flex space-x-2">
            <Link to="/stats">
              <Button variant="outline" className="desert-button" data-testid="stats-button">
                <TrendingUp className="mr-2 h-4 w-4" />
                Stats
              </Button>
            </Link>
            {user.is_admin && (
              <Link to="/admin">
                <Button variant="outline" className="desert-button" data-testid="admin-button">
                  <Settings className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={onLogout} className="desert-button" data-testid="logout-button">
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>

        {/* Main Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-2xl hover:shadow-3xl cactus-card" data-testid="create-room-card">
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <CardTitle className="text-2xl">Créer une partie</CardTitle>
              <CardDescription>Démarrez une nouvelle partie multijoueur ou contre un bot</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
                data-testid="create-room-button"
              >
                <Plus className="mr-2 h-5 w-5" />
                Créer une partie
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-2xl hover:shadow-3xl cactus-card" data-testid="join-room-card">
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎲</div>
              <CardTitle className="text-2xl">Rejoindre une partie</CardTitle>
              <CardDescription>Entrez le code de la partie pour rejoindre vos amis</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button
                onClick={() => setShowJoinDialog(true)}
                className="w-full desert-button bg-primary hover:bg-primary/90 text-white font-semibold py-6 text-lg"
                data-testid="join-room-button"
              >
                <Users className="mr-2 h-5 w-5" />
                Rejoindre une partie
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="shadow-2xl bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Comment jouer?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>🎯 <strong>Objectif:</strong> Ayez le score le plus bas à la fin de chaque manche</p>
            <p>🎴 <strong>Actions:</strong> Piochez, échangez ou défaussez des cartes à votre tour</p>
            <p>✨ <strong>Cartes spéciales:</strong> 8 (voir sa carte), 10 (voir carte adverse), V (échanger)</p>
            <p>⚡ <strong>Défausse rapide:</strong> Défaussez instantanément une carte identique à celle de la pile</p>
            <p>🌵 <strong>Cactus:</strong> Annoncez "Cactus" quand vous pensez avoir le meilleur score</p>
            <p>🏆 <strong>Perfect Cactus:</strong> Défaussez toutes vos cartes via la défausse rapide!</p>
          </CardContent>
        </Card>
      </div>

      {/* Create Room Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md" data-testid="create-room-dialog">
          <DialogHeader>
            <DialogTitle>Créer une partie</DialogTitle>
            <DialogDescription>Configurez les paramètres de votre partie</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mode de jeu</Label>
              <Select value={gameMode} onValueChange={setGameMode}>
                <SelectTrigger data-testid="game-mode-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="multiplayer">Multijoueur</SelectItem>
                  <SelectItem value="bot">Contre Bot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {gameMode === 'bot' && (
              <div className="space-y-2">
                <Label>Difficulté du bot</Label>
                <Select value={botDifficulty} onValueChange={setBotDifficulty}>
                  <SelectTrigger data-testid="bot-difficulty-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Facile</SelectItem>
                    <SelectItem value="medium">Moyen</SelectItem>
                    <SelectItem value="hard">Difficile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Cartes par joueur: {cardsPerPlayer}</Label>
              <Input
                type="range"
                min="3"
                max="6"
                value={cardsPerPlayer}
                onChange={(e) => setCardsPerPlayer(Number(e.target.value))}
                data-testid="cards-per-player-slider"
              />
            </div>

            <div className="space-y-2">
              <Label>Cartes visibles au début: {visibleAtStart}</Label>
              <Input
                type="range"
                min="1"
                max={cardsPerPlayer}
                value={visibleAtStart}
                onChange={(e) => setVisibleAtStart(Number(e.target.value))}
                data-testid="visible-at-start-slider"
              />
            </div>

            <div className="space-y-2">
              <Label>Score cible: {scoreThreshold}</Label>
              <Input
                type="range"
                min="30"
                max="100"
                step="10"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))}
                data-testid="score-threshold-slider"
              />
            </div>

            <div className="space-y-2">
              <Label>Nombre de manches: {numRounds}</Label>
              <Input
                type="range"
                min="1"
                max="10"
                value={numRounds}
                onChange={(e) => setNumRounds(Number(e.target.value))}
                data-testid="num-rounds-slider"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreateRoom}
              disabled={loading}
              className="w-full desert-button bg-accent hover:bg-accent/90"
              data-testid="create-room-confirm-button"
            >
              {loading ? 'Création...' : 'Créer la partie'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Join Room Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-md" data-testid="join-room-dialog">
          <DialogHeader>
            <DialogTitle>Rejoindre une partie</DialogTitle>
            <DialogDescription>Entrez le code de la partie</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="joinCode">Code de la partie</Label>
              <Input
                id="joinCode"
                placeholder="ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-2xl font-bold tracking-wider"
                data-testid="join-code-input"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleJoinRoom}
              disabled={loading || !joinCode.trim()}
              className="w-full desert-button bg-primary hover:bg-primary/90"
              data-testid="join-room-confirm-button"
            >
              {loading ? 'Connexion...' : 'Rejoindre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
