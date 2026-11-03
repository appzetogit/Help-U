import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiFacebook, FiTwitter, FiInstagram, FiLinkedin, FiMail, FiPhone, FiMapPin } from 'react-icons/fi';
import Logo from '../../../../components/common/Logo';
import { configService } from '../../../../services/configService';

const Footer = () => {
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const data = await configService.getSettings();
      if (data?.success) {
        setSettings(data.settings);
      }
    };
    fetchSettings();
  }, []);

  // Only show on home page as per user request
  if (location.pathname !== '/user' && location.pathname !== '/user/') {
    return null;
  }

  const footerSections = [
    {
      title: 'Company',
      links: [
        { label: 'About Us', path: '/user/about-helpu' },
        { label: 'Help & Support', path: '/user/help-support' },
        { label: 'Cancellation Policy', path: '/user/cancellation-policy' },
        { label: 'Terms & Conditions', path: '/user/terms' },
        { label: 'Privacy Policy', path: '/user/privacy-policy' },
        { label: 'FAQ', path: '/user/faq' },
      ]
    },
    {
      title: 'Quick Links',
      links: [
        { label: 'My Bookings', path: '/user/my-bookings' },
        { label: 'My Wallet', path: '/user/wallet' },
        { label: 'Register as Worker Partner', path: '/worker/signup' },
      ]
    },
    {
      title: 'Contact Us',
      // Only what the admin has set in Settings; nothing is invented
      links: [
        (() => {
          const email = settings?.supportEmail || settings?.companyEmail;
          return email ? { label: email, path: `mailto:${email}`, icon: FiMail } : null;
        })(),
        (() => {
          const phone = settings?.supportPhone || settings?.companyPhone;
          return phone ? { label: phone, path: `tel:${String(phone).replace(/\s/g, '')}`, icon: FiPhone } : null;
        })(),
        settings?.companyAddress
          ? {
              label: [settings.companyAddress, settings.companyCity, settings.companyState].filter(Boolean).join(', ') + (settings.companyPincode ? ` - ${settings.companyPincode}` : ''),
              path: '#',
              icon: FiMapPin
            }
          : null
      ].filter(Boolean)
    }
  ];

  return (
    <footer className="bg-gray-50 border-t border-gray-100 pt-16 pb-8 lg:pb-12 mt-20 relative overflow-hidden group">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl -mr-32 -mt-32 transition-colors group-hover:bg-teal-500/10" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl -ml-32 -mb-32 transition-colors group-hover:bg-orange-500/10" />

      <div className="max-w-screen-xl mx-auto px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand Column */}
          <div className="space-y-6">
            <Link to="/user" className="inline-block transform hover:scale-105 transition-transform duration-300">
              <Logo className="h-14 w-auto" />
            </Link>
            <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
              {settings?.companyName || 'Help U'} is your one-stop destination for all home services. From electrical repairs to premium salon services, we bring the experts to your doorstep.
            </p>
            <div className="flex items-center gap-4">
              {[FiFacebook, FiTwitter, FiInstagram, FiLinkedin].map((Icon, i) => (
                <a 
                  key={i} 
                  href="#" 
                  className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#347989] hover:border-[#347989] hover:shadow-lg transition-all duration-300"
                >
                  <Icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Navigation Sections */}
          {footerSections.map((section) => (
            <div key={section.title} className="space-y-6">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">{section.title}</h3>
              <ul className="space-y-4">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.path.startsWith('http') || link.path.startsWith('mailto') || link.path.startsWith('tel') ? (
                      <a 
                        href={link.path} 
                        className="text-gray-500 hover:text-[#347989] text-sm flex items-center gap-2 transition-colors duration-200"
                      >
                        {link.icon && <link.icon className="w-4 h-4" />}
                        {link.label}
                      </a>
                    ) : (
                      <Link 
                        to={link.path} 
                        className="text-gray-500 hover:text-[#347989] text-sm flex items-center gap-2 transition-colors duration-200"
                      >
                        {link.icon && <link.icon className="w-4 h-4" />}
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-8" />

        {/* Bottom Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-gray-400 text-sm">
            © {currentYear} {settings?.companyName || 'Help U'}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link to="/user/privacy-policy" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
            <Link to="/user/terms" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
            <Link to="/user/faq" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">FAQ</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
