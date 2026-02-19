# Design System

Chronobotanica uses a high-contrast, minimalist aesthetic that blends retro-teletext sensibilities with modern procedural voxel art.

## Typography

- **Interface Font**: Teletext / Monospace aesthetic.
  - Used for real-time stats, time display, and navigation.
  - Characterized by uppercase-only presentation and wide tracking.
  - Tracking: `0.2em` for headers, `widest` for labels.
- **Labels**: Small font size (`7px` to `10px`).

## Color Palette

### Environmental Colors
| Token | HEX | Usage |
| :--- | :--- | :--- |
| `Background` | `#000000` | Void world backdrop |
| `Ground` | `#050505` | Subtle ground plane |
| `Sun` | `#FFFFFF` | Solar light source |

### Life Cycle Colors
| Token | HEX | Usage |
| :--- | :--- | :--- |
| `Stem` | DNA-mapped | Voxel Type 1 |
| `Leaf` | DNA-mapped | Voxel Type 2 |
| `Flower` | DNA-mapped | Voxel Type 3 |
| `Crystal` | `#1A1A1A` | Voxel Type 4 (Crystallized) |
| `Genoma` | `#FFFFFF` | Voxel Type 5 (Legacy Seeds / Ash) |

## UI Components

### 1. Temporal Controls (Top-Right)
A set of high-impact buttons manipulating the simulation speed.
- **Time Travel**: `bg-black` -> `bg-white`. Accelerates time to 86,400x speed (1 Day/Sec).
- **Back to Present**: Resets time scale to 1.0 and reloads database state.
- **End of the World**: `border-fuchsia-400`. Destructive action with distinct danger-color styling.

### 2. Camera & Recording (Bottom-Right)
- **Capture**: Snapshots the current WebGL canvas to PNG.
- **Record**: Captures a `.webm` video clip of the simulation.

### 2. Stats Panel
A minimalist grid (2 columns) in the bottom-left corner.
- **Column 1**: Date, Time, Virtual Days.
- **Column 2**: Biological counts (Born, Species, Stem, Leaf, Flower, Crystal, Genoma).

### 3. Hover Tooltip
Dynamic overlay following the cursor.
- **Text**: Pure White (`#FFFFFF`) for labels.
- **Background**: Translucent black with subtle border.
- **Info**: Genome hash, Class (with DNA-mapped color), and Birth Time.
