package ke.mvua.tracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.unit.dp
import ke.mvua.tracker.data.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.ZoneId

val Olive = Color(0xFF596B35)
val DeepOlive = Color(0xFF354322)
val Paper = Color(0xFFF3F2E6)
val SurfaceCream = Color(0xFFFFFEF7)
val SoftGreen = Color(0xFFE5EBCF)
val Ink = Color(0xFF303A20)
val Muted = Color(0xFF70765F)
val Amber = Color(0xFFE6C66B)
val AlertRed = Color(0xFF9C493A)
private val KenyaZone = ZoneId.of("Africa/Nairobi")
val RainSeverities = listOf("No rain", "Drizzle", "Slight shower", "Medium rain", "Heavy rain", "Storm / thunderstorm")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MvuaTrackerApp(MvuaRepository(BuildConfig.MVUA_API_BASE_URL)) }
    }
}

@Composable
private fun MvuaTrackerApp(repository: MvuaRepository) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val communityPrefs = remember { context.getSharedPreferences("mvua-community", android.content.Context.MODE_PRIVATE) }
    val reporterKey = remember { communityPrefs.getString("reporter_key", null) ?: java.util.UUID.randomUUID().toString().also { communityPrefs.edit().putString("reporter_key", it).apply() } }
    val blockedKeys = remember { mutableStateOf(communityPrefs.getStringSet("blocked_reporters", mutableSetOf<String>())?.toSet() ?: emptySet()) }
    var place by remember { mutableStateOf(Place("Nairobi", "Nairobi County", -1.2864, 36.8172, "Africa/Nairobi")) }
    var weather by remember { mutableStateOf<WeatherSnapshot?>(null) }
    var reports by remember { mutableStateOf<List<CommunityReport>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Place>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var showReport by remember { mutableStateOf(false) }
    var showPrivacy by remember { mutableStateOf(false) }

    suspend fun refresh(target: Place) {
        loading = true
        error = ""
        try {
            weather = repository.weather(target)
            reports = repository.reports(target).filterNot { it.reporterKey in blockedKeys.value }
        } catch (e: Exception) {
            error = e.message ?: "Could not reach the MvuaTracker service. Check your connection and retry."
        } finally { loading = false }
    }
    LaunchedEffect(place) {
        while (true) { refresh(place); delay(60_000) }
    }

    MaterialTheme(colorScheme = lightColorScheme(primary = Olive, onPrimary = Color.White, background = Paper, surface = SurfaceCream, onSurface = Ink, secondary = Amber, error = AlertRed)) {
        Surface(Modifier.fillMaxSize(), color = Paper) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).windowInsetsPadding(WindowInsets.navigationBars).imePadding().padding(horizontal = 18.dp)) {
                if (showReport) {
                    ReportPage(repository, place, onCancel = { showReport = false }) { submittedPlace, commentStatus ->
                        place = submittedPlace
                        showReport = false
                        status = if (commentStatus == "approved") "Your rain report is live. The comment passed automatic screening; the observation is unverified." else "Your rain report is live. Its comment is hidden pending safety screening."
                    }
                } else {
                    HomeScreen(
                        place = place, query = query, onQuery = { query = it; results = emptyList() },
                        results = results, searching = searching, onSearch = {
                            if (query.trim().length >= 2) scope.launch {
                                searching = true; error = ""
                                try { results = repository.search(query.trim()); if (results.isEmpty()) error = "No Kenyan towns found. Try a town or county name." }
                                catch (e: Exception) { error = e.message ?: "Location search is unavailable." }
                                finally { searching = false }
                            }
                        }, onSelectPlace = { place = it; query = ""; results = emptyList(); status = "" },
                        weather = weather, reports = reports, onCommunityAction = { report, action ->
                            if (action == "block") {
                                val updated = blockedKeys.value + report.reporterKey
                                blockedKeys.value = updated
                                communityPrefs.edit().putStringSet("blocked_reporters", updated).apply()
                                reports = reports.filterNot { it.reporterKey == report.reporterKey }
                                status = "This contributor's updates are now hidden on this device."
                            } else scope.launch {
                                runCatching { repository.flagCommunityItem(reporterKey, report.id, report.reporterKey, action) }
                                    .onSuccess { status = "Thanks. Your report was sent for review." }
                                    .onFailure { status = it.message ?: "Could not send the report." }
                            }
                        }, loading = loading, error = error,
                        onRetry = { scope.launch { refresh(place) } }, onReport = { showReport = true },
                        onPrivacy = { showPrivacy = true }, statusMessage = status
                    )
                }
            }
        }
        if (showPrivacy) PrivacyDialog { showPrivacy = false }
    }
}
