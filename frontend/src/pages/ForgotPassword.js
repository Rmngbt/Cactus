import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      toast.error('Erreur lors de l\'envoi');
    } else {
      setSent(true);
      toast.success('Email envoyé!');
    }

    setLoading(false);
  };

  return (
    <div className="desert-bg flex items-center justify-center min-h-screen p-4">
      <div className="cactus-decoration cactus-left">🌵</div>
      <div className="cactus-decoration cactus-right">🌵</div>

      <Card className="w-full max-w-md z-10 shadow-2xl">
        <CardHeader className="text-center">
          <div className="text-6xl mb-4">🌵</div>
          <CardTitle className="text-2xl font-bold">Mot de passe oublié</CardTitle>
          <CardDescription>
            {sent
              ? 'Consultez votre email pour réinitialiser votre mot de passe'
              : 'Entrez votre email pour recevoir un lien de réinitialisation'}
          </CardDescription>
        </CardHeader>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-2"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3">
              <Button
                type="submit"
                className="w-full desert-button bg-primary hover:bg-primary/90 text-white font-semibold py-6"
                disabled={loading}
              >
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </Button>
              <Link to="/login" className="text-center text-sm text-primary hover:underline">
                Retour à la connexion
              </Link>
            </CardFooter>
          </form>
        ) : (
          <CardFooter>
            <Link to="/login" className="w-full">
              <Button className="w-full desert-button bg-primary hover:bg-primary/90">
                Retour à la connexion
              </Button>
            </Link>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
