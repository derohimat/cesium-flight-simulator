# SkyStudio - Aerial Content Creation Platform

Create stunning cinematic aerial content with automated drone flight paths over real-world locations. Built with Cesium, React, and TypeScript.

## ✨ Features

### 🎬 Director Mode
- **Waypoint-based Flight Paths** - Create complex routes by adding locations
- **Multiple Flight Modes** - Linear flyover, 360° orbit, or target lock
- **Auto-Recording** - Automatically capture your cinematic flights
- **Portrait/Landscape** - Toggle between 16:9 and 9:16 for social media

### 📍 Location Library
- **22+ Curated Locations** - Famous landmarks, cities, and natural wonders
- **Category Filtering** - Browse by landmarks, cities, or nature spots
- **Favorites System** - Save your go-to filming locations
- **Quick Teleport** - Instantly jump to any location

### 🎥 Camera Modes
- **Follow Camera** - Classic chase cam from behind
- **Close-Up** - Tight follow shot
- **FPV Drone** - First-person drone pilot view with gimbal control
- **Cinematic** - Professional shots with dolly zoom and crane effects

### 📤 Export Options
- **Multiple Resolutions** - 720p, 1080p, 4K
- **Social Media Presets** - TikTok, YouTube, Instagram ready
- **MP4/WebM Output** - Industry-standard formats
- **Screenshot Mode** - Capture high-res stills

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- Free API tokens from Mapbox and Cesium Ion

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/skystudio.git
cd skystudio/packages/web

# Install dependencies
npm install

# Run the development server
npm run dev
```

The app will prompt you for API tokens on first launch, or create a `.env` file:

```bash
VITE_MAPBOX_TOKEN=your_mapbox_token_here
VITE_CESIUM_TOKEN=your_cesium_token_here
```

### Getting API Tokens

**Mapbox Token** (for mini-map)
1. Sign up at [mapbox.com](https://account.mapbox.com/)
2. Copy your default public token (starts with `pk.`)

**Cesium Ion Token** (for 3D terrain)
1. Sign up at [cesium.com/ion](https://ion.cesium.com/tokens)
2. Copy your default access token

Both services are free for development use.

## 🎮 Controls

| Key | Action |
|-----|--------|
| `W` | Throttle / Forward |
| `S` | Brake / Backward |
| `A` / `D` / `←` / `→` | Turn / Roll |
| `C` | Cycle Camera Mode |
| `M` | Toggle Vehicle |
| `R` | Restart |
| `~` | Debug Panel |

## 🛠 Tech Stack

- **Cesium** - 3D globe and terrain rendering
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Modern styling
- **Vite** - Fast build tool
- **Mapbox GL** - 2D mini-map

## 📁 Project Structure

```
packages/web/src/
├── cesium/           # Core 3D engine
│   ├── camera/       # Camera systems (Follow, FPV, Cinematic)
│   ├── vehicles/     # Aircraft implementations
│   ├── managers/     # Vehicle and camera management
│   └── bridge/       # React-Cesium communication
└── react/            # UI layer
    ├── features/
    │   ├── studio/   # Location library, export panel, timeline
    │   ├── director/ # Flight path creation
    │   ├── camera/   # Camera controls
    │   └── hud/      # Heads-up display
    ├── layouts/      # StudioModeUI, BuilderModeUI
    └── hooks/        # React hooks for state
```

## 🔧 Development

```bash
# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [Cesium](https://cesium.com/) for the 3D rendering engine
- [Mapbox](https://www.mapbox.com/) for map tiles and styling
