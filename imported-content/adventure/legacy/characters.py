from __future__ import annotations
import random, re, os, time
import openai
from entities import Room, Item, Entity, EntityLinkException
from news import News

class Character(Item):
    def __init__(self, name="player", description="The main player", health=1, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, news=None, game=None, player=None, world=None, warn=True, **kwargs):
        Item.__init__(self, name=name, description=description, droppable=False, takeable=False, lookable=lookable, game=game, player=player, world=world, warn=warn)

        self.current_room = None
        self.max_items = 5
        self.inv_items = {}
        self.money = float(0)
        self.inv_items = {}
        self.wearing = {}
        self.words = ""
        self.watchers = {}
        self.health = health
        self.first_health = health
        self.attack_strength = attack_strength
        self.attack_msg = attack_msg
        self.damage_msg = damage_msg
        self.news = news

        if current_room != None and current_room.__class__ == Room:
            self.go(current_room)

    def loopit(self):
        pass

    def in_rooms(self, room: Room):
        try:
            return room.name in list(self.current_room.get_rooms().keys())
        except:
            return False

    def in_room_items(self, item: Entity):
        try:
            return item.name in list(self.current_room.linked.keys())
        except:
            return False

    def spend(self, amount):
        if self.money >= amount:
            self.money = self.money - amount
            self.game.output(f'${'{:.2f}'.format(amount)} spent.')
#FIXME            self.do_inv()
            return amount
        else:
            self.game.output("You don't have that kind of money, peasant.")
            return
 #FIXME           return self.do_inv()

    def say(self, words="blah blah blah"):
        self.words = words

    def go(self, room = Room, check_link=True):
        if self.current_room == None or (check_link and self.in_rooms(room)) or check_link == False:
            if self.current_room != None:
                self.current_room.pop(self.name)
            self.current_room = room
            self.current_room.add_item(self)
        else:
            self.game.output("WALKER", self.name, "GO", room.name, "DIDN'T WORK")

    def register_watcher(self, watcher):
        self.watchers[watcher.name] = watcher

    def unregister_watcher(self, watcher):
        del self.watchers[watcher.name]

    def take_damage(self, damage=1, attacker=None):
        if attacker != None and hasattr(attacker, 'name'):
            attacker = attacker.name
        elif attacker == None:
            attacker = "player"
        self.health -= damage
        self.game.output(self.damage_msg)
        self.game.output(f"{self.name.title()} took {damage} damage. Health: {self.health} ({self.health / self.first_health * 100:.2f}%)")
        if self.news != None:
            self.news.publish(f"{self.name.title()} just got hit by the {attacker.title()} and took {damage} damage. Health: {self.health} ({self.health / self.first_health * 100:.2f}%)")
        if self.health <= 0:
            self.die()
        else:
            self.attack(self.player)

    def die(self):
        self.game.output(f"{self.name.title()} has died.")
        if self.news != None:
            self.news.publish(f"{self.name.title()} has died.")
        self.current_room.pop(self.name)
        self.world.purge(self.name)
        try:
            self.player.unregister_watcher(self)
        except:
            pass
        if self.name == "player":
            self.game.game_over()
    
    def attack(self, target):
        if self.attack_strength != None:
            self.game.output(self.attack_msg)
            target.take_damage(damage=self.health / self.first_health * self.attack_strength, attacker=self)


class NonPlayerCharacter(Character):
    def __init__(self, name="npc", description="Just hanging around", health=2, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, verb="greet",
                 use_msg="Hi!", func=lambda var=None: True, news=None, game=None, player=None, world=None, **kwargs):
        Character.__init__(self, name=name, description=description, health=health, attack_strength=attack_strength, damage_msg=damage_msg, attack_msg=attack_msg, current_room=current_room, lookable=lookable, news=news, game=game, player=player, world=world, **kwargs)
        self.use_msg = use_msg
        self.func = func
        self.add_action(verb, self.use)
    
    def use(self):
        if self.use_msg != None:
            self.game.output(self.use_msg)
        self.func(self)
        return True

    def loopit(self):
        pass

