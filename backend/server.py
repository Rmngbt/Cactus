from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import resend
import asyncio
import json
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours to avoid frequent disconnections
security = HTTPBearer()

# Resend configuration
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# WebSocket manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].remove(websocket)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_json(message)
                except:
                    pass

manager = ConnectionManager()

# Models
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    username: str  # Login with username instead of email
    password: str

class ForgotPassword(BaseModel):
    email: EmailStr

class ResetPassword(BaseModel):
    token: str
    new_password: str

class CreateRoom(BaseModel):
    cards_per_player: int = 4
    visible_at_start: int = 2
    score_threshold: int = 60
    num_rounds: int = 1  # Number of rounds in the game
    mode: str = "multiplayer"  # multiplayer or bot
    bot_difficulty: Optional[str] = "medium"  # easy, medium, hard

class JoinRoom(BaseModel):
    code: str
    username: str

class GameAction(BaseModel):
    action_type: str  # draw_deck, draw_discard, exchange, discard, special, fast_discard, cactus
    card_index: Optional[int] = None
    target_player: Optional[str] = None
    target_card_index: Optional[int] = None

class RuleUpdate(BaseModel):
    cards_per_player: Optional[int] = None
    visible_at_start: Optional[int] = None
    score_threshold: Optional[int] = None
    card_visibility_delay: Optional[int] = None
    card_values: Optional[Dict[str, int]] = None

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user is None:
        raise credentials_exception
    return user

def generate_room_code():
    return ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=6))

def create_deck():
    suits = ['hearts', 'diamonds', 'clubs', 'spades']
    values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    deck = []
    for suit in suits:
        for value in values:
            deck.append({"suit": suit, "value": value})
    random.shuffle(deck)
    return deck

def get_card_value(card):
    card_values = {
        'K': 0, 'A': 1, '2': -2, '3': 3, '4': 4, '5': 5,
        '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10
    }
    return card_values.get(card['value'], 0)

def is_special_card(card):
    """Check if a card has special ability"""
    return card['value'] in ['8', '10', 'J']

def advance_turn(game_state):
    """Advance to next player and handle cactus final turns"""
    game_state["current_player_index"] = (game_state["current_player_index"] + 1) % len(game_state["players"])
    
    # Handle cactus final turns countdown
    if game_state.get("cactus_called") and game_state.get("remaining_final_turns", 0) > 0:
        game_state["remaining_final_turns"] -= 1
        
        # Check if this was the last final turn
        if game_state["remaining_final_turns"] <= 0:
            game_state["round_ended"] = True
            # Calculate scores for this round
            for player in game_state["players"]:
                score = sum(get_card_value(card) for card in player["hand"])
                player["round_score"] = score
    
    return game_state

async def end_round_and_update_stats(room_code: str, game_state: dict, room_config: dict):
    """Handle end of round: update stats and check if game is over"""
    # Calculate scores for this round
    scores = []
    for player in game_state["players"]:
        score = sum(get_card_value(card) for card in player["hand"])
        player["total_score"] = player.get("total_score", 0) + score
        scores.append({
            "user_id": player["user_id"],
            "username": player["username"],
            "round_score": score,
            "total_score": player["total_score"]
        })
    
    sorted_scores = sorted(scores, key=lambda x: x["round_score"])
    winner_this_round = sorted_scores[0]["user_id"]
    
    # Check if cactus caller got a perfect cactus (0 points)
    cactus_caller = game_state.get("cactus_caller")
    cactus_caller_score = next((s for s in scores if s["user_id"] == cactus_caller), {}).get("round_score", 999)
    is_perfect_cactus = cactus_caller_score == 0
    
    current_round = game_state.get("round", 1)
    num_rounds = room_config.get("num_rounds", 1)
    
    if current_round >= num_rounds:
        # Game is completely over
        game_state["phase"] = "ended"
        game_state["game_over"] = True
        
        # Final winner is the one with lowest total score
        final_sorted = sorted(scores, key=lambda x: x["total_score"])
        final_winner = final_sorted[0]["user_id"]
        
        # Update user stats in database
        for player in game_state["players"]:
            if player.get("is_bot"):
                continue
            
            is_winner = player["user_id"] == final_winner
            player_score = player.get("total_score", 0)
            
            update_stats = {
                "$inc": {
                    "stats.games_played": 1,
                    "stats.total_score": player_score,
                    "stats.wins": 1 if is_winner else 0,
                    "stats.perfect_cactus_count": 1 if (is_perfect_cactus and player["user_id"] == cactus_caller) else 0
                }
            }
            
            await db.users.update_one({"user_id": player["user_id"]}, update_stats)
        
        # Mark room as finished
        await db.game_rooms.update_one(
            {"code": room_code},
            {"$set": {"state": "finished"}}
        )
    else:
        # Round ended but game continues - show summary before starting next round
        game_state["phase"] = "round_summary"
        game_state["round_summary"] = {
            "round_number": current_round,
            "scores": scores,
            "winner": sorted_scores[0],
            "next_round": current_round + 1,
            "total_rounds": num_rounds
        }
        # Don't start new round yet - wait for player to acknowledge
    
    return game_state

