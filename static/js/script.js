document.addEventListener("DOMContentLoaded", () => {
  // Load move details data
  loadMoveDetails();

  const tableContainer = document.getElementById("moveset-table");
  const popup = document.getElementById("popup");
  const popupContent = document.getElementById("popupContent");
  const roleFilters = document.querySelectorAll('input[name="role"]');
  const minPickRate = document.getElementById("minPickRate");
  const nameSearch = document.getElementById("nameSearch");
  const resetFilters = document.getElementById("resetFilters");

  // Global variable for move details data
  let moveDetailsData = null;

  // Load move details JSON at page load
  async function loadMoveDetails() {
    try {
      // Add timestamp to prevent caching
      const response = await fetch(`static/json/all_pokemon_detailed.json?v=${Date.now()}`);
      if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
      moveDetailsData = await response.json();
      console.log('Move details loaded successfully');
    } catch (error) {
      console.error('Error loading move details:', error);
      moveDetailsData = {}; // Fallback to empty object
    }
  }

  function getOrdinalSuffix(day) {
    const j = day % 10,
          k = day % 100;
    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";
    return "th";
}

    // utility to fetch a text file and trim any trailing newline
  async function fetchText(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Couldn’t load ${path}: ${res.status}`);
    return (await res.text()).trim();
  }

  async function injectHeaderText() {
    try {
      const [rawDate, matchesRaw] = await Promise.all([
        fetchText('data/txt/date.txt'),
        fetchText('data/txt/matches.txt')
      ]);
      const d = new Date(rawDate);            // parse “2025-05-22” or “May 22, 2025”
      const day   = d.getDate();
      const month = d.toLocaleString('default',{ month: 'long' });
      const year  = d.getFullYear();
      const suffix = getOrdinalSuffix(day);
      const formattedDate = `${month} ${day}${suffix}`;

      const matches = Number(matchesRaw)
                         .toLocaleString(undefined,{ maximumFractionDigits: 0 });

      document.getElementById('header-text')
        .textContent = `Data comes from Unite API as of ${formattedDate} with ${matches} total games analyzed. Currently only working on non-mobile devices.`;
    } catch(e) {
      console.error(e);
    }
  }

  // run it once the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHeaderText);
  } else {
    injectHeaderText();
  }

  
  // Desktop-only mode - no mobile detection needed
  console.log("Desktop view mode active");
  
  const filters = document.getElementById("filters");
  if (filters) {
    // Set filter box to black background and center its contents
    const existingStyles = filters.getAttribute("style") || "";
    const newStyles = existingStyles + "background-color: #111111 !important; color: white !important; display: flex !important; justify-content: center !important; align-items: center !important; flex-wrap: wrap !important;";
    filters.setAttribute("style", newStyles);
    console.log("Setting filters background color to black and centering contents");
    
    // Create a container to hold all filter elements centered
    const nameSearch = document.getElementById("nameSearch");
    const pickRateContainer = document.querySelector(".pick-rate-container");
    const minPickRateInput = document.getElementById("minPickRate");
    const roleFilters = document.querySelector(".role-filters");
    const resetButton = document.getElementById("resetFilters");
    
    // Set appropriate widths for the elements for better layout
    if (nameSearch) {
      nameSearch.style.width = "240px";
    }
    
    // Style the min pick rate input
    if (minPickRateInput) {
      minPickRateInput.style.backgroundColor = "#333";
      minPickRateInput.style.color = "white";
      minPickRateInput.style.border = "none";
      minPickRateInput.style.borderRadius = "4px";
      minPickRateInput.style.padding = "4px";
      minPickRateInput.style.width = "40px";
      minPickRateInput.style.textAlign = "right";
    }
    
    // Make the percentage sign visible with inline styling
    const percentageSign = document.querySelector(".percentage-sign");
    if (percentageSign) {
      percentageSign.style.color = "white";
      percentageSign.style.fontWeight = "bold";
      percentageSign.style.fontSize = "14px";
      percentageSign.style.display = "inline-block";
      percentageSign.style.marginLeft = "4px";
      percentageSign.textContent = "%"; // Explicitly set content
      console.log("Applied styling to percentage sign");
    }
    
    // Ensure proper alignment and centering
    if (roleFilters) {
      roleFilters.style.display = "flex";
      roleFilters.style.justifyContent = "center";
      roleFilters.style.flexWrap = "wrap";
      roleFilters.style.margin = "0";
    }
    
    if (pickRateContainer) {
      pickRateContainer.style.display = "flex";
      pickRateContainer.style.alignItems = "center";
      pickRateContainer.style.justifyContent = "center";
    }
    
    // Ensure the filters container is properly centered
    if (filters) {
      filters.style.justifyContent = "center";
      filters.style.textAlign = "center";
    }
  }
  
  // Keep Win Rate as the default sort column, now it's the 7th column
  let currentSort = { column: "Win Rate", order: 'desc' };
  let activeNameFilter = null;
  let activeRoleFilters = []; // Change to array to store multiple roles
  
  // Calculate the global win rate range once at the start
  const globalWinRateRange = calculateGlobalWinRateRange();
  
  // Print a visual representation of the color scale to help with debugging
  logWinRateColorScale();
  
  function logWinRateColorScale() {
    console.log("Win Rate Color Scale (Exponential from 50%):");
    
    // Test very small deviations from 50%
    console.log("Small deviations from 50%:");
    const smallDeviation = [49, 49.25, 49.5, 49.75, 50, 50.25, 50.5, 50.75, 51];
    smallDeviation.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate.toFixed(2)}% `, `background: ${color}; color: black; padding: 3px 6px;`);
      console.log(`Small deviation ${rate.toFixed(2)}%: ${color}`);
    });
    
    // Test medium range
    console.log("\nMedium range deviations:");
    const mediumRange = [45, 46, 47, 48, 50, 52, 53, 54, 55];
    mediumRange.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate}% `, `background: ${color}; color: ${rate >= 55 || rate <= 45 ? 'white' : 'black'}; padding: 3px 6px;`);
      console.log(`Medium deviation ${rate}%: ${color}`);
    });
    
    // Test full range
    console.log("\nFull range:");
    const fullRange = [35, 40, 45, 47.5, 50, 52.5, 55, 60, 65];
    fullRange.forEach(rate => {
      const color = getWinRateColor(rate);
      console.log(`%c ${rate}% `, `background: ${color}; color: ${rate >= 60 || rate <= 40 ? 'white' : 'black'}; padding: 3px 6px;`);
      console.log(`Full range ${rate}%: ${color}`);
    });
  }
  
  // Function to calculate the global min, max, and middle win rates from all items
  function calculateGlobalWinRateRange() {
    let min = Number.MAX_VALUE;
    let max = Number.MIN_VALUE;
    let validRatesCount = 0;
    let maxEntry = null;
    let minEntry = null;
    
    // Process all items to get the absolute min and max
    items.forEach(entry => {
      const rate = parseFloat(entry["Win Rate"]);
      if (!isNaN(rate)) {
        if (rate < min) {
          min = rate;
          minEntry = `${entry.Name} - ${entry["Move Set"]}`;
        }
        if (rate > max) {
          max = rate;
          maxEntry = `${entry.Name} - ${entry["Move Set"]}`;
        }
        validRatesCount++;
      }
    });
    
    console.log(`Found ${validRatesCount} valid win rates`);
    console.log(`Min win rate: ${min.toFixed(2)}% for ${minEntry}`);
    console.log(`Max win rate: ${max.toFixed(2)}% for ${maxEntry}`);
    
    // If no valid rates found (should never happen), provide defaults
    if (min === Number.MAX_VALUE || max === Number.MIN_VALUE) {
      min = 40;
      max = 60;
      console.log("Using default win rate range");
    }
    
    // Calculate middle as the average of min and max
    const middle = (min + max) / 2;
    
    // Log the results for debugging
    console.log(`Global win rate range: min=${min.toFixed(2)}, middle=${middle.toFixed(2)}, max=${max.toFixed(2)}`);
    
    return { min, middle, max };
  }
  
  roleFilters.forEach(filter => {
    filter.addEventListener("change", (e) => {
      // Clear name filter when roles are selected
      activeNameFilter = null;
      
      if (e.target.checked) {
        // Add role to the activeRoleFilters array if not already present
        if (!activeRoleFilters.includes(e.target.value)) {
          activeRoleFilters.push(e.target.value);
        }
        
        // Add active class to the selected role label
        if (e.target.closest('.role-option')) {
          e.target.closest('.role-option').classList.add('active-role');
        }
      } else {
        // Remove role from the activeRoleFilters array
        activeRoleFilters = activeRoleFilters.filter(role => role !== e.target.value);
        
        // Remove active class
        if (e.target.closest('.role-option')) {
          e.target.closest('.role-option').classList.remove('active-role');
        }
      }
      
      renderRows(filterItems());
    });
  });
  minPickRate.addEventListener("input", () => renderRows(filterItems()));
  nameSearch.addEventListener("input", () => renderRows(filterItems()));

  function format(val) {
    const num = parseFloat(val);
    return isNaN(num) ? "?" : `${num.toFixed(2)}%`;
  }
  
  // Calculate color based on win rate with EXACTLY 50% as white
  // Using an exponential scale to make small deviations visible
  function getWinRateColor(winRate) {
    // Convert win rate to a number if it's not already
    const rate = parseFloat(winRate);
    
    // Return default color if not a valid number
    if (isNaN(rate)) return "white";
    
    // Fixed values
    const MIDDLE = 50; // 50% is middle point
    const MAX_GREEN = 65; // Upper bound for full green
    const MIN_RED = 35;   // Lower bound for full red
    
    // If we're at exactly 50%, return pure white
    if (Math.abs(rate - MIDDLE) < 0.001) {
      return "rgb(255, 255, 255)";
    }
    
    // Calculate the exponential factor
    // This determines how quickly the colors intensify as we move away from 50%
    const expFactor = 2.5; // Higher values make color changes more pronounced near 50%
    
    // For values below 50%
    if (rate < MIDDLE) {
      // Calculate linear percentage first (0 to 1)
      const linearPercentage = Math.min(1, (MIDDLE - rate) / (MIDDLE - MIN_RED));
      
      // Apply exponential transformation
      // This makes values close to 50% have noticeable but subtle colors
      // and intensifies as we move toward the extremes
      // We use a function of form: 1 - (1 - x)^expFactor
      // This gives a more rapid initial change from 50%
      const expPercentage = 1 - Math.pow(1 - linearPercentage, expFactor);
      
      // Ensure even tiny deviations from 50% have a slight tint
      // For values very close to 50%, give a minimal tint
      const finalPercentage = rate >= 49 
        ? Math.max(0.05, expPercentage) // Min 5% color for values just below 50%
        : expPercentage;
      
      // Red to white gradient
      const r = 255;
      const g = Math.round((1 - finalPercentage) * 255);
      const b = Math.round((1 - finalPercentage) * 255);
      
      return `rgb(${r}, ${g}, ${b})`;
    } 
    // For values above 50%
    else {
      // Calculate linear percentage first (0 to 1)
      const linearPercentage = Math.min(1, (rate - MIDDLE) / (MAX_GREEN - MIDDLE));
      
      // Apply exponential transformation
      const expPercentage = 1 - Math.pow(1 - linearPercentage, expFactor);
      
      // Ensure even tiny deviations from 50% have a slight tint
      const finalPercentage = rate <= 51 
        ? Math.max(0.05, expPercentage) // Min 5% color for values just above 50%
        : expPercentage;
      
      // White to green gradient (using darker green #009900)
      const r = Math.round((1 - finalPercentage) * 255);
      const g = Math.round(255 - finalPercentage * 102); // 255 to 153
      const b = Math.round((1 - finalPercentage) * 255);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  function renderMoves(moves) {
    if (Array.isArray(moves)) {
      return moves.map(m => `<img src="static/img/${m}" alt="${m}" class="move-img">`).join('');
    }
    return `<img src="static/img/${moves}" alt="${moves}" class="move-img">`;
  }

  function parseMovePath(imgElement) {
    const src = imgElement.getAttribute('src');
    const filename = src.split('/').pop();
    const nameWithoutExt = filename.replace('.png', '');
    const parts = nameWithoutExt.split(' - ');

    if (parts.length !== 2) {
      console.error('Invalid move filename format:', filename);
      return null;
    }

    return {
      pokemonName: parts[0].trim(),
      moveName: parts[1].trim()
    };
  }

  function findMoveData(pokemonName, moveName) {
    if (!moveDetailsData || !moveDetailsData[pokemonName]) {
      console.error(`Pokemon "${pokemonName}" not found`);
      return null;
    }

    const pokemonData = moveDetailsData[pokemonName];

    // Search through Move 1 and Move 2
    for (const moveSlot of ['Move 1', 'Move 2']) {
      if (!pokemonData[moveSlot]) continue;

      // Search through Upgrade 1 and Upgrade 2
      for (const upgrade of ['Upgrade 1', 'Upgrade 2', 'Upgrade 3', 'Upgrade']) {
        const moveData = pokemonData[moveSlot][upgrade];

        if (moveData && moveData.Name === moveName) {
          return moveData;
        }
      }
    }

    console.error(`Move "${moveName}" not found for ${pokemonName}`);
    return null;
  }

  function syncFilterWidthToTable() {
    const table = document.getElementById("moveset-table");
    const filters = document.getElementById("filters");
    if (table && filters) {
        // For table layout, we need to measure the full table width
        const tableWidth = table.scrollWidth || table.offsetWidth;

        // Ensure minimum width for filters to match table
        const minWidth = 940; // Match the min-width setting in CSS
        const targetWidth = Math.max(tableWidth, minWidth);

        // Set the width and log it
        filters.style.width = `${targetWidth}px`;
        console.log(`Table width: ${tableWidth}px, Setting filter width to: ${targetWidth}px`);

        // Also check if the last column is visible
        const lastColumn = document.querySelector(".moveset-header > div:last-child");
        if (lastColumn) {
          const rect = lastColumn.getBoundingClientRect();
          console.log(`Last column (Pick Rate) dimensions: width=${rect.width}px, right=${rect.right}px, visible=${rect.right <= window.innerWidth}`);
        }
    }
  }

  function renderRows(filteredItems) {
    const tableBody = document.querySelector('.table-row-group');
    tableBody.innerHTML = ''; // Clear existing rows

    if (currentSort.column) {
      filteredItems.sort((a, b) => {
        const col = currentSort.column;
        let aVal = a[col] ?? "";
        let bVal = b[col] ?? "";

        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return currentSort.order === 'asc' ? aNum - bNum : bNum - aNum;
        } else {
          return currentSort.order === 'asc'
            ? aVal.toString().localeCompare(bVal)
            : bVal.toString().localeCompare(aVal);
        }
      });
    }

    updateSortArrows();

    filteredItems.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'table-row';

      const isActive = activeNameFilter === entry["Name"];
      const nameClass = isActive ? "filter-name active" : "filter-name";

      const isRoleActive = activeRoleFilters.includes(entry["Role"]);
      const roleClass = isRoleActive ? "filter-role active" : "filter-role";

      const winRate = parseFloat(entry["Win Rate"]);
      const winRateColor = getWinRateColor(winRate);

      row.innerHTML = `
        <div class="table-cell"><img src="static/img/${entry["Pokemon"]}" alt="${entry["Name"]}"></div>
        <div class="table-cell"><span class="${nameClass}" data-name="${entry["Name"]}">${entry["Name"]}</span></div>
        <div class="table-cell"><span class="${roleClass}" data-role="${entry["Role"]}">${entry["Role"]}</span></div>
        <div class="table-cell">${entry["Move Set"]}</div>
        <div class="table-cell">
          <span class="move-wrapper">${renderMoves(entry["Move 1"])}</span>
          <span class="move-wrapper">${renderMoves(entry["Move 2"])}</span>
        </div>
        <div class="table-cell">
          <button class="view-items" data-index="${items.indexOf(entry)}" 
                  style="color: ${winRateColor}; font-weight: bold; background: none; border: none;" 
                  data-win-rate="${entry["Win Rate"]}">
            ${format(entry["Win Rate"])}
          </button>
        </div>
        <div class="table-cell">${format(entry["Pick Rate"])}</div>
      `;

      tableBody.appendChild(row);
    });

    // Attach event handlers
    attachEventHandlers();
    syncFilterWidthToTable();
  }

  function attachEventHandlers() {
    // View items button handlers
    document.querySelectorAll(".view-items").forEach(button => {
      // Add hover effect that ONLY changes text color
      button.addEventListener("mouseenter", () => {
        // button.style.color = "#57c1ed";
      });

      button.addEventListener("mouseleave", () => {
        // Restore original color
        const winRate = parseFloat(button.dataset.winRate || "50");
        button.style.color = getWinRateColor(winRate);
        button.style.textShadow = "none";
      });

      button.addEventListener("click", e => {
        const index = parseInt(e.target.dataset.index);
        showPopup(items[index]);
      });
    });

    document.querySelectorAll(".filter-name").forEach(el => {
      // Ensure no text-decoration
      el.style.textDecoration = "none";

      el.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent document click from immediately clearing
        activeNameFilter = el.dataset.name;
        activeRoleFilter = null; // Clear role filter when setting name filter
        renderRows(filterItems());
      });
    });


    document.querySelectorAll(".filter-role").forEach(el => {
      // Ensure no text-decoration
      el.style.textDecoration = "none";

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const clickedRole = el.dataset.role;
        activeNameFilter = null; // Clear name filter when setting role filter

        // Toggle the role in activeRoleFilters
        if (activeRoleFilters.includes(clickedRole)) {
          // If already active, remove it
          activeRoleFilters = activeRoleFilters.filter(role => role !== clickedRole);
        } else {
          // If not active, add it
          activeRoleFilters.push(clickedRole);
        }

        updateRoleCheckboxes();
        renderRows(filterItems());
      });
    });

    // Move image click handlers
    document.querySelectorAll(".move-img").forEach(img => {
      img.addEventListener("click", e => {
        e.stopPropagation(); // Prevent row click events
        showMovePopup(img);
      });

      // Visual feedback
      img.style.cursor = "pointer";
    });

    // Pokemon image click handlers
    document.querySelectorAll(".table-row .table-cell:first-child img").forEach(img => {
      img.addEventListener("click", e => {
        e.stopPropagation(); // Prevent row click events
        showPokemonPopup(img);
      });

      // Visual feedback
      img.style.cursor = "pointer";
    });
  }


  function showPopup(entry) {
    // Create an array of items to sort
    const items = [];
    for (let i = 1; i <= 3; i++) {
      if (entry[`Item ${i}`]) {
        items.push({
          item: entry[`Item ${i}`],
          pickRate: parseFloat(entry[`Pick Rate ${i}`]) || 0,
          winRate: parseFloat(entry[`Win Rate ${i}`]) || 0,
          index: i
        });
      }
    }
    
    // Always use desktop layout
    popup.classList.remove('mobile-popup');
    
    // Sort items by pick rate (highest first)
    items.sort((a, b) => b.pickRate - a.pickRate);
    
    // Color the main win rate using the global range
    const winRate = parseFloat(entry["Win Rate"]);
    const mainWinRateColor = getWinRateColor(winRate);
    
    // Log the popup win rate for debugging
    console.log(`Popup win rate: ${winRate.toFixed(2)}%, color: ${mainWinRateColor}`);
    
    // Prepare move images for popup
    const move1Img = Array.isArray(entry["Move 1"]) ? entry["Move 1"][0] : entry["Move 1"];
    const move2Img = Array.isArray(entry["Move 2"]) ? entry["Move 2"][0] : entry["Move 2"];
    
    popupContent.innerHTML = `
      <div class="popup-header">
        <img src="static/img/${entry["Pokemon"]}" alt="${entry["Name"]}" class="popup-pokemon-img">
        <h3 class="popup-title">${entry["Name"]} – ${entry["Move Set"]}</h3>
        <div class="popup-move-container">
          <img src="static/img/${move1Img}" alt="Move 1" class="popup-move-img">
          <img src="static/img/${move2Img}" alt="Move 2" class="popup-move-img">
        </div>
      </div>
      <p style="text-align: center; margin-top: 0; margin-bottom: 15px;">
        Overall Win Rate: <span style="color: ${mainWinRateColor}; font-weight: bold; transition: color 0.2s; background: transparent;"
                                onmouseout="this.style.color='${mainWinRateColor}';">
                            ${format(entry["Win Rate"])}
                          </span>
      </p>
      <div class="popup-table-container">
        <table class="popup-table">
          <thead>
            <tr>
              <th class="item-col">Item</th>
              <th class="rate-col">Win Rate</th>
              <th class="rate-col">Pick Rate</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, index) => {
              const itemWinRateColor = getWinRateColor(item.winRate);
              const rowBgColor = index % 2 === 0 ? "#3B4A6A" : "#1F2537";
              return `
              <tr style="background-color: ${rowBgColor}; height: 60px;">
                <td class="item-col" style="padding: 0;">
                  <img src="static/img/${item.item}" class="item-img" alt="Item ${index+1}" style="max-width: 100%;">
                </td>
                <td class="rate-col" style="padding-left: 5px; padding-right: 5px;">
                  <span class="win-rate" style="color: ${itemWinRateColor}; display: block;"
                        onmouseout="this.style.color='${itemWinRateColor}';">
                    ${format(item.winRate)}
                  </span>
                </td>
                <td class="rate-col" style="padding-left: 5px; padding-right: 5px;"><span style="font-weight: bold; display: block;">${format(item.pickRate)}</span></td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    popup.classList.remove("hidden");
  }

  function showMovePopup(imgElement) {
    // Parse the image path
    const parsed = parseMovePath(imgElement);
    if (!parsed) {
      alert('Unable to load move details: Invalid move image format');
      return;
    }

    const { pokemonName, moveName } = parsed;

    // Find move data
    const moveData = findMoveData(pokemonName, moveName);
    if (!moveData) {
      alert(`Unable to load details for ${moveName}`);
      return;
    }

    // Build popup HTML
    const moveImgSrc = imgElement.getAttribute('src');

    popupContent.innerHTML = `
      <div class="move-popup-header">
        <img src="${moveImgSrc}" alt="${moveName}" class="move-popup-img">
        <h3 class="popup-title">${moveName}</h3>
      </div>

      <div class="move-popup-body">
        <div class="move-detail-row">
          <span class="move-detail-label">Level:</span>
          <span class="move-detail-value">${moveData.Level}</span>
        </div>

        <div class="move-detail-row">
          <span class="move-detail-label">Cooldown:</span>
          <span class="move-detail-value">${moveData.Cooldown}</span>
        </div>

        <div class="move-detail-section">
          <h4 class="move-detail-heading">Description</h4>
          <p class="move-description">${moveData.Description}</p>
        </div>

        ${moveData['Enhanced Level'] ? `
          <div class="move-detail-section enhanced-section">
            <h4 class="move-detail-heading">Enhanced (Level ${moveData['Enhanced Level']})</h4>
            <p class="move-description">${moveData['Enhanced Description'] || ''}</p>
          </div>
        ` : ''}
      </div>
    `;

    // Show popup
    popup.classList.remove("hidden");
  }

  function showPokemonPopup(imgElement) {
    // Parse the Pokemon name from the image alt text
    const pokemonName = imgElement.getAttribute('alt');

    if (!pokemonName) {
      alert('Unable to load Pokemon details: Invalid image');
      return;
    }

    // Find Pokemon data
    if (!moveDetailsData || !moveDetailsData[pokemonName]) {
      alert(`Unable to load details for ${pokemonName}`);
      return;
    }

    const pokemonData = moveDetailsData[pokemonName];
    const pokemonImgSrc = imgElement.getAttribute('src');

    // Build popup HTML
    popupContent.innerHTML = `
      <div class="move-popup-header">
        <img src="${pokemonImgSrc}" alt="${pokemonName}" class="move-popup-img">
        <h3 class="popup-title">${pokemonName}</h3>
      </div>

      <div class="move-popup-body">
        ${pokemonData['Passive Ability'] ? `
          <div class="move-detail-section">
            <h4 class="move-detail-heading">Passive Ability: ${pokemonData['Passive Ability'].Name || ''}</h4>
            <p class="move-description">${pokemonData['Passive Ability'].Description || ''}</p>
          </div>
        ` : ''}
        ${pokemonData['Passive Ability']['Name 2'] && pokemonData['Passive Ability']['Description 2'] ? `
          <div class="move-detail-section">
            <h4 class="move-detail-heading">Passive Ability: ${pokemonData['Passive Ability']['Name 2'] || ''}</h4>
            <p class="move-description">${pokemonData['Passive Ability']['Description 2'] || ''}</p>
          </div>
        ` : ''}

        ${pokemonData['Attack'] ? `
          <div class="move-detail-section">
            <h4 class="move-detail-heading">Attack</h4>
            <p class="move-description">${pokemonData['Attack']}</p>
          </div>
        ` : ''}

        ${pokemonData['Unite Move'] ? `
          <div class="move-detail-section enhanced-section">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
              ${pokemonData['Unite Move'].Name ? `
                <img src="static/img/Unite_Moves/${pokemonName} - ${pokemonData['Unite Move'].Name}.png"
                     alt="${pokemonData['Unite Move'].Name}"
                     style="max-height: 100px; width: auto;"
                     onerror="this.style.display='none'">
              ` : ''}
              <h4 class="move-detail-heading" style="margin: 0;">Unite Move: ${pokemonData['Unite Move'].Name || ''}</h4>
            </div>

            <div class="move-detail-row">
              <span class="move-detail-label">Level:</span>
              <span class="move-detail-value">${pokemonData['Unite Move'].Level || ''}</span>
            </div>

            <div class="move-detail-row">
              <span class="move-detail-label">Cooldown:</span>
              <span class="move-detail-value">${pokemonData['Unite Move'].Cooldown || ''}</span>
            </div>

            ${pokemonData['Unite Move']['Buff Duration'] ? `
              <div class="move-detail-row">
                <span class="move-detail-label">Buff Duration:</span>
                <span class="move-detail-value">${pokemonData['Unite Move']['Buff Duration']}</span>
              </div>
            ` : ''}

            ${pokemonData['Unite Move']['Buff Stats'] ? `
              <div class="move-detail-row">
                <span class="move-detail-label">Buff Stats:</span>
                <span class="move-detail-value">${pokemonData['Unite Move']['Buff Stats']}</span>
              </div>
            ` : ''}

            <p class="move-description" style="margin-top: 15px;">${pokemonData['Unite Move'].Description || ''}</p>
          </div>
        ` : ''}
      </div>
    `;

    // Show popup
    popup.classList.remove("hidden");
  }

  popup.addEventListener("click", (e) => {
    if (e.target === popup) {
      popup.classList.add("hidden");
      // Stop propagation to prevent the document click handler from triggering
      e.stopPropagation();
    }
  });

  // Add event listener for resetting all filters
  resetFilters.addEventListener("click", () => {
    // Reset active filters
    activeNameFilter = null;
    activeRoleFilters = [];
    
    // Reset role filters
    roleFilters.forEach(filter => {
      filter.checked = false;
      // Also remove any active role styling
      if (filter.closest('.role-option')) {
        filter.closest('.role-option').classList.remove('active-role');
      }
    });
    
    // Reset name search
    nameSearch.value = "";
    
    // Reset min pick rate to default value of 1
    minPickRate.value = 1;
    
    // Reset sorting to default (Win Rate descending)
    currentSort = { column: "Win Rate", order: 'desc' };
    
    // Re-render the table with reset filters and sorting
    renderRows(filterItems());
  });
  
  // Function to update role checkboxes based on activeRoleFilters
  function updateRoleCheckboxes() {
    // Get all role checkboxes
    const checkboxes = document.querySelectorAll('input[name="role"]');
    
    // Update each checkbox
    checkboxes.forEach(checkbox => {
      // Check if this role is in the activeRoleFilters array
      const isActive = activeRoleFilters.includes(checkbox.value);
      
      // Set the checkbox state
      checkbox.checked = isActive;
      
      // Update the role-option class
      const roleOption = checkbox.closest('.role-option');
      if (roleOption) {
        if (isActive) {
          roleOption.classList.add('active-role');
        } else {
          roleOption.classList.remove('active-role');
        }
      }
    });
    
    console.log("Updated role checkboxes to match:", activeRoleFilters);
  }
  
  function filterItems() {
    // Split search query into individual terms and remove empty strings
    const searchTerms = nameSearch.value.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    const selectedRoles = Array.from(document.querySelectorAll('input[name="role"]:checked'))
      .map(checkbox => checkbox.value);
    const minRate = parseFloat(minPickRate.value) || 0;
  
    return items.filter(entry => {
      // If there's an active name filter, only show entries matching that name
      if (activeNameFilter && entry["Name"] !== activeNameFilter) {
        return false;
      }
  
      // If there are active role filters, only show entries matching any of those roles
      if (activeRoleFilters.length > 0 && !activeRoleFilters.includes(entry["Role"])) {
        return false;
      }
  
      // Check minimum pick rate
      if (parseFloat(entry["Pick Rate"]) < minRate) {
        return false;
      }
  
      // We don't need to check selectedRoles separately since we're now using activeRoleFilters
  
      // Enhanced search across multiple fields with multiple terms
      if (searchTerms.length > 0) {
        // For each search term, check if it exists in any field
        return searchTerms.every(term => {
          // Create a searchable text from all relevant fields
          const nameText = entry["Name"].toLowerCase();
          const moveSetText = entry["Move Set"].toLowerCase();
          const roleText = entry["Role"].toLowerCase();
          
          // Process moves - convert to lowercase strings for searching
          const move1List = Array.isArray(entry["Move 1"]) 
            ? entry["Move 1"].map(m => m.toLowerCase())
            : [entry["Move 1"].toString().toLowerCase()];
          
          const move2List = Array.isArray(entry["Move 2"]) 
            ? entry["Move 2"].map(m => m.toLowerCase())
            : [entry["Move 2"].toString().toLowerCase()];
          
          // Check if this term appears in any field
          return nameText.includes(term) ||
                 moveSetText.includes(term) ||
                 roleText.includes(term) ||
                 move1List.some(move => move.includes(term)) ||
                 move2List.some(move => move.includes(term));
        });
      }
      
      // If no search query, include this entry
      return true;
    });
  }

    function attachSortHandlers() {
    document.querySelectorAll(".table-header-group .table-cell[data-sort]").forEach(div => {
      // Only process if we haven't already created the sort-text span
      if (!div.querySelector('.header-text')) {
        // Get the text content (excluding any spans)
        let textContent = '';

        // Get all text nodes directly inside the div (excluding spans)
        div.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            textContent += node.textContent;
          }
        });

        // Clean up the text content
        textContent = textContent.trim();

        // Remove all text nodes from the div
        div.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            div.removeChild(node);
          }
        });

        // Create a sortable/selectable span for the text
        const textSpan = document.createElement('span');
        textSpan.className = 'header-text';
        textSpan.textContent = textContent;

        // Place the text span at the beginning of div
        if (div.firstChild) {
          div.insertBefore(textSpan, div.firstChild);
        } else {
          div.appendChild(textSpan);
        }

        // Add click event only to the new span
        textSpan.addEventListener("click", (e) => {
          e.stopPropagation();
          const col = div.getAttribute("data-sort");
          const isSame = currentSort.column === col;
          currentSort.column = col;
          currentSort.order = isSame && currentSort.order === 'desc' ? 'asc' : 'desc';
          renderRows(filterItems());
        });
      }
      
      // Remove click handler from the div itself
      div.onclick = null;
    });
  }

  function updateSortArrows() {
    document.querySelectorAll(".table-header-group .table-cell[data-sort]").forEach(div => {
      const col = div.getAttribute("data-sort");
      const arrow = document.getElementById(`arrow-${col}`);
      if (arrow) {
        arrow.textContent =
          currentSort.column === col
            ? currentSort.order === "asc" ? "▲" : "▼"
            : "";
      }
    });
  }


  // Add document click handler to reset filters only when clicking outside the table
  document.addEventListener("click", (e) => {
    // If we're clicking on the popup or popup content, don't reset filters
    if (e.target.closest('#popup')) {
      return;
    }
    
    // Check if the click is outside both the moveset table and filters
    if (!e.target.closest('#moveset-table') && !e.target.closest('#filters')) {
      // Reset active filters
      activeNameFilter = null;
      activeRoleFilters = [];
      
      // Reset role filters
      roleFilters.forEach(filter => {
        filter.checked = false;
        // Also remove any active role styling
        if (filter.closest('.role-option')) {
          filter.closest('.role-option').classList.remove('active-role');
        }
      });
      
      // Re-render the table with reset filters
      renderRows(filterItems());
    }
  });
  
  // ✅ Attach everything
  window.addEventListener("resize", syncFilterWidthToTable);
  attachSortHandlers();
  renderRows(filterItems());
});
