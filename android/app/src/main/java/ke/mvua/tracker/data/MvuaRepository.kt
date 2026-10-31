package ke.mvua.tracker.data

import ke.mvua.tracker.BuildConfig

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

const val COMMUNITY_TERMS_VERSION = "2026-10-31-v1"

/** API boundary for forecasts, Kenya Met warnings, and community rain observations. */
class MvuaRepository(private val baseUrl: String) {
    suspend fun search(query: String): List<Place> {
        val root = requestJson("/api/search?q=${encode(query)}")
        return (root.optJSONArray("locations") ?: JSONArray()).toPlaces()
    }

    suspend fun weather(place: Place): WeatherSnapshot {
        val query = "latitude=${place.latitude}&longitude=${place.longitude}" +
            "&place=${encode(place.name)}&county=${encode(place.county)}"
        return WeatherSnapshot.fromJson(requestJson("/api/weather?$query"))
    }

    suspend fun reports(place: Place): List<CommunityReport> {
        val query = "latitude=${place.latitude}&longitude=${place.longitude}"
        val root = requestJson("/api/reports?$query")
        return (root.optJSONArray("reports") ?: JSONArray()).toReports()
    }

    suspend fun mapReports(): List<MapCommunityReport> {
        val root = requestJson("/api/community/map")
        return (root.optJSONArray("reports") ?: JSONArray()).toMapReports()
    }

    suspend fun submitReport(
        place: Place,
        date: String,
        startTime: String,
        endTime: String,
        severity: String,
        comment: String,
        reporterKey: String,
        termsVersion: String
    ): SubmitReportResult {
        val body = JSONObject()
            .put("place", place.name)
            .put("county", place.county)
            .put("latitude", place.latitude)
            .put("longitude", place.longitude)
            .put("date", date)
            .put("startTime", startTime)
            .put("endTime", endTime)
            .put("severity", severity)
            .put("comment", comment.trim())
            .put("reporterKey", reporterKey)
            .put("termsVersion", termsVersion)
        val report = requestJson("/api/reports", "POST", body).getJSONObject("report")
        return SubmitReportResult(
            commentStatus = report.optString("commentStatus", "pending"),
            severity = report.optString("severity", severity)
        )
    }

    suspend fun flagCommunityItem(actorKey: String, targetReportId: String, targetKey: String, type: String) {
        val body = JSONObject().put("actorKey", actorKey).put("targetReportId", targetReportId)
            .put("targetKey", targetKey).put("type", type).put("reason", "other")
        requestJson("/api/community/flags", "POST", body)
    }

    private suspend fun requestJson(path: String, method: String = "GET", body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            require(baseUrl.startsWith("https://") || BuildConfig.DEBUG) {
                "The release API must use HTTPS. Configure MVUA_API_BASE_URL in Gradle."
            }
            require(baseUrl.isNotBlank()) { "The MvuaTracker API is not configured yet." }
            val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 10_000
                readTimeout = 15_000
                setRequestProperty("Accept", "application/json")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
            }
            try {
                if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                if (status !in 200..299) {
                    val message = runCatching { JSONObject(text).optString("error") }.getOrNull()
                    throw IOException(message?.takeIf { it.isNotBlank() } ?: "Weather service returned HTTP $status.")
                }
                JSONObject(text)
            } finally {
                connection.disconnect()
            }
        }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())
}

data class Place(
    val name: String,
    val county: String,
    val latitude: Double,
    val longitude: Double,
    val timezone: String
)

