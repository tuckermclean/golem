# Adventure Game Engine

A flexible text-based adventure game engine written in Python. This engine allows you to create interactive text adventures with rooms, items, characters, and more.

## Features

- **Entity System**: A flexible entity-based architecture that allows for easy extension
- **Room Navigation**: Create interconnected rooms with doors and passages
- **Item Interaction**: Items can be picked up, dropped, used, and more
- **Character System**: Create NPCs and AI characters with custom behaviors
- **Command Interface**: Built-in command processing using cmd2
- **YAML World Definition**: Define your game world using simple YAML files

## Installation

```bash
# Clone the repository
git clone https://github.com/tuckermclean/adventure.git
cd adventure

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Running the Game

```bash
export OPENAI_API_KEY=your_openai_api_key
python adventure.py
```

### Creating a Custom World

Create a YAML file with your world definition:

```yaml
rooms:
  - name: living_room
    description: A cozy living room with a fireplace
    links: [kitchen, hallway]
    items:
      - name: book
        type: Item
        description: An old leather-bound book
        takeable: true

  - name: kitchen
    description: A modern kitchen with stainless steel appliances
    links: [living_room]
    items:
      - name: apple
        type: Eatable
        description: A fresh red apple
        takeable: true
        verb: eat
        use_msg: Delicious!

characters:
  - name: butler
    type: NonPlayerCharacter
    description: A well-dressed butler
    current_room: living_room
    health: 10
    verb: talk
    use_msg: "Good day, sir!"
```

There are some truly complex examples in the `world.yaml` file.

## Testing

Run the tests with coverage:

```bash
python -m pytest tests --cov
```

## Production

Run the server with Gunicorn:

```bash
export OPENAI_API_KEY=your_openai_api_key
gunicorn server:app
```

Or, run the server with Docker:

```bash
docker build -t adventure .
docker run -e OPENAI_API_KEY=your_openai_api_key -p 5000:5000 adventure
```

## API Specification

The API specification is available in [API_SPECIFICATION.md](API_SPECIFICATION.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
