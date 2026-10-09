import React, { useEffect, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaUser, FaStore, FaHammer, FaCheckCircle, FaClock, FaArrowRight, FaChevronDown, FaChevronLeft, FaChevronRight, FaQuoteLeft, FaStar, FaHandshake, FaTruck, FaBroom, FaToolbox, FaBolt, FaPaintRoller, FaBug, FaAirFreshener, FaMapMarkerAlt, FaTv, FaTemperatureLow, FaTshirt, FaUtensils, FaMicrochip, FaGooglePlay, FaShieldAlt, FaMapMarker, FaFileInvoiceDollar, FaBars, FaTimes, FaMobileAlt, FaChartLine, FaTools } from 'react-icons/fa';
import { configService } from '../../../services/configService';
import { publicCatalogService } from '../../../services/catalogService';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const LandingPage = () => {
  const scrollRef = React.useRef(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

  const PLAY_STORE_URL = "https://play.google.com/store/search?q=homestr&c=apps";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    const fetchSettings = async () => {
      const data = await configService.getSettings();
      if (data?.success) {
        setSettings(data.settings);
      }
    };

    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const response = await publicCatalogService.getCategories();
        if (response?.success) {
          setCategories(response.categories || []);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setCategoriesLoading(false);
      }
    };

    fetchSettings();
    fetchCategories();
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scroll = (direction) => {
    if (scrollRef.current) {
        const { scrollLeft, clientWidth } = scrollRef.current;
        const scrollTo = direction === 'left' ? scrollLeft - clientWidth / 2 : scrollLeft + clientWidth / 2;
        scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  const categoryColors = [
    'text-blue-500', 'text-purple-500', 'text-cyan-500', 'text-pink-500', 
    'text-orange-500', 'text-indigo-500', 'text-yellow-500', 'text-brand'
  ];

  const menuItems = [
    { label: 'Glimpse', href: '#app-glimpse' },
    { label: 'Expertise', href: '#expertise' },
    { label: 'Why Us', href: '#expertise' },
    { label: 'Join Us', href: '#join-platform' },
  ];

  return (
    <div className="min-h-screen bg-white overflow-x-hidden font-sans selection:bg-brand selection:text-white">
      {/* 1. Permanent Professional Pure White Glassmorphism Navbar */}
      <header className="fixed top-0 left-0 right-0 z-[100] bg-white/90 backdrop-blur-xl border-b border-gray-100 py-3 shadow-sm transition-all duration-300">
        <div className="container mx-auto px-4 sm:px-8 flex justify-between items-center max-w-7xl">
          <Link to="/Home" className="flex items-center gap-3 group">
              <img src="/helpu-logo.png" alt="Help U Logo" className="h-12 sm:h-14 w-auto transition-transform group-hover:scale-110" />
          </Link>

          {/* Desktop Nav - Dark Text for Light Navbar */}
          <nav className="hidden lg:flex gap-10 items-center font-bold text-[11px] text-gray-900">
            {menuItems.map((item) => (
              <a 
                key={item.label} 
                href={item.href} 
                className="hover:text-brand transition-all duration-300 relative group"
              >
                {item.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-brand transition-all duration-300 group-hover:w-full shadow-[0_0_10px_rgba(52,121,137,0.5)]"></span>
              </a>
            ))}
            <Link 
              to="/user" 
              className="px-10 py-3.5 bg-brand text-white rounded-full hover:bg-gray-900 transition-all shadow-xl shadow-brand/20 font-bold"
            >
              Order Repair
            </Link>
          </nav>

          {/* Mobile Toggle - Gray icons */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-gray-900 text-xl focus:outline-none"
          >
            {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>

        {/* Mobile Menu Overlay - Light Theme */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="lg:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 py-8 px-8 flex flex-col gap-6 items-center text-center shadow-2xl z-50"
            >
              {menuItems.map((item) => (
                <a 
                  key={item.label} 
                  href={item.href} 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-gray-900 font-normal text-xs hover:text-brand transition-colors"
                >
                  {item.label}
                </a>
              ))}
              <Link 
                to="/user" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full max-w-xs py-4 bg-brand text-white rounded-2xl font-normal text-xs shadow-xl shadow-brand/20"
              >
                Order Repair
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* 2. Floating Categories (Remains Pro) */}
      <section className="relative pt-24 pb-12 bg-white overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 -z-10"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2 -z-10"></div>
        
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl relative">
          {/* Section Heading for Landing Feel */}
          <div className="flex flex-col mb-10 text-center sm:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">Expert Services</h2>
              <p className="text-gray-400 text-xs font-normal mt-2">Professional repairs tailored for your home electronics</p>
          </div>

          <div className="relative group px-12 sm:px-16">
            {/* Edge Fading Masks */}
            <div className="absolute left-12 sm:left-16 top-0 bottom-0 w-16 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none transition-opacity"></div>
            <div className="absolute right-12 sm:right-16 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none transition-opacity"></div>

            {/* Navigation Buttons - Always Visible & Outside */}
            <button 
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-full shadow-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:text-brand hover:scale-110 active:scale-90 transition-all shadow-brand/10 hover:shadow-brand/20"
            >
              <FaChevronLeft className="text-lg" />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-full shadow-xl border border-gray-100 flex items-center justify-center text-gray-400 hover:text-brand hover:scale-110 active:scale-90 transition-all shadow-brand/10 hover:shadow-brand/20"
            >
              <FaChevronRight className="text-lg" />
            </button>

            <div 
              ref={scrollRef}
              className="overflow-x-auto scrollbar-hide scroll-smooth py-6 px-1"
            >
              <div className="flex items-center gap-8 sm:gap-12 min-w-max">
                {categoriesLoading ? (
                   Array(8).fill(0).map((_, i) => (
                     <div key={i} className="flex flex-col items-center gap-4 animate-pulse">
                       <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gray-50 rounded-[2rem] mb-1"></div>
                       <div className="w-12 h-2.5 bg-gray-50 rounded"></div>
                     </div>
                   ))
                ) : categories.length > 0 ? (
                  categories.map((cat, idx) => (
                    <Link 
                      key={cat.id || idx} 
                      to="/user" 
                      state={{ openCategoryId: cat.id }}
                      className="flex flex-col items-center gap-4 group cursor-pointer transition-all duration-500 hover:-translate-y-3"
                    >
                      <div className="relative">
                        {/* Glow effect on hover */}
                        <div className="absolute inset-0 bg-brand/20 blur-2xl rounded-full scale-0 group-hover:scale-110 transition-transform duration-500 opacity-0 group-hover:opacity-100"></div>
                        
                        <div className="relative w-20 h-20 lg:w-28 lg:h-28 bg-white rounded-[2.5rem] flex items-center justify-center p-5 lg:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] group-hover:shadow-[0_20px_50px_rgba(52,121,137,0.15)] border border-gray-100 group-hover:border-brand/20 transition-all duration-500 z-10 overflow-hidden">
                           {/* Subtle background pattern in card */}
                           <div className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                              <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(${idx % 2 === 0 ? '#347989' : '#D68F35'} 1px, transparent 1px)`, backgroundSize: '12px 12px' }}></div>
                           </div>
                           
                           {cat.icon ? (
                            <img 
                              src={toAssetUrl(cat.icon)} 
                              alt={cat.title} 
                              className="w-full h-full object-contain relative z-20 transition-transform duration-700 group-hover:scale-125 group-hover:rotate-6" 
                            />
                           ) : (
                            <FaShieldAlt className="text-4xl text-brand relative z-20" />
                           )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center gap-2">
                         <span className="text-xs lg:text-sm font-bold text-gray-900 transition-colors tracking-tight text-center">
                            {cat.title}
                         </span>
                         <div className="w-0 h-1 bg-brand rounded-full group-hover:w-full transition-all duration-300 shadow-[0_0_10px_rgba(52,121,137,0.4)]"></div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-gray-400 text-xs font-normal w-full text-center">No categories available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main Hero */}
      <section className="relative pt-12 sm:pt-16 pb-16 sm:pb-24 overflow-hidden bg-white">
        <div className="absolute top-0 right-0 -z-10 w-full h-full bg-gradient-to-b from-gray-50/50 to-white"></div>
        <div className="absolute top-[-10%] right-[-10%] -z-10 w-[50%] h-[70%] bg-brand/5 blur-[120px] rounded-full"></div>
        
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="flex-1 text-center lg:text-left order-2 lg:order-1"
            >
              <div className="inline-flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 bg-gray-900 border border-white/10 text-white rounded-full mb-6 sm:mb-8 shadow-2xl">
                <div className="flex items-center gap-1 text-brand">
                    <FaMapMarkerAlt className="text-sm" />
                    <span className="text-[10px] sm:text-xs font-normal">Indore Exclusive</span>
                </div>
                <div className="w-px h-3 bg-white/20"></div>
                <span className="text-[9px] sm:text-[10px] font-normal text-gray-400">India's #1 Electronics Repair App</span>
              </div>
              
              <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold text-gray-900 leading-[1.1] sm:leading-[0.9] mb-6 sm:mb-8">
                Genuine Parts, <br />
                <span className="text-brand">Expert Repairs.</span>
              </h1>
              <p className="text-base sm:text-xl leading-relaxed text-gray-500 mb-8 sm:mb-10 max-w-xl font-normal">
                "Our parts. Our warranty. Your peace of mind." — Help U uses only platform-certified genuine electronics parts for every repair.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 justify-center lg:justify-start items-center">
                <Link 
                  to="/user" 
                  className="w-full sm:w-auto px-10 sm:px-14 py-4 sm:py-5 bg-gray-900 text-white rounded-2xl text-base sm:text-lg font-normal flex items-center justify-center gap-3 hover:bg-brand transition-all hover:shadow-2xl active:scale-95"
                >
                  Book Repair <FaArrowRight />
                </Link>
                <div className="flex flex-col items-center sm:items-start w-full sm:w-auto">
                    <p className="text-[10px] font-normal text-gray-400 mb-2">Available on</p>
                    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto flex items-center justify-center gap-3 bg-gray-50 border border-gray-100 px-6 sm:px-8 py-3 rounded-xl hover:bg-white hover:shadow-lg transition-all group overflow-hidden">
                        <FaGooglePlay className="text-gray-900 text-xl sm:text-2xl group-hover:scale-110 transition-transform" />
                        <span className="text-xs sm:text-sm font-normal text-gray-900 whitespace-nowrap">Play Store</span>
                    </a>
                </div>
              </div>
            </motion.div>

            <motion.div 
              style={{ opacity: heroOpacity, scale: heroScale }}
              className="flex-1 relative w-full order-1 lg:order-2 px-4 sm:px-0"
            >
              <div className="relative z-10 p-2 sm:p-4 bg-gray-50 rounded-[3rem] sm:rounded-[4rem] border border-gray-100 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] overflow-hidden group">
                <div className="overflow-hidden rounded-[2.5rem] sm:rounded-[3.5rem] relative aspect-[4/5] lg:aspect-square">
                  <img src="/hero-image.png" alt="Help U Pro Electronics" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent"></div>
                </div>
                
                <motion.div 
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="absolute bottom-6 sm:bottom-10 left-6 sm:left-10 right-6 sm:right-10 bg-gray-900/90 backdrop-blur-md p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl z-20 border border-white/20 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 sm:gap-4 text-white">
                     <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brand rounded-full flex items-center justify-center text-white shadow-lg">
                        <FaShieldAlt className="text-base sm:text-2xl" />
                     </div>
                     <div>
                        <p className="text-[9px] sm:text-[10px] text-gray-400 font-normal leading-none mb-1">Help U Certified</p>
                        <p className="text-xs sm:text-sm font-normal whitespace-nowrap">Genuine Platform Parts</p>
                     </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* 4. Stats Section */}
      <section className="py-12 sm:py-20 bg-gray-900 text-white overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full bg-brand/5 opacity-20 -z-10"></div>
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {[
                { label: 'Verified Xperts', value: '450+', color: 'text-brand' },
                { label: 'Indore Families', value: '12k+', color: 'text-white' },
                { label: 'Certified Parts', value: '1.5k+', color: 'text-brand' },
                { label: 'Reliability Score', value: '99%', color: 'text-white' },
              ].map((stat, idx) => (
                <div key={idx} className="text-center group border-r border-white/5 last:border-0 lg:border-r">
                  <h3 className={`text-3xl sm:text-5xl md:text-6xl font-bold mb-2 sm:mb-3 transition-transform group-hover:scale-110 duration-500 ${stat.color}`}>{stat.value}</h3>
                  <p className="text-gray-500 font-normal text-[8px] sm:text-[10px]">{stat.label}</p>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* 5. APP GLIMPSE SECTION */}
      <section id="app-glimpse" className="py-24 sm:py-32 bg-gray-50 overflow-hidden relative">
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
          <div className="text-center mb-16 sm:mb-24">
            <span className="text-brand font-normal text-[10px] mb-4 block">Platform Glimpse</span>
            <h2 className="text-4xl sm:text-7xl font-bold text-gray-900 mb-6 leading-tight">One Ecosystem, <br /><span className="text-brand">Three Super Apps.</span></h2>
            <p className="max-w-2xl mx-auto text-gray-500 font-normal">Experience the power of a unified technical ecosystem designed for speed, transparency, and global standards.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16 lg:gap-20">
             {/* User App Glimpse */}
             <motion.div 
               whileHover={{ y: -10 }}
               className="flex flex-col items-center text-center group"
             >
                <div className="relative w-full max-w-[260px] sm:max-w-[280px] mb-10">
                   <div className="absolute inset-0 bg-brand/20 blur-[80px] rounded-full scale-50 group-hover:scale-100 transition-transform duration-700"></div>
                   <div className="relative z-10 p-2.5 sm:p-4 bg-gray-900 rounded-[2.5rem] sm:rounded-[3rem] border-[4px] sm:border-[8px] border-white shadow-2xl aspect-[9/18.5] overflow-hidden transform group-hover:rotate-1 transition-transform duration-500">
                      <img src="/helpu-user.png" alt="Help U User App" className="w-full h-full object-cover rounded-2xl brightness-95 group-hover:brightness-100 transition-all duration-500" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded-full"></div>
                   </div>
                </div>
                <div className="w-14 h-14 bg-white shadow-xl rounded-2xl flex items-center justify-center mb-6 text-brand">
                   <FaMobileAlt size={24} />
                </div>
                <h4 className="text-2xl font-normal mb-3 text-nowrap">User App</h4>
                <p className="text-gray-500 text-sm font-normal px-4">"Book world-class technical repairs in under 60 seconds."</p>
             </motion.div>

             {/* Worker App Glimpse */}
             <motion.div 
               whileHover={{ y: -10 }}
               className="flex flex-col items-center text-center group"
             >
                <div className="relative w-full max-w-[260px] sm:max-w-[280px] mb-10">
                   <div className="absolute inset-0 bg-cyan-500/20 blur-[80px] rounded-full scale-50 group-hover:scale-100 transition-transform duration-700"></div>
                   <div className="relative z-10 p-2.5 sm:p-4 bg-gray-900 rounded-[2.5rem] sm:rounded-[3rem] border-[4px] sm:border-[8px] border-white shadow-2xl aspect-[9/18.5] overflow-hidden transform group-hover:-rotate-1 transition-transform duration-500">
                      <img src="/helpu-worker.png" alt="Help U Worker App" className="w-full h-full object-contain bg-gray-50 rounded-2xl brightness-95 group-hover:brightness-100 transition-all duration-500" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded-full"></div>
                   </div>
                </div>
                <div className="w-14 h-14 bg-white shadow-xl rounded-2xl flex items-center justify-center mb-6 text-cyan-600">
                   <FaChartLine size={24} />
                </div>
                <h4 className="text-2xl font-normal mb-3 text-nowrap">Worker OS</h4>
                <p className="text-gray-500 text-sm font-normal px-4">"Full-stack digital operating system to scale your local business."</p>
             </motion.div>

             {/* Xpert App Glimpse */}
             <motion.div 
               whileHover={{ y: -10 }}
               className="flex flex-col items-center text-center group"
             >
                <div className="relative w-full max-w-[260px] sm:max-w-[280px] mb-10">
                   <div className="absolute inset-0 bg-orange-500/20 blur-[80px] rounded-full scale-50 group-hover:scale-100 transition-transform duration-700"></div>
                   <div className="relative z-10 p-2.5 sm:p-4 bg-gray-900 rounded-[2.5rem] sm:rounded-[3rem] border-[4px] sm:border-[8px] border-white shadow-2xl aspect-[9/18.5] overflow-hidden transform group-hover:rotate-1 transition-transform duration-500">
                      <img src="/helpu-xpert.png" alt="Help U Xpert App" className="w-full h-full object-contain bg-gray-50 rounded-2xl brightness-95 group-hover:brightness-100 transition-all duration-500" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-12 h-1 bg-white/20 rounded-full"></div>
                   </div>
                </div>
                <div className="w-14 h-14 bg-white shadow-xl rounded-2xl flex items-center justify-center mb-6 text-orange-600">
                   <FaTools size={24} />
                </div>
                <h4 className="text-2xl font-normal mb-3">Xpert Pro</h4>
                <p className="text-gray-500 text-sm font-normal px-4 text-nowrap">"Professional toolkit for engineers with live tracking and CRM."</p>
             </motion.div>
          </div>
        </div>
      </section>

      {/* 5. Key Features Section */}
      <section id="expertise" className="py-20 sm:py-32 bg-white relative">
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl text-center">
            <h2 className="text-3xl sm:text-5xl md:text-7xl font-normal text-gray-900 mb-6 leading-tight text-nowrap">Technical <span className="text-brand">Logistics.</span></h2>
            <p className="text-xs sm:text-sm text-gray-500 font-normal mb-16 sm:mb-24">Standardizing repairs across Indore</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                {[
                    { title: "Real-time Tracking", desc: "Monitor your Xpert live on the map as they head to your location.", icon: <FaMapMarker />, bg: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&q=80&w=800" },
                    { title: "Doorstep Billing", desc: "Verified invoices generated at home. Transparency in every charge.", icon: <FaFileInvoiceDollar />, bg: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=800" },
                    { title: "Platform Warranty", desc: "6-month warranty on every certified Help U spare part replaced.", icon: <FaShieldAlt />, bg: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=800" },
                    { title: "Direct Connect", desc: "Call or chat with your assigned technician directly in-app.", icon: <FaHandshake />, bg: "https://images.unsplash.com/photo-1521791136064-7986c2959213?auto=format&fit=crop&q=80&w=800" }
                ].map((item, i) => (
                    <div key={i} className="group relative p-8 sm:p-10 rounded-[3rem] sm:rounded-[4rem] overflow-hidden transition-all duration-700 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.3)] hover:-translate-y-4 h-[350px] sm:h-[400px] flex flex-col justify-end text-left border border-gray-100">
                        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-110" style={{ backgroundImage: `url(${item.bg})` }}></div>
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent group-hover:via-gray-900/60 transition-all duration-500"></div>
                        <div className="relative z-10">
                            <div className="w-14 h-14 bg-brand text-white shadow-xl rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 group-hover:rotate-[360deg] group-hover:scale-110">
                                <div className="text-xl sm:text-2xl">{item.icon}</div>
                            </div>
                            <h4 className="text-xl sm:text-2xl font-normal mb-3 text-white">{item.title}</h4>
                            <p className="text-xs sm:text-sm text-gray-300 font-normal leading-relaxed opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0 text-nowrap">"{item.desc}"</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </section>

      {/* 6. Join Platform Section */}
      <section id="join-platform" className="py-20 sm:py-32 bg-gray-900 rounded-[3rem] sm:rounded-[6rem] mx-2 sm:mx-8 mb-8 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full -z-10 opacity-20">
           <div className="absolute top-0 right-0 w-[80%] h-[80%] bg-brand/30 blur-[150px] rounded-full"></div>
        </div>
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
          <div className="text-center mb-16 sm:mb-24 text-white">
            <h2 className="text-3xl sm:text-5xl md:text-7xl font-normal mb-4 sm:mb-6">Become a Part.</h2>
            <div className="w-16 sm:w-24 h-1 sm:h-1.5 bg-brand mx-auto rounded-full"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10">
            {[
              { to: "/user", icon: <FaUser />, title: "As a User", btn: "Book Service" },
              { to: "/worker/login", icon: <FaStore />, title: "Worker Partner", btn: "Partner Now" },
            ].map((box, idx) => (
              <Link key={idx} to={box.to} className="group p-8 sm:p-12 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] sm:rounded-[3.5rem] transition-all duration-700 hover:bg-white hover:shadow-2xl hover:-translate-y-2 flex flex-col items-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/10 text-white rounded-[1.5rem] sm:rounded-3xl flex items-center justify-center mb-6 sm:mb-10 transition-all duration-500 group-hover:bg-brand group-hover:text-white group-hover:rotate-6">
                   <div className="text-3xl sm:text-4xl">{box.icon}</div>
                </div>
                <h3 className="text-2xl sm:text-3xl font-normal mb-6 sm:mb-10 text-white group-hover:text-gray-900">{box.title}</h3>
                <div className="flex items-center gap-3 text-brand font-normal text-xs sm:text-smr group-hover:gap-5 transition-all">
                  {box.btn} <FaArrowRight />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Testimonials */}
      <section className="py-20 sm:py-32 bg-white text-center border-t border-gray-50">
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
          <div className="flex flex-col items-center mb-16 sm:mb-24">
             <span className="text-brand font-bold text-[10px] uppercase tracking-[0.2em] mb-4">Trust Ecosystem</span>
             <h2 className="text-3xl sm:text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">Loved by Indore.</h2>
             <div className="flex justify-center gap-1.5 text-orange-400">
                {[1,2,3,4,5].map(i => <FaStar key={i} />)}
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10">
            {[
              { name: 'Aravind Sharma', role: 'Vijay Nagar', text: 'Professional Xperts. My AC repair was done with internal brand parts within 2 hours.' },
              { name: 'Priya Patel', role: 'AB Road', text: 'Registering as a partner was great for my tech hub. Excellent real-time tracking!' },
              { name: 'Suresh Kumar', role: 'Rajwada', text: 'Steady flow of jobs. Transparent doorstep billing is a game changer for technical jobs.' },
            ].map((t, i) => (
              <div key={i} className="group p-8 sm:p-12 bg-gray-50 rounded-[2.5rem] sm:rounded-[4rem] relative transition-all hover:bg-white hover:shadow-2xl hover:shadow-gray-200/50 text-left">
                <FaQuoteLeft className="text-brand/5 text-[60px] sm:text-[100px] absolute top-6 sm:top-8 left-6 sm:left-10" />
                <p className="text-base sm:text-lg text-gray-600 leading-relaxed font-normal mb-8 sm:mb-10 relative z-10 italic">"{t.text}"</p>
                <div className="flex items-center gap-4 sm:gap-5 relative z-10">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-[1.2rem] sm:rounded-[2rem] bg-brand/10 flex items-center justify-center text-brand font-bold text-xl uppercase">
                     {t.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-base sm:text-lg leading-none mb-1 sm:mb-2">{t.name}</h4>
                    <p className="text-gray-400 font-normal text-[10px] uppercase tracking-wider">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Download App Banner */}
      <section className="py-12 sm:py-20 mb-12 sm:mb-20 px-2 sm:px-0">
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl">
            <div className="bg-gray-900 rounded-[3rem] sm:rounded-[4rem] p-8 sm:p-12 md:p-20 relative overflow-hidden flex flex-col md:flex-row items-center justify-between border border-white/10 group shadow-2xl text-center md:text-left">
                <div className="absolute top-0 right-0 w-64 h-64 sm:w-80 sm:h-80 bg-brand/20 blur-[100px] sm:blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2"></div>
                <div className="relative z-10 mb-10 md:mb-0 max-w-xl">
                    <h2 className="text-3xl sm:text-5xl md:text-7xl font-normal text-white mb-6 sm:mb-8 leading-tight">Repair is a <br /><span className="text-brand">Tap Away.</span></h2>
                    <p className="text-gray-400 font-normal mb-8 sm:mb-10 text-[10px] sm:text-xs">Official Platform available on Android.</p>
                    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 sm:gap-4 bg-white text-gray-900 px-8 sm:px-14 py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-normal text-xs sm:text-sm hover:bg-brand hover:text-white transition-all shadow-xl active:scale-95">
                        <FaGooglePlay className="text-xl sm:text-2xl" /> Play Store
                    </a>
                </div>
                <div className="relative h-64 sm:h-80 md:h-[400px] w-full md:w-1/3">
                    <img src="/hero-image.png" alt="App Preview" className="h-full w-full object-cover rounded-[2.5rem] sm:rounded-[4rem] border-8 border-white/10 sm:rotate-3 shadow-2xl transition-transform group-hover:rotate-0 duration-700" />
                </div>
            </div>
        </div>
      </section>

      {/* 9. Dynamic Footer */}
      <footer className="py-16 sm:py-24 bg-gray-900 text-white relative overflow-hidden text-nowrap">
        <div className="absolute top-0 right-0 w-[40%] h-full bg-brand/5 blur-[120px] -z-10 rotate-12 translate-x-1/2"></div>
        <div className="container mx-auto px-4 sm:px-8 max-w-7xl relative z-10 text-center lg:text-left">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 sm:gap-20 mb-12 sm:mb-20 border-b border-white/5 pb-12 sm:pb-20">
            <div className="col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col items-center lg:items-start text-nowrap">
              <Link to="/Home" className="inline-block mb-8 sm:mb-10">
                <img src="/helpu-logo.png" alt="Help U Logo" className="h-11 sm:h-14 w-auto" />
              </Link>
              <p className="text-gray-400 font-normal leading-[1.8] text-base sm:text-lg max-w-md whitespace-normal">
                {settings?.companyName || 'Help U'} — Real-time tracking and doorstep billing across Indore. Exclusive genuine spare part ecosystem.
              </p>
            </div>
            
            <div className="hidden sm:block text-nowrap">
              <h4 className="text-[10px] font-normal text-brand mb-8 sm:mb-10">Technical Hub</h4>
              <ul className="space-y-4 sm:space-y-6 text-gray-400 font-normal text-sm">
                 {categories.slice(0, 3).map((cat, i) => (
                   <li key={cat.id || i}>
                     <Link 
                       to="/user" 
                       state={{ openCategoryId: cat.id }}
                       className="hover:text-white transition-all"
                     >
                       {cat.title}
                     </Link>
                   </li>
                 ))}
                 {!categoriesLoading && categories.length === 0 && (
                   <li><Link to="/user" className="hover:text-white transition-all">All Services</Link></li>
                 )}
              </ul>
            </div>

            <div className="flex flex-col items-center lg:items-start text-nowrap">
              <h4 className="text-[10px] font-normal text-brand mb-8 sm:mb-10">Contact Support</h4>
              <ul className="space-y-4 sm:space-y-6 text-gray-400 font-normal text-sm">
                 <li>Email: <a href={`mailto:${settings?.supportEmail || 'support@homestr.in'}`} className="hover:text-white transition-all">{settings?.supportEmail || 'support@homestr.in'}</a></li>
                 <li>Phone: <a href={`tel:${settings?.supportPhone || '+919876543210'}`} className="hover:text-white transition-all">{settings?.supportPhone || '+91 98765 43210'}</a></li>
                 <li className="text-[11px] opacity-50">
                    {settings?.companyAddress ? `${settings.companyAddress}, ${settings.companyCity}` : 'Indore, Madhya Pradesh'}
                 </li>
              </ul>
            </div>

            <div className="flex flex-col items-center lg:items-start text-nowrap">
              <h4 className="text-[10px] font-bold tracking-[0.2em] text-brand mb-8 sm:mb-10">Android App</h4>
              <div className="w-full max-w-[240px]">
                 <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 sm:px-8 py-4 sm:py-5 rounded-2xl text-xs font-bold hover:bg-white hover:text-gray-900 transition-all text-center justify-center">
                    <FaGooglePlay size={20} /> Play Store
                 </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-10 text-gray-500 font-normal text-[8px] sm:text-[10px] text-center whitespace-nowrap">
            <p>© {new Date().getFullYear()} {settings?.companyName || 'Help U Technologies'}. Proudly Indore 🇮🇳</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
