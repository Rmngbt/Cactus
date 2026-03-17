import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Lobby from '@/pages/Lobby';
import GameRoom from '@/pages/GameRoom';
import GameBoard from '@/pages/GameBoard';
import Stats from '@/pages/Stats';
import AdminPanel from '@/pages/AdminPanel';
import { Toaster } from '@/components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      // Verify token is still valid
      verifyToken(token, JSON.parse(savedUser));
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token, userData) => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Token is valid, update user data
      const updatedUser = response.data;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      localStorage.setItem('token', token); // Ensure token is saved
      
      console.log('Token verified, user:', updatedUser);
    } catch (error) {
      // Token invalid or expired
      console.error('Token verification failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData, token) => {
    console.log('Logging in user:', userData);
    console.log('Token:', token);
    
    // Set user immediately
    setUser(userData);
    
    // Save to localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Verify it was saved
    console.log('Token saved:', localStorage.getItem('token'));
    console.log('User saved:', localStorage.getItem('user'));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#5DADE2] to-[#48C9B0]">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/lobby" />} />
          <Route path="/register" element={!user ? <Register onLogin={handleLogin} /> : <Navigate to="/lobby" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/lobby" element={user ? <Lobby user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/room/:code" element={user ? <GameRoom user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/game/:code" element={user ? <GameBoard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/stats" element={user ? <Stats user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.is_admin ? <AdminPanel user={user} onLogout={handleLogout} /> : <Navigate to="/lobby" />} />
          <Route path="/" element={<Navigate to={user ? "/lobby" : "/login"} />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
