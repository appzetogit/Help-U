import React, { forwardRef } from 'react';

/**
 * Centralized Logo Component
 * Usage: <Logo className="h-12 w-auto" />
 * Supports ref for animations
 */
const Logo = forwardRef(({ className = "h-12 w-auto", ...props }, ref) => {
  return (
    <img
      ref={ref}
      src="/helpu-logo.png"
      alt="Help U"
      className={`${className} object-contain`}
      {...props}
    />
  );
});

Logo.displayName = 'Logo';

export default Logo;
