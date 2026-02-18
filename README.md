# Chronobotanica

Chronobotanica is a digital garden simulation exploring the intersection of biological rhythms and virtual time. It features a voxel-based sculptural world where plants grow, mature, and eventually dissolve into seeds that carry their genetic legacy forward.

## Key Features

### Global Persistence (Supabase)
- **Real-Time Database**: Every plant born in the garden is instantly recorded in a Supabase database.
- **State Restoration**: When the garden is reloaded, it fetches the entire history of the garden and "fast-forwards" growth to the current moment.
- **Missed Events**: The simulation calculates and spawns plants that *would have been born* while the application was closed, ensuring a continuous living world.

### Temporal Control
- **Time Travel**: A specialized mode where time accelerates to **1 Day per Second**, allowing users to witness generations of evolution in moments.
- **Back to Present**: Instantly snaps the simulation back to the user's local real-time and re-syncs with the database.
- **End of the World**: A destructive event that wipes the database, triggering a mass extinction and a fresh start.

## Setup

1.  **Clone and Install**:
    ```bash
    git clone https://github.com/tomasomanca/Chronobotanica.git
    cd Chronobotanica
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory with your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_project_url
    VITE_SUPABASE_ANON_KEY=your_anon_key
    ```

3.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Deployment (Vercel)

This project is optimized for deployment on Vercel.
**Important**: You must add the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **Environment Variables** section in your Vercel project settings for the application to connect to the database.

## Technology Stack
- **Framework**: React 18, Vite
- **Graphics**: Three.js (WebGL)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)

## Documentation

- [Design System](./DESIGN_SYSTEM.md)
