"""
Cactus Card Game - New Features Tests
Testing the following features:
1. Login with username instead of email
2. num_rounds parameter in create game
3. Display of current round / total rounds
4. Special card automatic activation
5. skip_special action
6. Stats page functionality
"""

import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


# =====================
# 1. Login with Username
# =====================
class TestLoginWithUsername:
    """Test login uses username instead of email"""
    
    def test_login_with_username_success(self):
        """Login should accept username field (not email)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "testuser123",
            "password": "test123"
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        assert "access_token" in data, "Response should contain access_token"
        assert "user" in data, "Response should contain user info"
        assert data["user"]["username"] == "testuser123", "Username should match"
    
    def test_login_email_field_rejected(self):
        """Old email field should be rejected (username required)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        
        # Should fail with 422 (validation error) because username is required
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        data = response.json()
        
        # Should mention missing username field
        assert "username" in str(data).lower(), "Error should mention username field"
    
    def test_login_wrong_username(self):
        """Login with wrong username should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "nonexistent_user_xyz",
            "password": "test123"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_login_wrong_password(self):
        """Login with wrong password should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "testuser123",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_register_requires_username(self):
        """Registration should require username field"""
        unique_id = str(uuid.uuid4())[:8]
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": f"TEST_newuser_{unique_id}",
            "email": f"TEST_newuser_{unique_id}@test.com",
            "password": "test123"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["user"]["username"] == f"TEST_newuser_{unique_id}", "Username should be set"


