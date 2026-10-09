const dotenv = require('dotenv');
const connectDB = require('../config/db');
const HomeContent = require('../models/HomeContent');

dotenv.config();

const helpuUrls = {
  "banner": [
    {
      "filename": "homepage-banner.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135844/Homster/HomeContent/banner/homepage-banner.png"
    },
    {
      "filename": "Winter-banner.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135846/Homster/HomeContent/banner/Winter-banner.png"
    }
  ],
  "curated-services": [
    {
      "filename": "ac-repair-service.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135847/Homster/HomeContent/curated-services/ac-repair-service.jpg"
    },
    {
      "filename": "electrical-panel-upgrade.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135848/Homster/HomeContent/curated-services/electrical-panel-upgrade.jpg"
    },
    {
      "filename": "home-wiring.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135849/Homster/HomeContent/curated-services/home-wiring.jpg"
    },
    {
      "filename": "smart home setup.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135850/Homster/HomeContent/curated-services/smart-home-setup.jpg"
    }
  ],
  "most-booked-services": [
    {
      "filename": "automatic-top-load-machine.webp",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135851/Homster/HomeContent/most-booked-services/automatic-top-load-machine.webp"
    },
    {
      "filename": "dreill&hang.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135852/Homster/HomeContent/most-booked-services/dreill-hang.webp"
    },
    {
      "filename": "fan-repairs.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135853/Homster/HomeContent/most-booked-services/fan-repairs.webp"
    },
    {
      "filename": "haircut-men.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135854/Homster/HomeContent/most-booked-services/haircut-men.webp"
    },
    {
      "filename": "intense-bathroom-2.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135855/Homster/HomeContent/most-booked-services/intense-bathroom-2.webp"
    },
    {
      "filename": "intense-bathroom-3.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135856/Homster/HomeContent/most-booked-services/intense-bathroom-3.webp"
    },
    {
      "filename": "roll-on-wax.webp",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135857/Homster/HomeContent/most-booked-services/roll-on-wax.webp"
    },
    {
      "filename": "spacula-waxing.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135858/Homster/HomeContent/most-booked-services/spacula-waxing.webp"
    },
    {
      "filename": "switch-board.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135859/Homster/HomeContent/most-booked-services/switch-board.webp"
    },
    {
      "filename": "tap-repai.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135860/Homster/HomeContent/most-booked-services/tap-repai.webp"
    }
  ],
  "new-and-noteworthy": [
    {
      "filename": "ac-repair.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135862/Homster/HomeContent/new-and-noteworthy/ac-repair.png"
    },
    {
      "filename": "bathroom-cleaning.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135863/Homster/HomeContent/new-and-noteworthy/bathroom-cleaning.png"
    },
    {
      "filename": "hair-studio.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135864/Homster/HomeContent/new-and-noteworthy/hair-studio.png"
    },
    {
      "filename": "water-purifiers.png",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135865/Homster/HomeContent/new-and-noteworthy/water-purifiers.png"
    }
  ],
  "promo-carousel": [
    {
      "filename": "1678450687690-81f922.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135866/Homster/HomeContent/promo-carousel/1678450687690-81f922.webp"
    },
    {
      "filename": "1678454437383-aa4984.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135868/Homster/HomeContent/promo-carousel/1678454437383-aa4984.webp"
    },
    {
      "filename": "1711428209166-2d42c0.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135869/Homster/HomeContent/promo-carousel/1711428209166-2d42c0.webp"
    },
    {
      "filename": "1745822547742-760034.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135870/Homster/HomeContent/promo-carousel/1745822547742-760034.webp"
    },
    {
      "filename": "1762785595543-540198.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135871/Homster/HomeContent/promo-carousel/1762785595543-540198.webp"
    },
    {
      "filename": "1764052270908-bae94c.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135873/Homster/HomeContent/promo-carousel/1764052270908-bae94c.webp"
    }
  ],
  "electrical-installation-repair": [
    {
      "filename": "home-wiring.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135874/Homster/HomeContent/electrical-installation-repair/home-wiring.jpg"
    },
    {
      "filename": "electrical-panel-upgrade.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135875/Homster/HomeContent/electrical-installation-repair/electrical-panel-upgrade.jpg"
    },
    {
      "filename": "smart home setup.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135876/Homster/HomeContent/electrical-installation-repair/smart-home-setup.jpg"
    }
  ],
  "appliance-repair-service": [
    {
      "filename": "ac-repair.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135877/Homster/HomeContent/appliance-repair-service/ac-repair.jpg"
    },
    {
      "filename": "washing-machine-repair].jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135878/Homster/HomeContent/appliance-repair-service/washing-machine-repair-.jpg"
    },
    {
      "filename": "water heater repair.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135879/Homster/HomeContent/appliance-repair-service/water-heater-repair.jpg"
    }
  ],
  "home-repair-installation": [
    {
      "filename": "wiring.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135880/Homster/HomeContent/home-repair-installation/wiring.jpg"
    },
    {
      "filename": "switch&socket.jpg",
      "url": "https://res.cloudinary.com/shubhamcloudinary/image/upload/v1766135884/Homster/HomeContent/home-repair-installation/switch-socket.jpg"
    }
  ]
};

