import string, random
import pytest
from adventure import *
from entities import Entity, Room, Item, World, NoEntityLinkException
from items import Money, Wearable, Useable, Eatable, Computer, Phone, Weapon
from characters import Character, NonPlayerCharacter

class MockGame:
    """Mock game class for testing"""
    def __init__(self):
        self.outputs = []

    def output(self, *args, **kwargs):
        message = " ".join(str(arg) for arg in args)
        self.outputs.append(message)
        return message

def randtext(k=5):
    """Generate random text for unique entity names"""
    return ''.join(random.choices(string.ascii_letters, k=k))

@pytest.fixture
def mock_game():
    """Fixture to provide a fresh mock game for each test"""
    return MockGame()

@pytest.fixture
def world(mock_game):
    """Fixture to provide a fresh world for each test"""
    return World(game=mock_game, warn=False)

@pytest.fixture
def player(mock_game, world):
    """Fixture to provide a fresh player for each test"""
    return Character("test_player", "Test Player", game=mock_game, world=world, warn=False)

@pytest.fixture
def room(mock_game, world, player):
    """Fixture to provide a fresh room for each test"""
    room = Room("test_room", "Test Room", game=mock_game, world=world, player=player, warn=False)
    player.go(room, check_link=False)
    return room

@pytest.fixture
def item(mock_game, world, player):
    """Fixture to provide a fresh item for each test"""
    return Item("test_item", "Test Item", game=mock_game, world=world, player=player, warn=False)

def create_entity(cls, world, mock_game, name=None, description=None):
    """Create a new entity without relying on global state"""
    if name is None:
        name = randtext()
    if description is None:
        description = randtext(k=20)

    entity = cls(name, description, game=mock_game, world=world, warn=False)
    return entity

def create_entity_tree(cls, world, mock_game, depth=3, display=False, root=None):
    """Create a tree of entities without relying on global state"""
    if root is None:
        root = create_entity(cls, world, mock_game)

    for _ in range(depth):
        for e1_name in list(root.traverse(entities={root.name: root})):
            # Get the actual entity object, not just the name
            e1 = cls.get(e1_name, world=world)
            e2 = create_entity(cls, world, mock_game)
            e1.link(e2)
            e2.link(e1)

    if display:
        for e in list(world.linked.values()):
            print("NAME", e.name, "LINKED", e.linked)
        print("DEPTH", depth, 'NUM OF ENTITIES TOTAL', len(world.linked))

    return root

# Legacy functions for backward compatibility
# These should be removed once all tests are updated to use fixtures

def wipe_world():
    """Legacy function - no longer needed with isolated tests"""
    pass

def dummy(cls = Entity, world=None, mock_game=None):
    """Legacy function - use create_entity instead"""
    if world is None:
        # Fall back to global state if no world is provided
        if Entity.world is None:
            test_world_exists()
        world = Entity.world

    if mock_game is None:
        mock_game = MockGame()

    return create_entity(cls, world, mock_game)

def dummy_tree(cls = Entity, depth=3, display=False, root=None, world=None, mock_game=None):
    """Legacy function - use create_entity_tree instead"""
    if world is None:
        # Fall back to global state if no world is provided
        if Entity.world is None:
            test_world_exists()
        world = Entity.world

    if mock_game is None:
        mock_game = MockGame()

    return create_entity_tree(cls, world, mock_game, depth, display, root)

def test_world_exists():
    """Legacy function - use the world fixture instead"""
    # This function is now a no-op
    # It's kept for backward compatibility
    pass
