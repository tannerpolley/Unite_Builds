import requests

# # Path to the folder with files you want to rename
# folder_path = r"C:\Users\Tanner\Documents\git\Pokemon_Unite\static\images\Pokemon"
#
# # Iterate over all the files in the folder
# for filename in os.listdir(folder_path):
#     # Check if the file name starts with "t_square_"
#     if filename.startswith("t_Square_"):
#         # Remove the "t_square_" part from the file name
#         new_filename = filename.replace("t_Square_", "")
#
#         # Get the full path of the current and new file
#         old_file = os.path.join(folder_path, filename)
#         new_file = os.path.join(folder_path, new_filename)
#
#         # Rename the file
#         os.rename(old_file, new_file)
#         print(f'Renamed: {filename} -> {new_filename}')
move_name = 'Electro Ball'
Pokemon_name = 'Alolan Raichu'
Battle_Item_name = 'Goal Hacker'
img_url = 'https://d275t8dp8rxb42.cloudfront.net/items/battle/Goal+Hacker.png'
img_response = requests.get(img_url)
name_pic_file = 'static/images/Pokemon/' + Pokemon_name + '.png'
battle_item_pic_file = 'static/images/Battle_Items/' + Battle_Item_name + '.png'
move_1_pic_file = 'static/images/Battle_Items/' + Battle_Item_name + '.png'
with open(move_1_pic_file, 'wb') as f:
    print(move_1_pic_file)
    f.write(img_response.content)

# with open(battle_item_pic_file, 'wb') as f:
#     print(battle_item_pic_file)
#     f.write(img_response.content)
