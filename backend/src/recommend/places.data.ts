// backend/src/recommend/places.data.ts
// Curated starter catalogue of well-known places, so recommendations work
// offline / without third-party APIs. When the server has internet access,
// places.service.ts can enrich this with live OpenStreetMap data.
//
// `popularity` is an editorial 0-100 prominence weight used for ranking only.
// It is NOT a user rating and is never shown as one in the UI.

import type { CategoryId } from "./categories";

export type BestTime = "morning" | "afternoon" | "evening" | "night" | "any";

export type Place = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  category: CategoryId;
  also: CategoryId[];
  popularity: number; // 0..100 editorial prominence
  durationMins: number; // typical visit length
  bestTime: BestTime;
  price: 0 | 1 | 2 | 3; // 0 free, 1 budget, 2 moderate, 3 premium
  indoor: boolean;
  tags: string[];
  description: string;
  source: "curated" | "osm";
};

type Row = [
  name: string,
  city: string,
  lat: number,
  lng: number,
  category: CategoryId,
  also: CategoryId[],
  popularity: number,
  durationMins: number,
  bestTime: BestTime,
  price: 0 | 1 | 2 | 3,
  indoor: boolean,
  description: string,
  tags?: string[]
];

// prettier-ignore
const ROWS: Row[] = [
  // ---------------- Chennai ----------------
  ["Fort St. George", "Chennai", 13.0796, 80.2875, "historic", [], 78, 90, "morning", 1, false, "First English fortress in India (1644), now housing the Fort Museum and St. Mary's Church."],
  ["Government Museum, Egmore", "Chennai", 13.0694, 80.2565, "historic", [], 76, 150, "morning", 1, true, "One of India's oldest museums, famous for its Chola bronze gallery.", ["museum", "rainy-day"]],
  ["Kapaleeshwarar Temple", "Chennai", 13.0339, 80.2696, "spiritual", ["historic"], 85, 60, "morning", 0, false, "Dravidian-style Shiva temple in Mylapore with a towering, colourful gopuram."],
  ["San Thome Basilica", "Chennai", 13.0334, 80.2777, "spiritual", ["historic"], 74, 45, "any", 0, true, "Neo-Gothic basilica built over the tomb of St. Thomas the Apostle."],
  ["Parthasarathy Temple", "Chennai", 13.0538, 80.2770, "spiritual", ["historic"], 66, 45, "morning", 0, false, "8th-century Vishnu temple in Triplicane, one of the oldest in the city."],
  ["Valluvar Kottam", "Chennai", 13.0500, 80.2416, "historic", [], 55, 45, "afternoon", 1, false, "Chariot-shaped memorial to the Tamil poet-saint Thiruvalluvar."],
  ["Marina Beach", "Chennai", 13.0500, 80.2824, "fun", ["nature", "food"], 90, 90, "evening", 0, false, "One of the world's longest urban beaches; evening walks and street snacks.", ["beach", "sunrise"]],
  ["Elliot's Beach (Besant Nagar)", "Chennai", 12.9988, 80.2718, "fun", ["nature", "food"], 72, 75, "evening", 0, false, "Calmer beach lined with cafes and food stalls in Besant Nagar.", ["beach"]],
  ["Semmozhi Poonga", "Chennai", 13.0503, 80.2510, "nature", [], 55, 60, "morning", 1, false, "Botanical garden in the heart of the city."],
  ["Guindy National Park", "Chennai", 13.0040, 80.2350, "nature", ["fun"], 60, 90, "morning", 1, false, "Rare national park inside a city, with blackbuck and a children's park."],
  ["Arignar Anna Zoological Park", "Chennai", 12.8790, 80.0819, "fun", ["nature"], 74, 240, "morning", 1, false, "Large zoo at Vandalur with lion safari and nocturnal house.", ["zoo", "kids"]],
  ["VGP Universal Kingdom", "Chennai", 12.9165, 80.2508, "fun", ["entertainment"], 62, 300, "afternoon", 2, false, "Beachside amusement park on East Coast Road.", ["theme park", "kids"]],
  ["MGM Dizzee World", "Chennai", 12.8445, 80.2462, "fun", ["entertainment"], 64, 300, "afternoon", 2, false, "Popular theme park with rides and a water park on ECR.", ["theme park", "kids"]],
  ["DakshinaChitra Heritage Museum", "Chennai", 12.8237, 80.2421, "historic", ["shopping"], 66, 150, "morning", 1, false, "Living-history museum of South Indian architecture, crafts and performing arts."],
  ["Birla Planetarium", "Chennai", 13.0110, 80.2420, "entertainment", ["fun"], 52, 75, "afternoon", 1, true, "Planetarium and science centre in Kotturpuram.", ["kids", "rainy-day"]],
  ["Sathyam Cinemas", "Chennai", 13.0556, 80.2580, "entertainment", [], 60, 180, "evening", 2, true, "Iconic multiplex in Royapettah.", ["movies", "rainy-day"]],
  ["The Music Academy", "Chennai", 13.0453, 80.2614, "entertainment", ["historic"], 58, 150, "evening", 2, true, "Landmark Carnatic music and Bharatanatyam venue; peak season Dec-Jan.", ["live music"]],
  ["Express Avenue Mall", "Chennai", 13.0583, 80.2641, "shopping", ["food", "entertainment"], 60, 120, "afternoon", 2, true, "Large central mall with food court and cinema.", ["mall", "rainy-day"]],
  ["Pondy Bazaar, T. Nagar", "Chennai", 13.0418, 80.2341, "shopping", ["food"], 70, 120, "evening", 1, false, "Bustling pedestrian shopping street for silks, jewellery and street food.", ["market"]],
  ["Phoenix Marketcity", "Chennai", 12.9915, 80.2170, "shopping", ["entertainment", "food"], 62, 150, "evening", 2, true, "Mall in Velachery with cinema, gaming and restaurants.", ["mall"]],
  ["Murugan Idli Shop", "Chennai", 13.0402, 80.2337, "food", [], 74, 45, "morning", 1, true, "Famous for soft idlis with a spread of chutneys.", ["south indian", "breakfast"]],
  ["Saravana Bhavan, Mylapore", "Chennai", 13.0336, 80.2683, "food", [], 76, 60, "any", 1, true, "Classic vegetarian South Indian meals and filter coffee.", ["south indian", "vegetarian"]],
  ["Ratna Cafe, Triplicane", "Chennai", 13.0560, 80.2770, "food", [], 64, 45, "morning", 1, true, "Decades-old cafe known for idli-sambar.", ["breakfast"]],
  ["Buhari Hotel, Anna Salai", "Chennai", 13.0629, 80.2700, "food", [], 62, 60, "evening", 1, true, "Heritage restaurant credited with popularising Chicken 65.", ["non-veg", "biryani"]],
  ["Shore Temple, Mahabalipuram", "Mahabalipuram", 12.6166, 80.1990, "historic", ["spiritual"], 86, 120, "morning", 1, false, "UNESCO World Heritage 8th-century granite temple on the Bay of Bengal."],

  // ---------------- Guwahati ----------------
  ["Kamakhya Temple", "Guwahati", 26.1664, 91.7055, "spiritual", ["historic"], 90, 120, "morning", 0, false, "Revered Shakti Peetha atop Nilachal Hill; go early to avoid queues."],
  ["Umananda Temple", "Guwahati", 26.1960, 91.7470, "spiritual", ["fun", "nature"], 70, 120, "morning", 1, false, "Shiva temple on Peacock Island in the Brahmaputra, reached by ferry.", ["boat"]],
  ["Navagraha Temple", "Guwahati", 26.1870, 91.7600, "spiritual", ["historic"], 55, 45, "morning", 0, false, "Ancient temple dedicated to the nine planets on Chitrachal Hill."],
  ["Assam State Museum", "Guwahati", 26.1866, 91.7507, "historic", [], 62, 90, "afternoon", 1, true, "Sculpture, textiles and tribal heritage of Assam near Dighalipukhuri.", ["museum", "rainy-day"]],
  ["Srimanta Sankardev Kalakshetra", "Guwahati", 26.1530, 91.7990, "entertainment", ["historic"], 64, 120, "afternoon", 1, false, "Cultural complex showcasing Assamese art, theatre and heritage village."],
  ["Assam State Zoo & Botanical Garden", "Guwahati", 26.1615, 91.7790, "fun", ["nature"], 66, 180, "morning", 1, false, "Large zoo known for one-horned rhinos.", ["zoo", "kids"]],
  ["Brahmaputra Sunset River Cruise", "Guwahati", 26.1902, 91.7560, "fun", ["entertainment", "nature"], 70, 120, "evening", 2, false, "Evening cruise on the Brahmaputra from the Uzan Bazar ghat.", ["boat", "sunset"]],
  ["Dighalipukhuri Park", "Guwahati", 26.1860, 91.7495, "nature", ["fun"], 52, 45, "evening", 1, false, "Historic tank with boating in the city centre.", ["boating"]],
  ["Basistha Ashram", "Guwahati", 26.1050, 91.7900, "spiritual", ["nature"], 52, 75, "morning", 0, false, "Ashram and temple beside forest streams on the city's edge."],
  ["Guwahati Planetarium", "Guwahati", 26.1890, 91.7530, "entertainment", ["fun"], 50, 60, "afternoon", 1, true, "Sky shows at the Uzan Bazar planetarium.", ["kids", "rainy-day"]],
  ["Fancy Bazaar", "Guwahati", 26.1830, 91.7380, "shopping", ["food"], 60, 90, "afternoon", 1, false, "Busy wholesale market for Assam silk, tea and everyday goods.", ["market"]],
  ["Paradise Restaurant (Assamese thali)", "Guwahati", 26.1871, 91.7612, "food", [], 62, 60, "afternoon", 1, true, "Traditional Assamese thali with fish curry and pitika.", ["assamese"]],
  ["Pobitora Wildlife Sanctuary", "Pobitora", 26.2370, 92.0550, "nature", ["fun"], 72, 240, "morning", 2, false, "Highest density of one-horned rhinos in the world; jeep and elephant safaris.", ["safari", "wildlife"]],

  // ---------------- Shillong / Sohra ----------------
  ["Ward's Lake", "Shillong", 25.5760, 91.8880, "nature", ["fun"], 66, 60, "morning", 1, false, "Colonial-era lake garden with paddle boats in central Shillong.", ["boating"]],
  ["Don Bosco Museum", "Shillong", 25.5890, 91.8990, "historic", [], 72, 120, "afternoon", 1, true, "Seven-storey museum of the cultures of North-East India, with a skywalk.", ["museum", "rainy-day"]],
  ["Cathedral of Mary Help of Christians", "Shillong", 25.5726, 91.8930, "spiritual", ["historic"], 58, 40, "any", 0, true, "Striking Gothic-style cathedral in Laitumkhrah."],
  ["Shillong Peak", "Shillong", 25.5470, 91.8770, "nature", [], 70, 60, "morning", 1, false, "Highest point in Meghalaya with panoramic views.", ["viewpoint"]],
  ["Elephant Falls", "Shillong", 25.5390, 91.8240, "nature", ["fun"], 72, 60, "morning", 1, false, "Three-tiered waterfall on the outskirts of the city.", ["waterfall"]],
  ["Laitlum Canyons", "Shillong", 25.4560, 91.9530, "nature", ["fun"], 70, 150, "morning", 0, false, "Dramatic canyon viewpoints and treks; best on clear mornings.", ["trek", "viewpoint"]],
  ["Umiam Lake", "Shillong", 25.6600, 91.8940, "fun", ["nature"], 76, 120, "afternoon", 1, false, "Reservoir lake with kayaking, boating and sunset views.", ["boating", "sunset"]],
  ["Police Bazaar", "Shillong", 25.5760, 91.8830, "shopping", ["food", "entertainment"], 70, 90, "evening", 1, false, "Shillong's lively central market and food street.", ["market", "street food"]],
  ["Cafe Shillong", "Shillong", 25.5740, 91.8920, "entertainment", ["food"], 60, 90, "evening", 2, true, "Cosy cafe known for live music in India's 'rock capital'.", ["live music", "cafe"]],
  ["Jadoh Stalls, Police Bazaar", "Shillong", 25.5770, 91.8825, "food", [], 58, 45, "afternoon", 1, true, "Try Khasi jadoh (rice with pork) and local snacks.", ["khasi", "street food"]],
  ["Nohkalikai Falls", "Sohra", 25.2750, 91.6860, "nature", [], 80, 90, "morning", 1, false, "India's tallest plunge waterfall, near Cherrapunji.", ["waterfall", "viewpoint"]],

  // ---------------- Gangtok ----------------
  ["MG Marg", "Gangtok", 27.3289, 88.6122, "shopping", ["food", "entertainment"], 84, 120, "evening", 1, false, "Pedestrian promenade with cafes, shops and evening buzz.", ["promenade", "street food"]],
  ["Rumtek Monastery", "Gangtok", 27.2885, 88.5620, "spiritual", ["historic"], 80, 120, "morning", 0, false, "Seat of the Karmapa and one of Sikkim's largest monasteries."],
  ["Enchey Monastery", "Gangtok", 27.3376, 88.6191, "spiritual", ["historic"], 62, 45, "morning", 0, false, "200-year-old Nyingma monastery above town."],
  ["Namgyal Institute of Tibetology", "Gangtok", 27.3175, 88.6040, "historic", [], 64, 75, "afternoon", 1, true, "Museum of rare Buddhist manuscripts, thangkas and icons.", ["museum", "rainy-day"]],
  ["Do Drul Chorten", "Gangtok", 27.3170, 88.6060, "spiritual", [], 58, 40, "any", 0, false, "Stupa ringed by 108 prayer wheels."],
  ["Gangtok Ropeway", "Gangtok", 27.3247, 88.6105, "fun", ["nature"], 66, 45, "afternoon", 1, false, "Cable car ride over the city from Deorali.", ["cable car", "viewpoint"]],
  ["Ganesh Tok", "Gangtok", 27.3420, 88.6200, "nature", ["spiritual"], 60, 45, "morning", 0, false, "Hilltop temple and viewpoint with Kanchenjunga views on clear days.", ["viewpoint"]],
  ["Hanuman Tok", "Gangtok", 27.3550, 88.6390, "spiritual", ["nature"], 58, 60, "morning", 0, false, "Peaceful temple viewpoint maintained by the Army.", ["viewpoint"]],
  ["Himalayan Zoological Park", "Gangtok", 27.3430, 88.6230, "fun", ["nature"], 60, 120, "morning", 1, false, "Hillside zoo with red pandas and snow leopards.", ["zoo", "kids"]],
  ["Banjhakri Falls & Energy Park", "Gangtok", 27.3530, 88.5960, "fun", ["nature"], 60, 90, "afternoon", 1, false, "Waterfall park with shamanic-themed sculptures.", ["waterfall", "kids"]],
  ["Taste of Tibet, MG Marg", "Gangtok", 27.3292, 88.6125, "food", [], 60, 60, "evening", 1, true, "Momos, thukpa and Tibetan staples on MG Marg.", ["momos", "tibetan"]],
  ["Tsomgo (Changu) Lake", "Gangtok", 27.3750, 88.7630, "nature", ["fun"], 84, 240, "morning", 2, false, "Glacial lake at 3,750 m; permit required, go early.", ["lake", "permit"]],

  // ---------------- Delhi ----------------
  ["Red Fort", "Delhi", 28.6562, 77.2410, "historic", [], 92, 120, "morning", 1, false, "UNESCO-listed Mughal fort; closed Mondays. Light & sound show in the evening."],
  ["Qutub Minar", "Delhi", 28.5245, 77.1855, "historic", [], 90, 90, "morning", 1, false, "73 m victory tower from the 12th century, UNESCO World Heritage Site."],
  ["Humayun's Tomb", "Delhi", 28.5933, 77.2507, "historic", ["nature"], 88, 90, "afternoon", 1, false, "Garden tomb that inspired the Taj Mahal."],
  ["India Gate", "Delhi", 28.6129, 77.2295, "historic", ["fun"], 86, 45, "evening", 0, false, "War memorial on Kartavya Path; lively in the evenings.", ["evening walk"]],
  ["National Museum", "Delhi", 28.6119, 77.2194, "historic", [], 72, 150, "afternoon", 1, true, "Five millennia of Indian art and artefacts.", ["museum", "rainy-day"]],
  ["Jama Masjid", "Delhi", 28.6507, 77.2334, "spiritual", ["historic"], 82, 60, "morning", 0, false, "India's largest mosque, built by Shah Jahan."],
  ["Lotus Temple", "Delhi", 28.5535, 77.2588, "spiritual", ["historic"], 80, 60, "afternoon", 0, false, "Baha'i House of Worship shaped like a lotus; closed Mondays."],
  ["Swaminarayan Akshardham", "Delhi", 28.6127, 77.2773, "spiritual", ["entertainment"], 86, 180, "afternoon", 0, false, "Vast temple complex with an evening water show.", ["show"]],
  ["Lodhi Garden", "Delhi", 28.5931, 77.2197, "nature", ["historic"], 70, 75, "morning", 0, false, "Landscaped park dotted with 15th-century tombs.", ["walk"]],
  ["Chandni Chowk", "Delhi", 28.6506, 77.2303, "shopping", ["food", "historic"], 84, 150, "afternoon", 1, false, "Old Delhi's historic market lanes; legendary street food.", ["market", "street food"]],
  ["Paranthe Wali Gali", "Delhi", 28.6560, 77.2300, "food", [], 74, 45, "morning", 1, false, "Lane of stuffed, deep-fried parathas in Old Delhi.", ["street food", "breakfast"]],
  ["Karim's, Jama Masjid", "Delhi", 28.6496, 77.2337, "food", [], 80, 60, "evening", 1, true, "Mughlai institution since 1913.", ["mughlai", "non-veg"]],
  ["Dilli Haat, INA", "Delhi", 28.5733, 77.2079, "shopping", ["food"], 72, 120, "evening", 1, false, "Open-air crafts bazaar with food stalls from every state.", ["handicraft"]],
  ["Hauz Khas Village", "Delhi", 28.5535, 77.1940, "entertainment", ["food", "historic"], 74, 150, "evening", 2, false, "Medieval ruins and lake beside cafes, bars and boutiques.", ["nightlife"]],
  ["Connaught Place", "Delhi", 28.6315, 77.2167, "shopping", ["entertainment", "food"], 78, 120, "evening", 2, false, "Georgian-style circular hub of shops, restaurants and bars."],
  ["Kingdom of Dreams", "Gurugram", 28.4679, 77.0680, "entertainment", ["food"], 66, 180, "evening", 3, true, "Bollywood-style musicals and a themed food street.", ["show"]],
  ["Adventure Island, Rohini", "Delhi", 28.7230, 77.1110, "fun", ["entertainment"], 60, 240, "afternoon", 2, false, "Amusement park with rides for all ages.", ["theme park", "kids"]],

  // ---------------- Mumbai ----------------
  ["Gateway of India", "Mumbai", 18.9220, 72.8347, "historic", ["fun"], 92, 45, "evening", 0, false, "1924 arch on the Apollo Bunder waterfront; ferries to Elephanta leave here."],
  ["Chhatrapati Shivaji Maharaj Terminus", "Mumbai", 18.9400, 72.8355, "historic", [], 82, 45, "any", 0, false, "UNESCO-listed Victorian Gothic railway station."],
  ["CSMVS Museum", "Mumbai", 18.9269, 72.8326, "historic", [], 74, 150, "afternoon", 1, true, "Indo-Saracenic museum of art and history in Kala Ghoda.", ["museum", "rainy-day"]],
  ["Elephanta Caves", "Mumbai", 18.9633, 72.9315, "historic", ["spiritual", "fun"], 80, 240, "morning", 2, false, "Rock-cut Shiva cave temples on an island, by ferry. Closed Mondays.", ["boat"]],
  ["Marine Drive", "Mumbai", 18.9440, 72.8230, "nature", ["fun"], 88, 60, "evening", 0, false, "The 'Queen's Necklace' seafront promenade at sunset.", ["sunset", "walk"]],
  ["Juhu Beach", "Mumbai", 19.0988, 72.8267, "fun", ["food"], 78, 90, "evening", 0, false, "Beach famous for pav bhaji and evening crowds.", ["beach", "street food"]],
  ["Siddhivinayak Temple", "Mumbai", 19.0169, 72.8302, "spiritual", [], 84, 60, "morning", 0, true, "One of the most visited Ganesh temples in India."],
  ["Haji Ali Dargah", "Mumbai", 18.9827, 72.8089, "spiritual", ["historic"], 82, 60, "afternoon", 0, false, "Islet shrine reached by a causeway at low tide."],
  ["Leopold Cafe", "Mumbai", 18.9227, 72.8317, "food", ["entertainment"], 74, 60, "evening", 2, true, "Historic Colaba cafe-bar since 1871.", ["cafe"]],
  ["Bademiya, Colaba", "Mumbai", 18.9230, 72.8320, "food", [], 70, 45, "night", 1, false, "Late-night kebab and roll institution.", ["street food", "non-veg"]],
  ["Colaba Causeway", "Mumbai", 18.9180, 72.8310, "shopping", ["food"], 72, 90, "afternoon", 1, false, "Street market for clothes, jewellery and souvenirs.", ["market"]],
  ["NCPA, Nariman Point", "Mumbai", 18.9255, 72.8200, "entertainment", [], 66, 150, "evening", 2, true, "India's premier performing-arts centre.", ["live music", "theatre"]],
  ["Prithvi Theatre", "Mumbai", 19.1060, 72.8260, "entertainment", ["food"], 62, 150, "evening", 2, true, "Intimate theatre and cafe in Juhu.", ["theatre"]],
  ["EsselWorld", "Mumbai", 19.2310, 72.8050, "fun", ["entertainment"], 66, 300, "afternoon", 2, false, "Large amusement and water park at Gorai.", ["theme park", "kids"]],
  ["Sanjay Gandhi National Park", "Mumbai", 19.2147, 72.9106, "nature", ["historic", "fun"], 70, 180, "morning", 1, false, "Forest park with the ancient Kanheri Caves inside.", ["trek", "caves"]],

  // ---------------- Jaipur ----------------
  ["Amber Fort", "Jaipur", 26.9855, 75.8513, "historic", [], 92, 180, "morning", 1, false, "Hilltop Rajput fort-palace; arrive at opening to beat heat and crowds."],
  ["Hawa Mahal", "Jaipur", 26.9239, 75.8267, "historic", [], 88, 45, "morning", 1, false, "The 953-window 'Palace of Winds'; best photographed in morning light."],
  ["City Palace, Jaipur", "Jaipur", 26.9258, 75.8237, "historic", [], 84, 120, "afternoon", 2, false, "Royal residence and museums in the old city."],
  ["Jantar Mantar, Jaipur", "Jaipur", 26.9248, 75.8246, "historic", [], 78, 60, "afternoon", 1, false, "UNESCO-listed 18th-century astronomical observatory."],
  ["Nahargarh Fort", "Jaipur", 26.9373, 75.8155, "historic", ["nature"], 78, 120, "evening", 1, false, "Ridge-top fort with sunset views over the Pink City.", ["sunset", "viewpoint"]],
  ["Jal Mahal", "Jaipur", 26.9535, 75.8462, "historic", ["nature"], 70, 30, "evening", 0, false, "Palace in the middle of Man Sagar Lake (viewed from the promenade)."],
  ["Albert Hall Museum", "Jaipur", 26.9116, 75.8195, "historic", [], 72, 90, "evening", 1, true, "Indo-Saracenic museum, beautifully lit at night.", ["museum", "rainy-day"]],
  ["Birla Mandir, Jaipur", "Jaipur", 26.8920, 75.8155, "spiritual", [], 62, 45, "evening", 0, false, "White-marble Lakshmi Narayan temple."],
  ["Johari Bazaar", "Jaipur", 26.9205, 75.8270, "shopping", ["food"], 72, 120, "afternoon", 1, false, "Old-city market for gems, jewellery and textiles.", ["market"]],
  ["Laxmi Misthan Bhandar (LMB)", "Jaipur", 26.9220, 75.8272, "food", [], 70, 45, "any", 1, true, "Famous for Rajasthani thali and sweets since 1954.", ["rajasthani", "sweets"]],
  ["Chokhi Dhani", "Jaipur", 26.7660, 75.8370, "entertainment", ["food", "fun"], 78, 180, "evening", 2, false, "Rajasthani village resort with folk shows and a traditional dinner.", ["show", "kids"]],
  ["Raj Mandir Cinema", "Jaipur", 26.9155, 75.8095, "entertainment", [], 68, 180, "evening", 1, true, "Art-deco 'meringue' cinema hall, a Jaipur icon.", ["movies"]],

  // ---------------- Agra ----------------
  ["Taj Mahal", "Agra", 27.1751, 78.0421, "historic", [], 99, 180, "morning", 2, false, "Mughal marble mausoleum; sunrise visits are calmest. Closed Fridays."],
  ["Agra Fort", "Agra", 27.1795, 78.0211, "historic", [], 86, 120, "afternoon", 1, false, "UNESCO-listed red sandstone Mughal fort."],
  ["Itimad-ud-Daulah (Baby Taj)", "Agra", 27.1925, 78.0310, "historic", [], 70, 60, "afternoon", 1, false, "Exquisite inlaid marble tomb across the Yamuna."],
  ["Mehtab Bagh", "Agra", 27.1800, 78.0430, "nature", ["historic"], 72, 60, "evening", 1, false, "Riverside garden with sunset views of the Taj.", ["sunset", "viewpoint"]],
  ["Fatehpur Sikri", "Fatehpur Sikri", 27.0945, 77.6679, "historic", ["spiritual"], 84, 180, "morning", 1, false, "Akbar's abandoned red-sandstone capital, 40 km from Agra."],
  ["Sadar Bazaar, Agra", "Agra", 27.1610, 78.0090, "shopping", ["food"], 58, 90, "evening", 1, false, "Market for petha sweets, leather and chaat.", ["market", "street food"]],

  // ---------------- Kolkata ----------------
  ["Victoria Memorial", "Kolkata", 22.5448, 88.3426, "historic", ["nature"], 90, 120, "morning", 1, false, "Marble memorial hall and museum set in landscaped gardens."],
  ["Indian Museum", "Kolkata", 22.5579, 88.3509, "historic", [], 74, 150, "afternoon", 1, true, "India's oldest museum (1814).", ["museum", "rainy-day"]],
  ["Howrah Bridge", "Kolkata", 22.5851, 88.3468, "historic", ["fun"], 84, 45, "morning", 0, false, "Cantilever bridge over the Hooghly; visit the flower market beneath at dawn."],
  ["Dakshineswar Kali Temple", "Kolkata", 22.6548, 88.3575, "spiritual", ["historic"], 82, 90, "morning", 0, false, "Riverside temple associated with Ramakrishna."],
  ["Belur Math", "Kolkata", 22.6324, 88.3557, "spiritual", ["historic"], 76, 90, "evening", 0, false, "Headquarters of the Ramakrishna Mission; serene evening aarti."],
  ["Prinsep Ghat", "Kolkata", 22.5551, 88.3323, "nature", ["fun", "historic"], 66, 60, "evening", 0, false, "Riverside colonnade with boat rides and views of Vidyasagar Setu.", ["sunset", "boat"]],
  ["Science City", "Kolkata", 22.5392, 88.3958, "fun", ["entertainment"], 70, 180, "afternoon", 1, true, "Large science centre with space theatre and exhibits.", ["kids", "rainy-day"]],
  ["Eco Park, New Town", "Kolkata", 22.5980, 88.4680, "nature", ["fun"], 66, 150, "afternoon", 1, false, "Huge urban park with lake, cycling and Seven Wonders replicas."],
  ["Park Street", "Kolkata", 22.5530, 88.3520, "entertainment", ["food"], 78, 150, "evening", 2, false, "Historic dining and nightlife street; legendary at Christmas.", ["nightlife"]],
  ["Peter Cat", "Kolkata", 22.5528, 88.3527, "food", [], 76, 75, "evening", 2, true, "Known for its chelo kebab.", ["non-veg"]],
  ["Flurys", "Kolkata", 22.5530, 88.3510, "food", [], 70, 45, "morning", 2, true, "Art-deco tearoom (1927) for English breakfast and pastries.", ["breakfast", "bakery"]],
  ["New Market (Hogg Market)", "Kolkata", 22.5602, 88.3519, "shopping", ["food"], 70, 120, "afternoon", 1, false, "Victorian-era covered market for everything from cheese to clothes.", ["market"]],
];

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const CURATED_PLACES: Place[] = ROWS.map((r) => ({
  id: `cur-${slugify(r[0])}`,
  name: r[0],
  city: r[1],
  lat: r[2],
  lng: r[3],
  category: r[4],
  also: r[5],
  popularity: r[6],
  durationMins: r[7],
  bestTime: r[8],
  price: r[9],
  indoor: r[10],
  description: r[11],
  tags: r[12] ?? [],
  source: "curated" as const,
}));

