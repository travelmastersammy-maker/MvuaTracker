package ke.mvua.tracker

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ke.mvua.tracker.data.*

@Composable
fun HomeScreen(
    place: Place,
    query: String,
    onQuery: (String) -> Unit,
    results: List<Place>,
    searching: Boolean,
    onSearch: () -> Unit,
    onSelectPlace: (Place) -> Unit,
    weather: WeatherSnapshot?,
    reports: List<CommunityReport>,
    onCommunityAction: (CommunityReport, String) -> Unit,
    loading: Boolean,
    error: String,
    onRetry: () -> Unit,
    onReport: () -> Unit,
    onPrivacy: () -> Unit,
    statusMessage: String
) {
    Column(Modifier.fillMaxWidth().padding(bottom = 20.dp)) {
        Spacer(Modifier.height(12.dp))
        BrandHeader(onPrivacy)
        Spacer(Modifier.height(14.dp))
        SearchPanel(query, onQuery, searching, results, onSearch, onSelectPlace)
        Spacer(Modifier.height(12.dp))
        if (error.isNotBlank()) ErrorCard(error, onRetry)
        if (statusMessage.isNotBlank()) InfoCard(statusMessage, isWarning = false) { }
        Spacer(Modifier.height(5.dp))
        Text("RAIN FORECAST FOR", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Muted, letterSpacing = 1.2.sp)
        Text(place.name, fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        if (place.county.isNotBlank()) Text(place.county, fontSize = 12.sp, color = Muted)
        Spacer(Modifier.height(10.dp))
        if (weather == null) LoadingPanel(loading) else {
            RainHero(weather, loading)
            Spacer(Modifier.height(18.dp))
            ForecastSection(weather)
            Spacer(Modifier.height(18.dp))
            AlertsSection(weather.officialAlertsAvailable, weather.officialAlerts, weather.officialAlertsUpdatedAt)
        }
        Spacer(Modifier.height(18.dp))
        CommunitySection(reports, onReport, onCommunityAction)
        Spacer(Modifier.height(22.dp))
        Text("Forecast: Open-Meteo model guidance · Official alerts: Kenya Meteorological Department · Times shown in EAT", fontSize = 10.sp, color = Muted)
    }
}
