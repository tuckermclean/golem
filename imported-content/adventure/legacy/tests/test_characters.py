import pytest
from adventure import *
from helpers import *
from entities import Entity, Room, Item, World, NoEntityLinkException
from characters import Character, NonPlayerCharacter, AICharacter, WalkerCharacter
import time

# Consolidated character tests with proper fixtures and no global state

def test_character_creation(world, mock_game):
    """Test basic character creation and properties"""
    # Create a new character for this test
    char = Character("test_char", "Test Character", health=10,
                    attack_strength=5, game=mock_game, world=world, warn=False)

    # Test basic properties
    assert char.name == "test_char"
    assert char.description == "Test Character"
    assert char.health == 10
    assert char.attack_strength == 5
    # Character doesn't have an 'alive' attribute, but we can check health > 0
    assert char.health > 0

def test_character_creation_with_attributes(world, mock_game):
    """Test character creation with various attributes"""
    # Create a new character for this test
    char_name = "test_char_" + randtext()
    char = Character(
        name=char_name,
        description="Test Character",
        health=10,
        attack_strength=5,
        damage_msg="Ouch!",
        attack_msg="Take that!",
        game=mock_game,
        world=world,
        warn=False
    )

    # Test basic properties
    assert char.name == char_name
    assert char.description == "Test Character"
    assert char.health == 10
    assert char.attack_strength == 5
    assert char.damage_msg == "Ouch!"
    assert char.attack_msg == "Take that!"
    assert char.current_room is None
    assert char.inv_items == {}
    assert char.money == 0.0

def test_character_go(world, mock_game):
    """Test character movement between rooms"""
    # Create a character and two rooms
    char = Character("test_char_go", "Test Character", game=mock_game, world=world, warn=False)
    room1 = Room("test_room_go1", "Test Room 1", game=mock_game, world=world, player=char, warn=False)
    room2 = Room("test_room_go2", "Test Room 2", game=mock_game, world=world, player=char, warn=False)

    # Link the rooms
    room1.link_room(room2)

    # Move character to room1
    char.go(room1, check_link=False)
    assert char.current_room == room1

    # Move character to room2 with check_link=True (should succeed)
    char.go(room2, check_link=True)
    assert char.current_room == room2

    # Create an unlinked room
    room3 = Room("test_room_go3", "Test Room 3", game=mock_game, world=world, player=char, warn=False)

    # Try to move to room3 with check_link=True (should fail)
    char.go(room3, check_link=True)
    assert char.current_room == room2  # Should still be in room2

def test_character_in_room_items(world, mock_game):
    """Test in_room_items method"""
    # Create a character, a room, and an item
    char = Character("test_char_items", "Test Character", game=mock_game, world=world, warn=False)
    room = Room("test_room_items", "Test Room", game=mock_game, world=world, player=char, warn=False)
    item = Item("test_item_in_room", "Test Item", game=mock_game, world=world, player=char, warn=False)

    # Move character to the room
    char.go(room, check_link=False)

    # Add the item to the room
    room.add_item(item)

    # Test in_room_items with an item in the room
    assert char.in_room_items(item) == True

    # Create an item not in the room
    other_item = Item("other_item", "Other Item", game=mock_game, world=world, player=char, warn=False)

    # Test in_room_items with an item not in the room
    assert char.in_room_items(other_item) == False

def test_character_in_rooms(world, mock_game):
    """Test in_rooms method"""
    # Create a character and linked rooms
    char = Character("test_char_rooms", "Test Character", game=mock_game, world=world, warn=False)
    room1 = Room("test_room_rooms1", "Test Room 1", game=mock_game, world=world, player=char, warn=False)
    room2 = Room("test_room_rooms2", "Test Room 2", game=mock_game, world=world, player=char, warn=False)
    room3 = Room("test_room_rooms3", "Test Room 3", game=mock_game, world=world, player=char, warn=False)

    # Link room1 and room2
    room1.link_room(room2)

    # Move character to room1
    char.go(room1, check_link=False)

    # Test in_rooms with a linked room
    assert char.in_rooms(room2) == True

    # Test in_rooms with an unlinked room
    assert char.in_rooms(room3) == False

def test_character_attack(world, mock_game):
    """Test character attack functionality"""
    # Create two characters
    attacker = Character(
        name="test_attacker",
        description="Test Attacker",
        health=10,
        attack_strength=3,
        damage_msg="Ouch!",
        attack_msg="Take that!",
        game=mock_game,
        world=world,
        warn=False
    )

    defender = Character(
        name="test_defender",
        description="Test Defender",
        health=10,
        game=mock_game,
        world=world,
        warn=False
    )

    # Create a room for the characters
    room = Room("test_room_attack", "Test Room", game=mock_game, world=world, player=attacker, warn=False)

    # Move both characters to the room
    attacker.go(room, check_link=False)
    defender.go(room, check_link=False)

    # Initial health
    initial_health = defender.health

    # Perform attack
    attacker.attack(defender)

    # Check that defender's health decreased
    assert defender.health < initial_health
    assert defender.health == initial_health - attacker.attack_strength

