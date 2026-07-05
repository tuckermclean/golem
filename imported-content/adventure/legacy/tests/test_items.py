import pytest
from adventure import *
from helpers import *
from entities import Entity, Room, Item, World, NoEntityLinkException, Door
from items import Money, Wearable, Useable, Eatable, Computer, Phone, Weapon
from characters import Character

# Consolidated item tests with proper fixtures and no global state

def test_item_creation(world, mock_game, player):
    """Test creating an item with a fresh world"""
    # Create a new item
    item_name = "test_item_" + randtext()
    item = Item(item_name, "Test Item", game=mock_game, world=world, player=player, warn=False)

    # Test that the item was created and linked to the world
    assert item.name == item_name
    assert item.description == "Test Item"
    assert item.name in world.linked
    assert world.linked[item.name] == item

    # Test item properties
    assert item.takeable == True
    assert item.droppable == True

def test_item_add_action(world, mock_game, player):
    """Test adding an action to an item"""
    # Create a new item
    item = Item("test_item_action", "Test Item", game=mock_game, world=world, player=player, warn=False)

    # Add an action to the item
    item.add_action("doink1", lambda: "doink2")

    # Test that the action was added
    assert item.actions["doink1"]() == "doink2"

def test_item_do(world, mock_game, player):
    """Test the do method"""
    # Create a new item for this test
    item = Item("test_item_do", "Test Item Do", game=mock_game, world=world, player=player, warn=False)

    # Add an action to the item
    action_result = "Action was performed"
    item.add_action("test_action", lambda: action_result)

    # Test the do method
    assert item.do("test_action") == action_result

    # Test with a non-existent action
    # The do method returns None for non-existent actions, not False
    assert item.do("nonexistent_action") is None

def test_item_get(world, mock_game, player):
    """Test the get method"""
    # Create an item to test with
    item_name = "test_item_" + randtext()
    item = Item(item_name, "Test Item", game=mock_game, world=world, player=player, warn=False)

    # Test get
    assert Item.get(item.name, world=world) == item
    with pytest.raises(NoEntityLinkException):
        Item.get("nonexistent", world=world)

def test_item_get_all(world, mock_game, player):
    """Test the get_all method"""
    # Create several items
    item1 = Item("test_item_all1", "Test Item 1", game=mock_game, world=world, player=player, warn=False)
    item2 = Item("test_item_all2", "Test Item 2", game=mock_game, world=world, player=player, warn=False)
    item3 = Item("test_item_all3", "Test Item 3", game=mock_game, world=world, player=player, warn=False)

    # Test get_all
    items = Item.get_all(world=world)
    assert len(items) >= 3
    assert item1.name in items
    assert item2.name in items
    assert item3.name in items

