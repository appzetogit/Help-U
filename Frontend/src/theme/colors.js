/**
 * Centralized Theme Colors Configuration
 * Separate themes for User and Worker modules
 * Update colors here to change theme across entire app
 * 
 * Usage:
 * - User module: import { userTheme } from '../../../../theme'
 * - Worker module: import { workerTheme } from '../../../../theme'
 */

// Help U LOGO Core Brand Colors
const brand = {
  navy: '#163B66',
  navyDark: '#0F2B48',
  navyLight: '#1E4C82',
  teal: '#163B66', // Primary brand action color (Logo Navy Blue)
  yellow: '#D68F35', // Logo 'U' Amber/Gold
  orange: '#BB5F36', // Logo Accent Orange
  green: '#16A34A', // Logo Tagline Green
  gradient: 'linear-gradient(135deg, #163B66 0%, #D68F35 50%, #BB5F36 100%)',
  conic: 'conic-gradient(from 0deg, #163B66, #D68F35, #BB5F36, #163B66)'
};

// User Theme Colors
const userTheme = {
  backgroundGradient: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
  gradient: brand.gradient,
  headerGradient: 'linear-gradient(135deg, #163B66 0%, #0F2B48 100%)',
  headerBg: '#FFFFFF',
  button: brand.navy,
  icon: brand.navy,
  cardShadow: '0 4px 20px -2px rgba(22, 59, 102, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.02)',
  cardBorder: '1px solid rgba(0, 0, 0, 0.06)',
  brand: brand
};

// Worker Theme Colors
const workerTheme = {
  backgroundGradient: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
  gradient: brand.gradient,
  headerGradient: brand.navy,
  button: brand.navy,
  icon: brand.navy,
  brand: brand
};

// Default theme (for backward compatibility)
const themeColors = userTheme;

// Export all themes
export { userTheme, workerTheme, brand };
export default themeColors;


