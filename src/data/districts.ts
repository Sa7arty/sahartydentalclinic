/** Major districts/areas, keyed by city name (only Cairo and Giza have curated lists). */
export const CITY_DISTRICTS: Record<string, string[]> = {
  Cairo: [
    'Abbassia', 'Ain Shams', 'Basateen', 'Downtown', 'Garden City', 'Hadayek El Kobba',
    'Heliopolis', 'Helwan', 'Khalifa', 'Maadi', 'Madinaty', 'Manial', 'Mokattam', 'Nasr City',
    'New Cairo', 'Nozha', 'Old Cairo (Masr El Qadima)', 'Rehab', 'Sayeda Zeinab', 'Shubra',
    'Tura', 'Zamalek', 'Zeitoun',
  ].sort(),
  Giza: [
    'Agouza', 'Badrasheen', 'Boulaq El Dakrour', 'Dokki', 'Faisal', 'Hadayek El Ahram',
    'Haram (Pyramids Road)', 'Imbaba', 'Kerdasa', 'Mohandessin', 'Omraniya', 'Saqqara',
    'Sheikh Zayed City', '6th of October City',
  ].sort(),
}

export function districtsForCity(city: string): string[] {
  const key = Object.keys(CITY_DISTRICTS).find((c) => c.toLowerCase() === city.trim().toLowerCase())
  return key ? CITY_DISTRICTS[key] : []
}