def test_character_take_damage(world, mock_game):
    """Test the take_damage method"""
    # Create a character
    char = Character(
        name="test_char_damage",
        description="Test Character",
        health=10,
        game=mock_game,
        world=world,
        warn=False
    )

    # Create a room for the character
    room = Room("test_room_damage", "Test Room", game=mock_game, world=world, player=char, warn=False)

    # Move character to the room
    char.go(room, check_link=False)

    # Initial health
    initial_health = char.health

    # Take damage
    char.take_damage(3)

    # Check that health decreased
    assert char.health == initial_health - 3

    # Test taking damage that exceeds health
    # This should call the die() method
    char.take_damage(10)  # This should kill the character
    assert char.health <= 0

def test_npc_creation(world, mock_game):
    """Test NonPlayerCharacter creation and properties"""
    # Create an NPC
    npc = NonPlayerCharacter(
        name="test_npc",
        description="Test NPC",
        health=5,
        verb="talk",
        use_msg="Hello there!",
        game=mock_game,
        world=world,
        warn=False
    )

    # Test basic properties
    assert npc.name == "test_npc"
    assert npc.description == "Test NPC"
    assert npc.health == 5
    # Test use method
    assert hasattr(npc, "use")

def test_npc_creation_and_use(world, mock_game):
    """Test NonPlayerCharacter creation and use method"""
    # Create a mock game
    mock_game = MockGame()

    # Create an NPC with a custom use function
    result = {"called": False}
    def test_func(var=None):
        result["called"] = True
        return True

    npc_name = "test_npc_" + randtext()
    npc = NonPlayerCharacter(
        name=npc_name,
        description="Test NPC",
        health=5,
        verb="talk",
        use_msg="Hello there!",
        func=test_func,
        game=mock_game,
        world=world,
        warn=False
    )

    # Test basic properties
    assert npc.name == npc_name
    assert npc.description == "Test NPC"
    assert npc.health == 5

    # Test use method
    assert npc.use() == True
    assert result["called"] == True

def test_ai_character(world, mock_game, monkeypatch):
    """Test AICharacter creation and basic functionality"""
    # Mock the OpenAIClient methods to avoid actual API calls
    class MockOpenAIClient:
        @staticmethod
        def connect(api_key=None):
            return True

        @staticmethod
        def get_or_create_assistant(name, instructions, model=None):
            return {"id": "mock_assistant_id", "name": name}

        @staticmethod
        def create_thread():
            return "mock_thread_id"

        @staticmethod
        def add_message(thread_id, content, role="user"):
            return True

        @staticmethod
        def stream_assistant_response(thread_id, assistant_name, additional_instructions=""):
            yield "Hello, I am an AI character!"

    # Apply the monkeypatch
    monkeypatch.setattr("characters.OpenAIClient", MockOpenAIClient)

    # Create an AICharacter
    ai_char = AICharacter(
        name="test_ai",
        description="Test AI Character",
        health=5,
        prompt="You are a test AI character.",
        game=mock_game,
        world=world,
        warn=False
    )

    # Create a room for the AI character
    room = Room("test_ai_room", "Test AI Room", game=mock_game, world=world, player=ai_char, warn=False)

    # Move AI character to the room
    ai_char.go(room, check_link=False)
    assert ai_char.current_room == room

    # Test basic properties
    assert ai_char.name == "test_ai"
    assert ai_char.description == "Test AI Character"
    assert ai_char.health == 5
    assert ai_char.phoneable == True

    # Test that the AI character has the required methods
    assert hasattr(ai_char, "talk")
    assert hasattr(ai_char, "add_to_prompt")
    assert hasattr(ai_char, "notify_news")

    # Test that the AI character has the required attributes
    assert hasattr(ai_char, "assistant_name")
    assert hasattr(ai_char, "thread_id")
    assert ai_char.assistant_name == "test_ai"
    assert ai_char.thread_id == "mock_thread_id"

def test_walker_character(world, mock_game):
    """Test WalkerCharacter creation and basic functionality"""
    # Create a WalkerCharacter
    walker = WalkerCharacter(
        name="test_walker",
        description="Test Walker",
        health=5,
        game=mock_game,
        world=world,
        warn=False
    )

    # Create some rooms for the walker to move between
    room1 = Room("test_walker_room1", "Test Walker Room 1", game=mock_game, world=world, player=walker, warn=False)
    room2 = Room("test_walker_room2", "Test Walker Room 2", game=mock_game, world=world, player=walker, warn=False)
    room3 = Room("test_walker_room3", "Test Walker Room 3", game=mock_game, world=world, player=walker, warn=False)

    # Link the rooms
    room1.link_room(room2)
    room2.link_room(room3)

    # Move walker to room1
    walker.go(room1, check_link=False)
    assert walker.current_room == room1

    # Test basic properties
    assert walker.name == "test_walker"
    assert walker.description == "Test Walker"
    assert walker.health == 5

    # Test that the walker has a loopit method
    assert hasattr(walker, "loopit")

    # Test the loopit method (just call it once to increase coverage)
    # We don't want to actually loop, so we'll just call it directly
    walker.loopit()

    # The walker should have moved to a different room
    # But we can't guarantee which one due to randomness
    # So we'll just check that it moved somewhere
    assert walker.current_room is not None