async def start_next_round(room_code: str, game_state: dict, room_config: dict):
    """Start the next round after players have seen the summary"""
    current_round = game_state.get("round", 1)
    
    # Start new round
    game_state["round"] = current_round + 1
    game_state["phase"] = "initial_reveal"
    game_state["cactus_called"] = False
    game_state["cactus_caller"] = None
    game_state["cactus_caller_username"] = None
    game_state["round_ended"] = False
    game_state["remaining_final_turns"] = 0
    game_state["round_summary"] = None
    
    # Reset hands for new round
    deck = create_deck()
    cards_per_player = room_config.get("cards_per_player", 4)
    
    for player in game_state["players"]:
        player["hand"] = [deck.pop() for _ in range(cards_per_player)]
        player["revealed_cards"] = [] if not player.get("is_bot") else list(range(cards_per_player))
        player["round_score"] = 0
    
    game_state["deck"] = deck
    game_state["discard_pile"] = [deck.pop()] if deck else []
    game_state["current_player_index"] = 0
    game_state["drawn_card"] = None
    
    return game_state

def calculate_final_scores(game_state):
    """Calculate and return final scores for all players"""
    scores = []
    for player in game_state["players"]:
        score = sum(get_card_value(card) for card in player["hand"])
        scores.append({
            "user_id": player["user_id"],
            "username": player["username"],
            "score": score,
            "cards": player["hand"]
        })
    return sorted(scores, key=lambda x: x["score"])

# Auth Routes
@api_router.post("/auth/register")
async def register(user: UserRegister):
    # Strict email validation - check if email already exists
    existing_user = await db.users.find_one({"email": user.email.lower()}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    # Check if username already exists
    existing_username = await db.users.find_one({"username": user.username}, {"_id": 0})
    if existing_username:
        raise HTTPException(status_code=400, detail="Ce pseudo est déjà utilisé")
    
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user.password)
    
    # Check if this is the first user or if email is romain.mignot14@gmail.com
    total_users = await db.users.count_documents({})
    is_admin = (total_users == 0) or (user.email.lower() == "romain.mignot14@gmail.com")
    
    user_doc = {
        "user_id": user_id,
        "username": user.username,
        "email": user.email.lower(),  # Store lowercase for consistency
        "password_hash": hashed_password,
        "is_admin": is_admin,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "games_played": 0,
            "wins": 0,
            "total_score": 0,
            "perfect_cactus_count": 0
        }
    }
    
    await db.users.insert_one(user_doc)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_id}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "user_id": user_id,
            "username": user.username,
            "email": user.email.lower(),
            "is_admin": is_admin
        }
    }

