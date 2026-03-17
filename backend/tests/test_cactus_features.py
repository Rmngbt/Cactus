"""
Cactus Card Game - New Features Tests
Testing: 
1. Cactus call shows username (cactus_caller_username)
2. remaining_final_turns countdown and game end
3. Fast discard on opponent success with pending_give_card
4. Special cards (8, 10, J) with special_card_available
5. Game end phase with score calculation
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestCactusCallUsername:
    """Test that Cactus displays username, not user_id"""
    
    def test_cactus_caller_username_is_set(self, auth_token, test_user_info):
        """When cactus is called, cactus_caller_username should contain the player's username"""
        # Create and start bot game
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        # Start game
        requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        
        # Complete initial reveal
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Call cactus
        cactus_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "cactus"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert cactus_response.status_code == 200, f"Cactus call failed: {cactus_response.text}"
        game_state = cactus_response.json()["game_state"]
        
        # Verify cactus_caller_username is set and matches the expected username
        assert game_state.get("cactus_called") == True, "cactus_called should be True"
        assert "cactus_caller_username" in game_state, "cactus_caller_username should be present"
        assert game_state["cactus_caller_username"] == test_user_info["username"], \
            f"Expected username '{test_user_info['username']}', got '{game_state.get('cactus_caller_username')}'"
        
        # Also verify cactus_caller (user_id) is set
        assert game_state.get("cactus_caller") == test_user_info["user_id"], \
            "cactus_caller should be the user_id"


class TestCactusFinalTurnsCountdown:
    """Test that remaining_final_turns decrements and game ends properly"""
    
    def test_cactus_sets_remaining_final_turns(self, auth_token):
        """When cactus is called, remaining_final_turns should be set to (num_players - 1)"""
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
        
        # Call cactus
        cactus_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "cactus"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        assert cactus_response.status_code == 200
        game_state = cactus_response.json()["game_state"]
        
        # With 2 players (user + bot), remaining_final_turns should be 1
        num_players = len(game_state["players"])
        assert game_state.get("remaining_final_turns") == num_players - 1, \
            f"Expected remaining_final_turns={num_players - 1}, got {game_state.get('remaining_final_turns')}"
    
    def test_cactus_turn_moves_to_next_player(self, auth_token):
        """After calling cactus, turn should immediately move to next player"""
        create_response = requests.post(f"{BASE_URL}/api/game/create-room", json={
            "cards_per_player": 4,
            "visible_at_start": 2,
            "mode": "bot"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        room_code = create_response.json()["room_code"]
        
        start_response = requests.post(f"{BASE_URL}/api/game/start/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"}, json={})
        initial_game_state = start_response.json()["game_state"]
        initial_player_index = initial_game_state["current_player_index"]
        
        for i in range(2):
            requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "reveal_card",
                "card_index": i
            }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Call cactus
        cactus_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "cactus"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        game_state = cactus_response.json()["game_state"]
        
        # Turn should have moved to next player
        expected_next = (initial_player_index + 1) % len(game_state["players"])
        assert game_state["current_player_index"] == expected_next, \
            f"Expected turn to move to player {expected_next}, but it's at {game_state['current_player_index']}"
    
    def test_remaining_final_turns_decrements_to_end_game(self, auth_token):
        """After cactus, game should end when remaining_final_turns reaches 0"""
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
        
        # Call cactus - bot should play and then game should end
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "cactus"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Wait for bot to complete its turn
        time.sleep(2)
        
        # Check game state
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        
        game_state = room_response.json()["game_state"]
        
        # Game should have ended after bot's final turn
        assert game_state["phase"] == "ended", \
            f"Expected phase 'ended', got '{game_state.get('phase')}'"
        assert game_state.get("remaining_final_turns", 1) <= 0, \
            f"remaining_final_turns should be 0 or less, got {game_state.get('remaining_final_turns')}"


