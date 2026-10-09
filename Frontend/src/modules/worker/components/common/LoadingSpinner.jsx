import React from 'react';
import { workerTheme as themeColors } from '../../../../theme';

import LogoLoader from '../../../../components/common/LogoLoader';

const LoadingSpinner = ({ size = 'md', text = 'Loading...', fullScreen = false }) => {
  if (fullScreen) {
    return <LogoLoader />;
  }

  const logoSize = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-20 h-20' : 'w-12 h-12';
  return <LogoLoader fullScreen={false} size={logoSize} />;
};

export default LoadingSpinner;

