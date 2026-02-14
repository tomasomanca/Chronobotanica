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
| Token | Color | Usage |
| :--- | :--- | :--- |
| `Genoma` | `#FFFFFF` | Legacy seeds (formerly Ash) |
| `Crystal` | `#1A1A1A` | Mature/dead plant matter (Crystallized) |
| `Stem` | DNA-mapped | Variable based on plant genetics |
| `Leaf` | DNA-mapped | Variable based on plant genetics |
| `Flower` | DNA-mapped | Variable based on plant genetics |

## UI Components

### 1. Flow of Time Controller
A custom narrative slider located in the top-right corner.
- **Positions**:
  - `Stop`: `timeScale = 0` (Paused)
  - `Day`: `timeScale = 1` (Real-time, 24h cycle)
  - `Hour`: `timeScale = 24`
  - `Minute`: `timeScale = 1440`
  - `Second`: `timeScale = 86400` (Max speed)

### 2. Stats Panel
A minimalist grid (2 columns) in the bottom-left corner.
- **Column 1**: Date, Time, Virtual Days.
- **Column 2**: Biological counts (Born, Species, Stem, Leaf, Flower, Crystal, Genoma).

### 3. Hover Tooltip
Dynamic overlay following the cursor.
- **Text**: Pure White (`#FFFFFF`) for labels.
- **Background**: Translucent black with subtle border.
- **Info**: Genome hash, Class (with DNA-mapped color), and Birth Time.
