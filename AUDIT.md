# 🔍 Audit complet — Cactus (fork Rmngbt/Cactus)

*Audit réalisé le 14/07/2026 sur la branche `main` (commit `461709a`).*

## Vue d'ensemble

L'application a **migré vers Supabase** : le frontend React (dans `frontend/`) parle directement à Supabase (auth, base Postgres, realtime). **Le backend FastAPI + MongoDB (`backend/`) est du code mort** : plus aucune référence (`axios`, `REACT_APP_BACKEND_URL`) dans le frontend. Le README décrit encore l'ancienne architecture.

Architecture actuelle :

```
React (Vercel) ──► Supabase (Auth + Postgres + Realtime)
```

Toute la logique de jeu tourne **dans le navigateur des joueurs** et l'état complet de la partie (y compris les mains de tous les joueurs) est stocké dans une colonne JSON `game_rooms.game_state` que chaque client lit et réécrit en entier. C'est la source de la majorité des problèmes ci-dessous.

---

## 🔴 Critique — sécurité & configuration

### 1. `frontend/.gitignore` contient les clés Supabase (!)

Le fichier `.gitignore` du frontend ne contient pas de règles d'ignore : quelqu'un y a collé le contenu du `.env` :

```
REACT_APP_SUPABASE_URL=https://futrjutgrfltghehrjic.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
```

Conséquences :
- L'URL et la clé anon du projet Supabase sont **publiées dans un repo public** (et dans l'historique git).
- **Plus rien n'est ignoré** : `node_modules/`, `build/`, `.env` peuvent être commités par erreur.

**Correction :**
1. Restaurer un vrai `.gitignore` (node_modules, build, .env*, etc.). ✅ *(fait sur cette branche)*
2. Mettre les clés dans `frontend/.env.local` (jamais commité) et dans les **Environment Variables du dashboard Vercel**.
3. La clé anon est « publique par design » **uniquement si les policies RLS sont solides** (voir point 2). Dans le doute : Supabase Dashboard → Settings → API → rotation des clés (ou migration vers les nouvelles clés `sb_publishable_...`).

### 2. Toute la sécurité repose sur RLS — à vérifier d'urgence

Points à contrôler dans le dashboard Supabase (Authentication → Policies) :

- **`profiles.is_admin`** : `AdminPanel.js:54-67` fait un simple `update({ is_admin: ... })` côté client. Si la policy UPDATE de `profiles` permet à un utilisateur de modifier sa propre ligne sans restreindre la colonne, **n'importe qui peut s'auto-promouvoir admin** depuis la console du navigateur (la garde `/admin` dans `App.js:86` est purement cosmétique).
- **`game_rooms`** : tous les joueurs (voire tous les utilisateurs connectés) peuvent réécrire `game_state` en entier → un tricheur peut se donner les cartes qu'il veut. Inhérent au design actuel (voir point 12), mais au minimum la policy doit exiger d'être authentifié et membre de la partie.
- **`stats`** : chaque client écrit ses propres stats (`GameBoard.js:112-157`) → n'importe qui peut se gonfler ses statistiques. Policy : `user_id = auth.uid()` au minimum.

Exemple de policies minimales :

```sql
-- profiles : lecture publique, l'utilisateur ne peut modifier que sa ligne, jamais is_admin
create policy "read profiles" on profiles for select using (true);
create policy "update own profile" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select is_admin from profiles where id = auth.uid()));

-- stats : chacun sa ligne
create policy "own stats" on stats for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

(Pour `is_admin`, le plus propre est une colonne modifiable uniquement via une fonction `security definer` réservée aux admins.)

### 3. Dépendances côté Supabase non versionnées dans le repo

Le code suppose que côté Supabase existent :
- les tables `profiles`, `stats`, `game_rooms` (avec colonnes `code`, `creator_id`, `mode`, `state`, `config`, `game_state`) ;
- la **RPC `get_email_by_username`** (`Login.js:39-40`) — sans elle, la connexion par pseudo est cassée ;
- le **Realtime activé** sur `game_rooms` (publication `supabase_realtime`) — sans lui, **aucune synchronisation** entre joueurs ne fonctionne (GameRoom et GameBoard reposent sur `postgres_changes`).

**Correction :** créer un dossier `supabase/migrations/` avec le SQL du schéma, des policies, de la RPC :

```sql
create or replace function get_email_by_username(p_username text)
returns text language sql security definer set search_path = public as $$
  select u.email::text from auth.users u
  join profiles p on p.id = u.id
  where p.username = p_username limit 1;
