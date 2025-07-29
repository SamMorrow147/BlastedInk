# Blasted Chain Interactive 3D Viewer

An interactive 3D chain pendant viewer built with React, Three.js, and react-three-fiber. Features realistic physics simulation with draggable and clickable interactions.

## Features

- **Interactive 3D Model**: Drag to swing the chain in any direction
- **Realistic Physics**: Accurate pendulum physics with gravity, damping, and momentum
- **Click Interaction**: Click to push the chain away and watch it swing back
- **Responsive Design**: Works on desktop and mobile devices
- **Smooth Animations**: Uses react-spring for fluid motion

## Technologies

- React
- Three.js / react-three-fiber
- react-spring (animations)
- @use-gesture/react (gesture handling)
- Vite (build tool)

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Deployment

This project is configured for easy deployment on Vercel:

1. Connect your GitHub repository to Vercel
2. Vercel will automatically detect the Vite framework
3. Deploy with default settings

The project includes a `vercel.json` configuration file for optimal deployment settings.

## Project Structure

```
├── public/
│   └── Blasted Chain-v2.glb    # 3D model file
├── src/
│   ├── App.jsx                 # Main component with 3D scene
│   └── main.jsx                # React entry point
├── index.html                  # HTML template
├── package.json                # Dependencies
├── vite.config.js              # Vite configuration
└── vercel.json                 # Vercel deployment config
```

## Physics Implementation

The chain uses realistic pendulum physics including:
- Gravity-driven acceleration
- Air resistance (quadratic damping)
- Pivot friction (linear damping)
- Momentum conservation
- Large-angle pendulum equations
- 3D coupling effects for complex motion patterns 