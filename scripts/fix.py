import os
import requests

move_name   = 'Decorate'
pokemon     = 'Alcremie'
img_url     = 'https://d275t8dp8rxb42.cloudfront.net/skills/Alcremie/Decorate.png'

# 1. Download the image
resp = requests.get(img_url)
resp.raise_for_status()   # optional: raise if download failed

# 2. Build the output path
output_dir  = os.path.join('static', 'img', 'Moves')
filename    = f"{pokemon} - {move_name}.png"
output_path = os.path.join(output_dir, filename)

# 3. Ensure the directory exists
os.makedirs(output_dir, exist_ok=True)

# 4. Write the file
with open(output_path, 'wb') as f:
    f.write(resp.content)

print(f"Downloaded and saved to: {output_path}")
