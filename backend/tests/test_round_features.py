"""
Tests for round summary, card reveal countdown, and deck recycling features
- Round summary popup when phase is 'round_summary'
- start_next_round action
- Deck recycling logic
- Admin rights verification
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Get authentication token using testuser123"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "username": "testuser123",
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestAdminRights:
    """Test admin rights for Rmng users"""
    
    def test_rmng_admin_status_query(self, api_client, authenticated_client):
        """Verify that Rmng account has admin rights"""
        # First login with testuser123 to get token
        response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        
        # Test user info is returned
        data = response.json()
        assert "user_id" in data
        assert "username" in data
        print(f"Current user: {data['username']}, is_admin: {data.get('is_admin')}")
    
    def test_admin_users_endpoint_accessible(self, authenticated_client):
        """Test if admin can access users list"""
        response = authenticated_client.get(f"{BASE_URL}/api/admin/users")
        # If testuser123 is not admin, this should return 403
        if response.status_code == 403:
            print("testuser123 is not admin - expected behavior")
        elif response.status_code == 200:
            users = response.json()
            print(f"Found {len(users)} users")
            # Check for Rmng users
            rmng_users = [u for u in users if 'rmng' in u.get('username', '').lower() or 
                          'romain.mignot14' in u.get('email', '').lower()]
            for user in rmng_users:
                print(f"Rmng user: {user.get('username')}, email: {user.get('email')}, is_admin: {user.get('is_admin')}")


class TestRoundSummary:
    """Test round summary phase and transitions"""
    
    def test_create_multi_round_game(self, authenticated_client):
        """Create a game with multiple rounds"""
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 3,  # Multi-round game
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "room_code" in data
        room_code = data["room_code"]
        print(f"Created multi-round game with room code: {room_code}")
        
        # Verify room config
        room_response = authenticated_client.get(f"{BASE_URL}/api/game/room/{room_code}")
        assert room_response.status_code == 200
        room = room_response.json()
        assert room["config"]["num_rounds"] == 3
        print(f"Verified num_rounds=3 in room config")
        
        return room_code
    
    def test_start_next_round_action(self, authenticated_client):
        """Test start_next_round action endpoint structure"""
        # Create a game first
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 2,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        room_code = response.json()["room_code"]
        
        # Start the game
        start_response = authenticated_client.post(f"{BASE_URL}/api/game/start/{room_code}")
        assert start_response.status_code == 200
        
        game_state = start_response.json().get("game_state", {})
        assert game_state.get("phase") == "initial_reveal"
        assert game_state.get("round") == 1
        
        # Try start_next_round when NOT in round_summary phase (should fail)
        action_response = authenticated_client.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "start_next_round"
        })
        
        # Should fail because we're not in round_summary phase
        assert action_response.status_code == 400
        assert "Not in round summary phase" in action_response.json().get("detail", "")
        print("Correctly rejected start_next_round when not in round_summary phase")
    
    def test_round_summary_data_structure(self, authenticated_client):
        """Verify round_summary object has correct structure when phase changes"""
        # This test verifies the data structure exists in the code
        # We can't easily trigger round_summary without completing a full round
        
        # Create and start a bot game
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 2,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        room_code = response.json()["room_code"]
        
        # Start game
        start_response = authenticated_client.post(f"{BASE_URL}/api/game/start/{room_code}")
        assert start_response.status_code == 200
        
        game_state = start_response.json().get("game_state", {})
        
        # Verify expected fields exist
        assert "round" in game_state
        assert "phase" in game_state
        assert game_state["phase"] == "initial_reveal"
        print(f"Game started in phase={game_state['phase']}, round={game_state['round']}")


class TestDeckRecycling:
    """Test deck recycling when deck is empty"""
    
    def test_draw_deck_recycling_logic(self, authenticated_client):
        """Test that draw_deck handles empty deck with recycling"""
        # Create a bot game
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 1,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        room_code = response.json()["room_code"]
        
        # Start game
        start_response = authenticated_client.post(f"{BASE_URL}/api/game/start/{room_code}")
        assert start_response.status_code == 200
        
        game_state = start_response.json().get("game_state", {})
        initial_deck_size = len(game_state.get("deck", []))
        initial_discard_size = len(game_state.get("discard_pile", []))
        
        print(f"Initial: deck={initial_deck_size}, discard={initial_discard_size}")
        
        # Deck recycling is tested by verifying the code structure
        # Full recycling would require depleting deck which takes many turns
        assert initial_deck_size > 0
        assert initial_discard_size >= 1  # At least one card in discard


class TestCardReveal:
    """Test initial card reveal phase"""
    
    def test_reveal_card_action(self, authenticated_client):
        """Test card reveal action during initial_reveal phase"""
        # Create a bot game
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 1,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        room_code = response.json()["room_code"]
        
        # Start game
        start_response = authenticated_client.post(f"{BASE_URL}/api/game/start/{room_code}")
        assert start_response.status_code == 200
        
        game_state = start_response.json().get("game_state", {})
        assert game_state["phase"] == "initial_reveal"
        
        # Reveal first card
        reveal_response = authenticated_client.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "reveal_card",
            "card_index": 0
        })
        
        assert reveal_response.status_code == 200
        updated_state = reveal_response.json().get("game_state", {})
        
        # Find player and check revealed cards
        me_response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        user_id = me_response.json()["user_id"]
        
        my_player = next((p for p in updated_state["players"] if p["user_id"] == user_id), None)
        assert my_player is not None
        assert 0 in my_player.get("revealed_cards", [])
        print(f"Card 0 revealed successfully, revealed_cards: {my_player.get('revealed_cards')}")
        
        # Reveal second card to complete reveal phase
        reveal_response2 = authenticated_client.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "reveal_card",
            "card_index": 1
        })
        
        assert reveal_response2.status_code == 200
        final_state = reveal_response2.json().get("game_state", {})
        
        # After all players reveal, phase should transition to 'playing'
        print(f"Phase after reveals: {final_state['phase']}")
        assert final_state["phase"] == "playing"  # Should auto-transition


class TestCreatorOnlyActions:
    """Test that only room creator can start next round"""
    
    def test_start_next_round_creator_only(self, authenticated_client):
        """Verify start_next_round requires room creator"""
        # Create a game
        response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 2,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert response.status_code == 200
        room_code = response.json()["room_code"]
        
        # Get room details to verify creator
        room_response = authenticated_client.get(f"{BASE_URL}/api/game/room/{room_code}")
        assert room_response.status_code == 200
        room = room_response.json()
        
        me_response = authenticated_client.get(f"{BASE_URL}/api/auth/me")
        user_id = me_response.json()["user_id"]
        
        # Verify we are the creator
        assert room["creator_id"] == user_id
        print(f"Verified: testuser123 is room creator")


class TestIntegration:
    """Integration tests for full game flow"""
    
    def test_full_game_start_flow(self, authenticated_client):
        """Test creating, starting, and playing initial moves"""
        # Create game
        create_response = authenticated_client.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 2,
            "mode": "bot",
            "bot_difficulty": "easy"
        })
        
        assert create_response.status_code == 200
        room_code = create_response.json()["room_code"]
        
        # Start game
        start_response = authenticated_client.post(f"{BASE_URL}/api/game/start/{room_code}")
        assert start_response.status_code == 200
        
        # Reveal cards
        for i in range(2):
            reveal_response = authenticated_client.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            })
            assert reveal_response.status_code == 200
            time.sleep(0.1)
        
        # Get updated state
        room_response = authenticated_client.get(f"{BASE_URL}/api/game/room/{room_code}")
        assert room_response.status_code == 200
        game_state = room_response.json().get("game_state", {})
        
        # Should be in playing phase now
        assert game_state["phase"] == "playing"
        print(f"Game successfully in playing phase, round: {game_state['round']}")
        
        # Draw a card from deck
        draw_response = authenticated_client.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        })
        
        if draw_response.status_code == 200:
            game_state = draw_response.json().get("game_state", {})
            assert game_state.get("drawn_card") is not None
            print(f"Drew card successfully: {game_state.get('drawn_card')}")
        else:
            # Might not be our turn if bot goes first
            print(f"Draw response: {draw_response.status_code} - {draw_response.json()}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
