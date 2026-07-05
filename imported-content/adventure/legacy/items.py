from __future__ import annotations
import code, os
from entities import Item, Entity
from characters import Character, AICharacter, WalkerCharacter, NonPlayerCharacter

#class VendingMachine(Item):
#class Phone(Item):

class Money(Item):
    def __init__(self, name="money", description="some money", amount=1.00, game=None, player=None, world=None, **kwargs):
        super().__init__(name, description, droppable=False, world=world, game=game, player=player)
        self.amount = amount
        self.add_action("take", self.take)
    
    def take(self, **kwargs):
        self.player.current_room.pop(self.name)
        self.player.money = self.player.money + self.amount
        self.game.current_room_intro()
        return True

class Wearable(Item):
    def __init__(self, name="hat", description="A silly hat", wear_msg="You put on the hat.", remove_msg="You took off the hat.", game=None, player=None, world=None, **kwargs):
        super().__init__(name, description, takeable=True, droppable=True, world=world, game=game, player=player)
        self.wear_msg = wear_msg
        self.remove_msg = remove_msg
        self.add_action("wear", self.wear)

    def wear(self):
        if self.player.in_room_items(self):
           self.take()

        if self in self.player.inv_items.values():
            self.game.output(self.wear_msg)
            self.player.wearing[self.name] = self
            self.add_action("remove", self.remove)
            self.droppable = False
            self.remove_action("drop")
            self.remove_action("wear")
        else:
            self.game.output(f"Something wrong: couldn't wear {self.name}")
        return True

    def remove(self):
        self.game.output(self.remove_msg)
        self.remove_action("remove")
        del self.player.wearing[self.name]
        self.droppable = True
        self.add_action("drop", self.drop)
        self.add_action("wear", self.wear)
        return True

class Useable(Item):
    def __init__(self, name="useful item", description="A useful item", takeable=True, droppable=True, verb="use",
                 use_msg=None, func=lambda var=None: True, game=None, player=None, world=None, **kwargs):
        Item.__init__(self, name, description, takeable=takeable, droppable=droppable, world=world, game=game, player=player)
        self.use_msg = use_msg
        self.func = func
        self.verb = verb
        self.add_action(verb, self.use)

    def use(self):
        if self.use_msg != None:
            self.game.output(self.use_msg)
        self.func(self)
        return True

class Weapon(Useable):
    def __init__(self, name="weapon", description="A weapon", damage=1, game=None, player=None, world=None, **kwargs):
        super().__init__(name=name, description=description, game=game, player=player, world=world, **kwargs)
        self.damage = damage
        self.add_action("use", self.use)

    def use(self, target=None):
        if target == None:
            target = Character.get(input(f"Who do you want to hit? {list(dict(filter(lambda pair : type(pair[1]) in [Character, AICharacter, WalkerCharacter, NonPlayerCharacter], self.player.current_room.get_items().items())).keys())}: ", world=self.world))
        elif type(target) == str:
            target = Character.get(target, world=self.world)

        if type(target) in [Character, AICharacter, WalkerCharacter, NonPlayerCharacter]:
            target.take_damage(self.damage)
        else:
            self.game.output("You can only use this weapon on a character.")
        return True

class Eatable(Useable):
    def __init__(self, name="food", description="A tasty item", takeable=True, droppable=True, verb="eat",
                 use_msg="Yummy!", func=lambda var=None: True, game=None, player=None, world=None, **kwargs):
        super().__init__(name, description, takeable, droppable, verb, use_msg, func, game=game, player=player, world=world, **kwargs)

    def use(self):
        super().use()
        popped = 0
        try:
            # Remove the item from the player's inventory
            self.player.inv_items.pop(self.name)
            popped += 1
        except:
            pass
        
        try:
            # Remove the item from the room
            self.player.current_room.pop(self.name)
            popped += 1
        except:
            pass

        popped += self.world.purge(self.name)
        return popped > 0

class Phone(Useable):
    def __init__(self, name="phone", description="An old phone", cost=0.25, costmsg="No service", mobile=False, game=None, player=None, world=None, **kwargs):
        super().__init__(name=name, description=description, droppable=mobile, takeable=mobile, game=game, player=player, world=world, **kwargs)
        self.cost = cost
        self.costmsg = costmsg
        self.add_action("use", self.use)

    def use(self, callee: str=None):
        self.game.output(f"This phone costs $ {self.cost} to use.")
        callees = dict(filter(lambda pair : pair[1].phoneable, AICharacter.get_all(world=self.world).items()))
        if callee == None:
            self.game.output("Who you gonna call? ", end="")
            self.game.output(list(callees.keys()))
            callee = input("(input): ")
        if callee in callees.keys():
            if self.player.spend(self.cost):
                self.game.output("**RINGING**")
                callees[callee].talk(phone=True)
                self.game.output("*Thank you, call again.*")
                self.game.current_room_intro()
            else:
                self.game.output(self.costmsg)
        else:
            self.game.output("You can't call them.")
        return True

class Computer(Useable):
    def __init__(self, name="computer", description="A computer", mobile=False, game=None, player=None, world=None, **kwargs):
        super().__init__(name=name, description=description, droppable=mobile, takeable=mobile, game=game, player=player, world=world, **kwargs)
        self.add_action("use", self.use)

    def use(self):
        self.game.output()
        self.game.output("You sit down in front of the computer, and with a flick of your hand, the console comes to life...")
        self.game.output("PRESS ENTER TO CONTINUE...", end="")
        input()
        
        os.system("clear")

        exit = "Press Ctrl+D to quit using the computer"
        quit = exit

        variables = {**globals(), **locals()}
        shell = code.InteractiveConsole(variables)
        shell.interact()

        self.game.output()
        self.game.current_room_intro()
        return True
