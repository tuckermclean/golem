from __future__ import annotations
import cmd2, os, shlex, sys, yaml
from entities import Room, Door, HiddenDoor, Item, Entity, World
from items import Money, Wearable, Useable, Eatable, Computer, Phone, Weapon
from characters import Character, AICharacter, WalkerCharacter, NonPlayerCharacter
from news import News

class Adventure(cmd2.Cmd):
    def __init__(self, player=None, world=None, file="world.yaml", output=print):
        self.prompt = "> "
        if file is not None and world is None:
            self.file = file
        elif len(sys.argv) > 1:
            self.file = sys.argv[1]
        if world is None:
            self.world = World(game=self, warn=False)
        else:
            self.world = world
        if player is None:
            player = Character(lookable=False, health=3, world=world, game=self, warn=False)
            player.set_game(self)
        else:
            player.set_game(self)
        self.world.set_player(player)
        self.player = player
        self.player.set_world(self.world)
        self.player.set_game(self)
        self.news = News()
        self.output = output

        if self.file is not None:
            # If self.file exists:
            if os.path.exists(self.file):
                self.world = Adventure.load_world(filename=self.file, game=self, player=self.player, news=self.news)
            else:
                raise FileNotFoundError(f"No world file found: {self.file}")

        # Go to first room
        self.player.go(list(Room.get_all(world=self.world).values())[0])
        super().__init__()

    @staticmethod
    def load_world(filename="world.yaml", game=None, player=None, news=None, output=print):
        world_obj = World(game=game, player=player)
        # Load the world from a file
        if os.path.exists(filename):
            with open(filename, 'r', encoding="utf-8") as stream:
                try:
                    world = yaml.safe_load(stream)
                    for room in world['rooms']:
                        Room(**room, game=game, player=player, world=world_obj)
                        for item in room['items']:
                            # Return the item class based on the item type
                            item_class = globals()[item['type']]
                            if 'func' in item:
                                def closure(func):
                                    return lambda var=None: exec(func, {
                                        'game': game,
                                        'player': player,
                                        'world': world_obj,
                                        'news': news,
                                        'var': var
                                    })
                                item['func'] = closure(item['func']) or True
                            item_class(**item, game=game, player=player, world=world_obj)
                            Room.get(room['name'], world=world_obj).add_item(item_class.get(item['name'], world=world_obj))
                    for door in world['doors']:
                        door['room1'] = Room.get(door['room1'], world=world_obj)
                        door['room2'] = Room.get(door['room2'], world=world_obj)
                        try:
                            door['key'] = Item.get(door['key'], world=world_obj)
                        except:
                            pass
                        if door.get('hidden', False):
                            if 'condition' in door:
                                def closure(condition):
                                    return lambda var=None: eval(condition, {
                                        'game': game,
                                        'player': player,
                                        'world': world_obj,
                                        'news': news,
                                        'door': door,
                                        'var': var
                                    })
                                door['condition'] = closure(door['condition']) or True
                            HiddenDoor(**door, game=game, player=player, world=world_obj)
                        else:
                            Door(**door, game=game, player=player, world=world_obj)
                    for character in world['characters']:
                        character_class = globals()[character['type']]
                        if 'func' in character:
                            def closure(func):
                                return lambda var=None: exec(func, {
                                    'game': game,
                                    'player': player,
                                    'world': world_obj,
                                    'news': news,
                                    'var': var
                                })
                            character['func'] = closure(character['func']) or True
                        character['news'] = news
                        character_obj = character_class(**character, game=game, player=player, world=world_obj)
                        character_obj.go(Room.get(character['current_room'], world=world_obj))
                        try:
                            if character_class == AICharacter and character['news'] == True:
                                news.subscribe(character_obj)
                        except:
                            pass
                    for help in world['help']:
                        text = world['help'][help]
                        if game:
                            setattr(game, f"help_{help}", lambda text=text: output(text))
                except yaml.YAMLError as exc:
                    output(exc)
        else:
            output("No world file found.")
        return world_obj

    def do_inv(self, arg=None):
        """List items in inventory"""

    def do_exit(self, arg=None):
        """Quit the game"""
        quit()

    def do_reset(self, arg=None):
        """Reset the game"""
        self.postloop()
        player = Character(lookable=False)
        game = Adventure(player)
        self.world = World(game=game, player=player)
        game.cmdloop()

    def postloop(self):
        return True

    def emptyline(self):
        pass

    def completedefault(self, text, line, begidx, endidx):
        """
        Provide custom tab-completion for adventure actions.
        - Gracefully handles invalid commands or quotes.
        - Returns partial matches for item names.
        """

        # Attempt to parse the line safely. If there's a mismatch in quotes,
        # shlex.split() might raise a ValueError, so we fall back to a simpler approach.
        try:
            tokens = shlex.split(line, posix=False)
        except ValueError:
            # Simple fallback if there are unbalanced quotes
            # e.g. user typed: take "some item
            tokens = line.strip().split()

        if not tokens:
            return []  # No tokens at all, no completions

        # First token is the action, e.g. 'take', 'look', 'go'
        action = tokens[0].lower()

        # Attempt to isolate the partial item text
        # If there's more than one token, treat the second as the item
        if len(tokens) > 1:
            # Strip leading/trailing quotes
            item_partial = " ".join(tokens[1:]).strip('"').strip("'").lower()
        else:
            item_partial = ""

        # Get all possible actions from the current room
        actions_dict = self.player.current_room.get_actions()
        # e.g. { 'take': [<Item1>, <Item2>], 'look': [...], 'go': [...], ... }

        # If the action doesn't exist, return empty
        if action not in actions_dict:
            return []

        # Gather possible item names for this action
        possible_items = [
            entity_item.name for entity_item in actions_dict[action]
            if not isinstance(entity_item, HiddenDoor)
            or (isinstance(entity_item, HiddenDoor) and entity_item.condition())
        ]

        # Filter:
        # 1) Must start with item_partial
        # 2) Must NOT exactly equal item_partial (skip if already fully typed)
        completions = [
            item_name for item_name in possible_items
            if item_name.lower().startswith(item_partial)
            and item_name.lower() != item_partial
        ]

        # If user typed something like:
        #   take "sho
        # then text == '"sho' (starts with a quote but not ended).
        # We'll auto-add a trailing quote to each completion for a nicer experience.
        if text.startswith('"') and not text.endswith('"'):
            # Make sure the user sees a final quote
            completions = [c + '"' for c in completions]

        return completions

    def get_all_commands(self):
        return list(self.player.current_room.get_actions().keys()) + ['exit', 'help', 'reset']

    def default(self, line):
        command = shlex.split(line.raw)
        action = command[0].lower()
        try:
            if command[0].lower() == "look" and len(command) == 1:
                self.current_room_intro()
                return
            try:
                item_name = " ".join(command[1:]).lower().strip()
            except Exception as e:
                self.output(e)
                item_name = None
            if not item_name:
                return
            item = Entity.get(item_name, world=self.world)
            if self.player.in_room_items(item) or item in self.player.inv_items.values():
                try:
                    if not item.do(action):
                        self.output(f"I don't know how to do '{action}' to '{item_name}'")
                except Exception as e:
                    self.output(f"I couldn't do '{action}' to '{item_name}': {type(e)}")
            else:
                self.output(f"I don't see that item here: {item_name}")
        except Exception as e:
            self.output(f"I couldn't do '{action}' to '{item_name}': {type(e)}")
        
    def current_room_intro(self):
        for char in dict(filter(lambda pair : self.player.in_room_items(pair[1]), Character.get_all(world=self.world).items())).values():
            char.loopit()
        self.output('You are in:', self.player.current_room.name.upper(), ' -- ', self.player.current_room.description)
        self.output('In this room, there are:', list(dict(filter(lambda pair : pair[1] != self.player, self.player.current_room.get_items().items())).keys()))
        self.output('The rooms next door:', list(self.player.current_room.get_rooms().keys()))
        self.output("Items you have:", list(self.player.inv_items.keys()), " --  Money: $", '{:.2f}'.format(self.player.money))
        self.output()
        for char in dict(filter(lambda pair : self.player.in_room_items(pair[1]) and pair[1] != self.player, Character.get_all(world=self.world).items())).values():
            try:
                if char.words != "":
                    self.output(f"{char.description}\t{char.words}")
                else:
                    self.output(f"{char.description}")
            except:
                self.output(f"{char.description}")
                
    def preloop(self):
        self.output("Welcome to the adventure game!   Type help or ? to list commands.\n")
        self.current_room_intro()

    def game_over(self):
        self.output("Game over!")
        self.postloop()
        self.reset()

if __name__ == '__main__':
    game = Adventure()
    game.cmdloop()