class WalkerCharacter(NonPlayerCharacter):
    def __init__(self, name="walker", description="Just walking around", health=2, attack_strength=None, damage_msg="Ouch!", attack_msg="Have at you!", current_room=None, lookable=True, verb="greet",
                 use_msg="Hi!", func=lambda var=None: True, news=None, game=None, player=None, world=None, **kwargs):
        NonPlayerCharacter.__init__(self, name=name, description=description, health=health, attack_strength=attack_strength, damage_msg=damage_msg, attack_msg=attack_msg, current_room=current_room, lookable=lookable, verb=verb, use_msg=use_msg, func=func, news=news, game=game, player=player, world=world, **kwargs)

    def loopit(self):
        try:
            move = random.choice([True, False])
            if move:
                room = None
                while room.__class__ != Room:
                    room = random.choice(list(self.current_room.get_rooms().values()))
                #self.game.output("WALKER", self.name, "GO", room.name)
                self.go(room)
        except EntityLinkException:
            pass

class OpenAIClient():
    client = None
    assistants_cache = {}

    @staticmethod
    def connect(api_key=os.getenv("OPENAI_API_KEY")):
        if OpenAIClient.client is None:
            OpenAIClient.client = openai.OpenAI(api_key=api_key)

    @staticmethod
    def get_or_create_assistant(name, instructions, model="gpt-4o-mini"):
        OpenAIClient.connect()

        if name in OpenAIClient.assistants_cache:
            return OpenAIClient.assistants_cache[name]

        if not OpenAIClient.assistants_cache:
            assistants = OpenAIClient.client.beta.assistants.list().data
            OpenAIClient.assistants_cache = {a.name: a for a in assistants}

        assistant = OpenAIClient.assistants_cache.get(name)
        if assistant is None:
            assistant = OpenAIClient.client.beta.assistants.create(
                name=name,
                model=model,
                instructions=instructions,
            )
            OpenAIClient.assistants_cache[name] = assistant

        return assistant

    @staticmethod
    def create_thread():
        OpenAIClient.connect()
        return OpenAIClient.client.beta.threads.create().id

    @staticmethod
    def add_message(thread_id, content, role="user"):
        OpenAIClient.connect()

        OpenAIClient.client.beta.threads.messages.create(
            thread_id=thread_id, role=role, content=content
        )

    @staticmethod
    def stream_assistant_response(thread_id, assistant_name, additional_instructions=""):
        OpenAIClient.connect()

        assistant = OpenAIClient.assistants_cache[assistant_name]
        retries = 5
        while True:
            try:
                run_stream = OpenAIClient.client.beta.threads.runs.create(
                    thread_id=thread_id,
                    assistant_id=assistant.id,
                    additional_instructions=additional_instructions,
                    stream=True
                )
                break
            except Exception as e:
                if retries > 0:
                    time.sleep(1)
                    retries -= 1
                else:
                    raise e

        buffer = ""
        collecting_json = False

        for event in run_stream:
            if event.data.object == 'thread.message.delta':
                for delta in event.data.delta.content:
                    if delta.type == 'text':
                        chunk = delta.text.value
                        buffer += chunk

                        if '`' in buffer:
                            if '``' in buffer:
                                if '```' in buffer:
                                    collecting_json = not collecting_json
                                    # Remove the backticks from the buffer
                                    buffer = buffer.replace('```', '')
                                    if not collecting_json:
                                        json_obj = find_json_objects(buffer)
                                        if json_obj:
                                            for obj in json_obj:
                                                yield obj
                                    else:
                                        continue
                                else:
                                    continue
                            else:
                                continue
                        elif not collecting_json:
                            yielded = buffer
                            buffer = ""
                            yield yielded

    @staticmethod
    def oneoff_prompt(prompt, model="gpt-4-turbo", output=print):
        OpenAIClient.connect()

        response = openai.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            stream=True
        )

        try:
            for chunk in response:
                output(chunk.choices[0].delta.content or "", end="", flush=True)
        except Exception as e:
            output("Error:", e)
        output()

