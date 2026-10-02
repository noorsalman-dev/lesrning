# Infinity & Godot Platformer Workspace

This workspace contains two projects:
1. **Infinity**: A browser-based 2D top-down survival, mining, and crafting game built with HTML5 Canvas and JavaScript (`index.html`, `index.js`).
2. **Godot 4 Platformer**: A 2D platformer game built with Godot Engine (`project.godot`, GDScript files, `.tscn` scenes).

---

##  1. Infinity (Web Game)

**Infinity** is a top-down subterranean survival game. You explore procedurally carved caverns, mine minerals, manage vital signs, craft weapons and defense structures, and forge the ultimate **Infinity Wand**.

###  Core Files
- **`index.html`**: Game structure, HUD overlay (vital signs, level/depth counter, materials), canvas frame, crafting modal, and hotbar UI.
- **`index.js`**: Core game engine including:
  - **`MapManager`**: Generates procedural cavern maps with mines, terrain types (`dirt`, `stone`, `crystal`, `gold`, `diamond`), and destructible blocks.
  - **Player Mechanics**: Movement, pickaxe mining, health tracking, and inventory management.
  - **Combat & Structures**: Auto-turrets, power generators, monster/hunter spawning, and sword strikes.
  - **Crafting Engine**: $3 \times 3$ grid workbench, recipe book integration (`minecraft-data`), and field recipes.

###  Key Recipes & Features
| Item / Structure | Recipe / Requirements | Function |
| :--- | :--- | :--- |
| **Stone Sword** ⚔️ | 2 Stone + 1 Stick | Attack nearby enemies (`SPACE`) |
| **Auto Turret** 🛡️ | 3 Stone + 2 Crystal | Automatically shoots nearby monsters |
| **Generator** ⚡ | 2 Stone + 1 Gold + 2 Sticks | Speeds up nearby Auto Turrets |
| **Infinity Wand** ✨ | 11 Gold + 20 Diamond + 10 Sticks + 300 Creepers | Duplicates 100x blocks of any mined material |

###  Controls
- **`W` `A` `S` `D`**: Move player
- **`Q` / Click**: Mine adjacent blocks with pickaxe
- **`SPACE`**: Attack with sword
- **`1` – `5`**: Select placeable hotbar items
- **`F`**: Fuse nearby blocks into reinforced structures
- **`C`**: Open Crafting Box / Workbench

---

## 2. Godot Platformer

A 2D platformer powered by **Godot Engine 4.x**.

### 📜 Key Scripts & Scenes
- **`endless_level.gd` / `endless_level.tscn`**: Procedural level builder that generates platforms, gaps, level portals, and navigation UI.
- **`character_body_2d.gd` / `player.gd`**: Player platformer movement using gravity, jumping, and sprite flipping.
- **`coin.gd`**: Collectible items.
- **`eanemy.gd`**: Enemy logic and player interaction.

---

## 🚀 How to Run the Web Game (`index.html`)

### 1. Serve Locally
Using Python's HTTP server (defined in `package.json`):
```bash
npm start