class TestFastDiscardOnOpponent:
    """Test fast discard on opponent cards with pending_give_card"""
    
    def test_successful_fast_discard_sets_pending_give_card(self, auth_token, test_user_info):
        """When fast discard on opponent succeeds, pending_give_card should be set"""
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
        
        # Get current game state to find a matching card
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        game_state = room_response.json()["game_state"]
        
        # Get top discard card
        if not game_state["discard_pile"]:
            pytest.skip("No discard pile to test with")
        
        top_discard = game_state["discard_pile"][-1]
        top_value = top_discard["value"]
        
        # Find bot player
        bot_player = next((p for p in game_state["players"] if p.get("is_bot")), None)
        if not bot_player:
            pytest.skip("No bot player found")
        
        # Try fast discard on each bot card until we find a match
        # Note: This might fail if no bot card matches, which is expected
        found_match = False
        for idx, card in enumerate(bot_player["hand"]):
            if card["value"] == top_value:
                # Attempt fast discard
                fast_discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "fast_discard",
                    "target_player": "bot",
                    "target_card_index": idx
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                if fast_discard_response.status_code == 200:
                    result_state = fast_discard_response.json()["game_state"]
                    
                    # Check pending_give_card is set
                    pending = result_state.get("pending_give_card")
                    assert pending is not None, "pending_give_card should be set after successful fast discard"
                    assert pending["from_player"] == test_user_info["user_id"], \
                        "pending_give_card.from_player should be current user"
                    assert pending["to_player"] == "bot", \
                        "pending_give_card.to_player should be the target (bot)"
                    found_match = True
                    break
        
        if not found_match:
            # Test the structure by manually testing with potential mismatch
            # Fast discard with wrong card should add card to player's hand
            fast_discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "fast_discard",
                "target_player": "bot",
                "target_card_index": 0
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if fast_discard_response.status_code == 200:
                result_state = fast_discard_response.json()["game_state"]
                # If mismatch, no pending_give_card but player gets a card
                print(f"Fast discard result (no match): pending_give_card={result_state.get('pending_give_card')}")
            
            pytest.skip("No matching card found in bot's hand for testing pending_give_card")
    
    def test_give_card_action_transfers_card(self, auth_token, test_user_info):
        """Test that give_card action transfers a card to opponent"""
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
        
        # Get game state
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        game_state = room_response.json()["game_state"]
        
        if not game_state["discard_pile"]:
            pytest.skip("No discard pile")
        
        top_value = game_state["discard_pile"][-1]["value"]
        bot_player = next((p for p in game_state["players"] if p.get("is_bot")), None)
        
        # Try to find matching card
        for idx, card in enumerate(bot_player["hand"]):
            if card["value"] == top_value:
                # Execute fast discard
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "fast_discard",
                    "target_player": "bot",
                    "target_card_index": idx
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                # Get updated state
                room_response2 = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
                    headers={"Authorization": f"Bearer {auth_token}"})
                state2 = room_response2.json()["game_state"]
                
                if state2.get("pending_give_card"):
                    # Now give a card
                    my_player = next((p for p in state2["players"] if p["user_id"] == test_user_info["user_id"]))
                    my_hand_before = len(my_player["hand"])
                    
                    give_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                        "action_type": "give_card",
                        "card_index": 0
                    }, headers={"Authorization": f"Bearer {auth_token}"})
                    
                    assert give_response.status_code == 200, f"Give card failed: {give_response.text}"
                    result_state = give_response.json()["game_state"]
                    
                    # pending_give_card should be cleared
                    assert result_state.get("pending_give_card") is None, \
                        "pending_give_card should be None after give_card"
                    
                    # My hand should have one less card
                    my_player_after = next((p for p in result_state["players"] if p["user_id"] == test_user_info["user_id"]))
                    assert len(my_player_after["hand"]) == my_hand_before - 1, \
                        "Player's hand should have one less card after giving"
                    
                    return
        
        pytest.skip("No matching card found for complete give_card test")


