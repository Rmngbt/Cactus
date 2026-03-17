import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        username,
        password
      });

      onLogin(response.data.user, response.data.access_token);
      toast.success('Connexion réussie!');
      navigate('/lobby');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="desert-bg flex items-center justify-center min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>
      <div className="cloud cloud-1">☁️</div>
      <div className="cloud cloud-2">☁️</div>
      <div className="cloud cloud-3">☁️</div>

      <Card className="w-full max-w-md z-10 shadow-2xl" data-testid="login-card">
        <CardHeader className="text-center">
          <div className="text-6xl mb-4 floating-cactus">🌵</div>
          <CardTitle className="text-4xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
            CACTUS
          </CardTitle>
          <CardDescription className="text-base">Connectez-vous pour jouer</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Pseudo</Label>
              <Input
                id="username"
                type="text"
                placeholder="Votre pseudo"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="login-username-input"
                className="border-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
                className="border-2"
              />
            </div>

            <div className="text-right">
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:underline"
                data-testid="forgot-password-link"
              >
                Mot de passe oublié?
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button
              type="submit"
              className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>

            <div className="text-center text-sm">
              Pas encore de compte?{' '}
              <Link to="/register" className="text-primary font-semibold hover:underline" data-testid="register-link">
                S'inscrire
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
