import yaml
from graphviz import Digraph

# Load your world YAML data
with open('world.yaml', 'r', encoding='utf-8') as file:
    data = yaml.safe_load(file)

# Create directed graph
dot = Digraph(comment='Adventure World', format='png')
dot.attr(rankdir='LR')

# Add rooms as nodes
for room in data['rooms']:
    # Highlight the starting room (first room in the list)
    if room == data['rooms'][0]:
        dot.node(room['name'], room['name'], style='filled', fillcolor='lightblue')
    else:
        dot.node(room['name'], room['name'])

# Add links between rooms, ensuring only one edge per pair
added_edges = set()
for room in data['rooms']:
    for link in room.get('links', []):
        edge = tuple(sorted([room['name'], link]))
        if edge not in added_edges:
            dot.edge(edge[0], edge[1], dir='both')
            added_edges.add(edge)

# Add doors as edges with special styling
for door in data.get('doors', []):
    if door.get('hidden', False):
        dot.edge(door['room1'], door['room2'], label=f"Hidden Door: {door['name']}", dir='both', style='dashed', color='gray')
    else:
        dot.edge(door['room1'], door['room2'], label=f"Door: {door['name']}", dir='both', style='dashed', color='red')

# Add items grouped into a single node
for room in data['rooms']:
    items = []
    item_node_id = f"{room['name']}_items"
    for item in room.get('items', []):
        items.append(item['name'])
    if items:
        dot.node(item_node_id, '\n'.join(items), shape='box', color='green')
        dot.edge(room['name'], item_node_id, style='dotted', dir='none')

# Add characters
for character in data.get('characters', []):
    char_node_id = f"{character['current_room']}_{character['name']}"
    dot.node(char_node_id, character['name'], shape='ellipse', color='blue')
    dot.edge(character['current_room'], char_node_id, style='dotted', dir='none')

# Generate and save the diagram
dot.render('adventure_world_diagram', view=True)