class TestSpecialCards:
    """Test special cards (8, 10, J) set special_card_available"""
    
    def test_discard_8_sets_special_available(self, auth_token, test_user_info):
        """Discarding an 8 should set special_card_available and special_card_type='8'"""
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
        
        # Keep drawing until we get an 8, 10, or J
        max_attempts = 20
        special_values = ['8', '10', 'J']
        
        for attempt in range(max_attempts):
            # Draw from deck
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                # Might be bot's turn, wait and retry
                time.sleep(1.5)
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] in special_values:
                # Found a special card, discard it
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                assert discard_response.status_code == 200, f"Discard failed: {discard_response.text}"
                result_state = discard_response.json()["game_state"]
                
                # Verify special_card_available is set
                assert result_state.get("special_card_available") == True, \
                    f"special_card_available should be True after discarding {drawn_card['value']}"
                assert result_state.get("special_card_player") == test_user_info["user_id"], \
                    "special_card_player should be current user"
                assert result_state.get("special_card_type") == drawn_card["value"], \
                    f"special_card_type should be '{drawn_card['value']}'"
                
                print(f"Successfully verified special card: {drawn_card['value']}")
                return
            
            # Not a special card, discard and let bot play
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            # Wait for bot turn
            time.sleep(1.5)
        
        pytest.skip("Could not draw a special card (8, 10, or J) in 20 attempts")
    
    def test_special_look_own_with_jack(self, auth_token, test_user_info):
        """Test special_look_own action reveals player's own card"""
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
        
        # Try to find and discard a Jack
        max_attempts = 20
        for attempt in range(max_attempts):
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                time.sleep(1.5)
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] == 'J':
                # Discard the Jack
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                result_state = discard_response.json()["game_state"]
                
                if result_state.get("special_card_type") == 'J':
                    # Now use special_look_own
                    look_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                        "action_type": "special_look_own",
                        "card_index": 0
                    }, headers={"Authorization": f"Bearer {auth_token}"})
                    
                    assert look_response.status_code == 200, f"special_look_own failed: {look_response.text}"
                    look_state = look_response.json()["game_state"]
                    
                    # Check special_reveal is set
                    special_reveal = look_state.get("special_reveal")
                    assert special_reveal is not None, "special_reveal should be set"
                    assert special_reveal.get("type") == "look_own"
                    assert special_reveal.get("card_index") == 0
                    assert "card" in special_reveal, "Card info should be revealed"
                    
                    print(f"Successfully verified special_look_own: revealed card {special_reveal['card']}")
                    return
            
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            time.sleep(1.5)
        
        pytest.skip("Could not draw a Jack in 20 attempts")
    
    def test_special_look_opponent_with_8(self, auth_token):
        """Test special_look_opponent action reveals opponent's card"""
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
        
        max_attempts = 20
        for attempt in range(max_attempts):
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                time.sleep(1.5)
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] == '8':
                # Discard the 8
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                result_state = discard_response.json()["game_state"]
                
                if result_state.get("special_card_type") == '8':
                    # Now use special_look_opponent on bot
                    look_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                        "action_type": "special_look_opponent",
                        "target_player": "bot",
                        "target_card_index": 0
                    }, headers={"Authorization": f"Bearer {auth_token}"})
                    
                    assert look_response.status_code == 200, f"special_look_opponent failed: {look_response.text}"
                    look_state = look_response.json()["game_state"]
                    
                    special_reveal = look_state.get("special_reveal")
                    assert special_reveal is not None, "special_reveal should be set"
                    assert special_reveal.get("type") == "look_opponent"
                    assert special_reveal.get("target_player") == "bot"
                    assert "card" in special_reveal, "Card info should be revealed"
                    
                    print(f"Successfully verified special_look_opponent: revealed card {special_reveal['card']}")
                    return
            
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            time.sleep(1.5)
        
        pytest.skip("Could not draw an 8 in 20 attempts")
    
    def test_special_swap_with_10(self, auth_token, test_user_info):
        """Test special_swap action exchanges cards with opponent"""
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
        
        max_attempts = 20
        for attempt in range(max_attempts):
            draw_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                "action_type": "draw_deck"
            }, headers={"Authorization": f"Bearer {auth_token}"})
            
            if draw_response.status_code != 200:
                time.sleep(1.5)
                continue
            
            game_state = draw_response.json()["game_state"]
            drawn_card = game_state.get("drawn_card")
            
            if drawn_card and drawn_card["value"] == '10':
                # Discard the 10
                discard_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
                
                result_state = discard_response.json()["game_state"]
                
                if result_state.get("special_card_type") == '10':
                    # Get cards before swap
                    my_player = next((p for p in result_state["players"] if p["user_id"] == test_user_info["user_id"]))
                    bot_player = next((p for p in result_state["players"] if p.get("is_bot")))
                    my_card_before = my_player["hand"][0]
                    bot_card_before = bot_player["hand"][0]
                    
                    # Swap cards
                    swap_response = requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                        "action_type": "special_swap",
                        "card_index": 0,
                        "target_player": "bot",
                        "target_card_index": 0
                    }, headers={"Authorization": f"Bearer {auth_token}"})
                    
                    assert swap_response.status_code == 200, f"special_swap failed: {swap_response.text}"
                    swap_state = swap_response.json()["game_state"]
                    
                    # Verify cards were swapped
                    my_player_after = next((p for p in swap_state["players"] if p["user_id"] == test_user_info["user_id"]))
                    bot_player_after = next((p for p in swap_state["players"] if p.get("is_bot")))
                    
                    assert my_player_after["hand"][0] == bot_card_before, \
                        "My card should now be bot's previous card"
                    assert bot_player_after["hand"][0] == my_card_before, \
                        "Bot's card should now be my previous card"
                    
                    print(f"Successfully verified special_swap: exchanged {my_card_before} with {bot_card_before}")
                    return
            
            if drawn_card:
                requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
                    "action_type": "discard_drawn"
                }, headers={"Authorization": f"Bearer {auth_token}"})
            
            time.sleep(1.5)
        
        pytest.skip("Could not draw a 10 in 20 attempts")


