import requests
import os
from datetime import datetime

# Ensure the images folder exists
os.makedirs('images', exist_ok=True)

# Generate a unique filename (using timestamp to avoid collisions)
filename = f"images/image_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

# Download a single random image from Picsum
url = "https://picsum.photos/800/600"
response = requests.get(url)

# Save the image
with open(filename, 'wb') as f:
    f.write(response.content)

# Log the saved filename
print(f"Image saved as: {filename}")