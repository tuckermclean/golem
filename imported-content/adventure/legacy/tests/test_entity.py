import pytest
from adventure import *
from helpers import *
from entities import Entity, Room, Item, World, NoEntityLinkException, EntityLinkException, Door

@pytest.fixture
def world():
    """Fixture to provide a fresh world for each test"""
    return World(warn=False)

@pytest.fixture
def mock_game():
    """Fixture to provide a mock game for each test"""
    return MockGame()

@pytest.fixture
def player(world, mock_game):
    """Fixture to provide a player for each test"""
    player = Character(name="player", description="Test Player", game=mock_game, world=world, warn=False)
    return player

def test_entity_creation(world, mock_game):
    """Test creating an entity with a fresh world"""
    # Create a new entity
    entity_name = "test_entity_" + randtext()
    entity = Entity(entity_name, "Test Entity", game=mock_game, world=world, warn=False)

    # Test that the entity was created and linked to the world
    assert entity.name == entity_name
    assert entity.description == "Test Entity"
    assert entity.name in world.linked
    assert world.linked[entity.name] == entity

def test_entity_link(world, mock_game):
    """Test linking entities with a fresh world"""
    # Create two entities
    e1 = create_entity(Entity, world, mock_game)
    e2 = create_entity(Entity, world, mock_game)

    # Link the entities
    e1.link(e2)

    # Test that the entities are linked
    assert e2.name in e1.linked
    assert e1.linked[e2.name] == e2

def test_entity_get_linked(world, mock_game):
    """Test get_linked method with a fresh world"""
    # Create an entity
    e1 = create_entity(Entity, world, mock_game)

    # Test get_linked
    assert world.get_linked(e1.name) == e1

def test_entity_pop(world, mock_game):
    """Test pop method with a fresh world"""
    # Create an entity
    e2 = create_entity(Entity, world, mock_game)

    # Test pop
    e2_popped = world.pop(e2.name)
    with pytest.raises(KeyError):
        world.get_linked(e2.name)

@pytest.mark.parametrize("depth", [1, 2, 3])
def test_entity_build_tree(depth, world, mock_game):
    """Test building a tree of entities with a fresh world"""
    # Create a tree of entities
    root = create_entity_tree(Entity, world, mock_game, depth=depth)

    # Test that the tree was created
    assert len(list(root.traverse())) == 2 ** depth

def test_entity_is_linked(world, mock_game):
    """Test is_linked method with a fresh world"""
    # Create two entities
    e1 = create_entity(Entity, world, mock_game)
    e2 = create_entity(Entity, world, mock_game)

    # Link the entities
    e1.link(e2)

    # Test is_linked
    assert e1.is_linked(e2.name) == True

def test_entity_is_not_linked(world, mock_game):
    """Test is_linked method with unlinked entities"""
    # Create two entities
    e1 = create_entity(Entity, world, mock_game)
    e2 = create_entity(Entity, world, mock_game)

    # Don't link the entities

    # Test is_linked
    assert e1.is_linked(e2.name) == False

def test_entity_get_all(world, mock_game):
    """Test get_all method with a fresh world"""
    # Create some entities
    e1 = create_entity(Entity, world, mock_game)
    e2 = create_entity(Entity, world, mock_game)

    # Test get_all
    entities = Entity.get_all(world=world)
    assert len(entities) >= 2
    assert e1.name in entities
    assert e2.name in entities

def test_entity_get(world, mock_game):
    """Test get method with a fresh world"""
    # Create an entity
    e1 = create_entity(Entity, world, mock_game)

    # Test get
    assert Entity.get(e1.name, world=world) == e1

    # Test get with non-existent entity
    with pytest.raises(NoEntityLinkException):
        Entity.get("nonexistent", world=world)

def test_entity_link_exception(world, mock_game):
    """Test EntityLinkException with a fresh world"""
    # Create an entity
    entity_name = "test_entity_" + randtext()
    entity1 = Entity(entity_name, "Test Entity 1", game=mock_game, world=world, warn=False)

    # Try to create another entity with the same name
    with pytest.raises(EntityLinkException):
        entity2 = Entity(entity_name, "Test Entity 2", game=mock_game, world=world, warn=False)

def test_entity_purge(world, mock_game):
    """Test purge method with a fresh world"""
    # Create a tree of entities
    root = create_entity_tree(Entity, world, mock_game, depth=2)

    # Create a new entity to purge
    entity_to_purge = create_entity(Entity, world, mock_game)

    # Link it to the root
    root.link(entity_to_purge)

    # Get the initial entity count
    initial_entity_count = len(world.linked)

    # Purge the entity
    world.purge(entity_to_purge.name)

    # Test that the entity was removed from the world
    assert len(world.linked) < initial_entity_count
    assert entity_to_purge.name not in world.linked