const updateHomeContentImages = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Find existing HomeContent
    const homeContent = await HomeContent.findOne();
    if (!homeContent) {
      console.log('❌ No HomeContent found in database');
      return;
    }

    console.log('📝 Updating HomeContent images with Homster URLs...\n');

    // Update banners if they exist
    if (homeContent.banners && homeContent.banners.length > 0) {
      console.log('📸 Updating banners...');
      homeContent.banners.forEach((banner, index) => {
        if (helpuUrls.banner && helpuUrls.banner[index]) {
          banner.imageUrl = helpuUrls.banner[index].url;
          console.log(`  ✅ Banner ${index + 1}: ${helpuUrls.banner[index].url}`);
        }
      });
    }

    // Update promos if they exist
    if (homeContent.promos && homeContent.promos.length > 0) {
      console.log('🎠 Updating promos...');
      homeContent.promos.forEach((promo, index) => {
        if (helpuUrls['promo-carousel'] && helpuUrls['promo-carousel'][index]) {
          promo.imageUrl = helpuUrls['promo-carousel'][index].url;
          console.log(`  ✅ Promo ${index + 1}: ${helpuUrls['promo-carousel'][index].url}`);
        }
      });
    }

    // Update curated services if they exist
    if (homeContent.curated && homeContent.curated.length > 0) {
      console.log('🎯 Updating curated services...');
      homeContent.curated.forEach((item, index) => {
        if (helpuUrls['curated-services'] && helpuUrls['curated-services'][index]) {
          item.gifUrl = helpuUrls['curated-services'][index].url;
          console.log(`  ✅ Curated ${index + 1}: ${helpuUrls['curated-services'][index].url}`);
        }
      });
    }

    // Update noteworthy services if they exist
    if (homeContent.noteworthy && homeContent.noteworthy.length > 0) {
      console.log('⭐ Updating noteworthy services...');
      homeContent.noteworthy.forEach((item, index) => {
        if (helpuUrls['new-and-noteworthy'] && helpuUrls['new-and-noteworthy'][index]) {
          item.imageUrl = helpuUrls['new-and-noteworthy'][index].url;
          console.log(`  ✅ Noteworthy ${index + 1}: ${helpuUrls['new-and-noteworthy'][index].url}`);
        }
      });
    }

    // Update most booked services if they exist
    if (homeContent.booked && homeContent.booked.length > 0) {
      console.log('📦 Updating most booked services...');
      homeContent.booked.forEach((item, index) => {
        if (helpuUrls['most-booked-services'] && helpuUrls['most-booked-services'][index]) {
          item.imageUrl = helpuUrls['most-booked-services'][index].url;
          console.log(`  ✅ Booked ${index + 1}: ${helpuUrls['most-booked-services'][index].url}`);
        }
      });
    }

    // Update category sections if they exist
    if (homeContent.categorySections && homeContent.categorySections.length > 0) {
      console.log('📂 Updating category sections...');
      homeContent.categorySections.forEach((section, sectionIndex) => {
        let sectionKey = '';
        if (section.title === 'Electrical Installation & Repair') {
          sectionKey = 'electrical-installation-repair';
        } else if (section.title === 'Appliance repair & service') {
          sectionKey = 'appliance-repair-service';
        } else if (section.title === 'Home repair & installation') {
          sectionKey = 'home-repair-installation';
        }

        if (sectionKey && helpuUrls[sectionKey] && section.cards) {
          section.cards.forEach((card, cardIndex) => {
            if (helpuUrls[sectionKey][cardIndex]) {
              card.imageUrl = helpuUrls[sectionKey][cardIndex].url;
              console.log(`  ✅ ${section.title} - Card ${cardIndex + 1}: ${helpuUrls[sectionKey][cardIndex].url}`);
            }
          });
        }
      });
    }

    // Save the updated HomeContent
    await homeContent.save();
    console.log('\n🎉 HomeContent images updated successfully!');
    console.log('✅ All homepage images now use Homster/HomeContent URLs');

  } catch (error) {
    console.error('❌ Error updating HomeContent:', error);
  } finally {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
};

updateHomeContentImages();
