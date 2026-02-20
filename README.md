# Chronobotanica

Chronobotanica is a digital garden simulation exploring the intersection of biological rhythms and virtual time. It features a voxel-based sculptural world where plants grow, mature, and eventually dissolve into seeds that carry their genetic legacy forward.

## Key Features

### Global Persistence (Supabase)
- **Real-Time Database**: Every plant born in the garden is instantly recorded in a Supabase database.
- **Global Time Tracking**: A dedicated `garden_state` table tracks the exact virtual time of the last completed simulation tick, ensuring no fractional time is lost between sessions.
- **Atomic Block Persistence**: Every individual cell (Stem, Leaf, Flower, etc.) is saved as a discrete record in the `plant_cells` table. This ensures extreme precision and eliminates the "missing growth" issues of large JSON blobs.
- **Time Travel Guard**: Blocks are persisted *only* during real-time growth (`growthRate <= 1.0`). Time Travel simulations are transient and do not write to the database.
- **Full Reconstruction**: On reload, the garden fetches all historical cells and reconstructs the plants exactly as they were left.
- **Faithful Catch-Up**: When reopened after days offline, the garden simulates every missed tick with accurate sun cycling (heliotropism) and batch-saves all generated plants and cells to Supabase in a single transaction.

### Temporal Control
- **Time Travel**: A specialized mode where time accelerates to **1 Day per Second**, allowing users to witness generations of evolution in moments. No data is written to the database during this mode.
- **Back to Present**: Instantly reloads the garden from the database, discarding any Time Travel state.
- **Retroactive Growth**: Plants continue to grow even when the application is closed. Upon return, the garden simulates the passage of time with correct sun positions, then batch-saves all new growth.
- **End of the World**: A destructive event that wipes the database, triggering a mass extinction and a fresh start.

## Plant Biology & Simulation Mechanics

The garden operates on a sophisticated biological engine encoded in `Garden.ts`. Each plant is a unique organism defined by its genetic code and interacts with the environment over time.

### 1. DNA: The Source Code of Life
Every plant is born with a unique hexadecimal string (e.g., `0xA3F1...`). This string is a complete **genotype**. The system parses this string into byte pairs, mapping them to specific phenotypic traits:

| Hex Pair | Gene | Effect |
| :--- | :--- | :--- |
| **0-2** | `branchBias` | **Ramification**: Probability of the stem splitting into branches. |
| **2-4** | `sunSensitivity` | **Heliotropism & Height**: How strongly the plant seeks sunlight and its potential maximum height. |
| **4-6** | `leafDensity` | **Foliage**: Frequency of leaf generation along the stem. |
| **6-8** | `leafSize` | **Size**: Volume of leaf clusters. |
| **8-10** | `colorHue` | **Base Hue**: Determines the dominant color of the flower. |
| **10-12** | `colorVar` | **Saturation/Variance**: Influences the vibrancy of stem and leaf colors. |
| **Last 3** | `vigor` | **Metabolism**: Growth speed and overall longevity. |

### 2. Generative Aesthetics
Colors are not picked from a palette but are mathematically derived from the genome:
*   **Stem**: Base neon green (`#00FF41`) modulated by `colorVar`. High variance results in more acidic or darker stems.
*   **Leaves**: Derived from stem color but shifted towards deep emeralds for contrast.
*   **Flowers**: Calculated using a full-spectrum algorithm based on `colorHue`, ensuring a unique, consistent bloom color for each species.

### 3. Growth Mechanics (The 3D Algorithm)
Growth occurs in discrete "ticks", simulating a slow biological metabolism.

**A. Metabolism & Energy**
Plants accumulate energy based on their **Vigor**.
*   **Energy Gain**: `25 * Vigor` per tick.
*   **Growth Threshold**: Once energy > `ENERGY_TO_GROW` (40), the plant consumes it to generate **one new voxel block**.
*   **Result**: High-vigor plants grow significantly faster.

**B. Tropism (Growth Direction)**
The position of the next block is a vector sum of three forces:
1.  **Inertia (85%)**: Tendency to continue in the current direction.
2.  **Heliotropism (Variable)**: Attraction to the current `sunPosition`. Plants with high `sunSensitivity` curve aggressively towards the light.
3.  **Chaos**: Random noise to ensure organic, non-linear structures.

**C. Branching**
At specific intervals (every ~12 blocks), the plant rolls for a chance to branch based on `branchBias`. Branches spawn in random lateral directions, currently limited to 2 levels of depth to prevent explosive growth.

### 4. Lifecycle
Plants follow a finite lifecycle:
1.  **Germination**: A seed lands or is spawned.
2.  **Growth**: Vertical and lateral expansion until `maxHeight` or world ceiling is reached.
3.  **Flowering**: Upon ceasing vertical growth, the final block explodes into an organic flower volume.
4.  **Maturity**: A period of stasis where the plant remains fully colorful.
5.  **Crystallization**: The plant gradually turns into dark crystal blocks (`CRYSTAL`).
6.  **Dissolution**: The structure crumbles from top to bottom.
7.  **Legacy (Ash)**: The base block turns to `ASH`. There is a small probability (`REBIRTH_CHANCE`) that the original plant will be reborn from this ash with identical DNA, simulating perennity.

## Setup

1.  **Clone and Install**:
    ```bash
    git clone https://github.com/tomasomanca/Chronobotanica.git
    cd Chronobotanica
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env.local` file in the root directory with your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    ```

3.  **Supabase Schema & Policies**:
    Ensure the following tables and Row Level Security (RLS) policies are active for the `anon` role:
    - **`plants`**: `ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all for anon" ON plants FOR ALL USING (true) WITH CHECK (true);`
    - **`plant_cells`**: `ENABLE ROW LEVEL SECURITY; CREATE POLICY "Permetti lettura pubblica delle celle delle piante" ON plant_cells FOR SELECT TO anon USING (true);` (Note: Cells are inserted in batches, ensure insert/update policies match your needs).
    - **`garden_state`**: `ENABLE ROW LEVEL SECURITY; CREATE POLICY "Allow all for anon" ON garden_state FOR ALL USING (true) WITH CHECK (true);`

4.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Deployment (Vercel)

This project is optimized for deployment on Vercel.

## Technology Stack
- **Framework**: React 18, Vite
- **Graphics**: Three.js (WebGL)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)

## Documentation

- [Design System](./DESIGN_SYSTEM.md)
