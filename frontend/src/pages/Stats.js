import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { toast } from 'sonner';
import { ArrowLeft, TrendingUp, Trophy, Target, Star } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Stats({ user, onLogout }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/stats/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  const winRate = stats.games_played > 0 ? ((stats.wins / stats.games_played) * 100).toFixed(1) : 0;
  const avgScore = stats.games_played > 0 ? (stats.total_score / stats.games_played).toFixed(1) : 0;

  const barData = {
    labels: ['Parties jouées', 'Victoires', 'Perfect Cactus'],
    datasets: [
      {
        label: 'Statistiques',
        data: [stats.games_played || 0, stats.wins || 0, stats.perfect_cactus_count || 0],
        backgroundColor: ['rgba(72, 201, 176, 0.8)', 'rgba(46, 204, 113, 0.8)', 'rgba(244, 164, 96, 0.8)'],
        borderColor: ['rgba(72, 201, 176, 1)', 'rgba(46, 204, 113, 1)', 'rgba(244, 164, 96, 1)'],
        borderWidth: 2,
      },
    ],
  };

  const pieData = {
    labels: ['Victoires', 'Défaites'],
    datasets: [
      {
        data: [stats.wins || 0, (stats.games_played || 0) - (stats.wins || 0)],
        backgroundColor: ['rgba(46, 204, 113, 0.8)', 'rgba(231, 76, 60, 0.8)'],
        borderColor: ['rgba(46, 204, 113, 1)', 'rgba(231, 76, 60, 1)'],
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
    },
  };

  return (
    <div className="desert-bg min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>

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
            Vos Statistiques
          </h1>

          <div className="w-24"></div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="shadow-xl cactus-card" data-testid="games-played-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parties jouées</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.games_played || 0}</div>
            </CardContent>
          </Card>

          <Card className="shadow-xl cactus-card" data-testid="wins-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Victoires</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-accent">{stats.wins || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Taux: {winRate}%</p>
            </CardContent>
          </Card>

          <Card className="shadow-xl cactus-card" data-testid="avg-score-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Score moyen</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-secondary">{avgScore}</div>
            </CardContent>
          </Card>

          <Card className="shadow-xl cactus-card" data-testid="perfect-cactus-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Perfect Cactus</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" style={{ color: '#F4A460' }}>
                {stats.perfect_cactus_count || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-2xl" data-testid="bar-chart-card">
            <CardHeader>
              <CardTitle>Aperçu général</CardTitle>
              <CardDescription>Vue d'ensemble de vos performances</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ height: '300px' }}>
                <Bar data={barData} options={chartOptions} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-2xl" data-testid="pie-chart-card">
            <CardHeader>
              <CardTitle>Ratio victoires/défaites</CardTitle>
              <CardDescription>Votre taux de réussite</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ height: '300px' }}>
                <Pie data={pieData} options={chartOptions} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Achievements */}
        <Card className="shadow-2xl mt-6">
          <CardHeader>
            <CardTitle>Accomplissements 🏆</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-4xl mb-2">🌱</div>
                <div className="font-semibold">Débutant</div>
                <div className="text-xs text-muted-foreground">
                  {stats.games_played >= 1 ? '✅' : '❌'} Jouer 1 partie
                </div>
              </div>

              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-4xl mb-2">🌿</div>
                <div className="font-semibold">Régulier</div>
                <div className="text-xs text-muted-foreground">
                  {stats.games_played >= 10 ? '✅' : '❌'} Jouer 10 parties
                </div>
              </div>

              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-4xl mb-2">🏆</div>
                <div className="font-semibold">Champion</div>
                <div className="text-xs text-muted-foreground">
                  {stats.wins >= 5 ? '✅' : '❌'} Gagner 5 parties
                </div>
              </div>

              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-4xl mb-2">⭐</div>
                <div className="font-semibold">Perfection</div>
                <div className="text-xs text-muted-foreground">
                  {stats.perfect_cactus_count >= 1 ? '✅' : '❌'} 1 Perfect Cactus
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
