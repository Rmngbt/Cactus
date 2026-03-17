# 🌵 Guide d'utilisation - Jeu CACTUS

Bienvenue dans le jeu multijoueur **Cactus** ! Ce guide vous explique comment utiliser l'application étape par étape.

## 📍 URL de l'application

Votre jeu est accessible à l'adresse : **https://cactus-build.preview.emergentagent.com**

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

1. Entrez votre **email** et **mot de passe**
2. Cliquez sur **"Se connecter"**
3. Si vous avez oublié votre mot de passe, cliquez sur **"Mot de passe oublié?"**

### 3. Créer une partie

1. Dans le lobby, cliquez sur **"Créer une partie"**
2. Configurez votre partie :
   - **Mode** : Multijoueur (contre amis) ou Bot (contre ordinateur)
   - **Difficulté du bot** : Facile, Moyen ou Difficile (si mode Bot)
   - **Cartes par joueur** : 3 à 6 cartes
   - **Cartes visibles au début** : combien de cartes vous pouvez voir initialement
   - **Score cible** : score à atteindre pour terminer (30-100)
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
Avoir le **score le plus bas** à la fin de chaque manche !

#### Votre tour :
1. **Piocher** :
   - Cliquez sur la **pioche** (pile face cachée) OU
   - Cliquez sur la **défausse** (pile face visible)

2. **Échanger** :
   - Cliquez sur l'icône **poubelle** au-dessus d'une de vos cartes
   - La carte piochée remplace votre carte
   - Votre ancienne carte va à la défausse

3. **Défausser directement** :
   - Cliquez sur **"Défausser"** sous la carte piochée
   - Le tour passe au joueur suivant

#### Actions spéciales :
- **Œil** 👁️ : Voir une de vos cartes (elles sont cachées)
- **Défausse rapide** 🗑️ : Si vous avez la même carte que la défausse, cliquez sur la poubelle pour la jeter rapidement
- **Cartes spéciales** :
  - **8** : Regarder une carte d'un adversaire
  - **10** : Échanger une de vos cartes avec celle d'un adversaire
  - **J (Valet)** : Regarder une de vos propres cartes

#### Appeler Cactus 🌵 :
- Quand vous pensez avoir le meilleur score, cliquez sur **"🌵 Cactus!"**
- Tous les joueurs font un dernier tour
- Les cartes sont révélées et le score est calculé

#### Perfect Cactus ⭐ :
- Si vous parvenez à défausser **toutes vos cartes** via la défausse rapide
- C'est un **Perfect Cactus** - vous gagnez automatiquement la manche !

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

### Accéder au panneau admin

1. Votre compte doit avoir les droits admin (configurable en base de données)
2. Dans le lobby, cliquez sur **"Admin"**

### Modifier les règles du jeu

1. Allez dans l'onglet **"Règles"**
2. Ajustez les paramètres :
   - **Cartes par joueur** : 3-6
   - **Cartes visibles au début** : 1-4
   - **Score cible** : 30-100
   - **Délai de visibilité** : 1-10 secondes
3. Cliquez sur **"Sauvegarder les règles"**
4. Les nouvelles règles s'appliquent aux prochaines parties

### Modifier l'apparence

1. Allez dans l'onglet **"Apparence"**
2. Changez l'**image de fond** (URL)
3. Aperçu disponible avant sauvegarde
4. Cliquez sur **"Sauvegarder l'apparence"**

### Voir les statistiques globales

1. Allez dans l'onglet **"Statistiques"**
2. Consultez :
   - Nombre total d'utilisateurs inscrits
   - Nombre total de parties jouées
   - Nombre total de Perfect Cactus réalisés

---

## 🎯 Valeurs des cartes

- **Roi (K)** : 0 points (meilleure carte!)
- **As (A)** : 1 point
- **2** : -2 points (enlève 2 points!)
- **3 à 9** : valeur de la carte
- **10** : 10 points
- **Valet (J)** : 10 points
- **Dame (Q)** : 10 points

---

## 💡 Astuces

1. **Mémorisez vos cartes** : Au début, vous pouvez voir quelques cartes - essayez de vous en souvenir !
2. **Utilisez le 2** : Le 2 enlève 2 points de votre score - gardez-le !
3. **Défausse rapide** : Soyez attentif à la défausse pour des coups rapides
4. **N'appelez pas Cactus trop tôt** : Assurez-vous d'avoir un bon score
5. **Cartes spéciales** : Utilisez-les stratégiquement pour voir ce que les autres ont

---

## 🛠️ Informations techniques

### Architecture
- **Frontend** : React avec thème désertique
- **Backend** : FastAPI avec WebSocket pour le temps réel
- **Base de données** : MongoDB
- **Temps réel** : WebSocket natif pour synchronisation multijoueur

### Fonctionnalités
- ✅ Authentification sécurisée (JWT)
- ✅ Récupération mot de passe par email (Resend)
- ✅ Parties multijoueurs en temps réel
- ✅ Mode bot avec 3 niveaux de difficulté
- ✅ Règles configurables sans code
- ✅ Statistiques et graphiques
- ✅ Interface responsive (PC, tablette, mobile)
- ✅ Session persistante (reconnexion automatique)

### Hébergement actuel
- **URL** : https://cactus-build.preview.emergentagent.com
- **Environnement** : Cloud Kubernetes
- **Gratuit** : Oui, 100% gratuit

---

## 🔧 Configuration Email (Pour récupération mot de passe)

Pour activer l'envoi d'emails de récupération de mot de passe :

1. Créez un compte sur **Resend.com** (gratuit, 10 000 emails/mois)
2. Obtenez votre clé API
3. Ajoutez-la dans `/app/backend/.env` :
   ```
   RESEND_API_KEY=re_votre_cle_ici
   SENDER_EMAIL=votre@email.com
   ```
4. Redémarrez le backend : `sudo supervisorctl restart backend`

**Note** : Sans configuration email, le jeu fonctionne normalement, seule la récupération de mot de passe est désactivée.

---

## 📞 Support

En cas de problème :
1. Vérifiez que les services sont actifs : `sudo supervisorctl status`
2. Consultez les logs backend : `tail -n 50 /var/log/supervisor/backend.err.log`
3. Redémarrez les services si nécessaire : `sudo supervisorctl restart backend frontend`

---

## 🎊 Félicitations !

Votre jeu Cactus est prêt ! Amusez-vous bien avec vos amis et votre famille ! 🌵🎮