$$;

alter publication supabase_realtime add table game_rooms;
```

### 4. Inscription fragile si « Confirm email » est activé

`Register.js:48-83` : après `signUp`, le client insère lui-même la ligne `profiles` puis `stats`. Si la confirmation d'email est activée dans Supabase, `signUp` retourne un user **sans session** → les inserts échouent (RLS) → compte auth orphelin, et l'utilisateur est ensuite bloqué en boucle sur `/login` (session valide mais aucun profil, donc `App.fetchProfile` laisse `user = null`).

**Correction (recommandée) :** créer profil + stats par **trigger SQL** sur `auth.users` et passer le pseudo en metadata :

```js
await supabase.auth.signUp({ email, password, options: { data: { username } } });
```

```sql
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, username, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'Joueur'), false);
  insert into stats (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
```

Au passage : la vérification d'unicité du pseudo (`Register.js:35-45`) est une race condition — ajouter une contrainte `unique` sur `profiles.username`.

---

## 🟠 Bugs de gameplay

### 5. Bot : le slam détruit la mauvaise carte — `GameBoard.js:213-214`

```js
newGs.players[botIdx].hand.splice(slamIdx, 1);
newGs.discard_pile.push(topDiscard);   // ❌ duplique la carte du dessus
```

Le bot retire la carte de sa main mais pousse **`topDiscard`** (déjà au sommet de la défausse) au lieu de la carte jouée → la carte du bot disparaît du jeu et la défausse contient un doublon.

**Correction :**
```js
const slammed = newGs.players[botIdx].hand.splice(slamIdx, 1)[0];
newGs.discard_pile.push(slammed);
```

### 6. Bot : donne une carte après avoir slam **sa propre** carte — `GameBoard.js:226-238`

Selon la règle implémentée côté humain (`handleFastDiscard`), on ne donne une carte que lorsqu'on slam la carte **d'un adversaire**. Le bot, lui, slam sa propre carte puis offre sa plus haute carte au joueur : il s'auto-pénalise. Supprimer ce bloc.

### 7. En mode bot, le joueur « gagne » toujours dans les stats — `GameBoard.js:118-120`

```js
const humanPlayers = gs.players.filter(p => !p.is_bot);
const scores = humanPlayers.map(...);
const isWinner = myScore === Math.min(...scores);  // seul humain → toujours vrai
```

**Correction :** comparer aux scores de **tous** les joueurs, bot inclus.

### 8. Difficulté du bot inversée — `GameBoard.js:250`

```js
const cactusThreshold = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 12 : 18;
```

Un bot « difficile » appelle Cactus dès 18 points (mauvaise décision), un bot « facile » attend ≤ 5 points (excellente décision). Inverser : `easy: 18, medium: 12, hard: 5-8`.

### 9. Le bot triche au Valet — `GameBoard.js:363-368`

Pour l'échange du Valet, le bot lit la vraie valeur des cartes de l'humain pour prendre sa plus basse — information qu'un joueur réel n'a pas. À remplacer par un choix aléatoire (ou pondéré par les cartes vues avec un 10).

### 10. Stats comptées plusieurs fois — `GameBoard.js:63-69`

`statsUpdatedRef` est remis à zéro à chaque montage du composant. Si un joueur recharge `/game/CODE` après la fin (le `game_state.phase` reste `'ended'` en base), ses stats sont **ré-incrémentées à chaque visite**.

**Correction :** ne pas mettre à jour si `room.state === 'finished'`, ou marquer `stats_recorded: [user_ids]` dans le `game_state`.

### 11. Perfect Cactus jamais comptabilisé

`stats.perfect_cactus_count` est affiché (Stats, Admin, accomplissement ⭐) mais **jamais incrémenté** : quand un joueur vide sa main (`handleFastDiscard`), rien ne le note dans `updateStats`.

### 12. Conditions de course en multijoueur (bug de fond)

Chaque client lit `game_state`, le modifie **en entier** et le réécrit, sans verrou ni numéro de version :
- deux joueurs qui révèlent leurs cartes initiales en même temps s'écrasent mutuellement (`handleRevealCard`) ;
- deux slams simultanés → un seul survit ;
- deux joueurs qui rejoignent la salle en même temps (`GameRoom.fetchRoom:43-54`) → un des deux disparaît de la liste.

**Correction minimale :** colonne `version int` + update conditionnel (`.eq('version', v)` + retry), ou mieux : des **fonctions RPC Postgres atomiques** (`join_room(code)`, `reveal_card(...)`, `slam(...)`) qui modifient l'état côté serveur. C'est aussi le prérequis anti-triche (point 2) et pour un futur jeu mobile sérieux.

### 13. Partie gelée si on recharge pendant le tour du bot

`executeBotTurn` n'est déclenché qu'à la suite d'une action humaine. Si l'humain rafraîchit la page alors que `current_player_index` pointe sur le bot, plus rien ne relance le bot → partie bloquée.

**Correction :** au chargement / à chaque changement de `gameState`, si `phase === 'playing'` et que le joueur courant est un bot (et que je suis le créateur), lancer `executeBotTurn` (avec un garde-fou anti-double exécution).

### 14. Démarrage de partie fragile — `GameBoard.js:415-433`

Le passage `initial_reveal → playing` dépend d'un `setInterval` de 3 s **dans le navigateur du dernier joueur ayant révélé**. S'il ferme l'onglet pendant ces 3 s, la partie ne démarre jamais pour personne.

### 15. Options de partie non implémentées

`num_rounds` et `score_threshold` (Lobby) sont stockés mais **jamais utilisés** : la partie s'arrête toujours après une manche, l'affichage « Manche 1/N » est trompeur. Soit implémenter l'enchaînement des manches (cumul `total_score`, fin quand `score >= score_threshold`), soit retirer ces options.

### 16. Divers gameplay (mineurs)

- `handleCallCactus` (`GameBoard.js:565`) : `drawn_card = null` détruit la carte piochée au lieu de la remettre quelque part → le paquet rétrécit.
- Mélange biaisé : `sort(() => Math.random() - 0.5)` (`GameRoom.js:268`, recyclage du deck) → utiliser Fisher-Yates.
- `generateRoomCode` (`Lobby.js:13-15`) : peut produire moins de 6 caractères (rare) et aucune gestion de collision de code.
- `handleFastDiscard` ne vérifie pas `phase === 'playing'` : on peut encore slammer après la fin de partie.
- Slam raté : la pénalité pioche dans `deck` sans recycler la défausse si le deck est vide (pas de pénalité du tout).
- Pas de règle de pénalité pour un Cactus raté (le caller avec un score non minimal ne subit rien) — à confirmer selon vos règles.

---

## 🟡 Dette technique & build

### 17. Pas de lockfile → builds non reproductibles

Aucun `yarn.lock` / `package-lock.json` commité. Chaque build (local ou Vercel) résout les versions à nouveau → des mises à jour de dépendances peuvent casser le site du jour au lendemain. **Commiter un `yarn.lock`.**

### 18. `engines` bloque Node ≥ 21

```json
"engines": { "node": ">=16.0.0 <21.0.0" }
```

Vérifié dans cet environnement : `yarn install` **échoue** sous Node 22 (défaut actuel de Vercel et des machines récentes). Passer à `">=18"` (ou supprimer le champ) et vérifier la version Node du projet Vercel (Settings → General → Node.js Version).

### 19. Code mort à supprimer

- `backend/` (FastAPI + MongoDB, 1 242 lignes + tests), `backend_test.py`, `tests/`, `test_reports/`, `memory/` : ancienne architecture Emergent, plus utilisée.
- `frontend/plugins/` (visual-edits, health-check) + les blocs correspondants de `craco.config.js` : outillage de la plateforme Emergent.
- `frontend/src/hooks/use-toast.js` : doublon, seul `sonner` est utilisé.
- `README.md` et `GUIDE_UTILISATEUR.md` décrivent l'ancienne stack (MongoDB, JWT, supervisor…) → à réécrire pour la stack Supabase/Vercel.

### 20. `index.html` charge des scripts tiers emergent.sh

`frontend/public/index.html` inclut `https://assets.emergent.sh/scripts/emergent-main.js` (+ debug-monitor et le badge « Made with Emergent »), et le titre est « Emergent | Fullstack App ». Script tiers hors de votre contrôle exécuté chez vos joueurs : à retirer, avec un vrai titre/description/favicon.

### 21. Bundle très lourd

Beaucoup de dépendances installées mais inutilisées : `recharts` **et** `chart.js` (seul chart.js sert), `embla-carousel`, `vaul`, `input-otp`, `cmdk`, `react-hook-form`, `zod`, `date-fns`, `react-day-picker`, `next-themes`… et ~35 composants shadcn/ui pour ~10 réellement importés. Élaguer réduira le build de plusieurs Mo (important pour un futur mobile).

---

## 🔵 Repo forké & Vercel — faut-il « recréer un main » ?

**Non, pas besoin.** Le statut de fork n'a **aucun impact sur Vercel** : Vercel se connecte à `Rmngbt/Cactus` et se moque qu'il soit un fork. Rien à faire si vous restez comme ça.

Les vrais inconvénients du fork GitHub :
- les PRs proposent par défaut `m2interieur/Cactus` comme cible (piège classique) ;
- impossible de passer le repo en privé tant qu'il est dans le réseau de fork ;
- les issues/insights sont limités sur un fork.

**Si vous voulez détacher** (recommandé à terme, vu l'objectif jeu mobile indépendant) — 10 minutes, historique conservé :

1. Créer un repo vierge `Rmngbt/cactus-game` sur GitHub (sans README).
2. ```bash
   git remote add nouveau https://github.com/Rmngbt/cactus-game.git
   git push nouveau --all && git push nouveau --tags
   ```
3. Sur Vercel : soit *Project Settings → Git → Disconnect* puis *Connect* le nouveau repo, soit importer un nouveau projet (recopier les 2 variables d'env `REACT_APP_SUPABASE_*`, Root Directory = `frontend`, et réassigner le domaine). C'est simple et sans coupure notable.

*(Alternative : demander à GitHub Support de « detach from fork network » pour garder le même nom de repo.)*

Points de config Vercel à vérifier dans tous les cas :
- **Root Directory = `frontend`** (le `vercel.json` avec les rewrites SPA est dans `frontend/`, c'est correct) ;
- variables `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` définies dans le dashboard (sans elles, `createClient(undefined)` → écran blanc) ;
- version Node compatible avec `engines` (point 18).

---

## 🎯 Perspective « jeu mobile »

La stack actuelle (React + Supabase) se porte bien sur mobile via **Capacitor** (l'app web est empaquetée pour iOS/Android, ~1 journée de travail) ; React Native serait une réécriture complète. Le vrai prérequis n'est pas l'UI mais le **passage de la logique de jeu côté serveur** (RPC Postgres ou Edge Functions) : tant que les clients écrivent `game_state` librement, le jeu est trichable et fragile (points 2 et 12). C'est le chantier n° 1 avant toute ambition mobile.

---

## 📋 Ordre d'attaque recommandé

| # | Action | Effort |
|---|--------|--------|
| 1 | Restaurer `.gitignore`, clés → Vercel env + rotation | 15 min |
| 2 | Vérifier/écrire les policies RLS (`profiles.is_admin` !) | 1-2 h |
| 3 | Commiter `yarn.lock`, corriger `engines` | 15 min |
| 4 | Corriger les bugs bot (points 5-9) et stats (10-11) | 2-3 h |
| 5 | Versionner le schéma Supabase (`supabase/migrations/`) | 1 h |
| 6 | Nettoyer : backend mort, scripts emergent.sh, README | 1 h |
| 7 | Trigger SQL d'inscription (point 4) | 1 h |
| 8 | Refonte serveur-autoritaire (RPC atomiques) — prérequis mobile | plusieurs jours |
| 9 | Détacher le fork (optionnel) | 10 min |
