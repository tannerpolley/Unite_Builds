import os
import requests

move_name   = 'Luster Purge'
pokemon     = 'Latias'
img_url     = 'https://uniteapi.dev/_next/image?url=%2FSprites%2Ft_Skill_Latias_S12.png&w=64&q=75'


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
