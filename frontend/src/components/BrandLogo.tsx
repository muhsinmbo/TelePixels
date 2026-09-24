import React from 'react';
import { cn } from '../lib/utils';

interface BrandLogoProps {
  className?: string;
  type?: 'icon' | 'full' | 'text';
  mode?: 'light' | 'dark' | 'auto';
}

export default function BrandLogo({ className, type = 'full', mode = 'auto' }: BrandLogoProps) {
  const LogoImage = ({ sizeClass = "w-full h-full" }: { sizeClass?: string }) => (
    <img 
      src="/logo.png" 
      alt="TelePixels Logo" 
      className={cn("object-contain", sizeClass)}
      referrerPolicy="no-referrer"
    />
  );

  if (type === 'icon') {
    return (
      <div className={cn("w-8 h-8 flex items-center justify-center", className)}>
        <LogoImage />
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className={cn("flex flex-col", className)}>
        <span className="text-xl font-bold tracking-tight text-main">
          TelePixels
        </span>
        <span className="text-[10px] font-bold text-primary tracking-[0.2em] uppercase">
          Precision in Every Pixel
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="w-10 h-10 flex items-center justify-center">
        <LogoImage />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <span className="text-xl font-black tracking-tight text-main">
            TelePixels
          </span>
        </div>
        <span className="text-[8px] font-black text-primary tracking-[0.15em] uppercase whitespace-nowrap leading-none mt-0.5">
          Precision in every pixel
        </span>
      </div>
    </div>
  );
}