def test_money_creation(world, mock_game, player):
    """Test Money class creation and properties"""
    # Create a Money object
    money_name = "test_money_" + randtext()
    money = Money(
        name=money_name,
        description="Test Money",
        amount=50.0,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert money.name == money_name
    assert money.description == "Test Money"
    assert money.amount == 50.0
    assert money.takeable == True
    assert money.droppable == False

def test_wearable_creation(world, mock_game, player):
    """Test Wearable class creation and properties"""
    # Create a Wearable object
    wearable_name = "test_wearable_" + randtext()
    wearable = Wearable(
        name=wearable_name,
        description="Test Wearable",
        wear_msg="You put on the test wearable.",
        remove_msg="You took off the test wearable.",
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert wearable.name == wearable_name
    assert wearable.description == "Test Wearable"
    assert wearable.wear_msg == "You put on the test wearable."
    assert wearable.remove_msg == "You took off the test wearable."
    assert wearable.takeable == True
    assert wearable.droppable == True

def test_useable_creation(world, mock_game, player):
    """Test Useable class creation and properties"""
    # Create a function for the Useable
    def test_func(var=None):
        return "Function called with " + str(var)

    # Create a Useable object
    useable_name = "test_useable_" + randtext()
    useable = Useable(
        name=useable_name,
        description="Test Useable",
        verb="use",
        use_msg="You used the test useable.",
        func=test_func,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert useable.name == useable_name
    assert useable.description == "Test Useable"
    assert useable.verb == "use"
    assert useable.use_msg == "You used the test useable."
    assert useable.takeable == True
    assert useable.droppable == True

    # Test the function
    assert useable.func("test") == "Function called with test"

    # Test the use method
    assert useable.use() is not None

    # Create a room and add the useable to it
    room = Room("test_useable_room", "Test Room", game=mock_game, world=world, player=player, warn=False)
    room.add_item(useable)

    # Move player to the room
    player.go(room, check_link=False)

    # Test that the player can use the item
    assert player.in_room_items(useable) == True

def test_eatable_creation(world, mock_game, player):
    """Test Eatable class creation and properties"""
    # Create an Eatable object
    eatable_name = "test_eatable_" + randtext()
    eatable = Eatable(
        name=eatable_name,
        description="Test Eatable",
        verb="eat",
        use_msg="Yummy test eatable!",
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert eatable.name == eatable_name
    assert eatable.description == "Test Eatable"
    assert eatable.verb == "eat"
    assert eatable.use_msg == "Yummy test eatable!"
    assert eatable.takeable == True
    assert eatable.droppable == True

    # Test the use method
    assert eatable.use() is not None

def test_weapon_creation(world, mock_game, player):
    """Test Weapon class creation and properties"""
    # Create a Weapon object
    weapon_name = "test_weapon_" + randtext()
    weapon = Weapon(
        name=weapon_name,
        description="Test Weapon",
        damage=5,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert weapon.name == weapon_name
    assert weapon.description == "Test Weapon"
    assert weapon.damage == 5
    assert weapon.verb == "use"
    assert weapon.takeable == True
    assert weapon.droppable == True

    # Create a character to attack
    target = Character("test_target", "Test Target", health=10, game=mock_game, world=world, warn=False)

    # Create a room and add the weapon and target to it
    room = Room("test_weapon_room", "Test Room", game=mock_game, world=world, player=player, warn=False)
    room.add_item(weapon)

    # Move player and target to the room
    player.go(room, check_link=False)
    target.go(room, check_link=False)

    # Give the weapon to the player
    player.inv_items[weapon.name] = weapon

    # Test that the player has the weapon in inventory
    assert weapon.name in player.inv_items

def test_computer_creation(world, mock_game, player):
    """Test Computer class creation and properties"""
    # Create a Computer object
    computer_name = "test_computer_" + randtext()
    computer = Computer(
        name=computer_name,
        description="Test Computer",
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert computer.name == computer_name
    assert computer.description == "Test Computer"
    assert computer.verb == "use"
    assert computer.takeable == False  # Computers are not takeable
    assert computer.droppable == False  # Computers are not droppable

def test_phone_creation(world, mock_game, player):
    """Test Phone class creation and properties"""
    # Create a Phone object
    phone_name = "test_phone_" + randtext()
    phone = Phone(
        name=phone_name,
        description="Test Phone",
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert phone.name == phone_name
    assert phone.description == "Test Phone"
    assert phone.verb == "use"
    assert phone.takeable == False  # Phones are not takeable
    assert phone.droppable == False  # Phones are not droppable

def test_room_creation(world, mock_game, player):
    """Test creating a room with a fresh world"""
    # Create a new room
    room_name = "test_room_" + randtext()
    room = Room(room_name, "Test Room", game=mock_game, world=world, player=player, warn=False)

    # Test that the room was created and linked to the world
    assert room.name == room_name
    assert room.description == "Test Room"
    assert room.name in world.linked
    assert world.linked[room.name] == room

def test_room_linking(world, mock_game, player):
    """Test linking rooms with a fresh world"""
    # Create two rooms
    room1_name = "test_room1_" + randtext()
    room2_name = "test_room2_" + randtext()
    room1 = Room(room1_name, "Test Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room(room2_name, "Test Room 2", game=mock_game, world=world, player=player, warn=False)

    # Link the rooms
    room1.link_room(room2)

    # Test that the rooms are linked
    assert room2.name in room1.get_rooms()
    assert room1.get_rooms()[room2.name] == room2
    assert room1.name in room2.get_rooms()
    assert room2.get_rooms()[room1.name] == room1

def test_room_add_item(world, mock_game, player):
    """Test adding an item to a room"""
    # Create a room and an item
    room_name = "test_room_" + randtext()
    item_name = "test_item_" + randtext()
    room = Room(room_name, "Test Room", game=mock_game, world=world, player=player, warn=False)
    item = Item(item_name, "Test Item", game=mock_game, world=world, player=player, warn=False)

    # Add the item to the room
    room.add_item(item)

    # Test that the item is in the room
    assert item.name in room.get_items()
    assert room.get_items()[item.name] == item

def test_room_actions(world, mock_game, player):
    """Test room actions"""
    # Create two rooms
    room1 = Room("test_room_action1", "Test Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room("test_room_action2", "Test Room 2", game=mock_game, world=world, player=player, warn=False)

    # Add different actions to each room
    room1.add_action("action1", lambda: "Action 1")
    room2.add_action("action2", lambda: "Action 2")

    # Test that the actions were added
    assert "action1" in room1.actions
    assert "action2" in room2.actions
    assert "action1" not in room2.actions
    assert "action2" not in room1.actions

def test_room_get_rooms(world, mock_game, player):
    """Test get_rooms method"""
    # Create several rooms
    room1 = Room("test_room_get1", "Test Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room("test_room_get2", "Test Room 2", game=mock_game, world=world, player=player, warn=False)
    room3 = Room("test_room_get3", "Test Room 3", game=mock_game, world=world, player=player, warn=False)

    # Link the rooms
    room1.link_room(room2)
    room1.link_room(room3)

    # Test get_rooms
    rooms = room1.get_rooms()
    assert len(rooms) == 2
    assert room2.name in rooms
    assert room3.name in rooms

def test_room_get_doors(world, mock_game, player):
    """Test get_doors method"""
    # Create two rooms
    room1 = Room("test_room_door1", "Test Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room("test_room_door2", "Test Room 2", game=mock_game, world=world, player=player, warn=False)

    # Create a door between the rooms
    door = Door(
        name="test_door",
        room1=room1,
        room2=room2,
        locked=False,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test get_doors method - Door is a subtype of Room
    doors1 = room1.get_doors()
    assert len(doors1) == 1
    assert door.name in doors1
    assert doors1[door.name] == door

    doors2 = room2.get_doors()
    assert len(doors2) == 1
    assert door.name in doors2
    assert doors2[door.name] == door

def test_door(world, mock_game, player):
    """Test Door class creation and properties"""
    # Create two rooms
    room1 = Room("test_door_room1", "Test Door Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room("test_door_room2", "Test Door Room 2", game=mock_game, world=world, player=player, warn=False)

    # Create a door between the rooms (Door is a subtype of Room)
    door_name = "test_door_" + randtext()
    door = Door(
        name=door_name,
        room1=room1,
        room2=room2,
        locked=True,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test basic properties
    assert door.name == door_name
    assert "Door between" in door.description
    assert door.locked == True
    assert door.key is None

    # Test that the door is linked to both rooms
    assert door.name in room1.get_doors()
    assert door.name in room2.get_doors()

    # Test that the door is a Room subtype
    assert isinstance(door, Room)

def test_door_other_room(world, mock_game, player):
    """Test Door connections to other rooms"""
    # Create two rooms
    room1 = Room("test_door_other_room1", "Test Door Other Room 1", game=mock_game, world=world, player=player, warn=False)
    room2 = Room("test_door_other_room2", "Test Door Other Room 2", game=mock_game, world=world, player=player, warn=False)

    # Create a door between the rooms (Door is a subtype of Room)
    door = Door(
        name="test_door_other",
        room1=room1,
        room2=room2,
        locked=False,
        game=mock_game,
        world=world,
        player=player,
        warn=False
    )

    # Test that the door is linked to both rooms
    assert door.name in room1.get_doors()
    assert door.name in room2.get_doors()

    # Test that the rooms are accessible through the door
    # Move player to room1
    player.go(room1, check_link=False)

    # Check that player can see the door
    assert door.name in player.current_room.get_doors()

    # Check that player can go through the door to room2
    player.go(door, check_link=False)
    assert player.current_room == door

    # From the door, player should be able to go to either room
    rooms = door.get_rooms()
    assert room1.name in rooms
    assert room2.name in rooms