data class HourRain(val time: String, val probabilityPercent: Int, val millimetres: Double)
data class DayRain(val date: String, val probabilityPercent: Int, val millimetres: Double)
data class OfficialAlert(
    val title: String,
    val event: String,
    val description: String,
    val area: String,
    val severity: String,
    val published: String,
    val expires: String,
    val link: String
)
data class CommunityReport(
    val id: String,
    val reporterKey: String,
    val place: String,
    val county: String,
    val date: String,
    val startTime: String,
    val endTime: String,
    val severity: String,
    val comment: String,
    val commentStatus: String,
    val reportedAt: String
)
data class MapCommunityReport(
    val id: String,
    val place: String,
    val county: String,
    val latitude: Double,
    val longitude: Double,
    val date: String,
    val startTime: String,
    val endTime: String,
    val severity: String
)
data class SubmitReportResult(val commentStatus: String, val severity: String)
data class WeatherSnapshot(
    val place: Place,
    val todayMillimetres: Double?,
    val todayProbabilityPercent: Int?,
    val forecastUpdatedAt: String,
    val hourly: List<HourRain>,
    val sevenDays: List<DayRain>,
    val officialAlertsAvailable: Boolean,
    val officialAlertsUpdatedAt: String,
    val officialAlerts: List<OfficialAlert>
) {
    companion object {
        fun fromJson(root: JSONObject): WeatherSnapshot {
            val location = root.getJSONObject("location")
            val forecast = root.getJSONObject("forecast")
            val daily = forecast.optJSONObject("daily") ?: JSONObject()
            val hourly = forecast.optJSONObject("hourly") ?: JSONObject()
            val warnings = root.optJSONObject("warnings") ?: JSONObject()
            val place = Place(
                location.optString("name"), location.optString("county"),
                location.getDouble("latitude"), location.getDouble("longitude"),
                location.optString("timezone", "Africa/Nairobi")
            )
            val times = hourly.optJSONArray("time") ?: JSONArray()
            val rainfall = hourly.optJSONArray("precipitation") ?: JSONArray()
            val probabilities = hourly.optJSONArray("precipitation_probability") ?: JSONArray()
            val hourRows = (0 until times.length()).map { index ->
                HourRain(times.optString(index), probabilities.optInt(index), rainfall.optDouble(index))
            }
            val dates = daily.optJSONArray("time") ?: JSONArray()
            val totals = daily.optJSONArray("precipitation_sum") ?: JSONArray()
            val chances = daily.optJSONArray("precipitation_probability_max") ?: JSONArray()
            val dayRows = (0 until dates.length()).map { index ->
                DayRain(dates.optString(index), chances.optInt(index), totals.optDouble(index))
            }
            val alertsJson = warnings.optJSONArray("alerts") ?: JSONArray()
            val alerts = (0 until alertsJson.length()).map { index ->
                val alert = alertsJson.getJSONObject(index)
                OfficialAlert(
                    alert.optString("title"), alert.optString("event"), alert.optString("description"),
                    alert.optString("area"), alert.optString("severity"), alert.optString("published"),
                    alert.optString("expires"), alert.optString("link")
                )
            }
            return WeatherSnapshot(
                place, totals.optNullableDouble(0), chances.optNullableInt(0), forecast.optString("fetchedAt"),
                hourRows, dayRows, warnings.optString("status") == "ok", warnings.optString("fetchedAt"), alerts
            )
        }
    }
}

private fun JSONArray.toPlaces(): List<Place> = (0 until length()).map { index ->
    val item = getJSONObject(index)
    Place(item.optString("name"), item.optString("county"), item.getDouble("latitude"),
        item.getDouble("longitude"), item.optString("timezone", "Africa/Nairobi"))
}

private fun JSONArray.toReports(): List<CommunityReport> = (0 until length()).map { index ->
    val item = getJSONObject(index)
    CommunityReport(
        item.optString("id"), item.optString("reporterKey"), item.optString("place"), item.optString("county"), item.optString("date"),
        item.optString("startTime"), item.optString("endTime"), item.optString("severity"),
        item.optString("comment"), item.optString("commentStatus"), item.optString("reportedAt")
    )
}

private fun JSONArray.toMapReports(): List<MapCommunityReport> = (0 until length()).map { index ->
    val item = getJSONObject(index)
    MapCommunityReport(
        item.optString("id"), item.optString("place"), item.optString("county"),
        item.optDouble("latitude"), item.optDouble("longitude"), item.optString("date"),
        item.optString("startTime"), item.optString("endTime"), item.optString("severity")
    )
}

private fun JSONArray.optNullableDouble(index: Int): Double? =
    if (index < length() && !isNull(index)) optDouble(index) else null

private fun JSONArray.optNullableInt(index: Int): Int? =
    if (index < length() && !isNull(index)) optInt(index) else null
