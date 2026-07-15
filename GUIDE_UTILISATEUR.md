# 🌵 Guide d'utilisation - Jeu CACTUS

Bienvenue dans le jeu multijoueur **Cactus** ! Ce guide vous explique comment utiliser l'application étape par étape.

## 📍 URL de l'application

Le jeu est hébergé sur Vercel : **https://cactus-game.vercel.app**

---

## 🎮 Pour les Joueurs

### 1. Créer un compte

1. Cliquez sur **"S'inscrire"** sur la page de connexion
2. Remplissez :
   - **Pseudo** : votre nom de joueur
   - **Email** : votre adresse email
   - **Mot de passe** : minimum 6 caractères
3. Cliquez sur **"S'inscrire"**
4. Vous êtes automatiquement connecté et redirigé vers le lobby

### 2. Se connecter

1. Entrez votre **email ou votre pseudo** et votre **mot de passe**
2. Cliquez sur **"Se connecter"**
3. Si vous avez oublié votre mot de passe, cliquez sur **"Mot de passe oublié?"**

### 3. Créer une partie

1. Dans le lobby, cliquez sur **"Créer une partie"**
2. Configurez votre partie :
   - **Mode** : Multijoueur (contre amis) ou Bot (contre ordinateur)
   - **Difficulté du bot** : Facile, Moyen ou Difficile (si mode Bot)
   - **Cartes par joueur** : 3 à 6 cartes
   - **Cartes visibles au début** : combien de cartes vous mémorisez au départ
   - **Score cible** : la partie s'arrête quand un joueur l'atteint (30-100)
   - **Nombre de manches** : 1 à 10
3. Cliquez sur **"Créer la partie"**
4. Un **code unique** (ex: ABC123) est généré
5. **Partagez ce code** avec vos amis pour qu'ils rejoignent

### 4. Rejoindre une partie

1. Dans le lobby, cliquez sur **"Rejoindre une partie"**
2. Entrez le **code à 6 caractères** partagé par votre ami
3. Cliquez sur **"Rejoindre"**
4. Attendez que le créateur lance la partie

### 5. Jouer

#### Objectif du jeu
Avoir le **score le plus bas** à la fin de la partie !

#### Début de manche
Cliquez sur le nombre de cartes demandé pour les **mémoriser** — vous avez 3 secondes avant qu'elles se retournent. Ensuite, vous jouez de mémoire !

#### Votre tour :
1. **Piocher** :
   - Cliquez sur la **pioche** (pile face cachée) OU
   - Cliquez sur la **défausse** (pile face visible)

2. **Échanger** :
   - Cliquez sur l'icône **échange** sous une de vos cartes
   - La carte piochée remplace votre carte
   - Votre ancienne carte va à la défausse

3. **Défausser directement** :
   - Cliquez sur **"Défausser"** sous la carte piochée
   - Le tour passe au joueur suivant

#### Cartes spéciales ✨
Quand une carte spéciale arrive sur la défausse (piochée puis défaussée, ou sortie de votre main lors d'un échange), son pouvoir se déclenche :
- **8** : Regarder une de **VOS** cartes
- **10** : Regarder une carte d'un **ADVERSAIRE**
- **Valet (J)** : **Échanger** une de vos cartes avec celle d'un adversaire (à l'aveugle)

#### Défausse rapide (Slam) ⚡
**À n'importe quel moment**, si une carte identique au sommet de la défausse se trouve dans votre main (ou celle d'un adversaire !), cliquez sur l'icône poubelle pour la slammer :
- Slam de **votre** carte : elle part à la défausse, une carte de moins !
- Slam d'une carte **adverse** : elle part à la défausse, puis vous **donnez une de vos cartes** à l'adversaire
- **Slam raté** (la carte ne correspondait pas) : vous piochez **une carte de pénalité**
- Le bot aussi surveille la défausse... et peut vous slammer sous le nez !