/** Known cities/towns (used for geocoding free text without a network call). */
export const CITIES: Array<{ name: string; aliases?: string[]; lat: number; lng: number; state: string }> = [
  { name: "Chennai", aliases: ["madras"], lat: 13.0827, lng: 80.2707, state: "Tamil Nadu" },
  { name: "Mahabalipuram", aliases: ["mamallapuram"], lat: 12.6208, lng: 80.1945, state: "Tamil Nadu" },
  { name: "Puducherry", aliases: ["pondicherry", "pondy"], lat: 11.9416, lng: 79.8083, state: "Puducherry" },
  { name: "Madurai", lat: 9.9252, lng: 78.1198, state: "Tamil Nadu" },
  { name: "Ooty", aliases: ["udhagamandalam"], lat: 11.4102, lng: 76.695, state: "Tamil Nadu" },
  { name: "Bengaluru", aliases: ["bangalore"], lat: 12.9716, lng: 77.5946, state: "Karnataka" },
  { name: "Mysuru", aliases: ["mysore"], lat: 12.2958, lng: 76.6394, state: "Karnataka" },
  { name: "Hyderabad", lat: 17.385, lng: 78.4867, state: "Telangana" },
  { name: "Kochi", aliases: ["cochin"], lat: 9.9312, lng: 76.2673, state: "Kerala" },
  { name: "Munnar", lat: 10.0889, lng: 77.0595, state: "Kerala" },
  { name: "Goa", aliases: ["panaji", "panjim"], lat: 15.4909, lng: 73.8278, state: "Goa" },
  { name: "Mumbai", aliases: ["bombay"], lat: 19.076, lng: 72.8777, state: "Maharashtra" },
  { name: "Pune", lat: 18.5204, lng: 73.8567, state: "Maharashtra" },
  { name: "Delhi", aliases: ["new delhi"], lat: 28.6139, lng: 77.209, state: "Delhi" },
  { name: "Gurugram", aliases: ["gurgaon"], lat: 28.4595, lng: 77.0266, state: "Haryana" },
  { name: "Agra", lat: 27.1767, lng: 78.0081, state: "Uttar Pradesh" },
  { name: "Fatehpur Sikri", lat: 27.0945, lng: 77.6679, state: "Uttar Pradesh" },
  { name: "Varanasi", aliases: ["banaras", "benares", "kashi"], lat: 25.3176, lng: 82.9739, state: "Uttar Pradesh" },
  { name: "Jaipur", aliases: ["pink city"], lat: 26.9124, lng: 75.7873, state: "Rajasthan" },
  { name: "Udaipur", lat: 24.5854, lng: 73.7125, state: "Rajasthan" },
  { name: "Amritsar", lat: 31.634, lng: 74.8723, state: "Punjab" },
  { name: "Rishikesh", lat: 30.0869, lng: 78.2676, state: "Uttarakhand" },
  { name: "Manali", lat: 32.2432, lng: 77.1892, state: "Himachal Pradesh" },
  { name: "Leh", aliases: ["ladakh"], lat: 34.1526, lng: 77.5771, state: "Ladakh" },
  { name: "Srinagar", lat: 34.0837, lng: 74.7973, state: "Jammu & Kashmir" },
  { name: "Kolkata", aliases: ["calcutta"], lat: 22.5726, lng: 88.3639, state: "West Bengal" },
  { name: "Darjeeling", lat: 27.041, lng: 88.2663, state: "West Bengal" },
  { name: "Guwahati", aliases: ["gauhati"], lat: 26.1445, lng: 91.7362, state: "Assam" },
  { name: "Pobitora", lat: 26.237, lng: 92.055, state: "Assam" },
  { name: "Kaziranga", lat: 26.5775, lng: 93.1711, state: "Assam" },
  { name: "Dibrugarh", lat: 27.4728, lng: 94.912, state: "Assam" },
  { name: "Jorhat", lat: 26.7509, lng: 94.2037, state: "Assam" },
  { name: "Tezpur", lat: 26.6338, lng: 92.8, state: "Assam" },
  { name: "Majuli", lat: 26.95, lng: 94.1667, state: "Assam" },
  { name: "Shillong", lat: 25.5788, lng: 91.8933, state: "Meghalaya" },
  { name: "Sohra", aliases: ["cherrapunji", "cherrapunjee"], lat: 25.2702, lng: 91.7323, state: "Meghalaya" },
  { name: "Gangtok", lat: 27.3389, lng: 88.6065, state: "Sikkim" },
  { name: "Tawang", lat: 27.586, lng: 91.859, state: "Arunachal Pradesh" },
  { name: "Itanagar", lat: 27.0844, lng: 93.6053, state: "Arunachal Pradesh" },
  { name: "Imphal", lat: 24.817, lng: 93.9368, state: "Manipur" },
  { name: "Kohima", lat: 25.6751, lng: 94.1086, state: "Nagaland" },
  { name: "Aizawl", lat: 23.7271, lng: 92.7176, state: "Mizoram" },
  { name: "Agartala", lat: 23.8315, lng: 91.2868, state: "Tripura" },
];
