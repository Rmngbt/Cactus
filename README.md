# 🌵 Cactus - Jeu Multijoueur

Jeu de cartes multijoueur en temps réel accessible via navigateur web.

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- Python 3.11+
- MongoDB
- Yarn

### Installation

1. **Backend**
```bash
cd /app/backend
pip install -r requirements.txt
```

2. **Frontend**
```bash
cd /app/frontend
yarn install
```

3. **Configuration**

Créez `/app/backend/.env`:
```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="cactus_game_db"
CORS_ORIGINS="*"
JWT_SECRET_KEY="your-secret-key-here"
RESEND_API_KEY=""  # Optionnel
SENDER_EMAIL="onboarding@resend.dev"  # Optionnel
```

Créez `/app/frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### Lancement

**Avec Supervisor (recommandé):**
```bash
sudo supervisorctl restart backend frontend
sudo supervisorctl status
```

**Manuellement:**
```bash
# Terminal 1 - Backend
cd /app/backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 - Frontend
cd /app/frontend
yarn start
```

### Accès
- Frontend : http://localhost:3000
- Backend API : http://localhost:8001
- Documentation API : http://localhost:8001/docs

---

## 🏗️ Architecture

```
┌─────────────┐     WebSocket     ┌─────────────┐
│   Frontend  │ ←──────────────→ │   Backend   │
│   (React)   │   HTTP/REST API   │  (FastAPI)  │
└─────────────┘                   └─────────────┘
                                         │
                                         ↓
                                  ┌─────────────┐
                                  │   MongoDB   │
                                  └─────────────┘
```

### Stack technique

**Frontend:**
- React 19
- React Router pour navigation
- Axios pour API calls
- WebSocket pour temps réel
- Shadcn/UI + Tailwind CSS
- Chart.js pour statistiques

**Backend:**
- FastAPI (Python)
- Motor (MongoDB async)
- WebSocket natif
- JWT pour authentification
- Resend pour emails
- Bcrypt pour mots de passe

**Base de données:**
- MongoDB avec collections:
  - `users` : Comptes utilisateurs
  - `game_rooms` : Salles de jeu
  - `game_rules` : Règles configurables
  - `admin_settings` : Paramètres admin

---

## 🎮 Fonctionnalités implémentées

✅ Authentification complète (inscription, connexion, récupération mot de passe)
✅ Création et gestion de parties multijoueurs en temps réel
✅ Mode bot avec 3 niveaux de difficulté
✅ Règles configurables par l'administrateur sans modifier le code
✅ Statistiques utilisateur avec graphiques
✅ Panneau d'administration
✅ Interface responsive avec thème désertique
✅ Session persistante (reconnexion automatique)
✅ WebSocket pour synchronisation temps réel

---

## 📖 Documentation

- **Guide utilisateur complet** : voir `GUIDE_UTILISATEUR.md`
- **Documentation API** : http://localhost:8001/docs (une fois lancé)

---

## 🌐 Hébergement actuel

**URL** : https://cactus-build.preview.emergentagent.com

L'application est déployée et fonctionnelle !

---

## 🔧 Configuration Email (Optionnel)

Pour activer la récupération de mot de passe par email :

1. Créez un compte sur [Resend.com](https://resend.com) (gratuit)
2. Obtenez votre clé API
3. Ajoutez dans `/app/backend/.env`:
   ```
   RESEND_API_KEY=re_votre_cle_ici
   ```
4. Redémarrez : `sudo supervisorctl restart backend`

---

## 📝 Notes

- Le jeu fonctionne parfaitement sans configuration email
- Pour créer un compte admin : modifier `is_admin: true` en base MongoDB
- Les tokens JWT expirent après 30 minutes

---

Pour plus d'informations, consultez **GUIDE_UTILISATEUR.md** 🎮
