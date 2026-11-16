/**
 * Reference list of Indian states / union territories and their main cities, used by the admin
 * "Add city" forms so a city is picked (with its proper spelling) instead of typed.
 *
 * It is a convenience, not a limit: every form also has "Other city (type the name)" for a town that is
 * not listed. A city written "Name|Old name" is one place with two names; the second is only used to
 * notice a duplicate (for example Bangalore and Bengaluru are one city, as are Vijayapura and Bijapur).
 */
const RAW = {
  'Andhra Pradesh': 'Visakhapatnam|Vizag, Vijayawada, Guntur, Nellore, Tirupati, Kurnool, Rajahmundry|Rajamahendravaram, Kakinada, Kadapa|Cuddapah, Anantapur, Eluru, Ongole, Chittoor, Machilipatnam|Bandar, Srikakulam, Vizianagaram, Amaravati',
  'Arunachal Pradesh': 'Itanagar, Naharlagun, Pasighat, Tawang, Ziro, Bomdila',
  'Assam': 'Guwahati, Dibrugarh, Silchar, Jorhat, Nagaon, Tinsukia, Tezpur, Bongaigaon, Dhubri, Goalpara',
  'Bihar': 'Patna, Gaya, Bhagalpur, Muzaffarpur, Purnia, Darbhanga, Bihar Sharif, Arrah, Begusarai, Katihar, Munger, Chhapra, Hajipur, Sasaram',
  'Chhattisgarh': 'Raipur, Bhilai, Bilaspur, Korba, Durg, Rajnandgaon, Raigarh, Jagdalpur, Ambikapur',
  'Goa': 'Panaji|Panjim, Margao|Madgaon, Vasco da Gama, Mapusa, Ponda',
  'Gujarat': 'Ahmedabad, Surat, Vadodara|Baroda, Rajkot, Bhavnagar, Jamnagar, Gandhinagar, Junagadh, Anand, Nadiad, Morbi, Mehsana, Bharuch, Vapi, Navsari, Porbandar, Bhuj, Gandhidham',
  'Haryana': 'Gurugram|Gurgaon, Faridabad, Panipat, Ambala, Yamunanagar, Rohtak, Hisar, Karnal, Sonipat, Panchkula, Bhiwani, Sirsa, Bahadurgarh, Jind, Kurukshetra',
  'Himachal Pradesh': 'Shimla, Dharamshala, Solan, Mandi, Kullu, Manali, Baddi, Palampur, Hamirpur, Una',
  'Jharkhand': 'Ranchi, Jamshedpur, Dhanbad, Bokaro Steel City|Bokaro, Hazaribagh, Deoghar, Giridih, Ramgarh, Medininagar|Daltonganj',
  'Karnataka': 'Bangalore|Bengaluru, Mysuru|Mysore, Mangaluru|Mangalore, Hubballi-Dharwad|Hubli, Belagavi|Belgaum, Kalaburagi|Gulbarga, Vijayapura|Bijapur, Ballari|Bellary, Shivamogga|Shimoga, Tumakuru|Tumkur, Davanagere|Davangere, Raichur, Bidar, Udupi, Hassan, Mandya, Chitradurga, Kolar, Gadag, Hosapete|Hospet, Koppal, Chikkamagaluru|Chikmagalur, Karwar, Ramanagara',
  'Kerala': 'Thiruvananthapuram|Trivandrum, Kochi|Cochin, Kozhikode|Calicut, Thrissur|Trichur, Kollam|Quilon, Kannur|Cannanore, Alappuzha|Alleppey, Palakkad|Palghat, Kottayam, Malappuram, Kasaragod, Pathanamthitta, Idukki, Wayanad',
  'Madhya Pradesh': 'Indore, Bhopal, Jabalpur, Gwalior, Ujjain, Sagar, Dewas, Satna, Ratlam, Rewa, Katni, Singrauli, Burhanpur, Khandwa, Bhind, Chhindwara, Guna, Shivpuri, Vidisha, Damoh, Mandsaur, Neemuch, Khargone, Morena, Hoshangabad|Narmadapuram, Itarsi, Betul, Seoni, Sehore, Dhar, Chhatarpur, Pithampur',
  'Maharashtra': 'Mumbai|Bombay, Pune|Poona, Nagpur, Thane, Nashik, Aurangabad|Chhatrapati Sambhajinagar, Solapur, Kolhapur, Amravati, Navi Mumbai, Sangli, Jalgaon, Akola, Latur, Dhule, Ahmednagar|Ahilyanagar, Chandrapur, Nanded, Parbhani, Jalna, Satara, Ratnagiri, Bhiwandi, Vasai-Virar, Malegaon, Kalyan-Dombivli, Pimpri-Chinchwad, Mira-Bhayandar, Ulhasnagar, Panvel, Beed, Yavatmal, Wardha, Gondia, Osmanabad|Dharashiv',
  'Manipur': 'Imphal, Thoubal, Bishnupur, Churachandpur, Ukhrul',
  'Meghalaya': 'Shillong, Tura, Jowai, Nongpoh, Baghmara',
  'Mizoram': 'Aizawl, Lunglei, Champhai, Serchhip, Kolasib',
  'Nagaland': 'Kohima, Dimapur, Mokokchung, Tuensang, Wokha',
  'Odisha': 'Bhubaneswar, Cuttack, Rourkela, Berhampur, Sambalpur, Puri, Balasore|Baleshwar, Bhadrak, Baripada, Jharsuguda, Jeypore, Angul',
  'Punjab': 'Ludhiana, Amritsar, Jalandhar, Patiala, Bathinda, Mohali|SAS Nagar, Hoshiarpur, Pathankot, Moga, Batala, Abohar, Malerkotla, Khanna, Phagwara, Barnala, Firozpur, Kapurthala, Rupnagar|Ropar',
  'Rajasthan': 'Jaipur, Jodhpur, Udaipur, Kota, Ajmer, Bikaner, Bhilwara, Alwar, Sikar, Sri Ganganagar, Pali, Bharatpur, Chittorgarh, Jhunjhunu, Tonk, Barmer, Hanumangarh, Beawar, Bundi, Jaisalmer, Mount Abu',
  'Sikkim': 'Gangtok, Namchi, Gyalshing, Mangan',
  'Tamil Nadu': 'Chennai|Madras, Coimbatore|Kovai, Madurai, Tiruchirappalli|Trichy, Salem, Tiruppur|Tirupur, Erode, Tirunelveli, Vellore, Thoothukudi|Tuticorin, Dindigul, Thanjavur|Tanjore, Hosur, Nagercoil, Kanchipuram, Karur, Cuddalore, Kumbakonam, Sivakasi, Namakkal, Pudukkottai, Rajapalayam, Ooty|Udhagamandalam, Krishnagiri, Tiruvannamalai',
  'Telangana': 'Hyderabad, Warangal, Nizamabad, Karimnagar, Khammam, Ramagundam, Mahbubnagar, Nalgonda, Adilabad, Siddipet, Secunderabad, Suryapet, Miryalaguda',
  'Tripura': 'Agartala, Udaipur, Dharmanagar, Kailasahar, Belonia',
  'Uttar Pradesh': 'Lucknow, Kanpur, Ghaziabad, Agra, Varanasi|Banaras, Meerut, Prayagraj|Allahabad, Bareilly, Aligarh, Moradabad, Saharanpur, Gorakhpur, Noida, Greater Noida, Firozabad, Jhansi, Muzaffarnagar, Mathura, Ayodhya|Faizabad, Rampur, Shahjahanpur, Farrukhabad, Mau, Hapur, Etawah, Mirzapur, Bulandshahr, Sambhal, Amroha, Hardoi, Fatehpur, Raebareli, Orai, Sitapur, Bahraich, Unnao, Jaunpur, Lakhimpur, Basti, Budaun, Banda',
  'Uttarakhand': 'Dehradun, Haridwar, Roorkee, Haldwani, Rudrapur, Kashipur, Rishikesh, Nainital, Mussoorie, Pithoragarh, Almora',
  'West Bengal': 'Kolkata|Calcutta, Howrah, Durgapur, Asansol, Siliguri, Bardhaman|Burdwan, Malda, Baharampur, Habra, Kharagpur, Shantipur, Dankuni, Ranaghat, Haldia, Raiganj, Krishnanagar, Nabadwip, Medinipur|Midnapore, Jalpaiguri, Balurghat, Basirhat, Bankura, Purulia, Darjeeling, Cooch Behar',

  // Union territories
  'Andaman and Nicobar Islands': 'Port Blair, Diglipur, Mayabunder',
  'Chandigarh': 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu': 'Daman, Diu, Silvassa',
  'Delhi': 'New Delhi, Delhi, Dwarka, Rohini, Karol Bagh, Saket',
  'Jammu and Kashmir': 'Srinagar, Jammu, Anantnag, Baramulla, Sopore, Kathua, Udhampur, Kupwara',
  'Ladakh': 'Leh, Kargil',
  'Lakshadweep': 'Kavaratti, Agatti, Minicoy',
  'Puducherry': 'Puducherry|Pondicherry, Karaikal, Mahe, Yanam'
};

