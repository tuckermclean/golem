from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from characters import Character, AICharacter
from entities import Entity, Room, HiddenDoor
from items import Weapon
from adventure import Adventure
import os, uuid

app = Flask(__name__, static_url_path='', static_folder='static')
CORS(app)  # Enable CORS for all routes

app.secret_key = "supersecretkey"  # Replace with a secure key

# Global log buffer
log_buffers = {}
games = {}

def create_new_game(file=os.getenv("WORLD_FILE", "world.yaml")
):
    """Creates a new game instance for a session."""
    session['game_id'] = str(uuid.uuid4())  # Assign a unique game ID

    if not games.get(session['game_id']):
        games[session['game_id']] = Adventure(file=file, output=lambda x="", end="\n\n", flush=None: log_buffers[session['game_id']].append(str(x)+str(end)))
    
    game = games[session['game_id']]

    player = game.player
    world = game.world

    def current_room_intro():
        for char in dict(filter(lambda pair : game.player.in_room_items(pair[1]), Character.get_all(world=game.world).items())).values():
            char.loopit()

    def game_over():
        game.output("Game Over!")
        game.output("You have died.")
        game.output("Please refresh the page to start a new game.")
        del games[session['game_id']]
        session.clear()
        create_new_game()

    game.current_room_intro = current_room_intro
    game.game_over = game_over


@app.before_request
def ensure_game_session():
    """Ensures each session has its own game state."""
    if 'game_id' not in session:
        create_new_game()

# class StdoutBuffer(io.StringIO):
#     """ Redirects stdout to capture printed messages in a buffer. """
#     def write(self, message):
#         super().write(message)
#         log_buffer.append(message)  # Store log messages in the global buffer

#     def flush(self):
#         pass

# sys.stdout = StdoutBuffer()  # Redirect stdout to custom buffer

def get_game_state():
    """Fetches the current game state for the player."""
    try:
        current_room = games[session['game_id']].player.current_room
    except KeyError:
        create_new_game()

        current_room = games[session['game_id']].player.current_room
    actions_dict = current_room.get_actions()

    # Create mappings of valid actions per item and valid items per action
    item_to_actions = {}
    action_to_items = {}
    inventory_items = {
        item_name: [] for item_name, item in games[session['game_id']].player.inv_items.items()
    }

    for action, objects in actions_dict.items():
        if action == "go":
            continue  # Ignore movement actions
        
        for obj in objects:
            item_name = obj.name

            if item_name not in item_to_actions:
                item_to_actions[item_name] = []
            if item_name not in inventory_items:
                item_to_actions[item_name].append(action)
            else:
                inventory_items[item_name].append(action)
                del item_to_actions[item_name]

            if action not in action_to_items:
                action_to_items[action] = []
            action_to_items[action].append(item_name)

    adjacent_rooms = {
        room_name: room.name for room_name, room in current_room.get_rooms().items()
        if not (isinstance(room, HiddenDoor) and not room.condition())
    }

    return {
        "location": current_room.name,
        "description": current_room.description,
        "actions": action_to_items,  # Maps actions to valid items
        "items": item_to_actions,  # Maps items to valid actions
        "inventory": inventory_items,
        "adjacent_rooms": adjacent_rooms,
        "money": round(games[session['game_id']].player.money, 2),
        "health": games[session['game_id']].player.health,
        "first_health": games[session['game_id']].player.first_health,
    }

@app.route('/')
def serve_index():
    """Serve the main index.html file."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    return send_from_directory('static', 'index.html')

@app.route('/images/<path:filename>')
def serve_images(filename):
    """Serve images from the images directory."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    return send_from_directory('images', filename)

@app.route('/state', methods=['GET'])
def game_state():
    """API to get the current game state."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    return jsonify(get_game_state())

@app.route('/action', methods=['POST'])
def perform_action():
    """API to perform an action in the game."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    data = request.json
    action = data.get("action")
    item_name = data.get("item")

    if not action:
        return jsonify({"error": "Action is required"}), 400

    current_room = games[session['game_id']].player.current_room
    actions_dict = current_room.get_actions()

    if action not in actions_dict:
        return jsonify({"error": f"Invalid action: {action}"}), 400

    item = next((obj for obj in actions_dict[action] if obj.name == item_name), None)

    if isinstance(item, AICharacter) and action.lower() == "talk":
        request.talking_to = item.name
        return jsonify({"message": f"You are now talking to {item.name}.", "talking": True})

    elif isinstance(item, Weapon) and action.lower() == "use":
        if data.get("target") is None:
            # If the item is a weapon and no target is specified, prompt for a target
            return jsonify({"action": "use", "item": item.name, "message": "Choose a target.", "targets": [e.name for e in current_room.get_items().values() if isinstance(e, Character) and e != games[session['game_id']].player]})
        else:
            item.use(data.get("target"))
            return jsonify({"message": f"Used {item.name} on {data.get('target')}."})

    elif action.lower() == "look":
        games[session['game_id']].output(item)
        return jsonify({"message": str(item)})

    elif action.lower() == "take":
        item.take(look=False)
        games[session['game_id']].output(f"You took {item.name}.")
        return jsonify({"message": f"You took {item.name}."})

    else:
        item.do(action)
        return jsonify({"message": f"Performed {action} on {item_name}."})

@app.route('/move', methods=['POST'])
def move_to_room():
    """API to move to a different room."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    data = request.json
    room_name = data.get("room")

    if not room_name:
        return jsonify({"error": "Room name is required"}), 400

    current_room = games[session['game_id']].player.current_room.get_rooms().get(room_name)

    if not current_room:
        return jsonify({"error": f"No such room: {room_name}"}), 400

    current_room.go()
    return jsonify({"message": f"Moved to {room_name}.", "new_state": get_game_state()})

@app.route('/talk', methods=['POST'])
def talk_to_character():
    """API to talk to AI characters."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    data = request.json
    message = data.get("message")
    character_name = data.get("talking_to", None)

    if not character_name:
        return jsonify({"error": "No conversation is in progress."}), 400

    ai_character = next((char for char in Character.get_all(world=games[session['game_id']].world).values() if char.name == character_name), None)

    if not ai_character:
        return jsonify({"error": "Character not found"}), 404

    response = ai_character.talk(message, once=True)
    return jsonify({"response": response})

@app.route('/end_talk', methods=['POST'])
def end_talk():
    """API to end a conversation."""
    try:
        games[session['game_id']]
    except KeyError:
        create_new_game()

    if hasattr(request, "talking_to"):
        del request.talking_to
    return jsonify({"message": "Conversation ended."})

@app.route('/logs', methods=['GET'])
def get_logs():
    """API to retrieve stdout logs."""
    try:
        log_buffers[session['game_id']]
    except KeyError:
        log_buffers[session['game_id']] = []

    logs = log_buffers[session['game_id']][:]  # Copy the buffer
    log_buffers[session['game_id']] = []  # Clear the buffer after sending logs
    return jsonify({"logs": logs})

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)