class AICharacter(Character):
    def __init__(self, name="ai character", description="Some NPC", health=3, attack_strength=None, current_room=None,
                 prompt="You are a less-than helpful, yet amusing, assistant.",
                 phone_prompt=("The user is calling you on the phone, and you answer in an amusing way. "
                               "Don't worry about sounds or actions, just generate the words."),
                 func=lambda json: print(f"Character returned: {json}"), news=None, game=None, player=None, world=None, **kwargs):
        super().__init__(name=name, description=description, health=health, attack_strength=attack_strength, current_room=current_room, news=news, game=game, player=player, world=world, **kwargs)
        self.phoneable = phone_prompt is not None
        self.func = func
        self.add_action("talk", self.talk)
        self.additional_instructions = ""

        OpenAIClient.connect()
        self.assistant_name = name
        self.phone_assistant_name = f"{name}_phone"

        OpenAIClient.get_or_create_assistant(name, prompt)
        self.thread_id = OpenAIClient.create_thread()

        if self.phoneable:
            OpenAIClient.get_or_create_assistant(self.phone_assistant_name, f"{prompt} {phone_prompt}")
            self.phone_thread_id = OpenAIClient.create_thread()

    def take_damage(self, damage=1, attacker=None):
        super().take_damage(damage, attacker)
        if attacker != None and hasattr(attacker, 'name'):
            attacker = attacker.name
        elif attacker == None:
            attacker = "player"
        if self.health > 0:
            self.add_to_prompt(f"You just got hit by the {attacker}, and you took {damage} damage. Your health is now {self.health / self.first_health * 100:.2f}%) and you are really angry now. Don't mention your health percentage explicitly.")

    def attack(self, target):
        super().attack(target)
        if self.attack_strength != None:
            msg = f"You just attacked the {target.name}, and they took {self.attack_strength} damage. Their health is now {self.player.health / self.player.first_health * 100:.2f}%). Don't mention their health percentage explicitly."
            try:
                self.talk(msg=msg, once=True)
            except:
                self.add_to_prompt(msg)

    def notify_news(self, news):
        self.add_to_prompt(f"NEWS BULLETIN: {news}")
        return True

    def talk(self, msg=None, once=False, phone=False):
        OpenAIClient.connect()

        if phone and not self.phoneable:
            self.game.output("You can't call that character.")
            return

        thread_id = self.phone_thread_id if phone and self.phoneable else self.thread_id
        assistant_name = self.phone_assistant_name if phone and self.phoneable else self.assistant_name

        if msg != "":
            user_message = "phone rings" if phone else (msg or input("(input): "))
            OpenAIClient.add_message(thread_id, user_message)
        else:
            user_message = ""

        hangups = r"bye|\*hangs up\*|\*click\*"
        full_message = ""
        bye = False

        self.game.output(f"{self.name.capitalize()}: ", end="", flush=True)

        try:
            for chunk in OpenAIClient.stream_assistant_response(thread_id, assistant_name, additional_instructions=self.additional_instructions):
                if isinstance(chunk, str):
                    self.game.output(chunk, end="", flush=True)
                    full_message += chunk
                elif isinstance(chunk, dict):
                    self.func(chunk)
                    bye = True
                elif isinstance(chunk, list):
                    for obj in chunk:
                        self.func(obj)
                    bye = True
        except Exception as e:
            self.game.output("Error:", e)
            bye = True

        self.game.output()

        if re.search(hangups, full_message.lower(), re.IGNORECASE) or re.search(hangups, user_message.lower(), re.IGNORECASE):
            bye = True
        elif not bye:
            if once:
                return True
            else:
                return self.talk(phone=phone)

        if bye:
            self.game.current_room_intro()
            return True

    def add_to_prompt(self, new_instructions: str):
        """
        Insert a 'system' message into the existing thread,
        effectively updating the context for subsequent calls.
        """
        if not hasattr(self, 'thread_id') or self.thread_id is None:
            self.game.output("No active thread to update.")
            return

        self.additional_instructions += f"\n{new_instructions}"
        try:
            OpenAIClient.add_message(self.thread_id, new_instructions, role="assistant")
        except Exception as e:
            pass

def find_json_objects(text: str):
    """
    Tries to find and parse *all* JSON objects in `text` by scanning from left to right.
    Returns a list of tuples (parsed_obj, start_index, end_index).
    """
    import json
    decoder = json.JSONDecoder()
    results = []

    i = 0
    n = len(text)

    while i < n:
        # Skip ahead until we see a '{' (or '[' if we also want arrays).
        # If you're only expecting objects, scan for '{'—if arrays too, look for '[' as well.
        if text[i] not in ['{', '[']:
            i += 1
            continue

        try:
            parsed_obj, end_index = decoder.raw_decode(text, i)
            # If we get here, it successfully parsed a JSON object
            results.append(parsed_obj)
            i = end_index  # jump past this object
        except json.JSONDecodeError:
            i += 1  # not valid JSON here, move on

    return results

def replace_triple_backticks(text: str, replacement: str='') -> str:
    """
    Replaces all substrings enclosed by triple backticks (``` ... ```) with a specified replacement string.

    :param text: The original string that may contain triple-backtick blocks.
    :param replacement: The string to replace triple-backtick blocks with.
    :return: The string with all triple-backtick blocks replaced.
    """
    # DOTALL flag so '.' matches newlines as well
    return re.sub(r'```.*?```', replacement, text, flags=re.DOTALL)