class TestGameEndScoring:
    """Test that game end calculates scores correctly"""
    
    def test_game_ended_has_round_scores(self, auth_token):
        """When game ends, players should have round_score calculated"""
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
        
        # Call cactus to trigger end game
        requests.post(f"{BASE_URL}/api/game/action/{room_code}", json={
            "action_type": "cactus"
        }, headers={"Authorization": f"Bearer {auth_token}"})
        
        # Wait for bot to finish and game to end
        time.sleep(2)
        
        # Get final state
        room_response = requests.get(f"{BASE_URL}/api/game/room/{room_code}", 
            headers={"Authorization": f"Bearer {auth_token}"})
        game_state = room_response.json()["game_state"]
        
        assert game_state["phase"] == "ended", f"Expected phase 'ended', got '{game_state['phase']}'"
        
        # Check that round_score is calculated for each player
        for player in game_state["players"]:
            assert "round_score" in player, f"Player {player['username']} should have round_score"
            # Calculate expected score
            expected_score = sum(get_card_value(card) for card in player["hand"])
            assert player["round_score"] == expected_score, \
                f"Player {player['username']} round_score {player['round_score']} != expected {expected_score}"
        
        print(f"Game ended with scores: {[(p['username'], p['round_score']) for p in game_state['players']]}")


# Helper function for score calculation
def get_card_value(card):
    card_values = {
        'K': 0, 'A': 1, '2': -2, '3': 3, '4': 4, '5': 5,
        '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10
    }
    return card_values.get(card['value'], 0)


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


@pytest.fixture
def test_user_info():
    """Get test user info using USERNAME"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "testuser123",  # UPDATED: Using username instead of email
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json()["user"]
    pytest.skip("Could not get test user info")
