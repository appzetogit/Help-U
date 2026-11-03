import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useConfig } from './ConfigContext';
import api from '../services/api';
import { toast } from 'react-hot-toast';

// Comprehensive language catalog with code, native name, and English name
export const ALL_AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' }
];

// Essential UI translations dictionary
const TRANSLATIONS = {
  en: {
    select_location: 'Select Location',
    detecting_location: 'Detecting location...',
    search_services: 'Search for services...',
    book_now: 'Book Now',
    track_booking: 'Track Booking',
    current_location: 'Current Location',
    confirm_location: 'Confirm Location',
    enter_address: 'Enter complete address',
    my_addresses: 'My Addresses',
    add_new_address: 'Add New Address',
    save_address: 'Save Address',
    directions: 'Directions',
    calculating_route: 'Calculating route...',
    distance: 'Distance',
    duration: 'Estimated Time',
    language: 'Language',
    app_language: 'App Language',
    map_language: 'Map Language',
    settings: 'Settings',
    notifications: 'Notifications',
    push_notifications: 'Push Notifications',
    email_notifications: 'Email Notifications',
    account: 'Account',
    save_changes: 'Save Changes',
    saved_successfully: 'Saved successfully',
    auto_detect_lang: 'Auto-detect from location',
    suggested_language: 'Suggested Language',
    choose_language: 'Choose Language',
    select_app_language: 'Select your preferred app language',
    active: 'Active',
    auto_detect_from_map: 'Auto-detect from Map Location',
    detecting_from_map: 'Detecting from Google Map location...',
    map_adapts_auto: 'Google Maps & interface elements adapt automatically',
    activity: 'Activity',
    my_bookings: 'My Bookings',
    my_ratings: 'My Ratings',
    recurring_bookings: 'Recurring Bookings',
    my_disputes: 'My Disputes',
    shopping: 'Shopping',
    scrap_deals: 'Scrap Deals',
    preferences: 'Preferences',
    manage_addresses: 'Manage Addresses',
    support_and_more: 'Support & more',
    help_support: 'Help & Support',
    faq: 'FAQ',
    cancellation_policy: 'Cancellation Policy',
    terms_conditions: 'Terms & Conditions',
    privacy_policy: 'Privacy Policy',
    about_helpu: 'About Help U',
    log_out: 'Log out',
    wallet_balance: 'Wallet balance',
    refer_and_earn: 'Refer & earn',
    invite_friends: 'Invite friends',
    edit: 'Edit',
    home: 'Home',
    bookings: 'Bookings',
    location_detected: 'Location detected: {place}'
  },
  hi: {
    select_location: 'स्थान चुनें',
    detecting_location: 'स्थान का पता लगाया जा रहा है...',
    search_services: 'सेवाएं खोजें...',
    book_now: 'अभी बुक करें',
    track_booking: 'बुकिंग ट्रैक करें',
    current_location: 'वर्तमान स्थान',
    confirm_location: 'स्थान की पुष्टि करें',
    enter_address: 'पूरा पता दर्ज करें',
    my_addresses: 'मेरे पते',
    add_new_address: 'नया पता जोड़ें',
    save_address: 'पता सहेजें',
    directions: 'दिशा-निर्देश',
    calculating_route: 'मार्ग की गणना हो रही है...',
    distance: 'दूरी',
    duration: 'अनुमानित समय',
    language: 'भाषा',
    app_language: 'ऐप भाषा',
    map_language: 'मानचित्र भाषा',
    settings: 'सेटिंग्स',
    notifications: 'सूचनाएं',
    push_notifications: 'पुश सूचनाएं',
    email_notifications: 'ईमेल सूचनाएं',
    account: 'खाता',
    save_changes: 'परिवर्तन सहेजें',
    saved_successfully: 'सफलतापूर्वक सहेजा गया',
    auto_detect_lang: 'स्थान से स्वतः पहचानें',
    suggested_language: 'सुझाई गई भाषा',
    choose_language: 'भाषा चुनें',
    select_app_language: 'अपनी पसंदीदा ऐप भाषा चुनें',
    active: 'सक्रिय',
    auto_detect_from_map: 'मानचित्र स्थान से स्वतः पहचानें',
    detecting_from_map: 'गूगल मैप स्थान से भाषा का पता लगाया जा रहा है...',
    map_adapts_auto: 'गूगल मैप्स और इंटरफ़ेस स्वचालित रूप से अनुकूलित होते हैं',
    activity: 'गतिविधि',
    my_bookings: 'मेरी बुकिंग्स',
    my_ratings: 'मेरी रेटिंग्स',
    recurring_bookings: 'आवर्ती बुकिंग्स',
    my_disputes: 'मेरे विवाद',
    shopping: 'शॉपिंग',
    scrap_deals: 'कबाड़ सौदे',
    preferences: 'प्राथमिकताएं',
    manage_addresses: 'पते प्रबंधित करें',
    support_and_more: 'सहायता एवं अन्य',
    help_support: 'सहायता और समर्थन',
    faq: 'अक्सर पूछे जाने वाले प्रश्न',
    cancellation_policy: 'रद्दीकरण नीति',
    terms_conditions: 'नियम और शर्तें',
    privacy_policy: 'गोपनीयता नीति',
    about_helpu: 'हेल्प यू के बारे में',
    log_out: 'लॉग आउट',
    wallet_balance: 'वॉलेट शेष',
    refer_and_earn: 'रेफर करें और कमाएं',
    invite_friends: 'मित्रों को आमंत्रित करें',
    edit: 'संपादित करें',
    home: 'होम',
    bookings: 'बुकिंग्स',
    location_detected: 'स्थान पहचाना गया: {place}'
  },
  gu: {
    select_location: 'સ્થાન પસંદ કરો',
    detecting_location: 'સ્થાન શોધી રહ્યું છે...',
    search_services: 'સેવાઓ શોધો...',
    book_now: 'હમણાં બુક કરો',
    track_booking: 'બુકિંગ ટ્રેક કરો',
    current_location: 'વર્તમાન સ્થાન',
    confirm_location: 'સ્થાનની પુષ્ટિ કરો',
    enter_address: 'સંપૂર્ણ સરનામું દાખલ કરો',
    my_addresses: 'મારા સરનામાં',
    add_new_address: 'નવું સરનામું ઉમેરો',
    save_address: 'સરનામું સાચવો',
    directions: 'દિશાઓ',
    calculating_route: 'માર્ગની ગણતરી...',
    distance: 'અંતર',
    duration: 'અંદાજિત સમય',
    language: 'ભાષા',
    app_language: 'એપ્લિકેશન ભાષા',
    map_language: 'નકશાની ભાષા',
    settings: 'સેટિંગ્સ',
    notifications: 'સૂચનાઓ',
    push_notifications: 'પુશ સૂચનાઓ',
    account: 'ખાતું',
    save_changes: 'ફેરફારો સાચવો',
    saved_successfully: 'સફળતાપૂર્વક સંગ્રહિત',
    choose_language: 'ભાષા પસંદ કરો',
    select_app_language: 'તમારી પસંદગીની એપ્લિકેશન ભાષા પસંદ કરો',
    active: 'સક્રિય',
    auto_detect_from_map: 'નકશા સ્થાન પરથી આપમેળે ઓળખો',
    detecting_from_map: 'ગૂગલ મેપ સ્થાન પરથી શોધી રહ્યું છે...',
    map_adapts_auto: 'ગૂગલ મેપ્સ અને ઈન્ટરફેસ આપમેળે અનુકૂલિત થાય છે',
    activity: 'પ્રવૃત્તિ',
    my_bookings: 'મારા બુકિંગ',
    my_ratings: 'મારા રેટિંગ્સ',
    recurring_bookings: 'રિકરિંગ બુકિંગ',
    my_disputes: 'મારા વિવાદો',
    shopping: 'શોપિંગ',
    scrap_deals: 'ભંગાર સોદા',
    preferences: 'પસંદગીઓ',
    manage_addresses: 'સરનામાં સંચાલિત કરો',
    support_and_more: 'સહાય અને વધુ',
    help_support: 'સહાય અને સમર્થન',
    faq: 'વારંવાર પૂછાતા પ્રશ્નો',
    cancellation_policy: 'રદ્દીકરણ નીતિ',
    terms_conditions: 'નિયમો અને શરતો',
    privacy_policy: 'ગોપનીયતા નીતિ',
    about_helpu: 'હેલ્પ યુ વિશે',
    log_out: 'લૉગ આઉટ',
    wallet_balance: 'વોલેટ બેલેન્સ',
    refer_and_earn: 'રેફર કરો અને કમાઓ',
    invite_friends: 'મિત્રોને આમંત્રિત કરો',
    edit: 'સંપાદિત કરો',
    home: 'હોમ',
    bookings: 'બુકિંગ'
  },
  mr: {
    select_location: 'स्थान निवडा',
    detecting_location: 'स्थान शोधत आहे...',
    search_services: 'सेवा शोधा...',
    book_now: 'आता बुक करा',
    track_booking: 'बुकिंग ट्रॅक करा',
    current_location: 'सध्याचे स्थान',
    confirm_location: 'स्थानाची पुष्टी करा',
    enter_address: 'पूर्ण पत्ता प्रविष्ट करा',
    my_addresses: 'माझे पत्ते',
    add_new_address: 'नवीन पत्ता जोडा',
    save_address: 'पत्ता जतन करा',
    directions: 'दिशानिर्देश',
    calculating_route: 'मार्ग मोजत आहे...',
    distance: 'अंतर',
    duration: 'अंदाजे वेळ',
    language: 'भाषा',
    app_language: 'अ‍ॅप भाषा',
    map_language: 'नकाशा भाषा',
    settings: 'सेटिंग्ज',
    notifications: 'सूचना',
    push_notifications: 'पुश सूचना',
    account: 'खाते',
    save_changes: 'बदल जतन करा',
    saved_successfully: 'यशस्वीरित्या जतन केले',
    choose_language: 'भाषा निवडा',
    select_app_language: 'आपली पसंतीची अ‍ॅप भाषा निवडा',
    active: 'सक्रिय',
    auto_detect_from_map: 'नकाशा स्थानावरून आपोआप ओळखा',
    detecting_from_map: 'गुगल मॅप स्थानावरून शोधत आहे...',
    map_adapts_auto: 'गुगल मॅप्स आणि इंटरफेस आपोआप जुळवून घेतात',
    activity: 'क्रियाकलाप',
    my_bookings: 'माझे बुकिंग्ज',
    my_ratings: 'माझे रेटिंग्ज',
    recurring_bookings: 'आवर्ती बुकिंग',
    my_disputes: 'माझे वाद',
    shopping: 'खरेदी',
    scrap_deals: 'भंगार सौदे',
    preferences: 'प्राधान्ये',
    manage_addresses: 'पत्ते व्यवस्थापित करा',
    support_and_more: 'मदत आणि अधिक',
    help_support: 'मदत आणि समर्थन',
    faq: 'वारंवार विचारले जाणारे प्रश्न',
    cancellation_policy: 'रद्द करण्याचे धोरण',
    terms_conditions: 'नियम आणि अटी',
    privacy_policy: 'गोपनीयता धोरण',
    about_helpu: 'हेल्प यू बद्दल',
    log_out: 'लॉग आउट',
    wallet_balance: 'वॉलेट शिल्लक',
    refer_and_earn: 'रेफर करा आणि कमवा',
    invite_friends: 'मित्रांना आमंत्रित करा',
    edit: 'संपादित करा',
    home: 'होम',
    bookings: 'बुकिंग'
  }
};

