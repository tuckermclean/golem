class News():
    def __init__(self):
        self.bulletins = []
        self.subscribers = {}

    def publish(self, bulletin):
        self.bulletins.append(bulletin)
        for subscriber in self.subscribers.values():
            subscriber.notify_news(bulletin)

    def subscribe(self, character):
        self.subscribers[character.name] = character

    def unsubscribe(self, character):
        if character.name in self.subscribers:
            del self.subscribers[character.name]