const parseCities = (csv) =>
  csv.split(',').map((entry) => {
    const [name, ...aliases] = entry.trim().split('|');
    return { name: name.trim(), aliases: aliases.map((a) => a.trim()).filter(Boolean) };
  });

/** [{ name: 'Karnataka', cities: [{ name: 'Bangalore', aliases: ['Bengaluru'] }, ...] }, ...] in A-Z order */
export const INDIA_STATES = Object.keys(RAW)
  .sort((a, b) => a.localeCompare(b))
  .map((name) => ({ name, cities: parseCities(RAW[name]).sort((a, b) => a.name.localeCompare(b.name)) }));

const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The listed state that matches a stored one, ignoring case ("KARNATAKA" -> Karnataka). */
export const findState = (name) => INDIA_STATES.find((s) => norm(s.name) === norm(name)) || null;

/** The listed city (in that state) that matches a name or an old name, or null. */
export const findCity = (stateName, cityName) => {
  const state = findState(stateName);
  if (!state) return null;
  const target = norm(cityName);
  return state.cities.find((c) => norm(c.name) === target || c.aliases.some((a) => norm(a) === target)) || null;
};

/** True when two names are the same place (same name, or one is the other's old name). */
export const samePlace = (stateName, a, b) => {
  if (norm(a) === norm(b)) return true;
  const cityA = findCity(stateName, a);
  const cityB = findCity(stateName, b);
  return !!cityA && !!cityB && cityA.name === cityB.name;
};