const LanguageContext = createContext(null);
const STORAGE_KEY = 'app_language';

// Comprehensive Indian State / Region to Language map
const STATE_TO_LANG = {
  // Hindi belt
  'madhya pradesh': 'hi',
  'uttar pradesh': 'hi',
  'bihar': 'hi',
  'rajasthan': 'hi',
  'delhi': 'hi',
  'haryana': 'hi',
  'himachal pradesh': 'hi',
  'jharkhand': 'hi',
  'chhattisgarh': 'hi',
  'uttarakhand': 'hi',
  'chandigarh': 'hi',
  // Regional states
  'gujarat': 'gu',
  'maharashtra': 'mr',
  'goa': 'mr',
  'west bengal': 'bn',
  'tamil nadu': 'ta',
  'karnataka': 'kn',
  'telangana': 'te',
  'andhra pradesh': 'te',
  'punjab': 'pa',
  'kerala': 'ml',
  'odisha': 'or',
  'orissa': 'or',
  'assam': 'as'
};

export const LanguageProvider = ({ children }) => {
  const { config } = useConfig();

  // Admin-configured supported languages or fallback to English and Hindi
  const configuredCodes = Array.isArray(config?.supportedLanguages) && config.supportedLanguages.length > 0
    ? config.supportedLanguages
    : ['en', 'hi'];

  const supportedLanguages = ALL_AVAILABLE_LANGUAGES.filter(lang =>
    configuredCodes.includes(lang.code)
  );

  // Active language state
  const [currentLanguage, setCurrentLanguageState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && configuredCodes.includes(saved)) {
        return saved;
      }
    } catch (e) {
      // Ignore localStorage error
    }
    return config?.defaultAppLanguage || 'en';
  });

  // Keep language in sync if admin changes default or disables a previously selected language
  useEffect(() => {
    if (config?.defaultAppLanguage && !localStorage.getItem(STORAGE_KEY)) {
      setCurrentLanguageState(config.defaultAppLanguage);
    } else if (currentLanguage && !configuredCodes.includes(currentLanguage)) {
      const fallback = config?.defaultAppLanguage || configuredCodes[0] || 'en';
      setCurrentLanguageState(fallback);
      try { localStorage.setItem(STORAGE_KEY, fallback); } catch {}
    }
  }, [config?.defaultAppLanguage, configuredCodes, currentLanguage]);

  // Set language function
  const setLanguage = useCallback((langCode) => {
    if (!langCode) return;
    setCurrentLanguageState(langCode);
    try {
      localStorage.setItem(STORAGE_KEY, langCode);
      window.dispatchEvent(new CustomEvent('appLanguageChanged', { detail: { language: langCode } }));
    } catch (e) {
      console.warn('Failed to save language to localStorage:', e);
    }
  }, []);

  // Compute map language:
  // If admin configured a fixed map language, use it;
  // If 'auto' or not specified, use current app language.
  const mapLanguage = (config?.googleMapsLanguage && config.googleMapsLanguage !== 'auto')
    ? config.googleMapsLanguage
    : currentLanguage;

  // Translation helper
  const t = useCallback((key, fallback) => {
    const dict = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en || {};
    if (dict[key] !== undefined) return dict[key];
    const enDict = TRANSLATIONS.en || {};
    return enDict[key] !== undefined ? enDict[key] : (fallback || key);
  }, [currentLanguage]);

  // Synchronous location/address detection helper
  const detectLanguageFromLocation = useCallback((locationInput) => {
    if (!locationInput) return null;

    let searchTarget = '';
    if (Array.isArray(locationInput)) {
      const stateComp = locationInput.find(c =>
        c.types?.includes('administrative_area_level_1')
      );
      searchTarget = (stateComp?.long_name || stateComp?.short_name || '').toLowerCase();
    } else if (typeof locationInput === 'string') {
      searchTarget = locationInput.toLowerCase();
    } else if (typeof locationInput === 'object' && locationInput.state) {
      searchTarget = String(locationInput.state).toLowerCase();
    }

    if (!searchTarget) return null;

    for (const [state, code] of Object.entries(STATE_TO_LANG)) {
      if (searchTarget.includes(state)) {
        if (configuredCodes.includes(code)) {
          return code;
        }
        break;
      }
    }
    return null;
  }, [configuredCodes]);

  // Asynchronous detection from coordinates using Google Maps API
  const detectLanguageFromCoordinates = useCallback(async (lat, lng) => {
    if (!lat || !lng) return null;
    try {
      const response = await api.get('/public/detect-language', {
        params: { lat, lng }
      });
      if (response.data && response.data.success && response.data.language) {
        return {
          language: response.data.language,
          state: response.data.state
        };
      }
    } catch (err) {
      console.warn('Backend detect-language endpoint failed, checking client geocoder:', err);
    }

    // Client-side fallback if Google Maps JS is available
    if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const res = await new Promise((resolve) => {
          geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
            if (status === 'OK' && results?.[0]) resolve(results[0]);
            else resolve(null);
          });
        });
        if (res?.address_components) {
          const lang = detectLanguageFromLocation(res.address_components);
          const stateComp = res.address_components.find(c => c.types?.includes('administrative_area_level_1'));
          return { language: lang || 'en', state: stateComp?.long_name || '' };
        }
      } catch (clientErr) {
        console.warn('Client geocode failed:', clientErr);
      }
    }

    return null;
  }, [detectLanguageFromLocation]);

  // High-level helper: detect and switch language based on Google Maps API
  const detectAndApplyLanguageFromLocation = useCallback(async (locationInput, options = {}) => {
    let targetLang = null;
    let placeName = '';

    if (locationInput?.lat && locationInput?.lng) {
      const result = await detectLanguageFromCoordinates(locationInput.lat, locationInput.lng);
      if (result) {
        targetLang = result.language;
        placeName = result.state;
      }
    } else {
      targetLang = detectLanguageFromLocation(locationInput);
      if (typeof locationInput === 'string') placeName = locationInput;
    }

    if (targetLang && configuredCodes.includes(targetLang)) {
      const isDifferent = targetLang !== currentLanguage;
      if (isDifferent) {
        setLanguage(targetLang);
        if (options.notify !== false) {
          const langObj = ALL_AVAILABLE_LANGUAGES.find(l => l.code === targetLang);
          const name = langObj ? `${langObj.name} (${langObj.native})` : targetLang;
          toast.success(
            placeName
              ? `Language automatically switched to ${name} for ${placeName}`
              : `Language switched to ${name}`
          );
        }
        if (options.reload) {
          setTimeout(() => {
            window.location.reload();
          }, 350);
        }
      }
      return targetLang;
    }
    return null;
  }, [currentLanguage, configuredCodes, detectLanguageFromCoordinates, detectLanguageFromLocation, setLanguage]);

  const value = {
    currentLanguage,
    setLanguage,
    supportedLanguages: supportedLanguages.length > 0 ? supportedLanguages : ALL_AVAILABLE_LANGUAGES.slice(0, 2),
    allAvailableLanguages: ALL_AVAILABLE_LANGUAGES,
    mapLanguage,
    t,
    detectLanguageFromLocation,
    detectLanguageFromCoordinates,
    detectAndApplyLanguageFromLocation,
    autoDetectEnabled: Boolean(config?.autoDetectLanguageFromMap),
    mapLanguageMode: config?.googleMapsLanguage || 'auto'
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      currentLanguage: 'en',
      setLanguage: () => {},
      supportedLanguages: ALL_AVAILABLE_LANGUAGES.slice(0, 2),
      allAvailableLanguages: ALL_AVAILABLE_LANGUAGES,
      mapLanguage: 'en',
      t: (key, fallback) => fallback || key,
      detectLanguageFromLocation: () => null,
      detectLanguageFromCoordinates: async () => null,
      detectAndApplyLanguageFromLocation: async () => null,
      autoDetectEnabled: false,
      mapLanguageMode: 'auto'
    };
  }
  return context;
};

export default LanguageContext;
