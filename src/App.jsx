import React, { Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Environment } from '@react-three/drei'
import { useSpring, a } from '@react-spring/three'
import { useGesture } from '@use-gesture/react'
import LiquidChromeBackground from './LiquidChromeBackground'

// Loading component
function LoadingSpinner() {
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      color: '#666',
      fontSize: '18px',
      fontWeight: '500'
    }}>
      Loading 3D Model...
    </div>
  )
}

// Interactive Chain component that hangs from top
function InteractiveChain() {
  const { scene } = useGLTF('/Blasted Chain-v6.glb')
  const groupRef = useRef()
  const animationFrameRef = useRef(null)
  const [isSwinging, setIsSwinging] = useState(false)
  
  // Physics constants
  const CHAIN_LENGTH = 5.0 // Virtual chain length for physics calculations
  const GRAVITY = 12.0 // Increased gravity for more natural falling
  const AIR_DAMPING = 0.025 // Slightly increased air resistance
  const FRICTION_DAMPING = 0.006 // Slightly increased friction
  const CHAIN_MASS = 0.5 // Mass of the chain for inertia calculations
  
  // Camera and viewport calculations
  const CAMERA_Z = 10 // Camera distance from origin
  const CAMERA_FOV = 45 // Field of view in degrees
  const ASPECT_RATIO = window.innerWidth / window.innerHeight
  
  // Calculate the visible height at the chain's Z position (z=0)
  const vFOV = (CAMERA_FOV * Math.PI) / 180 // Convert to radians
  const visibleHeight = 2 * Math.tan(vFOV / 2) * CAMERA_Z
  const topOfViewport = visibleHeight / 2
  
  // Position chain so its top is just at/above the viewport edge
  const CHAIN_MODEL_HEIGHT = 5.3 // Height of the chain model when hanging straight
  // Fine-tuning guide: Lower values move chain down, higher values move it up
  // With camera at z=10 and fov=45: ~7.0-8.0 should be the sweet spot
  const ANCHOR_Y = 7.0 // Moved up slightly for better positioning
  const CHAIN_OFFSET = -CHAIN_MODEL_HEIGHT // How far down the chain model extends
  
  // Initial hanging position (slight forward tilt for natural look)
  const originalRotation = [-0.1, 0, 0] // Slight forward tilt
  
  // Store velocity for physics calculations
  const velocityRef = useRef({ x: 0, y: 0 })
  const dragVelocityRef = useRef({ x: 0, y: 0 })
  const lastDragPositionRef = useRef({ x: 0, y: 0 })
  const lastTimeRef = useRef(Date.now())
  
  // Secondary motion for chain links
  const secondaryMotionRef = useRef({ x: 0, y: 0, z: 0 })
  const secondaryVelocityRef = useRef({ x: 0, y: 0, z: 0 })
  
  const [{ rotation, scale }, api] = useSpring(() => ({
    rotation: originalRotation,
    scale: [1.5, 1.5, 1.5],
    config: { mass: 1, tension: 120, friction: 40 },
  }))

  // Add initial swing animation on mount
  React.useEffect(() => {
    // Start with a gentle swing - slightly off-center with small initial velocity
    const initialRotationX = -0.15; // Slight backward tilt
    const initialRotationY = 0.05;  // Very slight side tilt
    const initialVelocity = {
      x: 0.3,  // Small side-to-side velocity
      y: -0.2  // Small forward velocity (negative for forward motion)
    };
    
    // Start the swing animation immediately
    startSwingAnimation(initialRotationX, initialRotationY, initialVelocity);
    
    return () => {
      // Clean up animation on unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // Empty dependency array - only run on mount

  // Calculate scale based on rotation (perspective effect)
  const calculateScale = (rotX, rotY) => {
    // Calculate how far forward/back the chain is swinging
    const forwardAngle = -rotX // Negative because forward is negative rotation
    const sideAngle = Math.abs(rotY)
    
    // Combined angle effect
    const totalAngle = Math.sqrt(forwardAngle * forwardAngle + sideAngle * sideAngle)
    
    // Scale calculation - chain appears larger when swinging toward camera
    const baseScale = 1.5 // Increased from 1.0 to 1.5 for larger overall size
    const scaleRange = 0.4 // Increased from 0.3 to 0.4 for more dramatic perspective effect
    
    // Forward swing (negative rotX) makes chain larger, backward makes it smaller
    const perspectiveScale = baseScale + (Math.sin(forwardAngle) * scaleRange)
    
    // Clamp the scale to reasonable bounds (increased bounds for larger size)
    return Math.max(1.0, Math.min(2.0, perspectiveScale))
  }

  // Function to stop swinging and reset to original position
  const stopSwinging = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    setIsSwinging(false)
    velocityRef.current = { x: 0, y: 0 }
    secondaryMotionRef.current = { x: 0, y: 0, z: 0 }
    secondaryVelocityRef.current = { x: 0, y: 0, z: 0 }
    
    // Reset to original rotation only (position stays fixed)
    api.start({ 
      rotation: originalRotation,
      scale: [1.5, 1.5, 1.5],
      config: {
        tension: 150,
        friction: 50
      }
    })
  }

  // Shared physics calculation function
  const calculateAcceleration = (rotX, rotY, velocity) => {
    // Pendulum physics: a = -(g/L) * sin(θ) - damping * velocity
    const omega = Math.sqrt(GRAVITY / CHAIN_LENGTH) // Natural frequency
    
    // For large angles, use exact pendulum equation (not small angle approximation)
    const angle = Math.sqrt(rotX * rotX + rotY * rotY)
    const largeAngleFactor = angle > 0.5 ? (Math.sin(angle) / angle) : 1
    
    // Gravity restoring force
    const gravityX = -omega * omega * Math.sin(rotY) * largeAngleFactor
    const gravityY = -omega * omega * Math.sin(rotX) * largeAngleFactor
    
    // Damping forces
    const velocityMagnitude = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y)
    const airDampingX = -AIR_DAMPING * velocity.x * velocityMagnitude // Quadratic air damping
    const airDampingY = -AIR_DAMPING * velocity.y * velocityMagnitude
    
    const frictionDampingX = -FRICTION_DAMPING * velocity.x // Linear friction damping
    const frictionDampingY = -FRICTION_DAMPING * velocity.y
    
    // Coupling effects for 3D motion (creates figure-8 and chaotic patterns)
    const couplingStrength = 0.15
    const couplingX = couplingStrength * Math.sin(rotX) * Math.sin(rotY) * velocity.y
    const couplingY = -couplingStrength * Math.sin(rotX) * Math.sin(rotY) * velocity.x
    
    // Add nonlinear effects for large angles (chaotic behavior)
    const chaosStrength = angle > 1.0 ? 0.05 : 0
    const chaosX = chaosStrength * Math.sin(rotY * 3) * velocity.x
    const chaosY = chaosStrength * Math.sin(rotX * 3) * velocity.y
    
    return {
      x: gravityX + airDampingX + frictionDampingX + couplingX + chaosX,
      y: gravityY + airDampingY + frictionDampingY + couplingY + chaosY
    }
  }

  // Shared swing animation function
  const startSwingAnimation = (startRotationX, startRotationY, initialVelocity = null) => {
    // Always clean up any existing animation first
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    setIsSwinging(true)
    
    // Set initial velocity if provided
    if (initialVelocity) {
      velocityRef.current = { ...initialVelocity }
    }
    
    // Current rotation state - using const with object to allow mutation
    const currentRotation = {
      x: startRotationX,
      y: startRotationY
    }
    
    // Physics simulation using Runge-Kutta 4th order for accuracy
    let lastFrameTime = Date.now()
    
    const swing = () => {
      const now = Date.now()
      const dt = Math.min((now - lastFrameTime) / 1000, 0.033) // Cap at ~30fps for stability
      lastFrameTime = now
      
      // RK4 integration for more accurate physics
      const k1 = calculateAcceleration(currentRotation.x, currentRotation.y, velocityRef.current)
      const k2 = calculateAcceleration(
        currentRotation.x + velocityRef.current.y * dt/2,
        currentRotation.y + velocityRef.current.x * dt/2,
        { x: velocityRef.current.x + k1.x * dt/2, y: velocityRef.current.y + k1.y * dt/2 }
      )
      const k3 = calculateAcceleration(
        currentRotation.x + velocityRef.current.y * dt/2,
        currentRotation.y + velocityRef.current.x * dt/2,
        { x: velocityRef.current.x + k2.x * dt/2, y: velocityRef.current.y + k2.y * dt/2 }
      )
      const k4 = calculateAcceleration(
        currentRotation.x + velocityRef.current.y * dt,
        currentRotation.y + velocityRef.current.x * dt,
        { x: velocityRef.current.x + k3.x * dt, y: velocityRef.current.y + k3.y * dt }
      )
      
      // Update velocity
      velocityRef.current.x += (k1.x + 2*k2.x + 2*k3.x + k4.x) * dt / 6
      velocityRef.current.y += (k1.y + 2*k2.y + 2*k3.y + k4.y) * dt / 6
      
      // Update position
      currentRotation.x += velocityRef.current.y * dt
      currentRotation.y += velocityRef.current.x * dt
      
      // Apply constraints (maximum angles) - prevent getting stuck
      const maxAngle = Math.PI / 2.5 // Slightly more restrictive to prevent extreme positions
      currentRotation.x = Math.max(-maxAngle, Math.min(maxAngle, currentRotation.x))
      currentRotation.y = Math.max(-maxAngle, Math.min(maxAngle, currentRotation.y))
      
      // Update secondary motion (chain link wobble)
      const secondaryDamping = 0.95
      const secondarySpring = 0.1
      
      secondaryVelocityRef.current.x *= secondaryDamping
      secondaryVelocityRef.current.y *= secondaryDamping
      secondaryVelocityRef.current.z *= secondaryDamping
      
      secondaryVelocityRef.current.x -= secondaryMotionRef.current.x * secondarySpring
      secondaryVelocityRef.current.y -= secondaryMotionRef.current.y * secondarySpring
      secondaryVelocityRef.current.z -= secondaryMotionRef.current.z * secondarySpring
      
      // Add influence from main motion
      secondaryVelocityRef.current.x += velocityRef.current.x * 0.05
      secondaryVelocityRef.current.y += velocityRef.current.y * 0.05
      
      secondaryMotionRef.current.x += secondaryVelocityRef.current.x * dt
      secondaryMotionRef.current.y += secondaryVelocityRef.current.y * dt
      secondaryMotionRef.current.z += secondaryVelocityRef.current.z * dt
      
      // Calculate scale based on rotation
      const currentScale = calculateScale(currentRotation.x, currentRotation.y)
      
      api.start({
        rotation: [currentRotation.x, currentRotation.y, 0],
        scale: [currentScale, currentScale, currentScale],
        config: { tension: 200, friction: 10 }
      })
      
      // Check if should continue swinging
      const totalEnergy = Math.abs(velocityRef.current.x) + Math.abs(velocityRef.current.y) + 
                        Math.abs(currentRotation.x) * 0.1 + Math.abs(currentRotation.y) * 0.1 +
                        Math.abs(secondaryVelocityRef.current.x) + Math.abs(secondaryVelocityRef.current.y)
      
      if (totalEnergy > 0.002 && animationFrameRef.current !== null) {
        animationFrameRef.current = requestAnimationFrame(swing)
      } else {
        // Gradual settle to rest
        setIsSwinging(false)
        animationFrameRef.current = null
        velocityRef.current = { x: 0, y: 0 }
        secondaryMotionRef.current = { x: 0, y: 0, z: 0 }
        secondaryVelocityRef.current = { x: 0, y: 0, z: 0 }
        
        // Very gentle spring back to original rotation
        api.start({ 
          rotation: originalRotation,
          scale: [1.5, 1.5, 1.5],
          config: {
            tension: 40,
            friction: 80,
            mass: 2
          }
        })
      }
    }
    
    // Start the swing animation
    animationFrameRef.current = requestAnimationFrame(swing)
  }

  const bind = useGesture({
    onClick: () => {
      // Push the chain away when clicked (like slapping it)
      if (!isSwinging) {
        // Get current rotation from spring state
        const currentRotation = rotation.get()
        const startX = currentRotation[0] || originalRotation[0]
        const startY = currentRotation[1] || 0
        
        // Start swing with backward push
        startSwingAnimation(startX, startY, {
          x: 0, // No side-to-side momentum
          y: 1.2 // Reduced backward momentum for more natural gravity response
        })
      } else {
        // If already swinging, stop it
        stopSwinging()
      }
    },
    
    onDrag: ({ offset: [x, y], velocity, active, first, last, timeStamp, movement }) => {
      // Stop any ongoing swing animation when starting to drag
      if (first && isSwinging) {
        stopSwinging()
        lastDragPositionRef.current = { x, y }
        lastTimeRef.current = timeStamp
      }
      
      // Enhanced sensitivity with controlled drag range
      const sensitivity = 0.008
      const maxDragAngle = Math.PI / 3 // 60 degrees max in any direction
      
      // Convert drag to spherical rotation angles
      const dragRadius = Math.sqrt(x * x + y * y) * sensitivity
      const dragAngle = Math.atan2(y, x)
      
      // Limit drag radius
      const limitedRadius = Math.min(dragRadius, maxDragAngle)
      
      // Convert to rotation angles with proper spherical mapping
      const rotationY = limitedRadius * Math.cos(dragAngle) // Left/right
      const rotationX = -limitedRadius * Math.sin(dragAngle) // Forward/back (negative for intuitive control)
      
      // Add drag resistance for heavy chain feel
      const dragResistance = 0.85
      const resistedRotationX = rotationX * dragResistance
      const resistedRotationY = rotationY * dragResistance
      
      // Calculate scale based on rotation
      const currentScale = calculateScale(resistedRotationX, resistedRotationY)
      
      // Track velocity for momentum transfer
      if (!first) {
        const dt = (timeStamp - lastTimeRef.current) / 1000 || 0.016 // Convert to seconds
        if (dt > 0) {
          dragVelocityRef.current = {
            x: (resistedRotationY - lastDragPositionRef.current.x) / dt,
            y: (resistedRotationX - lastDragPositionRef.current.y) / dt
          }
        }
      }
      lastDragPositionRef.current = { x: resistedRotationY, y: resistedRotationX }
      lastTimeRef.current = timeStamp
      
      // Update secondary motion based on drag movement
      const [moveX, moveY] = movement || [0, 0]
      secondaryVelocityRef.current.x += moveX * 0.001
      secondaryVelocityRef.current.y += moveY * 0.001
      
      api.start({
        rotation: [resistedRotationX, resistedRotationY, 0],
        scale: [currentScale, currentScale, currentScale],
        config: active 
          ? { tension: 300, friction: 30 }
          : { tension: 150, friction: 40 },
      })
    },
    
    onDragEnd: ({ velocity, offset }) => {
      // Transfer drag velocity to pendulum angular velocity with momentum conservation
      const momentumTransfer = 0.7 // Some energy lost in transfer
      const transferredVelocity = {
        x: (dragVelocityRef.current.x || 0) * momentumTransfer,
        y: (dragVelocityRef.current.y || 0) * momentumTransfer
      }
      
      // Get current rotation from last drag position
      const currentRotX = lastDragPositionRef.current.y
      const currentRotY = lastDragPositionRef.current.x
      
      // Start swing animation with transferred momentum
      startSwingAnimation(currentRotX, currentRotY, transferredVelocity)
    },
  }, {
    drag: {
      threshold: 2,
      filterTaps: true,
      delay: false,
      bounds: { left: -500, right: 500, top: -500, bottom: 500 }, // Prevent dragging off screen
    }
  })

  return (
    <a.group 
      ref={groupRef}
      position={[0, ANCHOR_Y, 0]} // Fixed position at top of viewport
      rotation={rotation} // Only rotation changes, not position
      scale={scale}
      {...bind()}
      style={{ cursor: isSwinging ? 'pointer' : 'grab' }}
    >
      {/* Chain model positioned below the pivot point */}
      <group position={[0, CHAIN_OFFSET, 0]} scale={[16, 16, 16]}>
        <primitive object={scene} />
      </group>
    </a.group>
  )
}

// Main App component
function App() {
  // Add useEffect to set body styles
  React.useEffect(() => {
    // Prevent scrolling on the body and html
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.height = '100%';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    
    document.body.style.overflow = 'hidden';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.height = '100%';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = '0';
    document.body.style.left = '0';
    
    // Also set on the root element
    const root = document.getElementById('root');
    if (root) {
      root.style.overflow = 'hidden';
      root.style.height = '100vh';
      root.style.width = '100vw';
      root.style.position = 'fixed';
      root.style.top = '0';
      root.style.left = '0';
    }
    
    return () => {
      // Cleanup
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
      document.documentElement.style.margin = '';
      document.documentElement.style.padding = '';
      
      document.body.style.overflow = '';
      document.body.style.margin = '';
      document.body.style.padding = '';
      document.body.style.height = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      document.body.style.left = '';
      
      if (root) {
        root.style.overflow = '';
        root.style.height = '';
        root.style.width = '';
        root.style.position = '';
        root.style.top = '';
        root.style.left = '';
      }
    };
  }, []);

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      background: 'white',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      {/* Liquid Chrome Background */}
      <LiquidChromeBackground
        baseColor={[0.1, 0.1, 0.1]}
        speed={0.2}
        amplitude={0.3}
        frequencyX={3}
        frequencyY={3}
        interactive={true}
        style={{ zIndex: 0 }}
      />
      
      <Canvas
        camera={{ position: [0, 0, 10], fov: 45 }} // Camera looking straight at the chain
        style={{ 
          background: 'transparent',
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1
        }}
      >
        {/* Lighting setup */}
        <ambientLight intensity={1.4} />
        <directionalLight 
          position={[20, 20, 10]}  // Positioned far right and high for dramatic lighting
          intensity={0}  // Turned off temporarily
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        {/* Environment for better reflections */}
        <Environment preset="city" />

        {/* Orbit Controls - disabled to prevent conflicts */}
        <OrbitControls 
          enablePan={false}
          enableZoom={false}
          enableRotate={false}
          autoRotate={false}
        />

        {/* Interactive Chain Model */}
        <Suspense fallback={null}>
          <InteractiveChain />
        </Suspense>
      </Canvas>

      {/* Loading indicator */}
      <Suspense fallback={<LoadingSpinner />}>
        <div style={{ display: 'none' }} />
      </Suspense>
    </div>
  )
}

export default App 