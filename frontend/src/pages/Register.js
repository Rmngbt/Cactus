import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Register({ onLogin }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/register`, {
        username,
        email,
        password
      });

      onLogin(response.data.user, response.data.access_token);
      toast.success('Inscription réussie!');
      navigate('/lobby');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de l\'inscription');
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

      <Card className="w-full max-w-md z-10 shadow-2xl" data-testid="register-card">
        <CardHeader className="text-center">
          <div className="text-6xl mb-4 floating-cactus">🌵</div>
          <CardTitle className="text-4xl font-bold" style={{ fontFamily: 'Fredoka, sans-serif' }}>
            CACTUS
          </CardTitle>
          <CardDescription className="text-base">Créez votre compte</CardDescription>
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
                data-testid="register-username-input"
                className="border-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="register-email-input"
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
                minLength={6}
                data-testid="register-password-input"
                className="border-2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="register-confirm-password-input"
                className="border-2"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button
              type="submit"
              className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
              disabled={loading}
              data-testid="register-submit-button"
            >
              {loading ? 'Inscription...' : 'S\'inscrire'}
            </Button>

            <div className="text-center text-sm">
              Déjà un compte?{' '}
              <Link to="/login" className="text-primary font-semibold hover:underline" data-testid="login-link">
                Se connecter
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
