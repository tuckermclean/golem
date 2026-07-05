# gui_adventure.py

import tkinter as tk
from tkinter import messagebox, PhotoImage
from PIL import Image, ImageTk
from characters import Character, AICharacter
from entities import Entity, Room, Door, HiddenDoor
from items import Weapon
from adventure import Adventure
import sys
import threading

class AdventureGUI:
    def __init__(self, root, adventure_game=None):
        self.root = root

        self.root.title("Adventure Game")
        self.root.geometry('600x800')

        # Set default font
        self.root.option_add("*Font", "Helvetica 12")

        self.selected_action = None
        self.selected_item = None

        self.create_widgets()
        if adventure_game:
            self.set_game(adventure_game)

    def set_game(self, adventure_game):
        self.game = adventure_game
        self.player = self.game.player
        self.update_gui()
        self.game.current_room_intro = self.current_room_intro

    def current_room_intro(self):
        for char in dict(filter(lambda pair : self.player.in_room_items(pair[1]), Character.get_all(world=self.game.world).items())).values():
            char.loopit()
        self.update_gui()

    def create_widgets(self):
        self.image_frame = tk.Frame(self.root, height=300, width=600)
        self.image_frame.pack()

        self.room_image_label = tk.Label(self.image_frame)
        self.room_image_label.pack()

        self.location_label = tk.Label(self.root, text="", font=("Helvetica", 16, "bold"))
        self.location_label.pack(pady=5)

        self.location_desc = tk.Label(self.root, text="", wraplength=500, justify="left")
        self.location_desc.pack(pady=5)

        self.action_buttons_frame = tk.Frame(self.root)
        self.action_buttons_frame.pack(pady=5)

        self.item_buttons_frame = tk.Frame(self.root)
        self.item_buttons_frame.pack(pady=5)

        self.adjacent_rooms_frame = tk.Frame(self.root)
        self.adjacent_rooms_frame.pack(pady=5)

        self.inventory_frame = tk.Frame(self.root)
        self.inventory_frame.pack(pady=5)

        self.output_text = tk.Text(self.root, height=10, state="disabled")
        # Set text wrapping to word
        self.output_text.config(wrap="word")
        self.output_text.pack(pady=10, fill="x")

        self.input_entry = tk.Entry(self.root)
        self.input_entry.pack(pady=5, fill="x")
        self.input_entry.bind("<Return>", self.send_input)
        self.input_entry.config(state="disabled")

        self.awaiting_input = False
        self.current_ai_character = None

    def update_gui(self):
        for frame in [self.action_buttons_frame, self.item_buttons_frame, self.adjacent_rooms_frame, self.inventory_frame]:
            for widget in frame.winfo_children():
                widget.destroy()

        current_room = self.player.current_room
        self.location_label.config(text=current_room.name.title())
        self.location_desc.config(text=current_room.description)

        self.update_room_image(current_room)

        actions_dict = current_room.get_actions()
        actions = set(actions_dict.keys()) - {"go"}
        items = set(item.name for sublist in actions_dict.values() for item in sublist) - self.player.inv_items.keys() - current_room.get_rooms(show_hidden=True).keys()
        inv_items = set(self.player.inv_items.keys())

        # Label for actions:
        tk.Label(self.action_buttons_frame, text="Actions:").pack(side="left", padx=5)

        try:
            if self.selected_action:
                items = set(item.name for item in actions_dict[self.selected_action])
                inv_items = set(item.name for item in actions_dict[self.selected_action])
            if self.selected_item:
                actions = {action for action, objs in actions_dict.items() if any(obj.name == self.selected_item for obj in objs)}
        except KeyError:
            self.selected_action = None
            self.selected_item = None
            return self.update_gui()
    
        for action in actions:
            if action == self.selected_action:
                btn = tk.Button(self.action_buttons_frame, text=action,
                            command=lambda a=action: self.select_action(a), background="blue")
            else:
                btn = tk.Button(self.action_buttons_frame, text=action,
                            command=lambda a=action: self.select_action(a))
            btn.pack(side="left", padx=5)

        # Label for items:
        tk.Label(self.item_buttons_frame, text="Items:").pack(side="left", padx=5)

        for item_name in items:
            if item_name == self.selected_item:
                btn = tk.Button(self.item_buttons_frame, text=item_name,
                            command=lambda i=item_name: self.select_item(i), background="blue")
            else:
                btn = tk.Button(self.item_buttons_frame, text=item_name,
                            command=lambda i=item_name: self.select_item(i))
            btn.pack(side="left", padx=5)

        # Label for adjacent rooms:
        tk.Label(self.adjacent_rooms_frame, text="Adjacent Rooms:").pack(side="left", padx=5)

        for room_name, room in current_room.get_rooms().items():
            # If it's a hidden door, and the condition is not met, skip it
            if isinstance(room, HiddenDoor) and not room.condition():
                continue

            btn = tk.Button(self.adjacent_rooms_frame, text=room_name,
                            command=lambda r=room: self.move_to_room(r))
            btn.pack(side="left", padx=5)

        # Label for inventory:
        tk.Label(self.inventory_frame, text="Inventory:").pack(side="left", padx=5)

        for inv_item in inv_items:
            if inv_item == self.selected_item:
                lbl = tk.Button(self.inventory_frame, text=inv_item,
                            command=lambda i=inv_item: self.select_item(i), background="blue")
            else:
                lbl = tk.Button(self.inventory_frame, text=inv_item,
                            command=lambda i=inv_item: self.select_item(i))
            lbl.pack(side="left", padx=5)
        
        # Label for money:
        tk.Label(self.inventory_frame, text=f"Money: ${'{:.2f}'.format(self.player.money)}").pack(side="left", padx=5)

    def update_room_image(self, room):
        image_path = f"images/{room.name.lower().replace(' ', '_').replace("'", '_')}.jpeg"
        try:
            img = Image.open(image_path)
            self.room_image = ImageTk.PhotoImage(img)
            self.room_image_label.config(image=self.room_image)
        except FileNotFoundError:
            self.room_image_label.config(image="")

    def select_action(self, action):
        self.selected_action = None if self.selected_action == action else action
        if self.selected_action and self.selected_item:
            self.execute_selected()
        else:
            self.update_gui()

    def select_item(self, item):
        self.selected_item = None if self.selected_item == item else item
        if self.selected_action and self.selected_item:
            self.execute_selected()
        else:
            self.update_gui()

    def execute_selected(self):
        action = self.selected_action
        item_name = self.selected_item
        item = next((obj for obj in self.player.current_room.get_actions()[action] if obj.name == item_name), None)
        if isinstance(item, AICharacter) and action.lower() == "talk":
            self.start_talk_ai(item)
        elif isinstance(item, Weapon) and action.lower() == "use":
            self.show_weapon_targets(item)
        elif action.lower() == "look":
            print(item)
        elif action.lower() == "take":
            item.take(look=False)
            print(item)
        else:
            item.do(action)
        self.selected_action = None
        self.selected_item = None
        self.update_gui()

    def show_weapon_targets(self, weapon):
        target_window = tk.Toplevel(self.root)
        target_window.title("Choose Target")
        tk.Label(target_window, text="Choose a target:").pack(pady=5)
        # Filter list of items in the room to only include characters and exclude the player
        characters = [
            entity for entity in self.player.current_room.get_items().values()
            if isinstance(entity, Character) and entity != self.player
        ]

        if not characters:
            messagebox.showinfo("No Targets", "No valid targets available.")
            target_window.destroy()
            return
        
        for entity in characters:
            btn = tk.Button(
                target_window,
                text=entity.name,
                command=lambda e=entity: self.use_weapon_on_target(weapon, target=e, window=target_window)
            )
            btn.pack(pady=2)

    def use_weapon_on_target(self, weapon, target, window):
        weapon.use(target)
        window.destroy()
        self.update_gui()

    def move_to_room(self, room):
        self.end_talk_ai()
        room.go()
        self.update_gui()

    def start_talk_ai(self, ai_character):
        self.current_ai_character = ai_character
        self.input_entry.config(state="normal")
        self.input_entry.delete(0, "end")
        self.input_entry.focus()
        self.awaiting_input = True
        print(f"You are now talking to {ai_character.name}. Type your message and press Enter.")

    def end_talk_ai(self):
        self.awaiting_input = False
        self.input_entry.config(state="disabled")
        self.current_ai_character = None

    def send_input(self, event):
        if self.awaiting_input:
            user_input = self.input_entry.get()
            if not user_input.strip():
                return
            self.input_entry.delete(0, "end")
            print(f"You said: {user_input}")
            threading.Thread(target=self.current_ai_character.talk, args=(user_input,), kwargs={'once': True}, daemon=True).start()

    def output(self, text):
        self.output_text.config(state="normal")

        # Insert new text with a yellow highlight
        self.output_text.insert("end", text, "highlight")

        # Ensure new text is visible
        self.output_text.see("end")
        self.output_text.config(state="disabled")

        # Schedule removal of highlight after 3 seconds
        self.root.after(3000, remove_highlight)

        def remove_highlight(self):
            self.output_text.config(state="normal")
            self.output_text.tag_remove("highlight", "1.0", "end")
            self.output_text.config(state="disabled")

        # Configure the tag for highlighting new text with a yellow background
        self.output_text.tag_configure("highlight", background="yellow")

if __name__ == '__main__':
    root = tk.Tk()
    player = Character(lookable=False, health=3, warn=False)
    gui = AdventureGUI(root)
    adventure_game = Adventure(player=player, output=gui.output)
    gui.set_game(adventure_game)
    root.mainloop()