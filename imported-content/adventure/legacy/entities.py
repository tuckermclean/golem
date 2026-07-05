from __future__ import annotations

class EntityLinkException(Exception):
    "Thrown when there is already an Entity with this name"

class NoEntityLinkException(Exception):
    "Thrown when there is no near-enough link to an Entity with this name"

class Entity:
    def __init__(self, name = 'No name', description = 'No description', game=None, player=None, world=None, warn=True):
        self.name = name
        self.description = description
        self.linked = {}
        self.actions = {}
        self.game = game
        self.player = player
        self.world = world

        if self.world != None:
            self.world.link(self)

        if warn:
            if self.player == None:
                self.game.output(f"Warning: {type(self).__name__} has no player set")
            if self.game == None:
                self.game.output(f"Warning: {type(self).__name__} has no game set")
            if self.world == None:
                self.game.output(f"Warning: {type(self).__name__} has no world set")

    def __str__(self):
        return f"{self.name.upper()} -- {self.description}"

    def __repr__(self):
        return self.__str__()
    
    def link(self, linked: Entity, override = False):
        if linked.name not in self.linked.keys() or override == True:
            self.linked.update({ f"{linked.name}": linked })
        else:
            raise EntityLinkException

    def get_linked(self, name):
        return self.linked[name]

    def pop(self, name):
        if name in self.linked.keys():
            popped = self.linked[name]
            del self.linked[name]
            return popped
        else:
            raise NoEntityLinkException

    def add_action(self, name="doink", function = lambda: True):
        self.actions[name] = function

    def remove_action(self, name="doink"):
        del self.actions[name]

    def do(self, action):
        try:
            return self.actions[action]()
        except KeyError:
            return None
        except Exception as e:
            self.game.output("Something went wrong during action:", action, e)

    def traverse(self, max_levels=-1, first_level=0, entities=None):
        if entities == None:
            entities = {}
        for name in self.linked:
            level = first_level
            if (level < max_levels or max_levels < 0):
                if name not in entities.keys():
                    entities[name] = self.linked[name]                    
                    level = level + 1
                    if (level < max_levels or max_levels < 0):
                        children = self.linked[name].traverse(max_levels, level, entities)
                        for child in children:
                            for key in children.keys():
                                if not key in entities.keys():
                                    entities[name] = child
        return entities

    def is_linked(self, name):
        if name in self.linked:
            return True
        else:
            return False

    def set_game(self, game):
        self.game = game

    def set_player(self, player):
        self.player = player

    def set_world(self, world):
        self.world = world

    @classmethod
    def get_all(cls, world):
        return dict(filter(lambda pair : isinstance(pair[1], cls) or issubclass(pair[1].__class__, cls), world.linked.items()))

    @classmethod
    def get(cls, name, world):
        try:
            return cls.get_all(world)[name]
        except KeyError:
            raise NoEntityLinkException

    def purge(self, name):
        popped = 0
        for entity in self.world.traverse():
            try:
                self.get(entity, world=self.world).pop(name)
                popped = popped + 1
            except NoEntityLinkException:
                pass
        try:
            self.world.pop(name)
            popped = popped + 1
        except NoEntityLinkException:
            pass

        return popped > 0

class World(Entity):
    def __init__(self, name = 'world', description = 'The world as we know it', game=None, player=None, warn=True):
        super().__init__(name, description, game, player, world=self, warn=warn)

class Item(Entity):
    def __init__(self, name = 'item', description = "No description", droppable=True, takeable=True, lookable=True, game=None, player=None, world=None, warn=True, **kwargs):
        super().__init__(name, description, game, player, world, warn=warn)
        self.droppable = droppable
        self.takeable = takeable
        if takeable:
            self.add_action("take", self.take)
        if lookable:
            self.add_action("look", self.look)

    def add_item(self, item: Item):
        super().link(item)

    def look(self):
        self.game.output(self.name.upper(), " -- " , self.description)
        self.game.output(f"Actions: {list(self.actions.keys())}")
        return True

    def take(self, look=True):
        """Take an item"""
        if self.player.in_room_items(self):
            if len(self.player.inv_items) >= self.player.max_items:
                self.game.output(f"You already have {self.player.max_items} items, buddy")
            else:
                self.player.inv_items[self.name] = self.player.current_room.pop(self.name)
                self.remove_action("take")
                if self.droppable:
                    self.add_action("drop", self.drop)
                if look:
                    self.look()
        else:
            self.game.output("That item is not in this room!")
        return True
    
    def drop(self):
        """Drop an item from inventory"""
        if self in self.player.inv_items.values():
            if self.droppable:
                del self.player.inv_items[self.name]
                self.player.current_room.add_item(self)
                self.remove_action("drop")
                if self.takeable:
                    self.add_action("take", self.take)
                self.game.current_room_intro()
            else:
                self.game.output("That item is not droppable, guess you're stuck with it.")
        else:
            self.game.output("You don't have that item, dingus")
        return True