/**
 * Names of the listed cities of `stateName` that already exist in the system, matching case-insensitively
 * and by old name ("BIJAPUR" counts as Vijayapura). `ignoreId` leaves out the city being edited.
 */
export const takenCityNames = (stateName, existingCities = [], ignoreId = null) => {
  const state = findState(stateName);
  const taken = new Set();
  if (!state) return taken;
  existingCities.forEach((c) => {
    if (ignoreId && (c._id || c.id) === ignoreId) return;
    if (findState(c.state)?.name !== state.name) return;
    state.cities.forEach((listed) => {
      if (samePlace(state.name, c.name, listed.name)) taken.add(listed.name);
    });
  });
  return taken;
};

/**
 * Groups the system's cities by state for the admin Cities page. "KARNATAKA" and "Karnataka" are one state.
 * Each group: { key, name, listed, cities, activeCount, hasDefault, duplicates } where `duplicates` maps a
 * city id to the name of another record in the same state that is the same place (Bijapur / Vijayapura).
 * Sorted A-Z; cities without a state go last under "No state set".
 */
export const groupCitiesByState = (cities = []) => {
  const groups = new Map();
  cities.forEach((c) => {
    const raw = String(c.state || '').trim();
    const listed = findState(raw);
    const key = listed ? listed.name : raw ? norm(raw) : '';
    if (!groups.has(key)) {
      groups.set(key, { key: key || '__none__', name: listed ? listed.name : raw || 'No state set', listed: !!listed, cities: [] });
    }
    groups.get(key).cities.push(c);
  });

  return [...groups.values()]
    .map((g) => {
      const duplicates = {};
      g.cities.forEach((a, i) => {
        g.cities.forEach((b, j) => {
          if (i < j && g.listed && samePlace(g.name, a.name, b.name)) {
            duplicates[a._id || a.id] = b.name;
            duplicates[b._id || b.id] = a.name;
          }
        });
      });
      return {
        ...g,
        cities: [...g.cities].sort((x, y) => String(x.name).localeCompare(String(y.name))),
        activeCount: g.cities.filter((c) => c.isActive).length,
        hasDefault: g.cities.some((c) => c.isDefault),
        duplicates
      };
    })
    .sort((a, b) => (a.key === '__none__') - (b.key === '__none__') || a.name.localeCompare(b.name));
};
