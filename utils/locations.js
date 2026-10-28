/**
 * MvuaTracker Spatial Town Mapping Engine
 * Maps minor Kenyan towns/locales to their nearest major weather prediction hub.
 */

const majorHubs = {
    "nairobi": { lat: -1.2921, lon: 36.8219, name: "Nairobi Hub" },
    "mombasa": { lat: -4.0435, lon: 39.6682, name: "Mombasa Coastal Hub" },
    "kisumu": { lat: -0.0917, lon: 34.7680, name: "Kisumu Western Hub" },
    "nakuru": { lat: -0.3031, lon: 36.0800, name: "Nakuru Rift Hub" },
    "eldoret": { lat: 0.5143, lon: 35.2698, name: "Eldoret Highland Hub" },
    " nyeri": { lat: -0.4167, lon: 36.9500, name: "Nyeri Central Hub" }
};

const minorTownMappings = {
    "athiriver": "nairobi",
    "kitengela": "nairobi",
    "rongai": "nairobi",
    "kiambu": "nairobi",
    "thika": "nairobi",
    "ruiru": "nairobi",
    "kilifi": "mombasa",
    "diani": "mombasa",
    "malindi": "mombasa",
    "mtwapa": "mombasa",
    "kakamega": "kisumu",
    "busia": "kisumu",
    "siaya": "kisumu",
    "gilgil": "nakuru",
    "naivasha": "nakuru",
    "molo": "nakuru",
    "iten": "eldoret",
    "kapsabet": "eldoret",
    "karatina": "nyeri",
    "nanyuki": "nyeri"
};

function resolveWeatherLocation(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Location query must be a valid string');
    }
    
    const normalized = query.toLowerCase().replace(/\\s+/g, '').trim();
    
    // Direct match on major hub
    if (majorHubs[normalized]) {
        return {
            queryTown: query,
            matchedHub: majorHubs[normalized].name,
            isDirectHub: true,
            coordinates: { lat: majorHubs[normalized].lat, lon: majorHubs[normalized].lon }
        };
    }
    
    // Check minor town mapping
    const mappedHubKey = minorTownMappings[normalized];
    if (mappedHubKey && majorHubs[mappedHubKey]) {
        return {
            queryTown: query,
            matchedHub: majorHubs[mappedHubKey].name,
            isDirectHub: false,
            parentHubKey: mappedHubKey,
            coordinates: { lat: majorHubs[mappedHubKey].lat, lon: majorHubs[mappedHubKey].lon }
        };
    }
    
    // Fallback default
    return {
        queryTown: query,
        matchedHub: "Nairobi Hub (Default Fallback)",
        isDirectHub: false,
        coordinates: majorHubs["nairobi"]
    };
}

module.exports = { majorHubs, minorTownMappings, resolveWeatherLocation };