@api_router.post("/auth/login")
async def login(user: UserLogin):
    # Find user by username (case-insensitive)
    db_user = await db.users.find_one({"username": {"$regex": f"^{user.username}$", "$options": "i"}}, {"_id": 0})
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Pseudo ou mot de passe incorrect")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": db_user["user_id"]}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "user_id": db_user["user_id"],
            "username": db_user["username"],
            "email": db_user["email"],
            "is_admin": db_user.get("is_admin", False)
        }
    }

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPassword):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user:
        return {"message": "If email exists, reset link sent"}
    
    reset_token = create_access_token(
        data={"sub": user["user_id"], "type": "reset"},
        expires_delta=timedelta(hours=1)
    )
    
    reset_link = f"https://cactus-build.preview.emergentagent.com/reset-password?token={reset_token}"
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Réinitialisation de votre mot de passe</h2>
            <p>Bonjour {user['username']},</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe pour le jeu Cactus.</p>
            <p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe:</p>
            <p><a href="{reset_link}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a></p>
            <p>Ce lien expire dans 1 heure.</p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        </body>
    </html>
    """
    
    if resend.api_key:
        try:
            params = {
                "from": SENDER_EMAIL,
                "to": [request.email],
                "subject": "Réinitialisation de mot de passe - Cactus",
                "html": html_content
            }
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logging.error(f"Email error: {e}")
    
    return {"message": "If email exists, reset link sent"}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPassword):
    try:
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        token_type = payload.get("type")
        
        if token_type != "reset":
            raise HTTPException(status_code=400, detail="Invalid token")
        
        hashed_password = get_password_hash(request.new_password)
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"password_hash": hashed_password}}
        )
        
        return {"message": "Password reset successful"}
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "user_id": current_user["user_id"],
        "username": current_user["username"],
        "email": current_user["email"],
        "is_admin": current_user.get("is_admin", False),
        "stats": current_user.get("stats", {})
    }

# Game Routes
@api_router.post("/game/create-room")
async def create_room(room_config: CreateRoom, current_user: dict = Depends(get_current_user)):
    room_code = generate_room_code()
    
    room_doc = {
        "room_id": str(uuid.uuid4()),
        "code": room_code,
        "creator_id": current_user["user_id"],
        "mode": room_config.mode,
        "config": {
            "cards_per_player": room_config.cards_per_player,
            "visible_at_start": room_config.visible_at_start,
            "score_threshold": room_config.score_threshold,
            "num_rounds": room_config.num_rounds,
            "bot_difficulty": room_config.bot_difficulty
        },
        "players": [{
            "user_id": current_user["user_id"],
            "username": current_user["username"],
            "is_ready": False
        }],
        "state": "waiting",
        "game_state": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.game_rooms.insert_one(room_doc)
    
    return {
        "room_code": room_code,
        "room_id": room_doc["room_id"]
    }

@api_router.post("/game/join-room")
async def join_room(join_data: JoinRoom, current_user: dict = Depends(get_current_user)):
    room = await db.game_rooms.find_one({"code": join_data.code.upper()}, {"_id": 0})
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["state"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")
    
    player_exists = any(p["user_id"] == current_user["user_id"] for p in room["players"])
    if player_exists:
        return {"message": "Already in room", "room": room}
    
    new_player = {
        "user_id": current_user["user_id"],
        "username": current_user["username"],
        "is_ready": False
    }
    
    await db.game_rooms.update_one(
        {"code": join_data.code.upper()},
        {"$push": {"players": new_player}}
    )
    
    await manager.broadcast({
        "type": "player_joined",
        "player": new_player
    }, join_data.code.upper())
    
    room = await db.game_rooms.find_one({"code": join_data.code.upper()}, {"_id": 0})
    return {"message": "Joined room", "room": room}

@api_router.get("/game/room/{code}")
async def get_room(code: str, current_user: dict = Depends(get_current_user)):
    room = await db.game_rooms.find_one({"code": code.upper()}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@api_router.post("/game/start/{code}")
async def start_game(code: str, current_user: dict = Depends(get_current_user)):
    room = await db.game_rooms.find_one({"code": code.upper()}, {"_id": 0})
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["creator_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Only creator can start")
    
    if room["state"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")
    
    # Initialize game state
    deck = create_deck()
    cards_per_player = room["config"]["cards_per_player"]
    
    players_state = []
    for player in room["players"]:
        hand = [deck.pop() for _ in range(cards_per_player)]
        players_state.append({
            "user_id": player["user_id"],
            "username": player["username"],
            "hand": hand,
            "total_score": 0,
            "round_score": 0,
            "revealed_cards": []  # Track which cards have been revealed
        })
    
    # Add bot if mode is bot
    if room["mode"] == "bot":
        bot_hand = [deck.pop() for _ in range(cards_per_player)]
        players_state.append({
            "user_id": "bot",
            "username": f"Bot ({room['config']['bot_difficulty']})",
            "hand": bot_hand,
            "total_score": 0,
            "round_score": 0,
            "is_bot": True,
            "revealed_cards": list(range(cards_per_player))  # Bot knows all its cards
        })
    
    game_state = {
        "deck": deck,
        "discard_pile": [deck.pop()] if deck else [],
        "players": players_state,
        "current_player_index": 0,
        "round": 1,
        "phase": "initial_reveal",  # Phase: initial_reveal, playing, ended
        "cards_to_reveal": room["config"]["visible_at_start"],
        "drawn_card": None,
        "cactus_called": False,
        "cactus_caller": None,
        "remaining_final_turns": 0
    }
    
    await db.game_rooms.update_one(
        {"code": code.upper()},
        {
            "$set": {
                "state": "playing",
                "game_state": game_state
            }
        }
    )
    
    await manager.broadcast({
        "type": "game_started",
        "game_state": game_state
    }, code.upper())
    
    return {"message": "Game started", "game_state": game_state}

@api_router.post("/game/action/{code}")
async def game_action(code: str, action: GameAction, current_user: dict = Depends(get_current_user)):
    room = await db.game_rooms.find_one({"code": code.upper()}, {"_id": 0})
    
    if not room or room["state"] != "playing":
        raise HTTPException(status_code=400, detail="Game not active")
    
    game_state = room["game_state"]
    
    # Find current player
    player_index = next((i for i, p in enumerate(game_state["players"]) if p["user_id"] == current_user["user_id"]), None)
    if player_index is None:
        raise HTTPException(status_code=404, detail="Player not found in game")
    
    current_player = game_state["players"][player_index]
    
    # Handle different actions
    if action.action_type == "reveal_card":
        # During initial reveal phase - any player can reveal their cards
        if game_state["phase"] != "initial_reveal":
            raise HTTPException(status_code=400, detail="Not in reveal phase")
        
        player = game_state["players"][player_index]
        if "revealed_cards" not in player:
            player["revealed_cards"] = []
        
        if action.card_index not in player["revealed_cards"]:
            player["revealed_cards"].append(action.card_index)
        
        # Check if ALL players have revealed enough cards
        all_players_ready = True
        for p in game_state["players"]:
            if not p.get("is_bot", False):  # Skip bots
                revealed_count = len(p.get("revealed_cards", []))
                if revealed_count < game_state["cards_to_reveal"]:
                    all_players_ready = False
                    break
        
        # If all players ready, move to playing phase
        if all_players_ready:
            game_state["phase"] = "playing"
    
    elif action.action_type == "draw_deck":
        # Verify it's player's turn and in playing phase
        if game_state["phase"] != "playing":
            raise HTTPException(status_code=400, detail="Not in playing phase")
        
        if game_state["players"][game_state["current_player_index"]]["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your turn")
        
        # CRITICAL: Clean any existing drawn_card before allowing new draw
        if game_state.get("drawn_card"):
            logging.warning(f"Found existing drawn_card, cleaning it")
            game_state["drawn_card"] = None
        
        if not game_state["deck"] or len(game_state["deck"]) == 0:
            # Recycle discard pile into deck
            if len(game_state["discard_pile"]) > 1:
                top_card = game_state["discard_pile"].pop()
                game_state["deck"] = game_state["discard_pile"].copy()
                random.shuffle(game_state["deck"])
                game_state["discard_pile"] = [top_card]
            else:
                raise HTTPException(status_code=400, detail="No cards available")
        
        game_state["drawn_card"] = game_state["deck"].pop()
    
    elif action.action_type == "draw_discard":
        # Verify it's player's turn
        if game_state["phase"] != "playing":
            raise HTTPException(status_code=400, detail="Not in playing phase")
            
        if game_state["players"][game_state["current_player_index"]]["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your turn")
        
        # CRITICAL: Clean any existing drawn_card before allowing new draw
        if game_state.get("drawn_card"):
            logging.warning(f"Found existing drawn_card, cleaning it")
            game_state["drawn_card"] = None
        
        if not game_state["discard_pile"] or len(game_state["discard_pile"]) == 0:
            raise HTTPException(status_code=400, detail="Discard pile empty")
        
        game_state["drawn_card"] = game_state["discard_pile"].pop()
    
    elif action.action_type == "exchange":
        if not game_state.get("drawn_card"):
            raise HTTPException(status_code=400, detail="No card drawn")
        
        if game_state["players"][game_state["current_player_index"]]["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your turn")
        
        old_card = current_player["hand"][action.card_index]
        current_player["hand"][action.card_index] = game_state["drawn_card"]
        game_state["discard_pile"].append(old_card)
        
        # Check if discarded card is special - AUTOMATIC activation
        discarded_card = old_card
        if is_special_card(discarded_card):
            game_state["special_card_available"] = True
            game_state["special_card_player"] = current_user["user_id"]
            game_state["special_card_type"] = discarded_card["value"]
            game_state["awaiting_special_action"] = True  # Force the player to use or skip
            game_state["last_discarded_special"] = True
        else:
            game_state["last_discarded_special"] = False
        
        game_state["drawn_card"] = None
        
        # Move to next player ONLY if no special card (otherwise wait for special action)
        if not is_special_card(discarded_card):
            game_state = advance_turn(game_state)
    
    elif action.action_type == "discard_drawn":
        if not game_state.get("drawn_card"):
            raise HTTPException(status_code=400, detail="No card drawn")
        
        if game_state["players"][game_state["current_player_index"]]["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your turn")
        
        discarded_card = game_state["drawn_card"]
        game_state["discard_pile"].append(discarded_card)
        
        # Check if discarded card is special - AUTOMATIC activation
        if is_special_card(discarded_card):
            game_state["special_card_available"] = True
            game_state["special_card_player"] = current_user["user_id"]
            game_state["special_card_type"] = discarded_card["value"]
            game_state["awaiting_special_action"] = True  # Force the player to use or skip
            game_state["last_discarded_special"] = True
        else:
            game_state["last_discarded_special"] = False
        
        game_state["drawn_card"] = None
        
        # Move to next player ONLY if no special card (otherwise wait for special action)
        if not is_special_card(discarded_card):
            game_state = advance_turn(game_state)
    
    elif action.action_type == "fast_discard":
        # Fast discard - can be done anytime
        if not game_state["discard_pile"] or len(game_state["discard_pile"]) == 0:
            raise HTTPException(status_code=400, detail="No discard pile")
        
        top_card = game_state["discard_pile"][-1]
        
        if action.target_player:
            # Discarding opponent's card
            target_player_obj = next((p for p in game_state["players"] if p["user_id"] == action.target_player), None)
            if not target_player_obj:
                raise HTTPException(status_code=404, detail="Target player not found")
            
            card_to_discard = target_player_obj["hand"][action.target_card_index]
            
            if card_to_discard["value"] == top_card["value"]:
                # Success - remove card from opponent
                target_player_obj["hand"].pop(action.target_card_index)
                game_state["discard_pile"].append(card_to_discard)
                
                # Check if card is special - AUTOMATIC activation
                if is_special_card(card_to_discard):
                    game_state["special_card_available"] = True
                    game_state["special_card_player"] = current_user["user_id"]
                    game_state["special_card_type"] = card_to_discard["value"]
                    game_state["awaiting_special_action"] = True
                
                # Set state to allow giving a card to opponent
                game_state["pending_give_card"] = {
                    "from_player": current_user["user_id"],
                    "to_player": action.target_player
                }
                
                # Check for perfect cactus
                if len(target_player_obj["hand"]) == 0:
                    game_state["cactus_called"] = True
                    game_state["cactus_caller"] = action.target_player
                    game_state["cactus_caller_username"] = target_player_obj["username"]
                    game_state["round_ended"] = True
            else:
                # Failure - current player draws
                if game_state["deck"] and len(game_state["deck"]) > 0:
                    current_player["hand"].append(game_state["deck"].pop())
        else:
            # Discarding own card
            card_to_discard = current_player["hand"][action.card_index]
            
            if card_to_discard["value"] == top_card["value"]:
                # Success
                current_player["hand"].pop(action.card_index)
                game_state["discard_pile"].append(card_to_discard)
                
                # Check if card is special - AUTOMATIC activation
                if is_special_card(card_to_discard):
                    game_state["special_card_available"] = True
                    game_state["special_card_player"] = current_user["user_id"]
                    game_state["special_card_type"] = card_to_discard["value"]
                    game_state["awaiting_special_action"] = True
                
                # Check for perfect cactus
                if len(current_player["hand"]) == 0:
                    game_state["cactus_called"] = True
                    game_state["cactus_caller"] = current_user["user_id"]
                    game_state["cactus_caller_username"] = current_player["username"]
                    game_state["round_ended"] = True
            else:
                # Failure - draw a card
                if game_state["deck"] and len(game_state["deck"]) > 0:
                    current_player["hand"].append(game_state["deck"].pop())
    
    elif action.action_type == "give_card":
        # Give a card to opponent after successful fast discard
        if not game_state.get("pending_give_card"):
            raise HTTPException(status_code=400, detail="No pending give card action")
        
        pending = game_state["pending_give_card"]
        if pending["from_player"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your pending action")
        
        target_player_obj = next((p for p in game_state["players"] if p["user_id"] == pending["to_player"]), None)
        if not target_player_obj:
            raise HTTPException(status_code=404, detail="Target player not found")
        
        # Transfer card from current player to target
        card_to_give = current_player["hand"].pop(action.card_index)
        target_player_obj["hand"].append(card_to_give)
        
        # Clear pending action
        game_state["pending_give_card"] = None
    
    elif action.action_type == "skip_give_card":
        # Skip giving a card (player chooses not to give)
        if game_state.get("pending_give_card"):
            if game_state["pending_give_card"]["from_player"] == current_user["user_id"]:
                game_state["pending_give_card"] = None
    
    elif action.action_type == "cactus":
        if game_state["players"][game_state["current_player_index"]]["user_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your turn")
        
        # Cactus ends the caller's turn immediately
        game_state["cactus_called"] = True
        game_state["cactus_caller"] = current_user["user_id"]
        game_state["cactus_caller_username"] = current_player["username"]
        game_state["remaining_final_turns"] = len(game_state["players"]) - 1
        
        # Clear any drawn card
        game_state["drawn_card"] = None
        
        # Move to next player immediately
        game_state["current_player_index"] = (game_state["current_player_index"] + 1) % len(game_state["players"])
    
    elif action.action_type == "special_look_own":
        # 8 - Look at one of your OWN cards
        if action.card_index is None:
            raise HTTPException(status_code=400, detail="Card index required")
        
        card = current_player["hand"][action.card_index]
        # Return the card info - frontend will show it temporarily
        game_state["special_reveal"] = {
            "player_id": current_user["user_id"],
            "card_index": action.card_index,
            "card": card,
            "type": "look_own"
        }
        # Don't clear yet - wait for clear_special_reveal to advance turn
    
    elif action.action_type == "special_look_opponent":
        # 10 - Look at one of OPPONENT's cards
        if action.target_player is None or action.target_card_index is None:
            raise HTTPException(status_code=400, detail="Target player and card index required")
        
        target_player_obj = next((p for p in game_state["players"] if p["user_id"] == action.target_player), None)
        if not target_player_obj:
            raise HTTPException(status_code=404, detail="Target player not found")
        
        card = target_player_obj["hand"][action.target_card_index]
        # Return the card info - frontend will show it temporarily
        game_state["special_reveal"] = {
            "player_id": current_user["user_id"],
            "card_index": action.target_card_index,
            "card": card,
            "type": "look_opponent",
            "target_player": action.target_player
        }
        # Don't clear yet - wait for clear_special_reveal to advance turn
    
    elif action.action_type == "special_swap":
        # V (Jack/Valet) - Swap a card with opponent (blind swap)
        if action.card_index is None or action.target_player is None or action.target_card_index is None:
            raise HTTPException(status_code=400, detail="Card index, target player and target card index required")
        
        target_player_obj = next((p for p in game_state["players"] if p["user_id"] == action.target_player), None)
        if not target_player_obj:
            raise HTTPException(status_code=404, detail="Target player not found")
        
        # Swap cards blindly
        my_card = current_player["hand"][action.card_index]
        opponent_card = target_player_obj["hand"][action.target_card_index]
        
        current_player["hand"][action.card_index] = opponent_card
        target_player_obj["hand"][action.target_card_index] = my_card
        
        # Clear special state and advance turn
        game_state["special_card_available"] = False
        game_state["special_card_player"] = None
        game_state["special_card_type"] = None
        game_state["awaiting_special_action"] = False
        
        # Advance to next player after swap
        game_state = advance_turn(game_state)
    
    elif action.action_type == "clear_special_reveal":
        # Clear the special reveal state AND special card available, then advance turn
        game_state["special_reveal"] = None
        game_state["special_card_available"] = False
        game_state["special_card_player"] = None
        game_state["special_card_type"] = None
        game_state["awaiting_special_action"] = False
        
        # Advance to next player after viewing the card
        game_state = advance_turn(game_state)
    
    elif action.action_type == "skip_special":
        # Player chooses to skip using their special card ability
        game_state["special_reveal"] = None
        game_state["special_card_available"] = False
        game_state["special_card_player"] = None
        game_state["special_card_type"] = None
        game_state["awaiting_special_action"] = False
        
        # Advance to next player
        game_state = advance_turn(game_state)
    
    elif action.action_type == "start_next_round":
        # Player acknowledges round summary and starts next round
        if game_state.get("phase") != "round_summary":
            raise HTTPException(status_code=400, detail="Not in round summary phase")
        
        # Only room creator can start next round
        if room["creator_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Seul le créateur peut lancer la manche suivante")
        
        game_state = await start_next_round(code.upper(), game_state, room["config"])
    
    # Handle round end if needed
    if game_state.get("round_ended") and not game_state.get("game_over"):
        game_state = await end_round_and_update_stats(code.upper(), game_state, room["config"])
    
    # Save updated game state
    await db.game_rooms.update_one(
        {"code": code.upper()},
        {"$set": {"game_state": game_state}}
    )
    
    # CRITICAL: Broadcast to ALL players in the room
    logging.info(f"Broadcasting game update to room {code.upper()}, action: {action.action_type}")
    await manager.broadcast({
        "type": "game_update",
        "game_state": game_state,
        "action": action.action_type
    }, code.upper())
    
    # If next player is bot and phase is playing, trigger bot turn immediately
    if game_state["phase"] == "playing" and not game_state.get("drawn_card"):
        next_player = game_state["players"][game_state["current_player_index"]]
        if next_player.get("is_bot", False):
            logging.info(f"Bot turn detected, executing bot action for room {code.upper()}")
            # Execute bot turn immediately in same request
            await execute_bot_turn(code.upper(), room["config"]["bot_difficulty"])
    
    return {"message": "Action performed", "game_state": game_state}

async def execute_bot_turn(room_code: str, difficulty: str):
    """Execute bot turn immediately"""
    try:
        # Small delay for realism
        await asyncio.sleep(0.5)
        
        room = await db.game_rooms.find_one({"code": room_code}, {"_id": 0})
        if not room or room["state"] != "playing":
            return
        
        game_state = room["game_state"]
        current_player_index = game_state["current_player_index"]
        current_player = game_state["players"][current_player_index]
        
        if not current_player.get("is_bot", False):
            logging.info(f"Current player is not a bot, skipping")
            return
        
        logging.info(f"🤖 Bot executing turn in room {room_code}")
        
        # STEP 1: Clean any existing drawn_card
        if game_state.get("drawn_card"):
            logging.warning(f"Bot found existing drawn_card, cleaning it first")
            game_state["drawn_card"] = None
        
        # STEP 2: Bot draws a card from deck
        if game_state["deck"] and len(game_state["deck"]) > 0:
            game_state["drawn_card"] = game_state["deck"].pop()
            logging.info(f"Bot drew card from deck")
        elif len(game_state["discard_pile"]) > 1:
            # Recycle
            top = game_state["discard_pile"].pop()
            game_state["deck"] = game_state["discard_pile"].copy()
            random.shuffle(game_state["deck"])
            game_state["discard_pile"] = [top]
            if game_state["deck"]:
                game_state["drawn_card"] = game_state["deck"].pop()
                logging.info(f"Bot recycled and drew card")
        
        # STEP 3: Bot exchanges with highest card
        if game_state.get("drawn_card"):
            highest_idx = 0
            highest_val = get_card_value(current_player["hand"][0])
            for i, card in enumerate(current_player["hand"]):
                val = get_card_value(card)
                if val > highest_val:
                    highest_val = val
                    highest_idx = i
            
            old_card = current_player["hand"][highest_idx]
            current_player["hand"][highest_idx] = game_state["drawn_card"]
            game_state["discard_pile"].append(old_card)
            
            logging.info(f"Bot exchanged card at position {highest_idx}")
            
            # CRITICAL: Set drawn_card to None
            game_state["drawn_card"] = None
            
            # STEP 4: Move to next player using advance_turn to handle cactus countdown
            game_state = advance_turn(game_state)
            logging.info(f"Next player index: {game_state['current_player_index']}, phase: {game_state['phase']}, round_ended: {game_state.get('round_ended')}")
        
        # STEP 5: Handle round end if needed (after bot's final turn)
        if game_state.get("round_ended") and not game_state.get("game_over"):
            logging.info(f"🤖 Bot triggered round end, calling end_round_and_update_stats")
            game_state = await end_round_and_update_stats(room_code, game_state, room["config"])
        
        # STEP 6: Save and broadcast
        await db.game_rooms.update_one(
            {"code": room_code},
            {"$set": {"game_state": game_state}}
        )
        
        logging.info(f"🤖 Bot finished turn, broadcasting update")
        await manager.broadcast({
            "type": "game_update",
            "game_state": game_state,
            "action": "bot_turn_complete"
        }, room_code)
        
    except Exception as e:
        logging.error(f"Bot turn error: {e}", exc_info=True)

@api_router.post("/game/reset-turn/{code}")
async def reset_turn(code: str, current_user: dict = Depends(get_current_user)):
    """Emergency endpoint to reset a stuck turn"""
    room = await db.game_rooms.find_one({"code": code.upper()}, {"_id": 0})
    
    if not room or room["state"] != "playing":
        raise HTTPException(status_code=400, detail="Game not active")
    
    game_state = room["game_state"]
    
    # Clean drawn_card
    game_state["drawn_card"] = None
    
    logging.info(f"🔧 Emergency reset for room {code.upper()}")
    
    # Save
    await db.game_rooms.update_one(
        {"code": code.upper()},
        {"$set": {"game_state": game_state}}
    )
    
    # Broadcast
    await manager.broadcast({
        "type": "game_update",
        "game_state": game_state,
        "action": "turn_reset"
    }, code.upper())
    
    return {"message": "Turn reset", "game_state": game_state}

# Stats Routes
@api_router.get("/stats/user")
async def get_user_stats(current_user: dict = Depends(get_current_user)):
    return current_user.get("stats", {})

@api_router.get("/stats/global")
async def get_global_stats(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    
    total_users = await db.users.count_documents({})
    total_games = await db.game_rooms.count_documents({"state": "finished"})
    
    users = await db.users.find({}, {"_id": 0, "stats": 1}).to_list(1000)
    total_perfect_cactus = sum(u.get("stats", {}).get("perfect_cactus_count", 0) for u in users)
    
    return {
        "total_users": total_users,
        "total_games": total_games,
        "total_perfect_cactus": total_perfect_cactus
    }

# Admin Routes
@api_router.get("/admin/rules")
async def get_rules():
    rules = await db.game_rules.find_one({}, {"_id": 0})
    if not rules:
        # Default rules
        default_rules = {
            "rule_id": "default",
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "card_visibility_delay": 3,
            "card_values": {
                "K": 0, "A": 1, "2": -2, "3": 3, "4": 4,
                "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
                "10": 10, "J": 10, "Q": 10
            },
            "special_cards": {
                "8": "Look at opponent card",
                "10": "Exchange card with opponent",
                "J": "Look at your own card"
            }
        }
        result = await db.game_rules.insert_one(default_rules.copy())
        return default_rules
    return rules

@api_router.put("/admin/rules")
async def update_rules(rule_update: RuleUpdate, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_data = {k: v for k, v in rule_update.model_dump().items() if v is not None}
    
    if update_data:
        await db.game_rules.update_one(
            {},
            {"$set": update_data},
            upsert=True
        )
    
    return {"message": "Rules updated", "updated_fields": list(update_data.keys())}

@api_router.get("/admin/settings")
async def get_admin_settings(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    
    settings = await db.admin_settings.find_one({}, {"_id": 0})
    if not settings:
        default_settings = {
            "setting_id": "default",
            "background_images": [
                "https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=1920"
            ],
            "theme_config": {
                "primary_color": "#48C9B0",
                "secondary_color": "#F4A460"
            }
        }
        result = await db.admin_settings.insert_one(default_settings.copy())
        return default_settings
    return settings

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.put("/admin/users/{user_id}/toggle-admin")
async def toggle_admin(user_id: str, current_user: dict = Depends(get_current_user)):
    if not current_user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Prevent removing own admin rights
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot modify your own admin status")
    
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_admin_status = not target_user.get("is_admin", False)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_admin": new_admin_status}}
    )
    
    return {
        "message": f"User {'promoted to' if new_admin_status else 'removed from'} admin",
        "user_id": user_id,
        "is_admin": new_admin_status
    }

# WebSocket endpoint
@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            # Keep connection alive and receive messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Echo back or handle custom messages
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
    except Exception as e:
        logging.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, room_code)

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
