import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Save, Settings, Image as ImageIcon, BarChart, Users, Shield, ShieldOff } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function AdminPanel({ user, onLogout }) {
  const navigate = useNavigate();
  const [rules, setRules] = useState(null);
  const [settings, setSettings] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rules state
  const [cardsPerPlayer, setCardsPerPlayer] = useState(4);
  const [visibleAtStart, setVisibleAtStart] = useState(2);
  const [scoreThreshold, setScoreThreshold] = useState(60);
  const [cardVisibilityDelay, setCardVisibilityDelay] = useState(3);

  // Settings state
  const [backgroundImage, setBackgroundImage] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const [rulesRes, settingsRes, statsRes, usersRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/admin/rules`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${BACKEND_URL}/api/admin/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${BACKEND_URL}/api/stats/global`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${BACKEND_URL}/api/admin/users`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setRules(rulesRes.data);
      setSettings(settingsRes.data);
      setGlobalStats(statsRes.data);
      setAllUsers(usersRes.data);

      // Set form values
      setCardsPerPlayer(rulesRes.data.cards_per_player);
      setVisibleAtStart(rulesRes.data.visible_at_start);
      setScoreThreshold(rulesRes.data.score_threshold);
      setCardVisibilityDelay(rulesRes.data.card_visibility_delay);
      setBackgroundImage(settingsRes.data.background_images?.[0] || '');
    } catch (error) {
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRules = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BACKEND_URL}/api/admin/rules`,
        {
          cards_per_player: cardsPerPlayer,
          visible_at_start: visibleAtStart,
          score_threshold: scoreThreshold,
          card_visibility_delay: cardVisibilityDelay
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Règles mises à jour!');
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleToggleAdmin = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${BACKEND_URL}/api/admin/users/${userId}/toggle-admin`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la modification');
    }
  };

  if (loading) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="desert-bg min-h-screen p-4" data-page="admin">
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            onClick={() => navigate('/lobby')}
            className="desert-button"
            data-testid="back-button"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>

          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
            Panneau Administrateur
          </h1>

          <div className="w-24"></div>
        </div>

        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="rules" data-testid="rules-tab">
              <Settings className="mr-2 h-4 w-4" />
              Règles
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="users-tab">
              <Users className="mr-2 h-4 w-4" />
              Utilisateurs
            </TabsTrigger>
            <TabsTrigger value="appearance" data-testid="appearance-tab">
              <ImageIcon className="mr-2 h-4 w-4" />
              Apparence
            </TabsTrigger>
            <TabsTrigger value="stats" data-testid="stats-tab">
              <BarChart className="mr-2 h-4 w-4" />
              Statistiques
            </TabsTrigger>
          </TabsList>

          {/* Rules Tab */}
          <TabsContent value="rules">
            <Card className="shadow-2xl" data-testid="rules-card">
              <CardHeader>
                <CardTitle>Configuration des règles</CardTitle>
                <CardDescription>
                  Modifiez les règles du jeu sans toucher au code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                  <p className="text-xs text-muted-foreground">
                    Nombre de cartes distribuées à chaque joueur en début de manche
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Cartes visibles au début: {visibleAtStart}</Label>
                  <Input
                    type="range"
                    min="1"
                    max="4"
                    value={visibleAtStart}
                    onChange={(e) => setVisibleAtStart(Number(e.target.value))}
                    data-testid="visible-at-start-slider"
                  />
                  <p className="text-xs text-muted-foreground">
                    Nombre de cartes que chaque joueur peut voir au début
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Score à atteindre pour terminer la partie
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Délai de visibilité des cartes spéciales (secondes): {cardVisibilityDelay}</Label>
                  <Input
                    type="range"
                    min="1"
                    max="10"
                    value={cardVisibilityDelay}
                    onChange={(e) => setCardVisibilityDelay(Number(e.target.value))}
                    data-testid="card-visibility-delay-slider"
                  />
                  <p className="text-xs text-muted-foreground">
                    Temps pendant lequel une carte est visible via les pouvoirs spéciaux (8, 10)
                  </p>
                </div>

                {/* Special Cards Rules Reference */}
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-3">Règles des cartes spéciales</h4>
                  <div className="space-y-2 text-sm text-purple-700">
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-lg">8</span>
                      <span>→ Regarder une de ses propres cartes</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-lg">10</span>
                      <span>→ Regarder une carte adverse</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-lg">V</span>
                      <span>→ Échanger une carte avec l'adversaire (à l'aveugle)</span>
                    </div>
                  </div>
                  <p className="text-xs text-purple-600 mt-3">
                    Ces effets s'activent lorsqu'on défausse la carte piochée. Le joueur peut passer l'action avec le bouton "Passer".
                  </p>
                </div>

                <Button
                  onClick={handleSaveRules}
                  className="w-full desert-button bg-accent hover:bg-accent/90"
                  data-testid="save-rules-button"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Sauvegarder les règles
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Users Management Tab */}
          <TabsContent value="users">
            <Card className="shadow-2xl" data-testid="users-card">
              <CardHeader>
                <CardTitle>Gestion des utilisateurs</CardTitle>
                <CardDescription>
                  Gérer les droits d'administration des utilisateurs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {allUsers.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center justify-between p-4 bg-muted rounded-lg"
                      data-testid={`user-${u.user_id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold">{u.username}</span>
                          {u.is_admin && (
                            <span className="text-xs bg-accent text-white px-2 py-1 rounded">
                              <Shield className="inline h-3 w-3 mr-1" />
                              Admin
                            </span>
                          )}
                          {u.user_id === user.user_id && (
                            <span className="text-xs bg-primary text-white px-2 py-1 rounded">
                              Vous
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{u.email}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Parties: {u.stats?.games_played || 0} | Victoires: {u.stats?.wins || 0}
                        </div>
                      </div>
                      
                      {u.user_id !== user.user_id && (
                        <Button
                          onClick={() => handleToggleAdmin(u.user_id)}
                          variant={u.is_admin ? "destructive" : "default"}
                          size="sm"
                          className="desert-button"
                          data-testid={`toggle-admin-${u.user_id}`}
                        >
                          {u.is_admin ? (
                            <>
                              <ShieldOff className="mr-2 h-4 w-4" />
                              Retirer admin
                            </>
                          ) : (
                            <>
                              <Shield className="mr-2 h-4 w-4" />
                              Promouvoir admin
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Vous ne pouvez pas modifier vos propres droits d'administration.
                    Les administrateurs ont accès à ce panneau et peuvent modifier les règles du jeu.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <Card className="shadow-2xl" data-testid="appearance-card">
              <CardHeader>
                <CardTitle>Configuration de l'apparence</CardTitle>
                <CardDescription>
                  Personnalisez l'apparence du jeu
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="background">Image de fond (URL)</Label>
                  <Input
                    id="background"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={backgroundImage}
                    onChange={(e) => setBackgroundImage(e.target.value)}
                    data-testid="background-image-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    URL de l'image de fond du jeu
                  </p>
                </div>

                {backgroundImage && (
                  <div className="space-y-2">
                    <Label>Aperçu</Label>
                    <div className="w-full h-48 rounded-lg overflow-hidden border-2">
                      <img
                        src={backgroundImage}
                        alt="Background preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.src = 'https://via.placeholder.com/800x400?text=Image+invalide';
                        }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => toast.info('Fonctionnalité en cours de développement')}
                  className="w-full desert-button bg-primary hover:bg-primary/90"
                  data-testid="save-appearance-button"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Sauvegarder l'apparence
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats">
            <Card className="shadow-2xl" data-testid="global-stats-card">
              <CardHeader>
                <CardTitle>Statistiques globales</CardTitle>
                <CardDescription>
                  Vue d'ensemble de l'activité de tous les joueurs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-6 bg-muted rounded-lg">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {globalStats?.total_users || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Utilisateurs inscrits</div>
                  </div>

                  <div className="text-center p-6 bg-muted rounded-lg">
                    <div className="text-4xl font-bold text-accent mb-2">
                      {globalStats?.total_games || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Parties jouées</div>
                  </div>

                  <div className="text-center p-6 bg-muted rounded-lg">
                    <div className="text-4xl font-bold text-secondary mb-2">
                      {globalStats?.total_perfect_cactus || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Perfect Cactus réalisés</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Made with Emergent badge - Only in admin panel */}
        <div className="mt-8 flex justify-center">
          <div className="bg-black text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center space-x-2 shadow-lg">
            <span>⚡</span>
            <span>Made with Emergent</span>
          </div>
        </div>
      </div>
    </div>
  );
}
