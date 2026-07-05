# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set environment variables for production
ENV FLASK_ENV=production
ENV WORLD_FILE=/app/world.yaml

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port that the server listens on
EXPOSE 5000

# Use Gunicorn to serve the Flask application
CMD ["gunicorn", "--worker-class", "gevent", "--bind", "0.0.0.0:5000", "server:app"]
