import React, { useState, useEffect, useRef, memo } from 'react';
import { gsap } from 'gsap';
import PromoCard from '../../../components/common/PromoCard';
import { themeColors } from '../../../../../theme';
import promo1 from '../../../../../assets/images/pages/Home/promo-carousel/1764052270908-bae94c.jpg';
import promo2 from '../../../../../assets/images/pages/Home/promo-carousel/1678450687690-81f922.jpg';
import promo3 from '../../../../../assets/images/pages/Home/promo-carousel/1745822547742-760034.jpg';
import promo4 from '../../../../../assets/images/pages/Home/promo-carousel/1711428209166-2d42c0.jpg';
import promo5 from '../../../../../assets/images/pages/Home/promo-carousel/1762785595543-540198.jpg';
import promo6 from '../../../../../assets/images/pages/Home/promo-carousel/1678454437383-aa4984.jpg';

const PromoCarousel = memo(({ promos, onPromoClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollContainerRef = useRef(null);
  const intervalRef = useRef(null);
  const carouselRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);



  const promotionalCards = promos || [];

  // Auto-scroll functionality
  useEffect(() => {
    if (isHovered || promotionalCards.length <= 1) return;

    const interval = setInterval(() => {
      if (!scrollContainerRef.current) return;

      const container = scrollContainerRef.current;
      const card = container.querySelector('[data-promo-card]');
      const cardWidth = card ? card.offsetWidth + 12 : container.offsetWidth;

      let nextScrollLeft = container.scrollLeft + cardWidth;

      if (nextScrollLeft >= container.scrollWidth - container.offsetWidth + 10) {
        nextScrollLeft = 0;
      }

      container.scrollTo({
        left: nextScrollLeft,
        behavior: 'smooth'
      });

    }, 4500);

    return () => clearInterval(interval);
  }, [isHovered, promotionalCards.length]);

  // Trigger index update on scroll
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const card = container.querySelector('[data-promo-card]');
      const cardWidth = card ? card.offsetWidth + 12 : container.offsetWidth;
      const index = Math.round(container.scrollLeft / cardWidth);

      if (index !== currentIndex && index >= 0 && index < promotionalCards.length) {
        setCurrentIndex(index);
      }
    }
  };

  // Entrance animation
  useEffect(() => {
    if (carouselRef.current) {
      gsap.fromTo(carouselRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      );
    }
  }, []);

  if (!promos || promos.length === 0) {
    return null;
  }

  return (
    <div
      ref={carouselRef}
      className="w-full relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto px-4 pb-2 pt-1 scrollbar-hide snap-x snap-mandatory scroll-smooth"
      >
        {promotionalCards.map((promo, index) => (
          <div
            key={promo.id || promo._id || index}
            data-promo-card
            className="flex-shrink-0 snap-center flex justify-center"
          >
            <PromoCard
              title={promo.title}
              subtitle={promo.subtitle}
              buttonText={promo.buttonText}
              image={promo.image}
              className={promo.className}
              onClick={() => onPromoClick?.(promo)}
            />
          </div>
        ))}
      </div>
      {/* Carousel indicator dots */}
      <div className="flex justify-center items-center gap-1.5 mt-2.5 mb-3">
        {promotionalCards.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              if (scrollContainerRef.current) {
                const container = scrollContainerRef.current;
                const card = container.querySelector('[data-promo-card]');
                const cardWidth = card ? card.offsetWidth + 12 : container.offsetWidth;
                container.scrollTo({
                  left: index * cardWidth,
                  behavior: 'smooth'
                });
                setCurrentIndex(index);
              }
            }}
            aria-label={`Go to slide ${index + 1}`}
            className={`rounded-full transition-all duration-300 ${
              index === currentIndex
                ? 'w-6 h-1.5 bg-[#D68F35] shadow-[0_2px_8px_rgba(214,143,53,0.45)]'
                : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
});

PromoCarousel.displayName = 'PromoCarousel';

export default PromoCarousel;

