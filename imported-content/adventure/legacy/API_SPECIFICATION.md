# Adventure Game Project API Specification

This document provides a comprehensive specification of all public interfaces in the Adventure Game project.

## Table of Contents

- [Core Classes](#core-classes)
  - [Entity](#entity)
  - [World](#world)
  - [Item](#item)
  - [Room](#room)
  - [Door](#door)
  - [HiddenDoor](#hiddendoor)
  - [Character](#character)
  - [NonPlayerCharacter](#nonplayercharacter)
  - [WalkerCharacter](#walkercharacter)
  - [AICharacter](#aicharacter)
  - [News](#news)
- [Item Types](#item-types)
  - [Money](#money)
  - [Wearable](#wearable)
  - [Useable](#useable)
  - [Weapon](#weapon)
  - [Eatable](#eatable)
  - [Phone](#phone)
  - [Computer](#computer)
- [Game Engine](#game-engine)
  - [Adventure](#adventure)
- [Web Server API](#web-server-api)
  - [Flask Routes](#flask-routes)
- [World Definition Format](#world-definition-format)
- [Utility Functions](#utility-functions)

## Core Classes

### Entity

Base class for all game objects.

```python
class Entity:
    def __init__(self, name='No name', description='No description', game=None, player=None, world=None, warn=True)
    def link(self, entity)
    def pop(self, name)
    def add_action(self, action, func)
    def remove_action(self, action)
    def traverse(self)
    def set_game(self, game)
    def set_player(self, player)
    def set_world(self, world)
    
    @classmethod
    def get_all(cls, world)
    @classmethod
    def get(cls, name, world)
    def purge(self, name)
```

### World

Represents the game world that contains all other entities.

```python
class World(Entity):
    def __init__(self, name='world', description='The world as we know it', game=None, player=None, warn=True)
```

### Item

Base class for all items in the game.

```python
class Item(Entity):
    def __init__(self, name='item', description="No description", droppable=True, takeable=True, lookable=True, game=None, player=None, world=None, warn=True, **kwargs)
    def add_item(self, item)
    def look()
    def take()
    def drop()
```

### Room

Represents a location in the game world.

```python
class Room(Entity):
    def __init__(self, name='room', description="An empty room", game=None, player=None, world=None, **kwargs)
    def go()
    def link_room(self, room)
    def add_item(self, item)
    def get_items(self, takeable_only=False)
    def get_rooms(self, show_hidden=False)
    def get_doors()
```

### Door

Represents a connection between two rooms.

```python
class Door(Room):
    def __init__(self, name, room1, room2, locked=True, key=None, game=None, player=None, world=None, **kwargs)
    def get_other(self, room)
    def go()
    def unlock()
    def lock()
```

### HiddenDoor

A door that is only visible when a certain condition is met.

```python
class HiddenDoor(Door):
    def __init__(self, name, room1, room2, condition, game=None, player=None, world=None, **kwargs)
    def go()
```

### Character

Represents a character in the game, including the player.

```python
class Character(Item):
    def __init__(self, name="player", description="The main player", health=1, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, news=None, game=None, player=None, world=None, warn=True, **kwargs)
    def go(self, room, check_link=True)
    def take(self, item=None)
    def drop(self, item=None)
    def look(self, item=None)
    def attack(self, target)
    def take_damage(self, damage=1, attacker=None)
    def die()
    def in_room_items(self, item)
    def in_rooms(self, room)
    def add_watcher(self, watcher)
    def remove_watcher(self, watcher)
    def notify_news(self, news)
```

### NonPlayerCharacter

Represents a non-player character in the game.

```python
class NonPlayerCharacter(Character):
    def __init__(self, name="npc", description="Just hanging around", health=2, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, verb="greet", use_msg="Hi!", func=lambda var=None: True, news=None, game=None, player=None, world=None, **kwargs)
    def use()
    def loopit()
```

### WalkerCharacter

A character that can move between rooms.

```python
class WalkerCharacter(NonPlayerCharacter):
    def __init__(self, name="walker", description="Just walking around", health=2, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, verb="greet", use_msg="Hi!", func=lambda var=None: True, news=None, game=None, player=None, world=None, **kwargs)
    def loopit()
```

### AICharacter

A character powered by AI that can engage in conversation.

```python
class AICharacter(Character):
    def __init__(self, name="ai character", description="Some NPC", health=3, attack_strength=None, current_room=None, prompt="You are a less-than helpful, yet amusing, assistant.", phone_prompt=("The user is calling you on the phone, and you answer in an amusing way. Don't worry about sounds or actions, just generate the words."), func=lambda json: print(f"Character returned: {json}"), news=None, game=None, player=None, world=None, **kwargs)
    def talk(self, msg=None, once=False)
    def add_to_prompt(self, text)
    def attack(self, target)
    def notify_news(self, news)
```

### News

Manages news bulletins and subscriptions in the game world.

```python
class News:
    def __init__(self)
    def publish(self, bulletin)
    def subscribe(self, character)
    def unsubscribe(self, character)
```

## Item Types

### Money

Represents currency in the game.

```python
class Money(Item):
    def __init__(self, name="money", description="some money", amount=1.00, game=None, player=None, world=None, **kwargs)
    def take()
```

### Wearable

An item that can be worn by characters.

```python
class Wearable(Item):
    def __init__(self, name="hat", description="A silly hat", wear_msg="You put on the hat.", remove_msg="You took off the hat.", game=None, player=None, world=None, **kwargs)
    def wear()
    def remove()
```

### Useable

An item that can be used to trigger an action.

```python
class Useable(Item):
    def __init__(self, name="useful item", description="A useful item", takeable=True, droppable=True, verb="use", use_msg=None, func=lambda var=None: True, game=None, player=None, world=None, **kwargs)
    def use()
```

### Weapon

An item that can be used to attack characters.

```python
class Weapon(Useable):
    def __init__(self, name="weapon", description="A weapon", damage=1, game=None, player=None, world=None, **kwargs)
    def use()
```

### Eatable

An item that can be consumed.

```python
class Eatable(Useable):
    def __init__(self, name="food", description="A tasty item", takeable=True, droppable=True, verb="eat", use_msg="Yummy!", func=lambda var=None: True, game=None, player=None, world=None, **kwargs)
    def use()
```

### Phone

An item that can be used to call characters.

```python
class Phone(Useable):
    def __init__(self, name="phone", description="An old phone", cost=0.25, costmsg="No service", mobile=False, game=None, player=None, world=None, **kwargs)
    def use()
```

### Computer

An interactive computing device.

```python
class Computer(Useable):
    def __init__(self, name="computer", description="A computer", mobile=False, game=None, player=None, world=None, **kwargs)
    def use()
```

## Game Engine

### Adventure

The main game engine class that handles commands and game state.

```python
class Adventure(cmd2.Cmd):
    def __init__(self, player=None, world=None, file="world.yaml", output=print)
    def current_room_intro()
    def do_inv(self, arg=None)
    def do_exit(self, arg=None)
    def do_go(self, arg)
    def do_look(self, arg)
    def do_take(self, arg)
    def do_drop(self, arg)
    def do_use(self, arg)
    def do_attack(self, arg)
    def do_talk(self, arg)
    def game_over()
    
    @staticmethod
    def load_world(filename="world.yaml", game=None, player=None, news=None, output=print)
```

## Web Server API

### Flask Routes

API endpoints for the web interface.

```python
@app.route('/')
def serve_index()

@app.route('/images/<path:filename>')
def serve_images(filename)

@app.route('/state', methods=['GET'])
def game_state()

@app.route('/action', methods=['POST'])
def perform_action()

@app.route('/talk', methods=['POST'])
def talk_to_character()

@app.route('/end_talk', methods=['POST'])
def end_talk()

@app.route('/logs', methods=['GET'])
def get_logs()
```

## World Definition Format

The game world is defined in YAML format with the following structure:

```yaml
rooms:
  - name: string
    description: string
    links: [string]  # Names of connected rooms

items:
  - name: string
    description: string
    type: string  # Item class name (Money, Wearable, Useable, etc.)
    room: string  # Name of the room where the item is located
    # Additional properties based on item type

doors:
  - name: string
    room1: string  # Name of first connected room
    room2: string  # Name of second connected room
    locked: boolean
    key: string  # Name of the item that serves as the key
    hidden: boolean  # Whether the door is hidden
    condition: string  # Python expression for hidden door visibility condition

characters:
  - name: string
    description: string
    type: string  # Character class name (NonPlayerCharacter, AICharacter, etc.)
    current_room: string  # Name of the room where the character is located
    health: number
    attack_strength: number
    # Additional properties based on character type

help:
  command_name: string  # Help text for specific commands
```

## Utility Functions

The project includes utility functions for:

- **World visualization** (diagram.py): Creates a graphical representation of the game world
- **GUI interface** (adventure_gui.py): Provides a graphical user interface for the game
- **Web server interface** (server.py): Enables playing the game through a web browser
