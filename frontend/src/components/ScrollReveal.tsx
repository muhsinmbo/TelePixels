import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

type Easing = [number, number, number, number];
const easeInOut: Easing = [0.22, 1, 0.33, 1];
const EASE_OUT: Easing = [0.25, 0.1, 0.25, 1];

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
  amount?: number;
}

export const Stagger: React.FC<StaggerProps> = ({
  children,
  className,
  delay = 0,
  stagger = 0.12,
  once = true,
  amount = 0.2,
}) => {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: stagger,
            delayChildren: delay,
            when: 'beforeChildren',
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
  scale?: number;
}

export const StaggerItem: React.FC<StaggerItemProps> = ({
  children,
  className,
  delay = 0,
  y = 24,
  x = 0,
  scale = 1,
}) => {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y, x, scale },
        visible: { opacity: 1, y: 0, x: 0, scale: 1 },
      }}
      transition={{
        duration: 0.55,
        ease: easeInOut,
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
  once?: boolean;
}

export const Reveal: React.FC<RevealProps> = ({
  children,
  className,
  delay = 0,
  y = 24,
  x = 0,
  once = true,
}) => {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, amount: 0.25 }}
      transition={{ duration: 0.65, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

interface ParallaxProps {
  children?: React.ReactNode;
  offset?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Parallax: React.FC<ParallaxProps> = ({ children, offset = 20, className, style }) => {
  const reduce = useReducedMotion();
  const props: Record<string, unknown> = {
    className,
    style: { ...style, willChange: 'transform' },
    initial: { y: 0 },
    transition: {
      duration: 18 + offset,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'linear',
    },
  };
  if (!reduce) {
    props.animate = { y: [-offset, offset, -offset] };
  }
  return (
    <motion.div {...props}>
      {children}
    </motion.div>
  );
};
