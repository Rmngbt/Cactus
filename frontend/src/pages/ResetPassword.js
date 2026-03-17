import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${BACKEND_URL}/api/auth/reset-password`, {
        token,
        new_password: newPassword
      });

      toast.success('Mot de passe réinitialisé avec succès!');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la réinitialisation');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="desert-bg flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md z-10">
          <CardHeader>
            <CardTitle>Lien invalide</CardTitle>
            <CardDescription>Le lien de réinitialisation est invalide ou expiré</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link to="/login" className="w-full">
              <Button className="w-full">Retour à la connexion</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="desert-bg flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md z-10 shadow-2xl" data-testid="reset-password-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Nouveau mot de passe</CardTitle>
          <CardDescription>Choisissez un nouveau mot de passe sécurisé</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                data-testid="reset-password-input"
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
                data-testid="reset-confirm-password-input"
                className="border-2"
              />
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full desert-button bg-primary hover:bg-primary/90 text-white font-semibold py-6"
              disabled={loading}
              data-testid="reset-password-submit-button"
            >
              {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
