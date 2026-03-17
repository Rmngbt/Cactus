import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Plus, Users, TrendingUp, Settings } from 'lucide-react';

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
      const code = generateRoomCode();

      const { data, error } = await supabase
        .from('game_rooms')
        .insert({
          code,
          creator_id: user.id,
          mode: gameMode,
          state: 'waiting',
          config: {
            cards_per_player: cardsPerPlayer,
            visible_at_start: visibleAtStart,
            score_threshold: scoreThreshold,
            num_rounds: numRounds,
            bot_difficulty: botDifficulty
          },
          game_state: {}
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Partie créée!');
      navigate(`/room/${code}`);
    } catch (error) {
      toast.error('Erreur lors de la création');
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
      const { data, error } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('code', joinCode.toUpperCase())
        .single();

      if (error || !data) {
        toast.error('Salle introuvable');
        return;
      }

      if (data.state !== 'waiting') {
        toast.error('La partie a déjà commencé');
        return;
      }

      toast.success('Partie rejointe!');
      navigate(`/room/${joinCode.toUpperCase()}`);
    } catch (error) {
      toast.error('Erreur lors de la connexion');
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

      <div className="container mx-auto max-w-6xl relative z-10">
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
              <Button variant="outline" className="desert-button">
                <TrendingUp className="mr-2 h-4 w-4" />
                Stats
              </Button>
            </Link>
            {user.is_admin && (
              <Link to="/admin">
                <Button variant="outline" className="desert-button">
                  <Settings className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={onLogout} className="desert-button">
              <LogOut className="mr-2 h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-2xl hover:shadow-3xl cactus-card">
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎮</div>
              <CardTitle className="text-2xl">Créer une partie</CardTitle>
              <CardDescription>Démarrez une nouvelle partie</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
              >
                <Plus className="mr-2 h-5 w-5" />
                Créer une partie
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-2xl hover:shadow-3xl cactus-card">
            <CardHeader className="text-center">
              <div className="text-6xl mb-4">🎲</div>
              <CardTitle className="text-2xl">Rejoindre une partie</CardTitle>
              <CardDescription>Entrez le code pour rejoindre</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button
                onClick={() => setShowJoinDialog(true)}
                className="w-full desert-button bg-primary hover:bg-primary/90 text-white font-semibold py-6 text-lg"
              >
                <Users className="mr-2 h-5 w-5" />
                Rejoindre une partie
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-2xl bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Comment jouer?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>🎯 <strong>Objectif:</strong> Ayez le score le plus bas à la fin de chaque manche</p>
            <p>🎴 <strong>Actions:</strong> Piochez, échangez ou défaussez des cartes à votre tour</p>
            <p>✨ <strong>Cartes spéciales:</strong> 8 (voir sa carte), 10 (voir carte adverse), V (échanger)</p>
            <p>⚡ <strong>Défausse rapide:</strong> Défaussez instantanément une carte identique</p>
            <p>🌵 <strong>Cactus:</strong> Annoncez quand vous pensez avoir le meilleur score</p>
          </CardContent>
        </Card>
      </div>

      {/* Dialog Créer */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Créer une partie</DialogTitle>
            <DialogDescription>Configurez votre partie</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mode de jeu</Label>
              <Select value={gameMode} onValueChange={setGameMode}>
                <SelectTrigger>
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
                  <SelectTrigger>
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
              <Input type="range" min="3" max="6" value={cardsPerPlayer}
                onChange={(e) => setCardsPerPlayer(Number(e.target.value))} />
            </div>

            <div className="space-y-2">
              <Label>Cartes visibles au début: {visibleAtStart}</Label>
              <Input type="range" min="1" max={cardsPerPlayer} value={visibleAtStart}
                onChange={(e) => setVisibleAtStart(Number(e.target.value))} />
            </div>

            <div className="space-y-2">
              <Label>Score cible: {scoreThreshold}</Label>
              <Input type="range" min="30" max="100" step="10" value={scoreThreshold}
                onChange={(e) => setScoreThreshold(Number(e.target.value))} />
            </div>

            <div className="space-y-2">
              <Label>Nombre de manches: {numRounds}</Label>
              <Input type="range" min="1" max="10" value={numRounds}
                onChange={(e) => setNumRounds(Number(e.target.value))} />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleCreateRoom} disabled={loading}
              className="w-full desert-button bg-accent hover:bg-accent/90">
              {loading ? 'Création...' : 'Créer la partie'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Rejoindre */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-md">
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
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleJoinRoom} disabled={loading || !joinCode.trim()}
              className="w-full desert-button bg-primary hover:bg-primary/90">
              {loading ? 'Connexion...' : 'Rejoindre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