#### Appeler Cactus 🌵
- Quand vous pensez avoir le meilleur score, cliquez sur **"🌵 Cactus!"**
- Tous les autres joueurs font un dernier tour
- Les scores sont calculés
- ⚠️ Si vous n'avez **pas** le score le plus bas : **+10 points de pénalité !**

#### Perfect Cactus ⭐
Si vous parvenez à vider **toutes vos cartes** via la défausse rapide, c'est un **Perfect Cactus** : la manche s'arrête immédiatement et votre score est de 0 !

#### Manches multiples
Si la partie est configurée en plusieurs manches, les scores se cumulent de manche en manche. La partie s'arrête quand toutes les manches sont jouées ou qu'un joueur atteint le score cible. Le total le plus bas gagne !

### 6. Voir vos statistiques

1. Dans le lobby, cliquez sur **"Stats"**
2. Consultez :
   - Nombre de parties jouées
   - Victoires et taux de victoire
   - Score moyen
   - Nombre de Perfect Cactus réalisés
   - Graphiques de vos performances
   - Vos accomplissements débloqués

### 7. Se déconnecter

Cliquez sur **"Déconnexion"** en haut à droite du lobby

---

## 👑 Pour les Administrateurs

### Devenir administrateur

Les droits admin s'attribuent en base de données (Supabase → SQL Editor) :

```sql
update profiles set is_admin = true where username = 'VotrePseudo';
```

Un administrateur peut ensuite promouvoir d'autres joueurs depuis l'application.

### Le panneau admin

1. Dans le lobby, cliquez sur **"Admin"**
2. Onglet **Utilisateurs** : liste des joueurs, promotion/révocation des droits admin
3. Onglet **Statistiques** : utilisateurs inscrits, parties jouées, Perfect Cactus totaux

---

## 🎯 Valeurs des cartes

- **Roi (K)** : 0 point (meilleure carte!)
- **As (A)** : 1 point
- **2** : **-2 points** (enlève 2 points!)
- **3 à 9** : valeur de la carte
- **10** : 10 points
- **Valet (J)** : 10 points
- **Dame (Q)** : 10 points

---

## 💡 Astuces

1. **Mémorisez vos cartes** : Au début, vous voyez quelques cartes — retenez-les bien, elles se cachent ensuite !
2. **Utilisez le 2** : Le 2 enlève 2 points de votre score — gardez-le !
3. **Défausse rapide** : Surveillez la défausse en permanence pour slammer au bon moment
4. **N'appelez pas Cactus trop tôt** : un Cactus raté coûte 10 points !
5. **Cartes spéciales** : utilisez le 8 pour compléter votre mémoire, le 10 pour espionner, le Valet pour refiler votre pire carte

---

## 🛠️ Informations techniques

### Architecture
- **Frontend** : React (hébergé sur Vercel), thème désertique
- **Backend** : Supabase (authentification, base Postgres, temps réel)
- **Temps réel** : Supabase Realtime pour la synchronisation multijoueur
- **Concurrence** : verrou optimiste sur l'état des parties (les actions simultanées ne se perdent pas)

### Fonctionnalités
- ✅ Authentification (email ou pseudo) et récupération de mot de passe
- ✅ Parties multijoueurs en temps réel via un code à partager
- ✅ Mode bot avec 3 niveaux de difficulté — le bot joue avec une mémoire limitée, comme vous !
- ✅ Manches multiples et score cible configurables
- ✅ Statistiques et graphiques
- ✅ Interface responsive (PC, tablette, mobile)

### En cas de problème
1. Rechargez la page (Ctrl+Maj+R)
2. Vérifiez que le projet Supabase est actif : https://supabase.com/dashboard
3. Vérifiez le dernier déploiement sur Vercel : onglet *Deployments*

---

## 🎊 Félicitations !

Votre jeu Cactus est prêt ! Amusez-vous bien avec vos amis et votre famille ! 🌵🎮
