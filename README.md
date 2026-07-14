# 🌵 Cactus — Jeu de cartes multijoueur

Jeu de cartes multijoueur en temps réel, jouable dans le navigateur. Mémorisez vos cartes, faites des défausses rapides (slams), et annoncez « Cactus ! » quand vous pensez avoir le score le plus bas.

## 🏗️ Architecture

```
React (hébergé sur Vercel) ──► Supabase (Auth + Postgres + Realtime)
```

- **Frontend** : React 18 (Create React App + Craco), Tailwind CSS + shadcn/ui, Chart.js
- **Backend** : aucun serveur applicatif — le frontend parle directement à Supabase
  - **Auth** : comptes email/mot de passe, connexion par pseudo (RPC), récupération de mot de passe
  - **Base** : Postgres avec Row Level Security (tables `profiles`, `stats`, `game_rooms`)
  - **Temps réel** : synchronisation des parties via Supabase Realtime (`postgres_changes`)
- **Concurrence** : l'état de partie (`game_rooms.game_state`) est protégé par un verrou optimiste (`_v`) — les actions simultanées ne s'écrasent pas

## 🚀 Développement local

Prérequis : Node.js 18+, Yarn.

```bash
cd frontend
yarn install
```

Créez `frontend/.env.local` :

```env
REACT_APP_SUPABASE_URL=https://votre-projet.supabase.co
REACT_APP_SUPABASE_ANON_KEY=votre_cle_anon
```

Puis :

```bash
yarn start     # http://localhost:3000
```

## 🗄️ Base de données

Le schéma complet (tables, policies RLS, fonctions, realtime) est versionné dans
[`supabase/schema_complet.sql`](supabase/schema_complet.sql).
Pour initialiser un nouveau projet Supabase : SQL Editor → coller le script → Run.

Pour rendre un compte administrateur (une fois inscrit via le site) :

```sql
update profiles set is_admin = true where username = 'VotrePseudo';
```

## ☁️ Déploiement

- **Vercel** : projet connecté à ce repo, *Root Directory* = `frontend`.
  Variables d'environnement à définir dans le dashboard :
  `REACT_APP_SUPABASE_URL` et `REACT_APP_SUPABASE_ANON_KEY`.
- **Anti-pause Supabase** : le workflow GitHub Actions
  [`supabase-keepalive.yml`](.github/workflows/supabase-keepalive.yml) pinge la base
  2 fois par semaine (secrets GitHub requis : `SUPABASE_URL`, `SUPABASE_ANON_KEY`).

## 🎮 Règles du jeu

- Chaque joueur reçoit N cartes face cachée et n'en mémorise que quelques-unes au début.
- **Valeurs** : Roi = 0, As = 1, le 2 = **-2**, cartes 3-10 = valeur faciale, Valet/Dame = 10.
- À votre tour : piochez (pioche ou défausse), puis échangez avec une de vos cartes ou défaussez.
- **Cartes spéciales** (quand elles arrivent sur la défausse) : 8 = regarder une de ses cartes, 10 = regarder une carte adverse, Valet = échanger une carte avec un adversaire.
- **Slam (défausse rapide)** : à tout moment, défaussez une carte identique au sommet de la défausse. Sur la carte d'un adversaire : vous lui donnez ensuite une de vos cartes. Slam raté = +1 carte de pénalité.
- **Cactus** : annoncez quand vous pensez avoir le score le plus bas — chacun joue un dernier tour. Cactus raté = **+10 points** de pénalité. Vider sa main = **Perfect Cactus**.
- Le score le plus bas gagne. Parties en plusieurs manches avec score cible configurables.

Guide complet : [`GUIDE_UTILISATEUR.md`](GUIDE_UTILISATEUR.md)

## 📋 Audit & historique

Un audit complet du code (sécurité, bugs, dette technique) est disponible dans [`AUDIT.md`](AUDIT.md).
