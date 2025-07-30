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
const InteractiveChain = React.forwardRef(({ addDebugMessage }, ref) => {
  const { scene } = useGLTF('/Blasted Chain-v6.glb')
  const groupRef = useRef()
  const animationFrameRef = useRef(null)
  const [isSwinging, setIsSwinging] = useState(false)
  const [isGyroActive, setIsGyroActive] = useState(false)
  const [showGyroButton, setShowGyroButton] = useState(false)
    const [gyroError, setGyroError] = useState(null)
  const [manualControlActive, setManualControlActive] = useState(false) // Flag to prevent auto-swing restart
  

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
  
  // Gyroscope state
  const gyroRef = useRef({ beta: 0, gamma: 0 })
  const gyroTargetRef = useRef({ x: 0, y: 0 })
  const gyroSmoothingRef = useRef({ x: 0, y: 0 })
  
  // Secondary motion for chain links
  const secondaryMotionRef = useRef({ x: 0, y: 0, z: 0 })
  const secondaryVelocityRef = useRef({ x: 0, y: 0, z: 0 })
  
  const [{ rotation, scale }, api] = useSpring(() => ({
    rotation: originalRotation,
    scale: [1.5, 1.5, 1.5],
    config: { mass: 1, tension: 120, friction: 40 },
  }))

  // Safe mobile detection
  const isMobileDevice = () => {
    try {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
      return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    } catch (error) {
      console.log('Error detecting mobile device:', error);
      return false;
    }
  };

  // Gyroscope functions with error handling
  const requestGyroPermission = async () => {
    try {
      console.log('Requesting gyroscope permission...');
      
      if (typeof DeviceOrientationEvent === 'undefined') {
        setGyroError('DeviceOrientation not supported');
        return false;
      }

      // For iOS 13+ devices
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          console.log('iOS permission result:', permission);
          if (permission === 'granted') {
            enableGyroscope();
            return true;
          } else {
            setGyroError('Permission denied');
            return false;
          }
        } catch (error) {
          console.error('Error requesting iOS permission:', error);
          setGyroError('Permission request failed: ' + error.message);
          return false;
        }
      } else {
        // For Android and older iOS devices
        console.log('Enabling gyroscope for Android/older iOS');
        enableGyroscope();
        return true;
      }
    } catch (error) {
      console.error('Error in requestGyroPermission:', error);
      setGyroError('Failed to request permission: ' + error.message);
      return false;
    }
  };

  const enableGyroscope = async () => {
    try {
      addDebugMessage('🎬 ENABLE GYROSCOPE CALLED');
      
      // Try DeviceOrientation first (better for tilt-based control)
      if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
        addDebugMessage('✅ DeviceOrientationEvent available');
        
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          addDebugMessage('📱 iOS 13+ - requesting permission...');
          const permission = await DeviceOrientationEvent.requestPermission();
          addDebugMessage('🔐 Permission result: ' + permission);
          
          if (permission === 'granted') {
            addDebugMessage('🚀 ORIENTATION PERMISSION GRANTED!');
            window.addEventListener('deviceorientation', handleDeviceOrientation);
            addDebugMessage('👂 Event listener added');
            setIsGyroActive(true);
            addDebugMessage('🔄 isGyroActive set to true');
            startGyroAnimation(); // Start animation loop immediately
            return;
          } else {
            addDebugMessage('❌ Permission denied: ' + permission);
            setGyroError('Permission denied: ' + permission);
            return;
          }
        } else {
          // Android or older iOS
          addDebugMessage('🤖 Android/older iOS - no permission needed');
          window.addEventListener('deviceorientation', handleDeviceOrientation);
          addDebugMessage('👂 Event listener added');
          setIsGyroActive(true);
          addDebugMessage('🔄 isGyroActive set to true');
          startGyroAnimation(); // Start animation loop immediately
          return;
        }
      } else {
        addDebugMessage('❌ DeviceOrientationEvent not available');
      }

      // Fallback to DeviceMotion if orientation not available
      if (typeof window !== 'undefined' && window.DeviceMotionEvent) {
        addDebugMessage('✅ DeviceMotionEvent available');
        
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          addDebugMessage('📱 iOS 13+ - requesting motion permission...');
          const permission = await DeviceMotionEvent.requestPermission();
          addDebugMessage('🔐 Motion permission result: ' + permission);
          
          if (permission === 'granted') {
            addDebugMessage('🚀 MOTION PERMISSION GRANTED!');
            window.addEventListener('devicemotion', handleDeviceMotion);
            addDebugMessage('👂 Motion event listener added');
            setIsGyroActive(true);
            addDebugMessage('🔄 isGyroActive set to true');
            startGyroAnimation(); // Start animation loop immediately
            return;
          } else {
            addDebugMessage('❌ Motion permission denied: ' + permission);
            setGyroError('Motion permission denied: ' + permission);
            return;
          }
        } else {
          // Android or older iOS
          addDebugMessage('🤖 Android/older iOS - no motion permission needed');
          window.addEventListener('devicemotion', handleDeviceMotion);
          addDebugMessage('👂 Motion event listener added');
          setIsGyroActive(true);
          addDebugMessage('🔄 isGyroActive set to true');
          startGyroAnimation(); // Start animation loop immediately
          return;
        }
      } else {
        addDebugMessage('❌ DeviceMotionEvent not available');
      }

      addDebugMessage('❌ No sensor support found');
      setGyroError('No orientation or motion support found');
    } catch (error) {
      addDebugMessage('❌ Error enabling sensors: ' + error.message);
      setGyroError('Failed to enable: ' + error.message);
    }
  };

  const handleDeviceMotion = (event) => {
    try {
      if (!isGyroActive) return;

      const x = event.accelerationIncludingGravity.x || 0;
      const y = event.accelerationIncludingGravity.y || 0;
      const z = event.accelerationIncludingGravity.z || 0;

      console.log(`📱 MOTION - X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);

      // Convert acceleration to rotation with clamping
      const sensitivity = 0.3;
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      
      // Clamp rotations to reasonable range
      const rotX = clamp(-(y * sensitivity), -0.8, 0.8); // Forward/back tilt
      const rotY = clamp(x * sensitivity, -0.8, 0.8);    // Left/right tilt

      // Update target for spring animation
      gyroTargetRef.current = { x: rotX, y: rotY };
      console.log(`🎯 MOTION TARGETS - X: ${rotX.toFixed(2)}, Y: ${rotY.toFixed(2)}`);
    } catch (error) {
      console.error('❌ Error handling motion:', error);
    }
  };

  const disableGyroscope = () => {
    try {
      console.log('Disabling gyroscope...');
      setIsGyroActive(false);
      setGyroError(null);
      
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
      }
      
      // Stop gyro animation and return to normal physics
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      // Reset to original position
      api.start({ 
        rotation: originalRotation,
        scale: [1.5, 1.5, 1.5],
        config: {
          tension: 150,
          friction: 50
        }
      });
    } catch (error) {
      console.error('Error disabling gyroscope:', error);
    }
  };

  const handleDeviceOrientation = (event) => {
    try {
      if (!isGyroActive) return;
      
      // Beta: front-back tilt (-180 to 180, negative forward)
      // Gamma: left-right tilt (-90 to 90, negative left)
      const beta = event.beta || 0;   // Front-back tilt
      const gamma = event.gamma || 0; // Left-right tilt
      
      gyroRef.current = { beta, gamma };
      
      // Debug logging
      addDebugMessage(`📱 GYRO: β=${beta.toFixed(1)}° γ=${gamma.toFixed(1)}°`);
      
      // Convert to rotation with clamping
      const sensitivity = 2.0; // MUCH higher sensitivity for testing
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      
      // Convert to radians and clamp to reasonable range
      const rotX = clamp(-(beta * sensitivity * Math.PI / 180), -2.0, 2.0);  // Bigger range
      const rotY = clamp((gamma * sensitivity * Math.PI / 180), -2.0, 2.0);  // Bigger range
      
      // Update target for spring animation
      gyroTargetRef.current = { x: rotX, y: rotY };
      
      // Debug the calculated targets
      addDebugMessage(`🎯 TARGET: X=${rotX.toFixed(2)} Y=${rotY.toFixed(2)}`);
      
    } catch (error) {
      addDebugMessage('❌ Orientation error: ' + error.message);
    }
  };

    const startGyroAnimation = () => {
    try {
      addDebugMessage('🚀 STARTING GYRO ANIMATION LOOP');
      let lastFrameTime = Date.now();
      let frameCount = 0;
      
      const gyroLoop = () => {
        try {
          if (!isGyroActive) {
            console.log('⏹️ GYRO ANIMATION STOPPED - isGyroActive false');
            return;
          }
          
          frameCount++;
          const now = Date.now();
          const dt = (now - lastFrameTime) / 1000;
          lastFrameTime = now;
          
          // Smooth interpolation toward gyro target
          const smoothing = 0.3;
          gyroSmoothingRef.current.x += (gyroTargetRef.current.x - gyroSmoothingRef.current.x) * smoothing;
          gyroSmoothingRef.current.y += (gyroTargetRef.current.y - gyroSmoothingRef.current.y) * smoothing;
          
          // Debug every 60 frames (about once per second)
          if (frameCount % 60 === 0) {
            addDebugMessage(`🔄 LOOP frame ${frameCount}`);
            addDebugMessage(`📊 Smoothed: X=${gyroSmoothingRef.current.x.toFixed(2)} Y=${gyroSmoothingRef.current.y.toFixed(2)}`);
          }
          
          // Calculate scale based on tilt
          const currentScale = calculateScale(gyroSmoothingRef.current.x, gyroSmoothingRef.current.y);
          
          // Apply rotation with slight swing physics
          const swingFactor = 0.1;
          const swingX = Math.sin(now * 0.002) * swingFactor * Math.abs(gyroSmoothingRef.current.x);
          const swingY = Math.cos(now * 0.0015) * swingFactor * Math.abs(gyroSmoothingRef.current.y);
          
          const finalRotation = [
            gyroSmoothingRef.current.x + swingX,
            gyroSmoothingRef.current.y + swingY,
            0
          ];
          
          // Apply via spring
          api.start({
            rotation: finalRotation,
            scale: [currentScale, currentScale, currentScale],
            config: { tension: 200, friction: 30 }
          });
          
          // Debug every 60 frames - final output
          if (frameCount % 60 === 0) {
            addDebugMessage(`🎯 FINAL ROT: [${finalRotation[0].toFixed(2)}, ${finalRotation[1].toFixed(2)}]`);
          }
          
          animationFrameRef.current = requestAnimationFrame(gyroLoop);
        } catch (error) {
          addDebugMessage('❌ Error in gyro loop: ' + error.message);
        }
      };
      
      animationFrameRef.current = requestAnimationFrame(gyroLoop);
    } catch (error) {
      addDebugMessage('❌ Error starting gyro: ' + error.message);
    }
  };

  // Check if device orientation is supported on mount
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.DeviceOrientationEvent && isMobileDevice()) {
        console.log('Mobile device detected, showing gyro button');
        setShowGyroButton(true);
      }
    } catch (error) {
      console.error('Error checking device capabilities:', error);
    }
    
    return () => {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('deviceorientation', handleDeviceOrientation);
        }
      } catch (error) {
        console.error('Error cleaning up event listeners:', error);
      }
    };
  }, []);

  // Add initial swing animation on mount
  React.useEffect(() => {
    try {
      // Start with a gentle swing - slightly off-center with small initial velocity
      const initialRotationX = -0.15; // Slight backward tilt
      const initialRotationY = 0.05;  // Very slight side tilt
      const initialVelocity = {
        x: 0.3,  // Small side-to-side velocity
        y: -0.2  // Small forward velocity (negative for forward motion)
      };
      
      // Start the swing animation immediately (only if gyro is not active AND no manual control)
      if (!isGyroActive && !manualControlActive) {
        addDebugMessage('🎬 STARTING INITIAL SWING ANIMATION');
        startSwingAnimation(initialRotationX, initialRotationY, initialVelocity);
      } else if (manualControlActive) {
        addDebugMessage('⏸️ SKIPPING INITIAL SWING - MANUAL CONTROL ACTIVE');
      }
      
      return () => {
        // Clean up animation on unmount
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    } catch (error) {
      console.error('Error in initial swing effect:', error);
    }
  }, [isGyroActive, manualControlActive]); // Add both dependencies

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
    // Don't start swing animation if gyro is active
    if (isGyroActive) return
    
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
    
    // Current rotation state - using let to allow mutation (fixes const warnings)
    let currentRotationX = startRotationX
    let currentRotationY = startRotationY
    
    // Physics simulation using Runge-Kutta 4th order for accuracy
    let lastFrameTime = Date.now()
    
    const swing = () => {
      const now = Date.now()
      const dt = Math.min((now - lastFrameTime) / 1000, 0.033) // Cap at ~30fps for stability
      lastFrameTime = now
      
      // RK4 integration for more accurate physics
      const k1 = calculateAcceleration(currentRotationX, currentRotationY, velocityRef.current)
      const k2 = calculateAcceleration(
        currentRotationX + velocityRef.current.y * dt/2,
        currentRotationY + velocityRef.current.x * dt/2,
        { x: velocityRef.current.x + k1.x * dt/2, y: velocityRef.current.y + k1.y * dt/2 }
      )
      const k3 = calculateAcceleration(
        currentRotationX + velocityRef.current.y * dt/2,
        currentRotationY + velocityRef.current.x * dt/2,
        { x: velocityRef.current.x + k2.x * dt/2, y: velocityRef.current.y + k2.y * dt/2 }
      )
      const k4 = calculateAcceleration(
        currentRotationX + velocityRef.current.y * dt,
        currentRotationY + velocityRef.current.x * dt,
        { x: velocityRef.current.x + k3.x * dt, y: velocityRef.current.y + k3.y * dt }
      )
      
      // Update velocity
      velocityRef.current.x += (k1.x + 2*k2.x + 2*k3.x + k4.x) * dt / 6
      velocityRef.current.y += (k1.y + 2*k2.y + 2*k3.y + k4.y) * dt / 6
      
      // Update position (using let variables now - fixes const warnings)
      currentRotationX += velocityRef.current.y * dt
      currentRotationY += velocityRef.current.x * dt
      
      // Apply constraints (maximum angles) - prevent getting stuck
      const maxAngle = Math.PI / 2.5 // Slightly more restrictive to prevent extreme positions
      currentRotationX = Math.max(-maxAngle, Math.min(maxAngle, currentRotationX))
      currentRotationY = Math.max(-maxAngle, Math.min(maxAngle, currentRotationY))
      
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
      const currentScale = calculateScale(currentRotationX, currentRotationY)
      
      api.start({
        rotation: [currentRotationX, currentRotationY, 0],
        scale: [currentScale, currentScale, currentScale],
        config: { tension: 200, friction: 10 }
      })
      
      // Check if should continue swinging
      const totalEnergy = Math.abs(velocityRef.current.x) + Math.abs(velocityRef.current.y) + 
                        Math.abs(currentRotationX) * 0.1 + Math.abs(currentRotationY) * 0.1 +
                        Math.abs(secondaryVelocityRef.current.x) + Math.abs(secondaryVelocityRef.current.y)
      
      if (totalEnergy > 0.002 && animationFrameRef.current !== null && !isGyroActive) {
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
      // Don't allow click interactions when gyro is active
      if (isGyroActive) return
      
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
      // Don't allow drag interactions when gyro is active
      if (isGyroActive) return
      
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
      // Don't allow drag interactions when gyro is active
      if (isGyroActive) return
      
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

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    requestGyroPermission,
    disableGyroscope,
    api, // Expose the spring API for testing
    stopSwingAnimation: () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsSwinging(false);
      addDebugMessage('⏹️ SWING ANIMATION STOPPED');
    }
  }));

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
});

// Add display name for forwardRef
InteractiveChain.displayName = 'InteractiveChain';

// Gyroscope Control Component (separate for better error isolation)
function GyroControls({ 
  showButton, 
  isActive, 
  error, 
  onEnable, 
  onDisable 
}) {
  if (!showButton) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '160px'
    }}>
      {!isActive ? (
        <button
          onClick={onEnable}
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '2px solid #333',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            color: '#333',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease'
          }}
        >
          🔄 Enable Gyro
        </button>
      ) : (
        <button
          onClick={onDisable}
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(255, 100, 100, 0.9)',
            border: '2px solid #cc0000',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            color: 'white',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease'
          }}
        >
          🛑 Disable Gyro
        </button>
      )}
      
      {isActive && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(100, 255, 100, 0.9)',
          border: '2px solid #00cc00',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#006600',
          textAlign: 'center',
          fontWeight: '600'
        }}>
          Gyro Active
        </div>
      )}
      
      {error && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'rgba(255, 200, 200, 0.9)',
          border: '2px solid #cc0000',
          borderRadius: '6px',
          fontSize: '11px',
          color: '#cc0000',
          textAlign: 'center',
          fontWeight: '600',
          wordWrap: 'break-word'
        }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

// Main App component
function App() {
  const [gyroState, setGyroState] = useState({
    showButton: false,
    isActive: false,
    error: null
  });
  
  const [debugMessages, setDebugMessages] = useState([]);
  
  // Add debug message function
  const addDebugMessage = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugMessages(prev => [...prev.slice(-4), `${timestamp}: ${message}`]);
    console.log(message);
  };

  // Gyroscope handlers
  const chainRef = useRef();

  const handleEnableGyro = async () => {
    try {
      if (chainRef.current && chainRef.current.requestGyroPermission) {
        const success = await chainRef.current.requestGyroPermission();
        if (success) {
          setGyroState(prev => ({ ...prev, isActive: true, error: null }));
        }
      }
    } catch (error) {
      console.error('Error enabling gyro:', error);
      setGyroState(prev => ({ ...prev, error: error.message }));
    }
  };

  const handleDisableGyro = () => {
    try {
      if (chainRef.current && chainRef.current.disableGyroscope) {
        chainRef.current.disableGyroscope();
        setGyroState(prev => ({ ...prev, isActive: false, error: null }));
      }
    } catch (error) {
      console.error('Error disabling gyro:', error);
    }
  };

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
    
    // Check for mobile device and gyroscope support
    try {
      const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
      if (isMobile && typeof window !== 'undefined' && window.DeviceOrientationEvent) {
        setGyroState(prev => ({ ...prev, showButton: true }));
      }
    } catch (error) {
      console.error('Error checking mobile capabilities:', error);
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
        <ambientLight intensity={1.6} />
        <directionalLight 
          position={[20, 20, 10]}  // Positioned far right and high for dramatic lighting
          intensity={1.0}  // Full intensity directional lighting
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
          <InteractiveChain ref={chainRef} addDebugMessage={addDebugMessage} />
        </Suspense>
      </Canvas>

      {/* Gyroscope Controls */}
      <GyroControls
        showButton={gyroState.showButton}
        isActive={gyroState.isActive}
        error={gyroState.error}
        onEnable={handleEnableGyro}
        onDisable={handleDisableGyro}
      />

      {/* Debug Messages Panel */}
      {debugMessages.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          maxWidth: '300px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 1000,
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔍 Debug Log:</div>
          {debugMessages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '2px' }}>{msg}</div>
          ))}
        </div>
      )}

      {/* Test Movement Button */}
      <button
        onClick={() => {
          addDebugMessage('🎲 TEST BUTTON CLICKED');
          
          // STOP any running swing animation first AND prevent it from restarting
          if (chainRef.current && chainRef.current.stopSwingAnimation) {
            chainRef.current.stopSwingAnimation();
          }
                      setManualControlActive(true); // Prevent useEffect from restarting swing
            addDebugMessage('🔒 MANUAL CONTROL ACTIVATED');
          
          // Test spring animation (proper way) - EXTREME movements
          const randomRotation = [
            (Math.random() - 0.5) * Math.PI * 3.0,  // EXTREME rotation (540 degrees!)
            (Math.random() - 0.5) * Math.PI * 3.0,  // EXTREME rotation (540 degrees!)
            0
          ];
          
          // Test via spring API (correct method) with IMMEDIATE movement
          if (chainRef.current && chainRef.current.api) {
            chainRef.current.api.start({
              rotation: randomRotation,
              config: { 
                tension: 300,   // Higher tension = faster movement
                friction: 25,   // Lower friction = less damping  
                mass: 1
              }
            });
            addDebugMessage('🎲 SPRING ROTATION: ' + JSON.stringify(randomRotation));
            
            // Add a delay to check what the actual rotation becomes
            setTimeout(() => {
              if (chainRef.current && chainRef.current.api) {
                const currentRotation = chainRef.current.api.current;
                addDebugMessage('📍 ACTUAL ROTATION: ' + JSON.stringify(currentRotation?.rotation));
              }
            }, 500);  // Check after spring settles
          } else {
            addDebugMessage('❌ chainRef.current or api not available');
          }
        }}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '12px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          border: '2px solid #333',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          color: '#333',
          zIndex: 1000
        }}
      >
        🎲 Test Movement
      </button>

      {/* Loading indicator */}
      <Suspense fallback={<LoadingSpinner />}>
        <div style={{ display: 'none' }} />
      </Suspense>
    </div>
  )
}

export default App 