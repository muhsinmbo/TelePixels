import React, { useEffect, useState, useRef } from 'react';
import { motion, useSpring, useTransform, animate } from 'motion/react';

interface AnimatedNumberProps {
  value: number | string;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export default function AnimatedNumber({ 
  value, 
  duration = 2, 
  className,
  prefix = '',
  suffix = '',
  decimals = 0
}: AnimatedNumberProps) {
  // Extract numeric value if it's a string
  const numericValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[^0-9.]/g, '')) 
    : value;

  // Use state to track the display value
  const [displayValue, setDisplayValue] = useState(0);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const controls = animate(prevValueRef.current, numericValue, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => {
        setDisplayValue(latest);
      }
    });

    prevValueRef.current = numericValue;
    return () => controls.stop();
  }, [numericValue, duration]);

  // Format the display value
  const formattedValue = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return (
    <span className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
}
