import requests
import sys
import json
from datetime import datetime

class CactusAPITester:
    def __init__(self, base_url="https://cactus-build.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.room_code = None
        self.created_user_email = None

    def run_test(self, name, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        if description:
            print(f"   {description}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                return success, response.json() if response.content else {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.content:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_user_registration(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        test_email = f"test_user_{timestamp}@example.com"
        self.created_user_email = test_email
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "username": f"TestUser_{timestamp}",
                "email": test_email,
                "password": "TestPass123!"
            },
            description="Testing user registration with unique credentials"
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response['user']
            return True
        return False

    def test_user_login(self):
        """Test user login"""
        if not self.created_user_email:
            print("❌ Skipping login test - no registered user")
            return False
            
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": self.created_user_email,
                "password": "TestPass123!"
            },
            description="Testing login with registered credentials"
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_data = response['user']
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200,
            description="Testing authenticated user info retrieval"
        )
        return success

    def test_create_multiplayer_room(self):
        """Test creating a multiplayer room"""
        success, response = self.run_test(
            "Create Multiplayer Room",
            "POST",
            "game/create-room",
            200,
            data={
                "cards_per_player": 4,
                "visible_at_start": 2,
                "score_threshold": 60,
                "mode": "multiplayer"
            },
            description="Testing multiplayer room creation with custom config"
        )
        
        if success and 'room_code' in response:
            self.room_code = response['room_code']
            return True
        return False

    def test_create_bot_room(self):
        """Test creating a bot room"""
        success, response = self.run_test(
            "Create Bot Room",
            "POST",
            "game/create-room",
            200,
            data={
                "cards_per_player": 4,
                "visible_at_start": 2,
                "score_threshold": 60,
                "mode": "bot",
                "bot_difficulty": "medium"
            },
            description="Testing bot room creation with medium difficulty"
        )
        return success

    def test_get_room_info(self):
        """Test getting room information"""
        if not self.room_code:
            print("❌ Skipping room info test - no room created")
            return False
            
        success, response = self.run_test(
            "Get Room Info",
            "GET",
            f"game/room/{self.room_code}",
            200,
            description=f"Testing room info retrieval for room {self.room_code}"
        )
        return success

    def test_join_room(self):
        """Test joining a room"""
        if not self.room_code:
            print("❌ Skipping join room test - no room created")
            return False
            
        success, response = self.run_test(
            "Join Room",
            "POST",
            "game/join-room",
            200,
            data={
                "code": self.room_code,
                "username": self.user_data.get('username', 'TestUser')
            },
            description=f"Testing joining room {self.room_code}"
        )
        return success

    def test_start_game(self):
        """Test starting a game"""
        if not self.room_code:
            print("❌ Skipping start game test - no room created")
            return False
            
        success, response = self.run_test(
            "Start Game",
            "POST",
            f"game/start/{self.room_code}",
            200,
            data={},
            description=f"Testing game start for room {self.room_code}"
        )
        return success

    def test_user_stats(self):
        """Test getting user statistics"""
        success, response = self.run_test(
            "Get User Stats",
            "GET",
            "stats/user",
            200,
            description="Testing user statistics retrieval"
        )
        return success

    def test_game_rules(self):
        """Test getting game rules"""
        success, response = self.run_test(
            "Get Game Rules",
            "GET",
            "admin/rules",
            200,
            description="Testing game rules retrieval"
        )
        return success

    def test_forgot_password(self):
        """Test forgot password functionality"""
        success, response = self.run_test(
            "Forgot Password",
            "POST",
            "auth/forgot-password",
            200,
            data={
                "email": self.created_user_email or "test@example.com"
            },
            description="Testing forgot password request"
        )
        return success

    def test_admin_endpoints_unauthorized(self):
        """Test admin endpoints without admin privileges"""
        success, response = self.run_test(
            "Admin Global Stats (Should Fail)",
            "GET",
            "stats/global",
            403,
            description="Testing admin endpoint access without admin privileges (should fail)"
        )
        return success

    def test_duplicate_email_registration(self):
        """Test email uniqueness validation"""
        if not self.created_user_email:
            print("❌ Skipping duplicate email test - no registered user")
            return False
            
        success, response = self.run_test(
            "Duplicate Email Registration (Should Fail)",
            "POST",
            "auth/register",
            400,
            data={
                "username": "AnotherUser",
                "email": self.created_user_email,  # Same email as before
                "password": "TestPass123!"
            },
            description="Testing email uniqueness validation (should fail with 400)"
        )
        return success

    def test_initial_card_revelation(self):
        """Test initial card revelation in game"""
        if not self.room_code:
            print("❌ Skipping card revelation test - no room created")
            return False
            
        # First ensure game is started and in initial_reveal phase
        success, response = self.run_test(
            "Reveal Card Action",
            "POST",
            f"game/action/{self.room_code}",
            200,
            data={
                "action_type": "reveal_card",
                "card_index": 0
            },
            description="Testing initial card revelation gameplay"
        )
        return success

    def test_draw_deck_action(self):
        """Test drawing card from deck"""
        if not self.room_code:
            print("❌ Skipping draw deck test - no room created")
            return False
            
        success, response = self.run_test(
            "Draw from Deck",
            "POST",
            f"game/action/{self.room_code}",
            200,
            data={
                "action_type": "draw_deck"
            },
            description="Testing drawing card from deck"
        )
        return success

    def test_exchange_card_action(self):
        """Test exchanging drawn card with hand"""
        if not self.room_code:
            print("❌ Skipping exchange card test - no room created")
            return False
            
        success, response = self.run_test(
            "Exchange Card",
            "POST",
            f"game/action/{self.room_code}",
            200,
            data={
                "action_type": "exchange",
                "card_index": 1
            },
            description="Testing card exchange between drawn card and hand"
        )
        return success

def main():
    """Run all backend API tests"""
    print("🌵 Starting Cactus Game Backend API Tests 🌵")
    print("=" * 50)
    
    tester = CactusAPITester()
    
    # Authentication Tests
    print("\n📝 AUTHENTICATION TESTS")
    print("-" * 30)
    
    if not tester.test_user_registration():
        print("❌ Registration failed, stopping tests")
        return 1
    
    tester.test_user_login()
    tester.test_get_current_user()
    tester.test_forgot_password()
    
    # Game Room Tests
    print("\n🎮 GAME ROOM TESTS")
    print("-" * 30)
    
    tester.test_create_multiplayer_room()
    tester.test_create_bot_room()
    tester.test_get_room_info()
    tester.test_join_room()
    tester.test_start_game()
    
    # Stats and Rules Tests
    print("\n📊 STATS & RULES TESTS")
    print("-" * 30)
    
    tester.test_user_stats()
    tester.test_game_rules()
    tester.test_admin_endpoints_unauthorized()
    
    # Game Flow Tests - Test specific game features mentioned in review
    print("\n🃏 GAME FLOW TESTS")
    print("-" * 30)
    
    tester.test_duplicate_email_registration()
    tester.test_initial_card_revelation()
    tester.test_draw_deck_action()
    tester.test_exchange_card_action()
    
    # Final Results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        failed_tests = tester.tests_run - tester.tests_passed
        print(f"⚠️  {failed_tests} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())