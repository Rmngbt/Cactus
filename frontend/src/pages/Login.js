import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Login({ onLogin }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let emailToUse = identifier;

      // Si ce n'est pas un email → chercher par pseudo
      if (!identifier.includes('@')) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', identifier)
          .single();

        if (profileError || !profile) {
          toast.error('Pseudo introuvable');
          setLoading(false);
          return;
        }

        // Récupérer l'email via auth admin n'est pas possible côté client
        // On utilise une fonction RPC pour récupérer l'email
        const { data: userData, error: userError } = await supabase
          .rpc('get_email_by_username', { p_username: identifier });

        if (userError || !userData) {
          toast.error('Impossible de trouver le compte');
          setLoading(false);
          return;
        }

        emailToUse = userData;
      }

      // Connexion avec email + mot de passe
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password
      });

      if (error) {
        toast.error('Email/pseudo ou mot de passe incorrect');
        setLoading(false);
        return;
      }

      // Récupérer le profil
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      onLogin(profile);
      toast.success('Connexion réussie!');
      navigate('/lobby');
    } catch (error) {
      toast.error('Erreur de connexion');
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

      <Card className="w-full max-w-md z-10 shadow-2xl">
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
              <Label htmlFor="identifier">Email ou Pseudo</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="votre@email.com ou votre pseudo"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
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
                className="border-2"
              />
            </div>

            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Mot de passe oublié?
              </Link>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button
              type="submit"
              className="w-full desert-button bg-accent hover:bg-accent/90 text-white font-semibold py-6 text-lg"
              disabled={loading}
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>

            <div className="text-center text-sm">
              Pas encore de compte?{' '}
              <Link to="/register" className="text-primary font-semibold hover:underline">
                S'inscrire
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
