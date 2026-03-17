# Cactus - Jeu de Cartes en Temps Réel

## Description
Application web de jeu de cartes multijoueur en temps réel, avec mode bot et statistiques.

## Règles des Cartes Spéciales
| Carte | Effet |
|-------|-------|
| **8** | Regarder une de SES PROPRES cartes |
| **10** | Regarder une carte ADVERSE |
| **V (Valet)** | Échanger une carte avec l'adversaire (à l'aveugle) |

Les effets s'activent **automatiquement** quand on joue/défausse une carte spéciale.

## Ce qui a été implémenté

### Session 13 Février 2026 - Corrections UX
- ✅ **Droits admin restaurés** - Comptes Rmng (romain.mignot14@gmail.com) ont les droits admin
- ✅ **Popup fin de manche** - Récapitulatif avec gagnant, scores de tous les joueurs, et bouton pour lancer la manche suivante
- ✅ **Révélation cartes 5 secondes** - Chaque carte révélée reste visible 5 secondes avec countdown et barre de progression
- ✅ **Remélange pioche vérifié** - Quand la pioche est vide, la défausse est recyclée (sauf la carte du dessus)
- ✅ **Connexion avec pseudo** - Login utilise le pseudo au lieu de l'email
- ✅ **Nombre de manches configurable** - Option 1-10 manches dans création de partie
- ✅ **Activation automatique cartes spéciales** - Effet immédiat quand 8/10/V joué
- ✅ **Statistiques alimentées** - Stats mises à jour fin de partie

### Sessions précédentes
- ✅ Polling HTTP temps réel
- ✅ Mode Joueur vs Bot
- ✅ Mécanique "Cactus" fin de manche
- ✅ "Slam" (défausse rapide)
- ✅ Panel admin

## Architecture

```
/app/
├── backend/
│   ├── server.py        # API FastAPI
│   ├── tests/           # Tests pytest
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.js       # Connexion par pseudo
│   │   │   ├── GameBoard.js   # Interface jeu + popups
│   │   │   ├── Stats.js       # Statistiques
│   │   │   └── AdminPanel.js  # Administration
│   │   └── components/
│   └── package.json
└── memory/
    └── PRD.md
```

## Phases de jeu
1. `initial_reveal` - Révélation des cartes (5s par carte)
2. `playing` - Phase de jeu principale
3. `round_summary` - Récapitulatif fin de manche (bouton pour continuer)
4. `ended` - Partie terminée

## Test credentials
- `testuser123` / `test123`
- `Rmng` (admin)

## Backlog

### P1 - Prochaines améliorations
- [ ] Afficher historique des parties dans stats
- [ ] Bot utilise les cartes spéciales

### P2 - Futur
- [ ] Niveaux de difficulté du bot configurables
- [ ] Images de fond personnalisables (admin)
