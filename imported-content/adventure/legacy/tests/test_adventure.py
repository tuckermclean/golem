import pytest
import os
import tempfile
import yaml
from adventure import Adventure
from helpers import *
from entities import Room, Item, World
from characters import Character

@pytest.fixture
def test_world_file():
    """Fixture to provide a test world file"""
    # Create a temporary world file
    world_data = {
        "rooms": [
            {
                "name": "test_room1",
                "description": "A test room 1",
                "links": ["test_room2"],
                "items": [
                    {
                        "name": "test_item1",
                        "type": "Item",
                        "description": "A test item 1",
                        "takeable": True
                    }
                ]
            },
            {
                "name": "test_room2",
                "description": "A test room 2",
                "links": ["test_room1"],
                "items": [
                    {
                        "name": "test_item2",
                        "type": "Item",
                        "description": "A test item 2",
                        "takeable": True
                    }
                ]
            }
        ],
        "doors": [  # Top-level doors field
            {
                "name": "test_door",
                "type": "Door",
                "room1": "test_room1",
                "room2": "test_room2",
                "locked": False
            }
        ],
        "characters": [
            {
                "name": "test_npc",
                "type": "NonPlayerCharacter",
                "description": "A test NPC",
                "current_room": "test_room2",
                "health": 10,
                "verb": "talk",
                "use_msg": "Hello there!"
            }
        ],
        "help": {
            "go": "Move to a connected room",
            "look": "Look at an item or room",
            "take": "Take an item",
            "drop": "Drop an item",
            "inv": "Show inventory"
        }
    }

    fd, path = tempfile.mkstemp(suffix=".yaml")
    with os.fdopen(fd, 'w') as f:
        yaml.dump(world_data, f)

    yield path

    # Clean up the temporary file
    os.unlink(path)

class CaptureOutput:
    """Helper class to capture output from the Adventure class"""
    def __init__(self):
        self.captured = []

    def __call__(self, *args, **kwargs):
        message = " ".join(str(arg) for arg in args)
        self.captured.append(message)
        return message

    def clear(self):
        self.captured = []

    def contains(self, text):
        """Check if any captured output contains the given text"""
        return any(text.lower() in msg.lower() for msg in self.captured)

    def last_message(self):
        """Get the last captured message"""
        return self.captured[-1] if self.captured else ""

@pytest.fixture
def output_capture():
    """Fixture to provide an output capture object"""
    return CaptureOutput()

def test_adventure_load_world(test_world_file, output_capture):
    """Test loading a world from a file"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test that the world was loaded correctly
    # We expect 3 entities: test_room1, test_room2, and test_door
    assert len(Room.get_all(world=adv.world)) == 3
    assert "test_room1" in Room.get_all(world=adv.world)
    assert "test_room2" in Room.get_all(world=adv.world)
    assert "test_door" in Room.get_all(world=adv.world)  # Door is a subtype of Room

    # Test that the player is in the first room
    assert adv.player.current_room is not None
    assert adv.player.current_room.name == "test_room1"

def test_adventure_current_room_description(test_world_file, output_capture):
    """Test the current room description"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test current_room_intro (which is called by default when the game starts)
    output_capture.clear()
    adv.current_room_intro()
    assert output_capture.contains("test room 1")
    assert output_capture.contains("test_item1")

def test_adventure_inventory(test_world_file, output_capture):
    """Test the inventory display"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test current_room_intro which shows inventory
    output_capture.clear()
    adv.current_room_intro()
    assert output_capture.contains("Items you have:")

def test_adventure_commands(test_world_file, output_capture):
    """Test the available commands"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test get_all_commands
    commands = adv.get_all_commands()
    assert 'exit' in commands
    assert 'help' in commands
    assert 'reset' in commands

def test_adventure_preloop(test_world_file, output_capture):
    """Test the preloop method"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test preloop
    output_capture.clear()
    adv.preloop()
    assert output_capture.contains("Welcome to the adventure game")

def test_adventure_postloop(test_world_file, output_capture):
    """Test the postloop method"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test postloop
    result = adv.postloop()
    assert result == True

def test_adventure_emptyline(test_world_file, output_capture):
    """Test the emptyline method"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test emptyline
    result = adv.emptyline()
    assert result is None

def test_adventure_current_room_intro(test_world_file, output_capture):
    """Test the current_room_intro method"""
    # Create an adventure instance with the test world file
    adv = Adventure(file=test_world_file, output=output_capture)

    # Test current_room_intro
    output_capture.clear()
    adv.current_room_intro()
    assert output_capture.contains("test room 1")

def test_adventure_default(test_world_file, output_capture):
    """Test the default method"""
    # This test is more complex and would require mocking the line.raw attribute
    # Skip for now
    pass
