"""
Cactus Card Game - Backend API Tests
Testing: Authentication, Room management, Game mechanics, Bot mode, Real-time polling
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_existing_user(self):
        """Test login with test credentials using USERNAME"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "testuser123",  # UPDATED: Using username instead of email
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["username"] == "testuser123"
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "testuser123",  # UPDATED: Using username instead of email
            "password": "wrongpassword"
        })
        assert response.status_code == 401
    
    def test_get_current_user(self, auth_token):
        """Test /auth/me endpoint"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "username" in data


class TestBotGameMode:
    """Test Bot mode game creation and gameplay - main focus for real-time testing"""
    
    def test_create_bot_room(self, auth_token):
        """Create a bot room for testing"""
        response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "mode": "bot",
            "bot_difficulty": "easy"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Create room failed: {response.text}"
        data = response.json()
        assert "room_code" in data
        return data["room_code"]
    
    def test_start_bot_game(self, auth_token):
        """Create and start a bot game"""
        # Create room
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "mode": "bot",
            "bot_difficulty": "easy"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert create_response.status_code == 200
        room_code = create_response.json()["room_code"]
        
        # Start game
        start_response = requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        
        assert start_response.status_code == 200, f"Start game failed: {start_response.text}"
        data = start_response.json()
        assert "game_state" in data
        assert data["game_state"]["phase"] == "initial_reveal"
        assert len(data["game_state"]["players"]) == 2  # Player + Bot
        return room_code, data["game_state"]
    
    def test_initial_card_reveal(self, auth_token):
        """Test initial card reveal phase"""
        # Create and start game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "mode": "bot",
            "bot_difficulty": "easy"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Reveal first card
        reveal_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "reveal_card",
            "card_index": 0
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert reveal_response.status_code == 200, f"Reveal card failed: {reveal_response.text}"
        game_state = reveal_response.json()["game_state"]
        
        # Find player and check revealed_cards
        player = next(p for p in game_state["players"] if p["user_id"] != "bot")
        assert 0 in player["revealed_cards"]
        
        # Reveal second card to complete initial phase
        reveal_response2 = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "reveal_card",
            "card_index": 1
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert reveal_response2.status_code == 200
        game_state2 = reveal_response2.json()["game_state"]
        assert game_state2["phase"] == "playing"  # Should move to playing phase
        
        return room_code, game_state2
    
    def test_draw_card_from_deck(self, auth_token):
        """Test drawing a card from deck"""
        # Setup game in playing phase
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Draw from deck
        draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert draw_response.status_code == 200, f"Draw deck failed: {draw_response.text}"
        game_state = draw_response.json()["game_state"]
        assert game_state.get("drawn_card") is not None
        
        return room_code, game_state
    
    def test_exchange_card(self, auth_token):
        """Test exchanging drawn card with hand card"""
        # Setup game and draw card
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Exchange card at index 0
        exchange_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "exchange",
            "card_index": 0
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert exchange_response.status_code == 200, f"Exchange failed: {exchange_response.text}"
        game_state = exchange_response.json()["game_state"]
        
        # After exchange, drawn_card should be None and turn should move to bot
        assert game_state.get("drawn_card") is None
        
        return room_code, game_state
    
    def test_discard_drawn_card(self, auth_token):
        """Test discarding drawn card"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Discard the drawn card
        discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "discard_drawn"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert discard_response.status_code == 200, f"Discard failed: {discard_response.text}"
        game_state = discard_response.json()["game_state"]
        
        # drawn_card should be None after discard
        assert game_state.get("drawn_card") is None
        
        return room_code, game_state
    
    def test_bot_auto_turn(self, auth_token):
        """Test that bot plays automatically after player's turn"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot",
            "bot_difficulty": "easy"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Draw and discard to end turn
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "discard_drawn"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Wait for bot turn to complete
        time.sleep(1.5)
        
        # Get room state - should be back to player's turn
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        
        assert room_response.status_code == 200
        game_state = room_response.json()["game_state"]
        
        # Check that bot has played and turn is back to player
        current_player = game_state["players"][game_state["current_player_index"]]
        assert current_player["user_id"] != "bot", "Turn should be back to player after bot plays"
        
        return room_code, game_state


class TestPollingEndpoint:
    """Test room polling endpoint used for real-time updates"""
    
    def test_room_polling(self, auth_token):
        """Test GET /game/room/{code} returns correct state for polling"""
        # Create room
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        # First poll - waiting state
        poll1 = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        assert poll1.status_code == 200
        assert poll1.json()["state"] == "waiting"
        
        # Start game
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Second poll - playing state
        poll2 = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        assert poll2.status_code == 200
        assert poll2.json()["state"] == "playing"
        assert poll2.json()["game_state"] is not None
    
    def test_multiple_rapid_polls(self, auth_token):
        """Test that multiple rapid polls don't cause issues"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        # Simulate rapid polling like frontend does (1-1.5s intervals)
        for i in range(5):
            poll_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
                headers={"Authorization": f"Bearer {auth_token}"})
            assert poll_response.status_code == 200
            time.sleep(0.3)


class TestResetTurn:
    """Test emergency reset turn endpoint"""
    
    def test_reset_turn(self, auth_token):
        """Test reset-turn endpoint clears drawn_card"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Complete reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Draw a card
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Reset turn
        reset_response = requests.post(f"{BASE_URL}/api/game/reset-turn/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        assert reset_response.status_code == 200
        game_state = reset_response.json()["game_state"]
        assert game_state.get("drawn_card") is None


class TestMultiplayerRoom:
    """Test multiplayer room functionality"""
    
    def test_create_multiplayer_room(self, auth_token):
        """Create a multiplayer room"""
        response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "mode": "multiplayer"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200
        data = response.json()
        assert "room_code" in data
        assert len(data["room_code"]) == 6
    
    def test_get_room_shows_players(self, auth_token):
        """Test that room endpoint shows player list"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "mode": "multiplayer"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        
        assert room_response.status_code == 200
        room = room_response.json()
        assert "players" in room
        assert len(room["players"]) >= 1


# Fixtures
@pytest.fixture
def auth_token():
    """Get authentication token for test user using USERNAME"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "testuser123",  # UPDATED: Using username instead of email
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Could not authenticate test user")