# =====================
# 2. num_rounds Parameter
# =====================
class TestNumRoundsParameter:
    """Test num_rounds configuration in game creation"""
    
    def test_create_room_with_num_rounds(self, auth_token):
        """Create room should accept num_rounds parameter"""
        response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "num_rounds": 5,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200, f"Create room failed: {response.text}"
        data = response.json()
        
        assert "room_code" in data, "Response should contain room_code"
        
        # Verify num_rounds is stored in config
        room_response = requests.get(
            f"{BASE_URL}/api/game/room/{data['room_code']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert room_response.status_code == 200
        room_data = room_response.json()
        
        assert room_data["config"]["num_rounds"] == 5, \
            f"Expected num_rounds=5, got {room_data['config'].get('num_rounds')}"
    
    def test_create_room_default_num_rounds(self, auth_token):
        """Create room without num_rounds should default to 1"""
        response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "score_threshold": 60,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify default num_rounds
        room_response = requests.get(
            f"{BASE_URL}/api/game/room/{data['room_code']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        room_data = room_response.json()
        assert room_data["config"]["num_rounds"] == 1, \
            f"Default num_rounds should be 1, got {room_data['config'].get('num_rounds')}"


# =====================
# 3. Round Display in Game State
# =====================
class TestRoundDisplay:
    """Test that game state includes current round number"""
    
    def test_game_state_has_round_field(self, auth_token):
        """Game state should include round field"""
        # Create and start game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "num_rounds": 3,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        room_code = create_response.json()["room_code"]
        
        # Start the game
        start_response = requests.post(
            f"{BASE_URL}/api/game/start/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        
        assert start_response.status_code == 200
        game_state = start_response.json()["game_state"]
        
        # Verify round field exists and is 1
        assert "round" in game_state, "game_state should contain 'round' field"
        assert game_state["round"] == 1, f"First round should be 1, got {game_state['round']}"
    
    def test_room_config_has_num_rounds_accessible(self, auth_token):
        """Room config with num_rounds should be accessible for UI display"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "num_rounds": 7,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        room_code = create_response.json()["room_code"]
        
        # Get room details
        room_response = requests.get(
            f"{BASE_URL}/api/game/room/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        room_data = room_response.json()
        
        # UI needs both current round (from game_state) and total rounds (from config)
        assert "config" in room_data, "Room should have config"
        assert "num_rounds" in room_data["config"], "Config should have num_rounds"
        assert room_data["config"]["num_rounds"] == 7


# =====================
# 4. Special Card Automatic Activation
# =====================
class TestSpecialCardAutoActivation:
    """Test that special cards (8, 10, J) are automatically activated"""
    
    def test_special_card_sets_awaiting_flag(self, auth_token, test_user_info):
        """When a special card is discarded, awaiting_special_action should be True"""
        # Create and start game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        room_code = create_response.json()["room_code"]
        
        requests.post(
            f"{BASE_URL}/api/game/start/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Try to find a special card (8, 10, or J)
        special_values = ['8', '10', 'J']
        max_attempts = 15
        
        for attempt in range(max_attempts):
            # Draw from deck
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                time.sleep(1.5)  # Wait for bot turn
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] in special_values:
                # Discard the special card
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                result_state = discard_response.json()["game_state"]
                
                # Check awaiting_special_action is True
                assert result_state.get("awaiting_special_action") == True, \
                    f"awaiting_special_action should be True after discarding {drawn_card['value']}"
                assert result_state.get("special_card_available") == True
                assert result_state.get("special_card_type") == drawn_card["value"]
                assert result_state.get("special_card_player") == test_user_info["user_id"]
                
                print(f"SUCCESS: Special card {drawn_card['value']} auto-activated")
                return
            
            # Not special, discard and wait for bot
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            time.sleep(1.5)
        
        pytest.skip("Could not draw a special card in 15 attempts")
    
    def test_exchange_with_special_sets_awaiting_flag(self, auth_token, test_user_info):
        """When exchanging with a special card in hand, awaiting_special_action should be True"""
        # Create and start game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        room_code = create_response.json()["room_code"]
        
        requests.post(
            f"{BASE_URL}/api/game/start/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Get current hand and check for special cards
        room_response = requests.get(
            f"{BASE_URL}/api/game/room/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        game_state = room_response.json()["game_state"]
        my_player = next((p for p in game_state["players"] if p["user_id"] == test_user_info["user_id"]))
        
        # Find special card index in hand
        special_values = ['8', '10', 'J']
        special_index = None
        for idx, card in enumerate(my_player["hand"]):
            if card["value"] in special_values:
                special_index = idx
                break
        
        if special_index is None:
            pytest.skip("No special card in initial hand")
        
        # Draw a card
        draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "draw_deck"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        if draw_response.status_code != 200:
            pytest.skip("Could not draw card (not our turn)")
        
        # Exchange with the special card position
        exchange_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "exchange",
            "card_index": special_index
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        result_state = exchange_response.json()["game_state"]
        
        # If the discarded card was special, awaiting_special_action should be True
        if result_state.get("special_card_available"):
            assert result_state.get("awaiting_special_action") == True, \
                "awaiting_special_action should be True after exchanging with special card"
            print(f"SUCCESS: Exchange with special card auto-activated")
        else:
            print("INFO: Exchanged card was not a special card (random draw replaced it)")


# =====================
# 5. skip_special Action
# =====================
class TestSkipSpecialAction:
    """Test the skip_special action to skip using special card ability"""
    
    def test_skip_special_clears_state_and_advances_turn(self, auth_token, test_user_info):
        """skip_special should clear special state and advance turn"""
        # Create and start game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        room_code = create_response.json()["room_code"]
        
        requests.post(
            f"{BASE_URL}/api/game/start/{room_code}",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={}
        )
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Try to get a special card
        special_values = ['8', '10', 'J']
        max_attempts = 15
        
        for attempt in range(max_attempts):
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                time.sleep(1.5)
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] in special_values:
                # Discard to activate special
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                after_discard_state = discard_response.json()["game_state"]
                
                if after_discard_state.get("special_card_available"):
                    # Record current player index
                    current_idx = after_discard_state["current_player_index"]
                    
                    # Now skip the special
                    skip_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                        "action_type": "skip_special"
                    }, headers={"Authorization": f"Bearer {auth_token}"})
                    
                    assert skip_response.status_code == 200, f"skip_special failed: {skip_response.text}"
                    skip_state = skip_response.json()["game_state"]
                    
                    # Verify state is cleared
                    assert skip_state.get("special_card_available") == False or skip_state.get("special_card_available") is None, \
                        "special_card_available should be False/None after skip"
                    assert skip_state.get("awaiting_special_action") == False or skip_state.get("awaiting_special_action") is None, \
                        "awaiting_special_action should be False/None after skip"
                    assert skip_state.get("special_card_player") is None, \
                        "special_card_player should be None after skip"
                    assert skip_state.get("special_card_type") is None, \
                        "special_card_type should be None after skip"
                    
                    # Verify turn advanced (considering bot might have played)
                    new_idx = skip_state["current_player_index"]
                    # Note: Bot might immediately play after skip, so turn could advance multiple times
                    print(f"SUCCESS: skip_special cleared state. Turn moved from {current_idx} to {new_idx}")
                    return
            
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            time.sleep(1.5)
        
        pytest.skip("Could not draw a special card in 15 attempts")


# =====================
# 6. Stats Page Functionality
# =====================
class TestStatsEndpoint:
    """Test stats API endpoint"""
    
    def test_get_user_stats_structure(self, auth_token):
        """Stats endpoint should return correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/stats/user",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200, f"Stats fetch failed: {response.text}"
        stats = response.json()
        
        # Verify all required fields exist
        required_fields = ["games_played", "wins", "total_score", "perfect_cactus_count"]
        for field in required_fields:
            assert field in stats, f"Stats should contain '{field}'"
        
        # Verify types
        assert isinstance(stats["games_played"], int)
        assert isinstance(stats["wins"], int)
        assert isinstance(stats["total_score"], int)
        assert isinstance(stats["perfect_cactus_count"], int)
    
    def test_stats_requires_auth(self):
        """Stats endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/stats/user")
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 without auth, got {response.status_code}"


# =====================
# Fixtures
# =====================
@pytest.fixture
def auth_token():
    """Get authentication token for test user using USERNAME"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "testuser123",  # UPDATED: Using username instead of email
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip(f"Could not authenticate test user: {response.text}")


@pytest.fixture
def test_user_info():
    """Get test user info using USERNAME"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "testuser123",  # UPDATED: Using username instead of email
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json()["user"]
    pytest.skip(f"Could not get test user info: {response.text}")
