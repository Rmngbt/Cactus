import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Save, Settings, BarChart, Users, Shield, ShieldOff } from 'lucide-react';

export default function AdminPanel({ user, onLogout }) {
  const navigate = useNavigate();
  const [allUsers, setAllUsers] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: users } = await supabase
        .from('profiles')
        .select('*, stats(*)');

      const { count: totalGames } = await supabase
        .from('game_rooms')
        .select('*', { count: 'exact' })
        .eq('state', 'finished');

      const { data: statsData } = await supabase
        .from('stats')
        .select('perfect_cactus_count');

      const totalPerfectCactus = statsData?.reduce(
        (sum, s) => sum + (s.perfect_cactus_count || 0), 0
      ) || 0;

      setAllUsers(users || []);
      setGlobalStats({
        total_users: users?.length || 0,
        total_games: totalGames || 0,
        total_perfect_cactus: totalPerfectCactus
      });
    } catch (error) {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      toast.success(`Droits admin ${!currentStatus ? 'accordés' : 'retirés'}`);
      fetchData();
    } catch (error) {
      toast.error('Erreur lors de la modification');
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
    <div className="desert-bg min-h-screen p-4">
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate('/lobby')} className="desert-button">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Fredoka, sans-serif' }}>
            Panneau Administrateur
          </h1>
          <div className="w-24"></div>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users">
              <Users className="mr-2 h-4 w-4" />
              Utilisateurs
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart className="mr-2 h-4 w-4" />
              Statistiques
            </TabsTrigger>
          </TabsList>

          {/* Onglet Utilisateurs */}
          <TabsContent value="users">
            <Card className="shadow-2xl">
              <CardHeader>
                <CardTitle>Gestion des utilisateurs</CardTitle>
                <CardDescription>Gérer les droits d'administration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {allUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold">{u.username}</span>
                          {u.is_admin && (
                            <span className="text-xs bg-accent text-white px-2 py-1 rounded">
                              <Shield className="inline h-3 w-3 mr-1" />
                              Admin
                            </span>
                          )}
                          {u.id === user.id && (
                            <span className="text-xs bg-primary text-white px-2 py-1 rounded">
                              Vous
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Parties: {u.stats?.games_played || 0} | Victoires: {u.stats?.wins || 0}
                        </div>
                      </div>

                      {u.id !== user.id && (
                        <Button
                          onClick={() => handleToggleAdmin(u.id, u.is_admin)}
                          variant={u.is_admin ? "destructive" : "default"}
                          size="sm"
                          className="desert-button"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet Stats */}
          <TabsContent value="stats">
            <Card className="shadow-2xl">
              <CardHeader>
                <CardTitle>Statistiques globales</CardTitle>
                <CardDescription>Vue d'ensemble de l'activité</CardDescription>
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
                    <div className="text-sm text-muted-foreground">Perfect Cactus</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
