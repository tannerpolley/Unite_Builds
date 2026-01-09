"""
Pokemon Unite Database Scraper - Working Version
This scraper uses Selenium to handle JavaScript-rendered content
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import requests
from bs4 import BeautifulSoup
import json
import time
import re
import os
from typing import Dict, List, Optional
import logging
from urllib.parse import urljoin

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class UniteDBWorkingScraper:
    """Working scraper using Selenium for JavaScript-rendered pages"""

    BASE_URL = "https://unite-db.com"
    POKEMON_URL = f"{BASE_URL}/pokemon"

    def __init__(self, headless: bool = True):
        self.pokemon_data = {}
        self.driver = None
        self.headless = headless
        self.load_pokemon_database()
        # self.create_image_directories()

    def load_pokemon_database(self):
        """Load existing Pokemon database from all_pokemon_detailed.json"""
        try:
            import os
            with open('../static/json/all_pokemon_detailed.json', 'r', encoding='utf-8') as f:
                self.pokemon_data = json.load(f)
            logger.info(f"Loaded {len(self.pokemon_data)} Pokemon from database")
        except FileNotFoundError:
            logger.warning("No existing database found - will create new one")
            self.pokemon_data = {}
        except Exception as e:
            logger.error(f"Error loading database: {e}")
            self.pokemon_data = {}

    def create_image_directories(self):
        """Create necessary image directories if they don't exist"""
        unite_moves_dir = './/static/img/Unite_Moves'
        if not os.path.exists(unite_moves_dir):
            os.makedirs(unite_moves_dir)
            logger.info(f"Created directory: {unite_moves_dir}")

    def download_image(self, image_url: str, save_path: str) -> bool:
        """Download an image from URL and save to local path"""
        try:
            # Make sure the URL is absolute
            if not image_url.startswith('http'):
                image_url = urljoin(self.BASE_URL, image_url)

            # Download the image
            response = requests.get(image_url, timeout=10)
            response.raise_for_status()

            # Save the image
            with open(save_path, 'wb') as f:
                f.write(response.content)

            logger.info(f"Downloaded image: {save_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to download image from {image_url}: {e}")
            return False

    def setup_driver(self):
        """Setup Chrome WebDriver with options"""
        options = webdriver.ChromeOptions()

        if self.headless:
            options.add_argument('--headless=new')

        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        try:
            self.driver = webdriver.Chrome(options=options)
            logger.info("Chrome WebDriver initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing WebDriver: {e}")
            logger.info("Make sure you have Chrome and ChromeDriver installed")
            raise

    def close_driver(self):
        """Close the WebDriver"""
        if self.driver:
            self.driver.quit()
            logger.info("WebDriver closed")

    def get_pokemon_to_scrape(self) -> List[tuple]:
        """Get list of (preferred_name, unite_db_name) tuples from database"""
        pokemon_list = []

        for preferred_name, data in self.pokemon_data.items():
            unite_db_name = data.get('unite-db-name')
            if not unite_db_name:
                logger.warning(f"No unite-db-name for '{preferred_name}', skipping")
                continue
            pokemon_list.append((preferred_name, unite_db_name))

        logger.info(f"Found {len(pokemon_list)} Pokemon to scrape from database")
        return pokemon_list

    def clean_text(self, text: Optional[str]) -> str:
        """Clean and normalize text"""
        if not text:
            return ""
        text = re.sub(r'\s+', ' ', text.strip())
        return text

    def check_single_upgrade_structure(self, preferred_name: str) -> Dict[str, bool]:
        """Check if Pokemon uses single upgrade structure for moves"""
        # Pokemon with only 1 upgrade per move
        megas_single_upgrade = [
            "Mega Charizard X", "Mega Charizard Y",
            "Mega Gyarados", "Mega Lucario"
        ]

        # Scyther and Scizor: Move 1 has 1 upgrade, Move 2 has 2
        scyther_scizor = ["Scyther", "Scizor"]

        result = {"Move 1": False, "Move 2": False}

        if preferred_name in megas_single_upgrade:
            # Both moves have single upgrade
            result["Move 1"] = True
            result["Move 2"] = True
        elif preferred_name in scyther_scizor:
            # Only Move 1 has single upgrade
            result["Move 1"] = True
            result["Move 2"] = False

        return result

    def validate_scraped_data(self, pokemon_data: Dict, pokemon_name: str):
        """Validate that critical fields aren't blank"""
        blank_fields = []

        # Check Passive Ability
        if not pokemon_data.get("Passive Ability", {}).get("Name"):
            blank_fields.append("Passive Ability.Name")

        # Check Attack
        if not pokemon_data.get("Attack"):
            blank_fields.append("Attack")

        # Check Move 1 - Mew has special structure with Upgrades
        move1 = pokemon_data.get("Move 1", {})
        if "Upgrade 1" in move1:
            # Mew's move group structure - check if at least Upgrade 1 has a name
            if not move1.get("Upgrade 1", {}).get("Name"):
                blank_fields.append("Move 1.Upgrade 1.Name")
        else:
            # Regular move structure
            if not move1.get("Name"):
                blank_fields.append("Move 1.Name")

        # Check Move 2 - Mew has special structure with Upgrades
        move2 = pokemon_data.get("Move 2", {})
        if "Upgrade 1" in move2:
            # Mew's move group structure
            if not move2.get("Upgrade 1", {}).get("Name"):
                blank_fields.append("Move 2.Upgrade 1.Name")
        else:
            # Regular move structure
            if not move2.get("Name"):
                blank_fields.append("Move 2.Name")

        # Check Unite Move
        if not pokemon_data.get("Unite Move", {}).get("Name"):
            blank_fields.append("Unite Move.Name")

        if blank_fields:
            error_msg = f"VALIDATION ERROR for {pokemon_name}: Blank fields detected: {', '.join(blank_fields)}"
            logger.error(error_msg)
            raise ValueError(error_msg)

    def wait_for_content(self, timeout: int = 15):
        """Wait for the page content to load"""
        try:
            # Wait for the main content area to appear
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((By.CLASS_NAME, "full-details"))
            )
            # Additional wait for JavaScript to populate content
            time.sleep(3)
        except TimeoutException:
            logger.warning("Timeout waiting for content - continuing anyway")

    def scrape_pokemon_page(self, pokemon_name: str, preferred_name: str = "") -> Optional[Dict]:
        """Scrape individual Pokemon page"""
        url = f"{self.POKEMON_URL}/{pokemon_name}"
        logger.info(f"Scraping {pokemon_name} from {url}")

        try:
            self.driver.get(url)
            self.wait_for_content()

            # Get the fully rendered HTML
            html = self.driver.page_source
            soup = BeautifulSoup(html, 'html.parser')

            # Check if this is Mew (special move group structure)
            if pokemon_name.lower() == 'mew':
                pokemon_data = self.extract_mew_moves(soup, pokemon_name=preferred_name)
            else:
                # Determine if this Pokemon uses single or dual upgrade structure
                has_single_upgrade = self.check_single_upgrade_structure(preferred_name)

                pokemon_data = {
                    "Passive Ability": self.extract_passive_ability(soup),
                    "Attack": self.extract_auto_attack(soup),
                    "Move 1": self.extract_move(soup, move_number=1, single_upgrade=has_single_upgrade.get("Move 1", False)),
                    "Move 2": self.extract_move(soup, move_number=2, single_upgrade=has_single_upgrade.get("Move 2", False)),
                    "Unite Move": self.extract_unite_move(soup, pokemon_name=preferred_name)
                }

            # Validate that we didn't get blank critical fields
            self.validate_scraped_data(pokemon_data, pokemon_name)

            logger.info(f"Successfully scraped {pokemon_name}")
            return pokemon_data

        except Exception as e:
            logger.error(f"Error scraping {pokemon_name}: {e}")
            import traceback
            traceback.print_exc()
            return None

    def extract_passive_ability(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract passive ability from rendered page"""
        passive = {"Name": "", "Description": ""}

        try:
            # Find the passive skill div
            passive_skill = soup.find('div', class_='skill Passive')
            if passive_skill:
                # Find the inner passive ability div
                passive_div = passive_skill.find('div', class_='passive ability')
                if passive_div:
                    # Get the name from info > h2
                    info_div = passive_div.find('div', class_='info')
                    if info_div:
                        name_elem = info_div.find('h2')
                        if name_elem:
                            passive["Name"] = self.clean_text(name_elem.get_text())

                    # Get the description (direct child p.description)
                    desc_elem = passive_div.find('p', class_='description', recursive=False)
                    if desc_elem:
                        passive["Description"] = self.clean_text(desc_elem.get_text())

                    info_two_div = passive_div.find('div', class_='info two')
                    if info_two_div:
                        # print('hi')
                        name_elem = info_two_div.find('h2')
                        if name_elem:
                            passive["Name 2"] = self.clean_text(name_elem.get_text())

                        # Get the description (direct child p.description)
                        desc_elems = passive_div.find_all('p', class_='description', recursive=False)[1:]
                        if desc_elems:
                            passive["Description 2"] = ''
                            for desc_elem in desc_elems:
                                passive["Description 2"] += self.clean_text(desc_elem.get_text()) + '\n\n'
                    else:
                        desc_elems = passive_div.find_all('p', class_='description', recursive=False)[1:]

                        for desc_elem in desc_elems:
                            if desc_elem:
                                passive["Description"] += '  ' + self.clean_text(desc_elem.get_text())



        except Exception as e:
            logger.warning(f"Error extracting passive ability: {e}")

        return passive

    def extract_auto_attack(self, soup: BeautifulSoup) -> str:
        """Extract auto attack description"""
        try:
            # Find the basic attack skill div
            basic_skill = soup.find('div', class_='skill Basic')
            if basic_skill:
                # Find the inner auto attack div
                auto_div = basic_skill.find('div', class_='auto attack')
                if auto_div:
                    # Get the description (direct child p.description)
                    desc_elems = auto_div.find_all('p', class_='description', recursive=False)
                    desc_text = ''
                    for desc_elem in desc_elems:
                        if desc_elem:
                            desc_text += self.clean_text(desc_elem.get_text()) + '\n\n'
                    return desc_text

        except Exception as e:
            logger.warning(f"Error extracting auto attack: {e}")

        return ""

    def extract_mew_moves(self, soup: BeautifulSoup, pokemon_name: str = "") -> Dict:
        """Extract Mew's special move group structure"""
        pokemon_data = {
            "Passive Ability": self.extract_passive_ability(soup),
            "Attack": self.extract_auto_attack(soup),
            "Unite Move": self.extract_unite_move(soup, pokemon_name=pokemon_name)
        }

        # Find skill Move 1 and skill Move 2 divs first
        skill_moves = [
            soup.find('div', class_='skill Move 1'),
            soup.find('div', class_='skill Move 2')
        ]

        for idx, skill_move in enumerate(skill_moves, 1):
            if not skill_move:
                continue

            move_key = f"Move {idx}"

            # Find move-group within the skill Move div
            move_group = skill_move.find('div', class_='move-group')
            if not move_group:
                continue

            move_options = move_group.find_all('div', class_='move-option')

            # Mew has 3 move upgrades per group
            options_data = {}
            for opt_idx, move_option in enumerate(move_options[:3], 1):
                option_key = f"Upgrade {opt_idx}"

                # Extract move data - Mew's structure is different
                # Includes base description (Level 1/3) and enhanced (Level 10/12)
                option_data = {
                    "Name": "",
                    "Level": "",
                    "Cooldown": "",
                    "Description": "",
                    "Enhanced Level": "",
                    "Enhanced Description": ""
                }

                # Get name and cooldown from info div (direct child of move-option)
                info_div = move_option.find('div', class_='info')
                if info_div:
                    # Get name from h2
                    name_elem = info_div.find('h2')
                    if name_elem:
                        option_data["Name"] = self.clean_text(name_elem.get_text())

                    # Get cooldown
                    cooldown_p = info_div.find('p', class_='cooldown')
                    if cooldown_p:
                        cd_text = cooldown_p.get_text()
                        cd_match = re.search(r'([\d.]+\s*s)', cd_text)
                        if cd_match:
                            option_data["Cooldown"] = cd_match.group(1).strip()

                # Get description - for Mew, it can be in different structures:
                # Option 1: <p class="description"><label>Level 1</label>Text</p> (direct child)
                # Options 2-3: <div class="description"><p><span><label>Level 1</label>Text</span></p></div>

                desc_elem = None

                # First try: Look for direct child p.description
                desc_elem = move_option.find('p', class_='description', recursive=False)

                # Second try: Look for div.description > p with label inside
                if not desc_elem:
                    desc_div = move_option.find('div', class_='description', recursive=False)
                    if desc_div:
                        # Find the first p tag inside that has a label
                        p_tags = desc_div.find_all('p')
                        for p in p_tags:
                            label = p.find('label', class_='label')
                            if label and 'Level' in label.get_text():
                                desc_elem = p
                                break

                # Third try: Look for any direct child <p> that has a label
                if not desc_elem:
                    all_p_tags = move_option.find_all('p', recursive=False)
                    for p in all_p_tags:
                        label = p.find('label', class_='label')
                        if label and 'Level' in label.get_text():
                            desc_elem = p
                            break

                if desc_elem:
                    # For Mew, the description has a label we need to skip
                    # Sometimes it's in a span: <p><span><label>Level 1</label>Text</span></p>

                    # Check if there's a span containing the label
                    span = desc_elem.find('span')
                    if span:
                        # Get text from span
                        desc_text = span.get_text()
                    else:
                        # Get text from p directly
                        desc_text = desc_elem.get_text()

                    # Extract the base level and remove the label text
                    label = desc_elem.find('label', class_='label')
                    if label:
                        label_text = label.get_text()

                        # Extract level number (e.g., "Level 1" -> "1", "Level 3" -> "3")
                        level_match = re.search(r'Level\s+(\d+)', label_text, re.I)
                        if level_match:
                            level_num = level_match.group(1)
                            # Only set as base level if it's low (1-3), not enhanced (10+)
                            if int(level_num) < 10:
                                option_data["Level"] = level_num

                        # Remove label text from the full description
                        desc_text = desc_text.replace(label_text, '', 1)

                    option_data["Description"] = self.clean_text(desc_text)

                # Extract enhanced description (can be Level 10, 11, 12, etc.)
                # Can be in multiple places:
                # 1. Inside <div class="description"> (Options 2 & 3)
                # 2. As direct child <p class="description"> (Option 1)
                # 3. Inside <section class="half-columns">

                enhanced_found = False

                # First, try finding in div.description
                desc_div = move_option.find('div', class_='description', recursive=False)
                if desc_div:
                    all_desc_p = desc_div.find_all('p', class_='description')
                    for p in all_desc_p:
                        label = p.find('label', class_='label')
                        if label:
                            # Match any "Level X" where X is a number (10, 11, 12, etc.)
                            level_match = re.search(r'Level\s+(\d+)', label.get_text(), re.I)
                            if level_match:
                                level_num = level_match.group(1)
                                # Skip if it's the base level (Level 1, Level 3, etc.) - enhanced is typically 10+
                                if int(level_num) >= 10:
                                    option_data["Enhanced Level"] = level_num

                                    # Try to get from span first
                                    enhanced_span = p.find('span')
                                    if enhanced_span:
                                        option_data["Enhanced Description"] = self.clean_text(enhanced_span.get_text())
                                    else:
                                        # Get direct text content (without the label)
                                        enhanced_text = p.get_text().replace(label.get_text(), '', 1)
                                        option_data["Enhanced Description"] = self.clean_text(enhanced_text)

                                    enhanced_found = True
                                    break

                # If not found, try direct children p.description tags
                if not enhanced_found:
                    all_p_desc = move_option.find_all('p', class_='description', recursive=False)
                    for p in all_p_desc:
                        label = p.find('label', class_='label')
                        if label:
                            level_match = re.search(r'Level\s+(\d+)', label.get_text(), re.I)
                            if level_match:
                                level_num = level_match.group(1)
                                if int(level_num) >= 10:
                                    option_data["Enhanced Level"] = level_num

                                    # Try to get from span first
                                    enhanced_span = p.find('span')
                                    if enhanced_span:
                                        option_data["Enhanced Description"] = self.clean_text(enhanced_span.get_text())
                                    else:
                                        # Get direct text content (without the label)
                                        enhanced_text = p.get_text().replace(label.get_text(), '', 1)
                                        option_data["Enhanced Description"] = self.clean_text(enhanced_text)

                                    enhanced_found = True
                                    break

                # If still not found, check inside section.half-columns
                if not enhanced_found:
                    # Look in div.description > section.half-columns
                    if desc_div:
                        half_columns = desc_div.find('section', class_='half-columns')
                        if half_columns:
                            all_p_desc = half_columns.find_all('p', class_='description')
                            for p in all_p_desc:
                                label = p.find('label', class_='label')
                                if label:
                                    level_match = re.search(r'Level\s+(\d+)', label.get_text(), re.I)
                                    if level_match:
                                        level_num = level_match.group(1)
                                        if int(level_num) >= 10:
                                            option_data["Enhanced Level"] = level_num

                                            # Try to get from span first
                                            enhanced_span = p.find('span')
                                            if enhanced_span:
                                                option_data["Enhanced Description"] = self.clean_text(enhanced_span.get_text())
                                            else:
                                                # Get direct text content (without the label)
                                                enhanced_text = p.get_text().replace(label.get_text(), '', 1)
                                                option_data["Enhanced Description"] = self.clean_text(enhanced_text)

                                            break

                options_data[option_key] = option_data

            pokemon_data[move_key] = options_data

        return pokemon_data

    def extract_move(self, soup: BeautifulSoup, move_number: int, single_upgrade: bool = False) -> Dict:
        """Extract move information including upgrades"""
        # Create structure based on upgrade type
        if single_upgrade:
            move_data = {
                "Name": "",
                "Level": "",
                "Cooldown": "",
                "Description": "",
                "Upgrade": {
                    "Name": "",
                    "Level": "",
                    "Cooldown": "",
                    "Description": "",
                    "Enhanced Level": "",
                    "Enhanced Description": ""
                }
            }
        else:
            move_data = {
                "Name": "",
                "Level": "",
                "Cooldown": "",
                "Description": "",
                "Upgrade 1": {
                    "Name": "",
                    "Level": "",
                    "Cooldown": "",
                    "Description": "",
                    "Enhanced Level": "",
                    "Enhanced Description": ""
                },
                "Upgrade 2": {
                    "Name": "",
                    "Level": "",
                    "Cooldown": "",
                    "Description": "",
                    "Enhanced Level": "",
                    "Enhanced Description": ""
                }
            }

        try:
            # Find the specific move div (Move 1 or Move 2)
            move_class = f"Move {move_number}"
            move_skill = soup.find('div', class_=f'skill {move_class}')

            if move_skill:
                # Find the activated-ability div
                activated_div = move_skill.find('div', class_='activated-ability')
                if activated_div:
                    # Get base move name from info > h2
                    info_div = activated_div.find('div', class_='info')
                    if info_div:
                        name_elem = info_div.find('h2')
                        if name_elem:
                            move_data["Name"] = self.clean_text(name_elem.get_text())

                        # Get cooldown from p.cooldown
                        cooldown_p = info_div.find('p', class_='cooldown')
                        if cooldown_p:
                            cd_text = cooldown_p.get_text()
                            cd_match = re.search(r'([\d.]+\s*s)', cd_text)
                            if cd_match:
                                move_data["Cooldown"] = cd_match.group(1).strip()

                    # Get level from p.level-unlock
                    level_p = activated_div.find('p', class_='level-unlock')
                    if level_p:
                        level_label = level_p.find('label')
                        if level_label:
                            level_text = level_label.get_text()
                            # Extract "Level 1 or 3" -> "1 or 3"
                            level_match = re.search(r'Level\s+(.*)', level_text, re.I)
                            if level_match:
                                move_data["Level"] = level_match.group(1).strip()

                    # Get base description (all p.description tags that are direct children)
                    desc_paragraphs = activated_div.find_all('p', class_='description', recursive=False)
                    if desc_paragraphs:
                        descriptions = [self.clean_text(p.get_text()) for p in desc_paragraphs]
                        move_data["Description"] = " ".join(descriptions)

                    # Extract upgrades
                    upgrades_div = activated_div.find('div', class_='upgrades')
                    if upgrades_div:
                        upgrade_divs = upgrades_div.find_all('div', class_='upgrade', recursive=False)

                        # Determine how many upgrades to process
                        max_upgrades = 1 if single_upgrade else 2

                        for idx, upgrade_div in enumerate(upgrade_divs[:max_upgrades], 1):
                            # Use "Upgrade" for single, "Upgrade 1"/"Upgrade 2" for dual
                            if single_upgrade:
                                upgrade_key = "Upgrade"
                            else:
                                upgrade_key = f"Upgrade {idx}"

                            # Get upgrade name from info > h2
                            upgrade_info = upgrade_div.find('div', class_='info')
                            if upgrade_info:
                                upgrade_name = upgrade_info.find('h2')
                                if upgrade_name:
                                    move_data[upgrade_key]["Name"] = self.clean_text(upgrade_name.get_text())

                                # Get upgrade cooldown
                                upgrade_cooldown_p = upgrade_info.find('p', class_='cooldown')
                                if upgrade_cooldown_p:
                                    cd_text = upgrade_cooldown_p.get_text()
                                    cd_match = re.search(r'([\d.]+\s*s)', cd_text)
                                    if cd_match:
                                        move_data[upgrade_key]["Cooldown"] = cd_match.group(1).strip()

                            # Get upgrade description and levels from div.description
                            upgrade_desc_div = upgrade_div.find('div', class_='description')
                            if upgrade_desc_div:
                                # Find all paragraphs with labels
                                label_paragraphs = upgrade_desc_div.find_all('p')
                                for p in label_paragraphs:
                                    label = p.find('label', class_='label')

                                    if label:
                                        label_text = label.get_text()
                                        level_match = re.search(r'Level\s+(\d+)', label_text, re.I)

                                        if level_match:
                                            level_num = level_match.group(1)

                                            # Get the span text after the label
                                            span = p.find('span')
                                            if span:
                                                desc_text = self.clean_text(span.get_text())

                                    elif 'description' in p.get('class', []):
                                        desc_text = '  ' + p.get_text()
                                        move_data[upgrade_key]["Description"] += '\n\n' + desc_text

                                    # Determine if this is base level or enhanced level
                                    if not move_data[upgrade_key]["Level"]:
                                    # First level found is the base upgrade level
                                        move_data[upgrade_key]["Level"] = level_num
                                        move_data[upgrade_key]["Description"] += desc_text
                                    else:
                                    # Second level found is the enhanced level
                                        move_data[upgrade_key]["Enhanced Level"] = level_num
                                        move_data[upgrade_key]["Enhanced Description"] = desc_text

                                # Special case: Check for Decidueye-style enhanced descriptions
                                # where p has style="margin-bottom: 15px;" and label is inside
                                if not move_data[upgrade_key]["Enhanced Level"]:
                                    enhanced_p = upgrade_desc_div.find('p', style="margin-bottom: 15px;")
                                    if enhanced_p:
                                        # Find label with level
                                        label = enhanced_p.find('label', class_='label')
                                        if label:
                                            level_text = label.get_text()
                                            level_match = re.search(r'Level\s+(\d+)', level_text, re.I)
                                            if level_match:
                                                move_data[upgrade_key]["Enhanced Level"] = level_match.group(1)

                                        # Find the description in the next p.description sibling
                                        next_desc_p = enhanced_p.find_next_sibling('p', class_='description')
                                        if next_desc_p:
                                            move_data[upgrade_key]["Enhanced Description"] = self.clean_text(next_desc_p.get_text())

        except Exception as e:
            logger.warning(f"Error extracting move {move_number}: {e}")
            import traceback
            traceback.print_exc()

        return move_data

    def extract_unite_move(self, soup: BeautifulSoup, pokemon_name: str = "") -> Dict[str, str]:
        """Extract Unite Move information and download image"""
        unite_data = {
            "Name": "",
            "Level": "",
            "Cooldown": "",
            "Description": "",
            "Buff Duration": "",
            "Buff Stats": "",
            "Image": ""
        }

        try:
            # Find the Unite Move skill div
            unite_skill = soup.find('div', class_='skill Unite Move')

            if unite_skill:
                # Find the ultimate-ability div inside (Unite Moves use 'ultimate-ability' not 'activated-ability')
                ultimate_div = unite_skill.find('div', class_='ultimate-ability')
                if ultimate_div:
                    # Get name from info > h2
                    info_div = ultimate_div.find('div', class_='info')
                    if info_div:
                        name_elem = info_div.find('h2')
                        if name_elem:
                            unite_data["Name"] = self.clean_text(name_elem.get_text())

                    # Extract and download Unite Move image
                    img_elem = ultimate_div.find('img')
                    if img_elem and img_elem.get('src'):
                        image_url = img_elem['src']

                        # Create filename: Pokemon_Name - Unite_Move_Name.png
                        if pokemon_name and unite_data["Name"]:
                            filename = f"{pokemon_name} - {unite_data['Name']}.png"
                            unite_data["Image"] = filename

                    if info_div:
                        # Get cooldown from p.cooldown
                        cooldown_p = info_div.find('p', class_='cooldown')
                        if cooldown_p:
                            cd_text = cooldown_p.get_text()
                            cd_match = re.search(r'([\d.]+\s*s)', cd_text)
                            if cd_match:
                                unite_data["Cooldown"] = cd_match.group(1).strip()

                    # Get level from unite-level class
                    unite_level_div = ultimate_div.find(class_='unite-level')
                    if unite_level_div:
                        level_text = unite_level_div.get_text()
                        level_match = re.search(r'Level\s+(\d+)', level_text, re.I)
                        if level_match:
                            unite_data["Level"] = level_match.group(1).strip()
                        else:
                            # Try to extract just the number if "Level" text isn't there
                            number_match = re.search(r'(\d+)', level_text)
                            if number_match:
                                unite_data["Level"] = number_match.group(1).strip()

                    # Get description (all p.description tags that are direct children)
                    desc_paragraphs = ultimate_div.find_all('p', class_='description', recursive=False)
                    if desc_paragraphs:
                        descriptions = [self.clean_text(p.get_text()) for p in desc_paragraphs]
                        unite_data["Description"] = " ".join(descriptions)

                    # Look for buffs section
                    # Buff Duration is in unite-buffs, Buff Stats is in buff-description
                    unite_buffs_p = ultimate_div.find('p', class_='unite-buffs')
                    buff_description_p = ultimate_div.find('p', class_='buff-description')

                    # Get Buff Duration from unite-buffs (extract only "#s" format)
                    if unite_buffs_p:
                        duration_text = unite_buffs_p.get_text()
                        # Remove buff-description text if it's nested
                        if buff_description_p:
                            duration_text = duration_text.replace(buff_description_p.get_text(), '')
                        # Extract just the duration in "#s" format
                        duration_match = re.search(r'([\d.]+\s*s)', duration_text, re.I)
                        if duration_match:
                            unite_data["Buff Duration"] = duration_match.group(1).strip()
                        else:
                            unite_data["Buff Duration"] = self.clean_text(duration_text)

                    # Get Buff Stats from buff-description
                    if buff_description_p:
                        unite_data["Buff Stats"] = self.clean_text(buff_description_p.get_text())

            # Apply defaults for missing data
            if not unite_data["Level"]:
                # Default to level 9 if missing (e.g., Armarouge)
                unite_data["Level"] = "9"
                logger.info("Unite Move Level missing, defaulting to 9")

            if not unite_data["Cooldown"]:
                # Default to 0s if missing (e.g., Dragapult, Pawmot - unique mechanics)
                unite_data["Cooldown"] = "0s"
                logger.info("Unite Move Cooldown missing, defaulting to 0s")

        except Exception as e:
            logger.warning(f"Error extracting Unite Move: {e}")
            import traceback
            traceback.print_exc()

        return unite_data

    def scrape_all_pokemon(self, pokemon_list: Optional[List[str]] = None, delay: float = 2.0) -> Dict:
        """Scrape all Pokemon with rate limiting and update existing data"""
        if pokemon_list is None:
            # Get list from database
            pokemon_to_scrape = self.get_pokemon_to_scrape()
        else:
            # Custom list provided (for testing)
            pokemon_to_scrape = [(name, name) for name in pokemon_list]

        self.setup_driver()

        try:
            logger.info(f"Starting to scrape {len(pokemon_to_scrape)} Pokemon...")

            for idx, (preferred_name, unite_db_name) in enumerate(pokemon_to_scrape, 1):
                logger.info(f"Progress: {idx}/{len(pokemon_to_scrape)} - {preferred_name}")

                # Scrape move data from unite-db
                scraped_move_data = self.scrape_pokemon_page(unite_db_name, preferred_name)

                if scraped_move_data:
                    # Get existing entry or create new one
                    existing_data = self.pokemon_data.get(preferred_name, {})

                    # Preserve metadata fields and update move data
                    updated_entry = {
                        "unite-db-name": existing_data.get("unite-db-name", unite_db_name),
                        "uniteapi-name": existing_data.get("uniteapi-name", ""),
                        "role": existing_data.get("role", "")
                    }

                    # Add scraped move data
                    updated_entry.update(scraped_move_data)

                    self.pokemon_data[preferred_name] = updated_entry
                    logger.info(f"Updated data for: {preferred_name}")
                else:
                    logger.warning(f"Failed to scrape {preferred_name}, keeping existing data")

                if idx < len(pokemon_to_scrape):
                    time.sleep(delay)

        finally:
            self.close_driver()

        logger.info(f"Scraping complete! Updated {len(self.pokemon_data)} Pokemon")
        # print(self.pokemon_data['Aegislash']['Passive Ability'])
        return self.pokemon_data

    def save_to_json(self, filename: str = "../static/json/all_pokemon_detailed.json"):
        """Save scraped data to JSON file"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                print(self.pokemon_data['Aegislash']['Passive Ability'])
                json.dump(self.pokemon_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Data saved to {filename}")
        except Exception as e:
            logger.error(f"Error saving to file: {e}")


def main():
    """Main execution function"""
    scraper = UniteDBWorkingScraper(headless=True)

    # Test with a few Pokemon first
    # test_pokemon = ["aegislash", "ceruledge"]
    # scraper.scrape_all_pokemon(pokemon_list=test_pokemon, delay=2.0)
    #
    # print(scraper.pokemon_data['Aegislash']['Passive Ability'])

    # Once you verify it works, scrape all Pokemon:
    scraper.scrape_all_pokemon(delay=1.0)

    # Save results
    scraper.save_to_json("../static/json/all_pokemon_detailed.json")

    # Print summary
    print(f"\n{'='*60}")
    print(f"Scraping Summary:")
    print(f"Total Pokemon scraped: {len(scraper.pokemon_data)}")
    print(f"Output file: ../static/json/all_pokemon_detailed.json")
    print(f"{'='*60}\n")

    # Print sample data
    # if scraper.pokemon_data:
    #     first_pokemon = list(scraper.pokemon_data.keys())[0]
    #     print(f"\nSample data for {first_pokemon}:")
    #     print(json.dumps(scraper.pokemon_data[first_pokemon], indent=2))


if __name__ == "__main__":
    main()
