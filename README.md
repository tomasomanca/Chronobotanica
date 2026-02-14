# Chronobotanica

Chronobotanica is a digital garden simulation exploring the intersection of biological rhythms and virtual time. It features a voxel-based sculptural world where plants grow, mature, and eventually dissolve into seeds that carry their genetic legacy forward.

## Key Features

### Temporal Synchronization
- **Real-Time Alignment**: The simulation synchronizes its solar cycle with the user's local time upon launch. Noon and Midnight in the virtual world correspond to the actual time of day.
- **Narrative Flow of Time**: A custom UI control allows users to manipulate the passage of time from a complete **STOP** to a **SECOND** (where a full day passes every second), with intermediate benchmarks for real-time (**DAY**), **HOUR**, and **MINUTE**.

### Botanical Life Cycle
- **Growth & Maturity**: Plants grow based on hereditary parameters (Vigor, Branch Bias, Sun Sensitivity).
- **Crystallization**: Mature plants eventually enter a state of crystallization, turning into dark, glassy structures.
- **Collapse & Genoma**: Crystallized plants eventually dissolve, collapsing toward the ground.
- **Legacy Seeds (Genoma)**: At the end of its life, each plant leaves behind exactly one white **GENOMA** seed pixel at the base.
- **Rebirth**: Genoma seeds have a probability of rebirthing a new plant with the exact same DNA, continuing the genetic lineage.

### Environmental Simulation
- **Voxel World**: A 100x100x100 grid of procedural growth.
- **Dynamic Lighting**: 3D solar mechanics with custom intensity curves based on time of day.
- **Hereditary DNA**: Unique genome hashing (HEX-based) determining colors and growth patterns.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Run development server**:
    ```bash
    npm run dev
    ```

## Technology Stack
- **Framework**: React 18
- **Graphics**: Three.js (WebGL)
- **Styling**: Tailwind CSS
- **Typography**: Teletext/Monospace aesthetics

## Documentation

- [Design System](./DESIGN_SYSTEM.md)