class Room(Entity):
    def __init__(self, name='room', description = "An empty room", game=None, player=None, world=None, **kwargs):
        super().__init__(name, description, game, player, world)
        self.add_action("go", self.go)
        if 'links' in kwargs:
            for link in kwargs['links']:
                try:
                    self.link_room(self.get(link, world=self.world))
                except NoEntityLinkException:
                    pass

    def go(self):
        self.player.current_room.pop(self.player.name)
        self.player.current_room = self
        self.player.current_room.add_item(self.player)

        for watcher in self.player.watchers.values():
            watcher.loopit()

        self.game.current_room_intro()
        return True

    def link_room(self, room: Room):
        try:
            super().link(room)
            room.link_room(self)
        except EntityLinkException:
            pass

    def add_item(self, item: Item):
        super().link(item)

    def get_items(self, takeable_only=False):
        if takeable_only:
            return dict(filter(lambda pair : isinstance(pair[1], Item) and not pair[1].takeable == False, self.linked.items()))
        else:
            return dict(filter(lambda pair : isinstance(pair[1], Item), self.linked.items()))

    def get_rooms(self, show_hidden=False):
        # If the room is a HiddenDoor, don't return it if condition() is False
        if show_hidden:
            return dict(filter(lambda pair : isinstance(pair[1], Room), self.linked.items()))
        else:
            return dict(filter(lambda pair : (isinstance(pair[1], Room) and not isinstance(pair[1], HiddenDoor)) or (isinstance(pair[1], HiddenDoor) and pair[1].condition()), self.linked.items()))

    def get_doors(self):
        return dict(filter(lambda pair : (isinstance(pair[1], Door) and not isinstance(pair[1], HiddenDoor)) or (isinstance(pair[1], HiddenDoor) and pair[1].condition()), self.linked.items()))

    def get_actions(self):
        actions = {}
        for item in list(self.linked.values()) + list(self.player.inv_items.values()):
            for action in item.actions:
                try:
                    if not isinstance(actions[action], list):
                        actions[action] = []
                except KeyError:
                    actions[action] = []
                actions[action].append(item)

        return actions

class Door(Room):
    def __init__(self, name: str, room1: Room, room2: Room, locked = True, key: Item = None, game=None, player=None, world=None, **kwargs):
        super().__init__(name, description=f"Door between {room1.name} and {room2.name}", game=game, player=player, world=world)
        super().link_room(room1)
        super().link_room(room2)
        self.locked = locked
        self.key = key
        if self.locked:
            self.add_action("unlock", self.unlock)
        elif self.key != None:
            self.add_action("lock", self.lock)
        self.add_action("go", self.go)

    def get_other(self, room: Room) -> Room:
        names = list(self.linked.keys())
        if names[0] == room.name:
            return self.linked[names[1]]
        else:
            return self.linked[names[0]]
        
    # def lock(self, key):
    #     if key == self.key:
    #         self.locked = True
    #     return self.locked == True

    # def unlock(self, key):
    #     if key == self.key:
    #         self.locked = False
    #     return self.locked == False
    
    def go(self):
        if self.locked == False:
            self.player.current_room.pop(self.player.name)
            self.player.current_room = self.get_other(self.player.current_room)
            self.player.current_room.add_item(self.player)

            for watcher in self.player.watchers.values():
                watcher.loopit()

            self.game.current_room_intro()
        else:
            self.game.output("That door is locked.")
        return True

    def unlock(self):
        """Unlock a door"""
        if self.player.in_rooms(self):
            if self.locked == False:
                self.game.output("This door is already unlocked")
            elif self.key in self.player.inv_items.values() or self.key in self.player.inv_items.keys():
                self.locked = False
                self.game.output("Door unlocked")
                self.remove_action("unlock")
                self.add_action("lock", self.lock)
            else:
                self.game.output("You don't have the key to unlock this door")
        else:
            self.game.output("That door isn't here")
        return True
    
    def lock(self):
        if self.player.in_rooms(self):
            if self.locked == True:
                self.game.output("This door is already locked")
            elif self.key in self.player.inv_items.values():
                self.locked = True
                self.game.output("Door locked")
                self.remove_action("lock")
                self.add_action("unlock", self.unlock)
            else:
                self.game.output("You don't have the key to lock this door")
        else:
            self.game.output("That door isn't here")
        return True

class HiddenDoor(Door):
    """A door that is hidden and will only show when a certain condition is met"""
    def __init__(self, name: str, room1: Room, room2: Room, condition: lambda var=None: bool, game=None, player=None, world=None, **kwargs):
        super().__init__(name, room1, room2, game=game, player=player, world=world, **kwargs)
        self.condition = condition

    def go(self):
        if self.condition():
            super().go()
        else:
            self.game.output("The door is hidden and cannot be accessed yet.")
        return True